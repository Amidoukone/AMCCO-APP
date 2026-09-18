import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createRentalTenant,
  deleteRentalTenant,
  findRentalTenantById,
  listRentalTenants,
  updateRentalTenant
} from "../repositories/rental-tenants.repository.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

type MysqlError = {
  code?: string;
};

function mysqlErrorCode(error: unknown): string | undefined {
  return (error as MysqlError).code;
}

function canManageRentalTenants(role: RoleCode): boolean {
  return role === "SYS_ADMIN" || role === "ACCOUNTANT" || role === "SUPERVISOR";
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function listCompanyRentalTenants(input: {
  companyId: string;
  activeOnly?: boolean;
}) {
  return listRentalTenants(input);
}

export async function createCompanyRentalTenant(
  actor: ActorContext,
  input: {
    name: string;
    unitLabel: string;
    monthlyRent: string;
    phone?: string;
    tenancyStart?: string;
  }
) {
  if (!canManageRentalTenants(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour créer un locataire.");
  }

  const tenantId = randomUUID();
  try {
    await createRentalTenant({
      id: tenantId,
      companyId: actor.companyId,
      name: input.name.trim(),
      unitLabel: input.unitLabel.trim(),
      monthlyRent: input.monthlyRent,
      phone: input.phone?.trim() || null,
      tenancyStart: input.tenancyStart?.trim() || currentMonthKey()
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un locataire avec ce nom existe déjà.");
    }
    throw error;
  }

  const created = await findRentalTenantById(actor.companyId, tenantId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger le locataire créé.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "RENTAL_TENANT_CREATED",
    entityType: "RENTAL_TENANT",
    entityId: created.id,
    metadataJson: JSON.stringify({
      name: created.name,
      unitLabel: created.unitLabel,
      monthlyRent: created.monthlyRent
    })
  });

  return created;
}

export async function updateCompanyRentalTenant(
  actor: ActorContext,
  input: {
    tenantId: string;
    name: string;
    unitLabel: string;
    monthlyRent: string;
    phone?: string;
    tenancyStart?: string;
    isActive: boolean;
  }
) {
  if (!canManageRentalTenants(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier un locataire.");
  }

  const existing = await findRentalTenantById(actor.companyId, input.tenantId);
  if (!existing) {
    throw new HttpError(404, "Locataire introuvable.");
  }

  try {
    await updateRentalTenant({
      companyId: actor.companyId,
      tenantId: input.tenantId,
      name: input.name.trim(),
      unitLabel: input.unitLabel.trim(),
      monthlyRent: input.monthlyRent,
      phone: input.phone?.trim() || null,
      tenancyStart: input.tenancyStart?.trim() || existing.tenancyStart,
      isActive: input.isActive
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un locataire avec ce nom existe déjà.");
    }
    throw error;
  }

  const updated = await findRentalTenantById(actor.companyId, input.tenantId);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger le locataire modifié.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "RENTAL_TENANT_UPDATED",
    entityType: "RENTAL_TENANT",
    entityId: updated.id,
    metadataJson: JSON.stringify({
      name: updated.name,
      unitLabel: updated.unitLabel,
      monthlyRent: updated.monthlyRent,
      isActive: updated.isActive
    })
  });

  return updated;
}

export async function deleteCompanyRentalTenant(
  actor: ActorContext,
  input: {
    tenantId: string;
  }
) {
  if (!canManageRentalTenants(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer un locataire.");
  }

  const existing = await findRentalTenantById(actor.companyId, input.tenantId);
  if (!existing) {
    throw new HttpError(404, "Locataire introuvable.");
  }

  await deleteRentalTenant({
    companyId: actor.companyId,
    tenantId: input.tenantId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "RENTAL_TENANT_DELETED",
    entityType: "RENTAL_TENANT",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      name: existing.name,
      unitLabel: existing.unitLabel
    })
  });
}
