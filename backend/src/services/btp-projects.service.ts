import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createBtpProject,
  deleteBtpProject,
  findBtpProjectById,
  listBtpProjects,
  updateBtpProject
} from "../repositories/btp-projects.repository.js";
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

function canManageBtpProjects(role: RoleCode): boolean {
  return role === "SYS_ADMIN" || role === "ACCOUNTANT" || role === "SUPERVISOR";
}

export async function listCompanyBtpProjects(input: {
  companyId: string;
  activeOnly?: boolean;
}) {
  return listBtpProjects(input);
}

export async function createCompanyBtpProject(
  actor: ActorContext,
  input: {
    name: string;
    clientRef?: string;
    contractRef?: string;
    location?: string;
  }
) {
  if (!canManageBtpProjects(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour créer un chantier.");
  }

  const projectId = randomUUID();
  try {
    await createBtpProject({
      id: projectId,
      companyId: actor.companyId,
      name: input.name.trim(),
      clientRef: input.clientRef?.trim() || null,
      contractRef: input.contractRef?.trim() || null,
      location: input.location?.trim() || null
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un chantier avec ce nom existe déjà.");
    }
    throw error;
  }

  const created = await findBtpProjectById(actor.companyId, projectId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger le chantier créé.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "BTP_PROJECT_CREATED",
    entityType: "BTP_PROJECT",
    entityId: created.id,
    metadataJson: JSON.stringify({
      name: created.name,
      clientRef: created.clientRef,
      contractRef: created.contractRef
    })
  });

  return created;
}

export async function updateCompanyBtpProject(
  actor: ActorContext,
  input: {
    projectId: string;
    name: string;
    clientRef?: string;
    contractRef?: string;
    location?: string;
    isActive: boolean;
  }
) {
  if (!canManageBtpProjects(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier un chantier.");
  }

  const existing = await findBtpProjectById(actor.companyId, input.projectId);
  if (!existing) {
    throw new HttpError(404, "Chantier introuvable.");
  }

  try {
    await updateBtpProject({
      companyId: actor.companyId,
      projectId: input.projectId,
      name: input.name.trim(),
      clientRef: input.clientRef?.trim() || null,
      contractRef: input.contractRef?.trim() || null,
      location: input.location?.trim() || null,
      isActive: input.isActive
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un chantier avec ce nom existe déjà.");
    }
    throw error;
  }

  const updated = await findBtpProjectById(actor.companyId, input.projectId);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger le chantier modifié.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "BTP_PROJECT_UPDATED",
    entityType: "BTP_PROJECT",
    entityId: updated.id,
    metadataJson: JSON.stringify({
      name: updated.name,
      clientRef: updated.clientRef,
      contractRef: updated.contractRef,
      isActive: updated.isActive
    })
  });

  return updated;
}

export async function deleteCompanyBtpProject(
  actor: ActorContext,
  input: {
    projectId: string;
  }
) {
  if (!canManageBtpProjects(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer un chantier.");
  }

  const existing = await findBtpProjectById(actor.companyId, input.projectId);
  if (!existing) {
    throw new HttpError(404, "Chantier introuvable.");
  }

  await deleteBtpProject({
    companyId: actor.companyId,
    projectId: input.projectId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "BTP_PROJECT_DELETED",
    entityType: "BTP_PROJECT",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      name: existing.name
    })
  });
}
