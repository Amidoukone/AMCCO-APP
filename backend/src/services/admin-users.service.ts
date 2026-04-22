import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { hashPassword } from "../lib/password.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  countOwnersInCompany,
  createMembershipIfMissing,
  createMembership,
  createUser,
  deleteMembership,
  findMembershipByCompanyAndUser,
  findUserByEmail,
  listCompanyUsers,
  revokeRefreshSessionsForUserInCompany,
  updateMembershipRole,
  updateUserPasswordHash,
  updateUserProfile
} from "../repositories/admin-users.repository.js";
import { listAllCompanyIds } from "../repositories/companies.repository.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
};

type MysqlError = {
  code?: string;
};

function mysqlErrorCode(error: unknown): string | undefined {
  return (error as MysqlError).code;
}

export async function listUsersForCompany(companyId: string) {
  return listCompanyUsers(companyId);
}

export async function createCompanyUser(
  actor: ActorContext,
  input: {
    email: string;
    fullName: string;
    password: string;
    role: RoleCode;
  }
) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    const existingMembership = await findMembershipByCompanyAndUser(actor.companyId, existingUser.userId);
    if (existingMembership) {
      throw new HttpError(409, "Cet utilisateur est deja rattache a cette entreprise.");
    }
  }

  const userId = existingUser?.userId ?? randomUUID();
  if (!existingUser) {
    const passwordHash = await hashPassword(input.password);
    try {
      await createUser({
        userId,
        email,
        fullName,
        passwordHash
      });
    } catch (error) {
      if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
        throw new HttpError(409, "Cet email existe deja.");
      }
      throw error;
    }
  } else {
    await updateUserProfile({
      userId,
      fullName,
      isActive: true
    });
  }

  const companyIds = await listAllCompanyIds();
  for (const companyId of companyIds) {
    if (companyId === actor.companyId) {
      try {
        await createMembership({
          membershipId: randomUUID(),
          companyId,
          userId,
          role: input.role
        });
      } catch (error) {
        if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
          throw new HttpError(409, "Le rattachement utilisateur existe deja pour cette entreprise.");
        }
        throw error;
      }
      continue;
    }

    await createMembershipIfMissing({
      membershipId: randomUUID(),
      companyId,
      userId,
      role: input.role
    });
  }

  const membership = await findMembershipByCompanyAndUser(actor.companyId, userId);
  if (!membership) {
    throw new HttpError(500, "Impossible de creer le rattachement utilisateur.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ADMIN_USER_CREATED",
    entityType: "MEMBERSHIP",
    entityId: membership.membershipId,
    metadataJson: JSON.stringify({
      userId: membership.userId,
      email: membership.email,
      role: membership.role
    })
  });

  return membership;
}

export async function updateCompanyUser(
  actor: ActorContext,
  input: {
    userId: string;
    fullName?: string;
    isActive?: boolean;
  }
) {
  const membership = await findMembershipByCompanyAndUser(actor.companyId, input.userId);
  if (!membership) {
    throw new HttpError(404, "Rattachement utilisateur introuvable pour cette entreprise.");
  }

  if (typeof input.fullName !== "string" && typeof input.isActive !== "boolean") {
    throw new HttpError(400, "Aucun champ de profil a mettre a jour.");
  }

  await updateUserProfile({
    userId: input.userId,
    fullName: input.fullName?.trim(),
    isActive: input.isActive
  });

  const updatedMembership = await findMembershipByCompanyAndUser(actor.companyId, input.userId);
  if (!updatedMembership) {
    throw new HttpError(500, "Impossible de recharger le profil utilisateur mis a jour.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ADMIN_USER_UPDATED",
    entityType: "USER",
    entityId: updatedMembership.userId,
    metadataJson: JSON.stringify({
      fullName: updatedMembership.fullName,
      isActive: updatedMembership.isActive
    })
  });

  return updatedMembership;
}

export async function changeCompanyUserRole(
  actor: ActorContext,
  input: {
    userId: string;
    role: RoleCode;
  }
) {
  const membership = await findMembershipByCompanyAndUser(actor.companyId, input.userId);
  if (!membership) {
    throw new HttpError(404, "Rattachement utilisateur introuvable pour cette entreprise.");
  }

  if (membership.userId === actor.actorId && input.role !== membership.role) {
    throw new HttpError(400, "Vous ne pouvez pas modifier votre propre role.");
  }

  if (membership.role === "OWNER" && input.role !== "OWNER") {
    const ownerCount = await countOwnersInCompany(actor.companyId);
    if (ownerCount <= 1) {
      throw new HttpError(400, "Impossible de retirer le dernier proprietaire de l'entreprise.");
    }
  }

  await updateMembershipRole({
    companyId: actor.companyId,
    userId: input.userId,
    role: input.role
  });

  const updatedMembership = await findMembershipByCompanyAndUser(actor.companyId, input.userId);
  if (!updatedMembership) {
    throw new HttpError(500, "Impossible de recharger le role mis a jour.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ADMIN_USER_ROLE_CHANGED",
    entityType: "MEMBERSHIP",
    entityId: updatedMembership.membershipId,
    metadataJson: JSON.stringify({
      userId: updatedMembership.userId,
      role: updatedMembership.role
    })
  });

  return updatedMembership;
}

export async function deleteCompanyUser(actor: ActorContext, userId: string): Promise<void> {
  const membership = await findMembershipByCompanyAndUser(actor.companyId, userId);
  if (!membership) {
    throw new HttpError(404, "Rattachement utilisateur introuvable pour cette entreprise.");
  }

  if (membership.userId === actor.actorId) {
    throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre rattachement.");
  }

  if (membership.role === "OWNER") {
    const ownerCount = await countOwnersInCompany(actor.companyId);
    if (ownerCount <= 1) {
      throw new HttpError(400, "Impossible de retirer le dernier proprietaire de l'entreprise.");
    }
  }

  await deleteMembership(actor.companyId, userId);
  await revokeRefreshSessionsForUserInCompany(actor.companyId, userId);

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ADMIN_USER_REMOVED",
    entityType: "MEMBERSHIP",
    entityId: membership.membershipId,
    metadataJson: JSON.stringify({
      userId: membership.userId,
      email: membership.email,
      role: membership.role
    })
  });
}

export async function resetCompanyUserPassword(
  actor: ActorContext,
  input: {
    userId: string;
    newPassword: string;
  }
): Promise<void> {
  const membership = await findMembershipByCompanyAndUser(actor.companyId, input.userId);
  if (!membership) {
    throw new HttpError(404, "Rattachement utilisateur introuvable pour cette entreprise.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await updateUserPasswordHash({
    userId: input.userId,
    passwordHash
  });

  await revokeRefreshSessionsForUserInCompany(actor.companyId, input.userId);

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ADMIN_USER_PASSWORD_RESET",
    entityType: "USER",
    entityId: membership.userId,
    metadataJson: JSON.stringify({
      targetUserId: membership.userId,
      targetEmail: membership.email
    })
  });
}
