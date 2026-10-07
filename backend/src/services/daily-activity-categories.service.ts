import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createDailyActivityCategory,
  deleteDailyActivityCategory,
  findDailyActivityCategoryById,
  listDailyActivityCategories,
  seedDefaultDailyActivityCategories,
  updateDailyActivityCategory
} from "../repositories/daily-activity-categories.repository.js";
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

function canManageDailyActivityCategories(role: RoleCode): boolean {
  return role === "SYS_ADMIN" || role === "ACCOUNTANT" || role === "SUPERVISOR";
}

const DEFAULT_CATEGORY_NAMES = [
  "Rendez-vous",
  "Demande pour le PDG",
  "Récupération de document",
  "Décision prise",
  "Nouveau partenaire",
  "Protocole d'accord",
  "Actualité / information",
  "Autre"
];

export async function listCompanyDailyActivityCategories(input: {
  companyId: string;
  activeOnly?: boolean;
}) {
  const items = await listDailyActivityCategories(input);
  const defaultNames = items.length > 0
    ? ["Protocole d'accord"]
    : DEFAULT_CATEGORY_NAMES;
  await seedDefaultDailyActivityCategories({
    companyId: input.companyId,
    categories: defaultNames.map((name) => ({ id: randomUUID(), name }))
  });
  return listDailyActivityCategories(input);
}

export async function createCompanyDailyActivityCategory(
  actor: ActorContext,
  input: {
    name: string;
  }
) {
  if (!canManageDailyActivityCategories(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour créer une catégorie d'activité.");
  }

  const categoryId = randomUUID();
  try {
    await createDailyActivityCategory({
      id: categoryId,
      companyId: actor.companyId,
      name: input.name.trim()
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Une catégorie avec ce nom existe déjà.");
    }
    throw error;
  }

  const created = await findDailyActivityCategoryById(actor.companyId, categoryId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger la catégorie créée.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "DAILY_ACTIVITY_CATEGORY_CREATED",
    entityType: "DAILY_ACTIVITY_CATEGORY",
    entityId: created.id,
    metadataJson: JSON.stringify({ name: created.name })
  });

  return created;
}

export async function updateCompanyDailyActivityCategory(
  actor: ActorContext,
  input: {
    categoryId: string;
    name: string;
    isActive: boolean;
  }
) {
  if (!canManageDailyActivityCategories(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier une catégorie d'activité.");
  }

  const existing = await findDailyActivityCategoryById(actor.companyId, input.categoryId);
  if (!existing) {
    throw new HttpError(404, "Catégorie introuvable.");
  }

  try {
    await updateDailyActivityCategory({
      companyId: actor.companyId,
      categoryId: input.categoryId,
      name: input.name.trim(),
      isActive: input.isActive
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Une catégorie avec ce nom existe déjà.");
    }
    throw error;
  }

  const updated = await findDailyActivityCategoryById(actor.companyId, input.categoryId);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la catégorie modifiée.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "DAILY_ACTIVITY_CATEGORY_UPDATED",
    entityType: "DAILY_ACTIVITY_CATEGORY",
    entityId: updated.id,
    metadataJson: JSON.stringify({ name: updated.name, isActive: updated.isActive })
  });

  return updated;
}

export async function deleteCompanyDailyActivityCategory(
  actor: ActorContext,
  input: {
    categoryId: string;
  }
) {
  if (!canManageDailyActivityCategories(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer une catégorie d'activité.");
  }

  const existing = await findDailyActivityCategoryById(actor.companyId, input.categoryId);
  if (!existing) {
    throw new HttpError(404, "Catégorie introuvable.");
  }

  await deleteDailyActivityCategory({
    companyId: actor.companyId,
    categoryId: input.categoryId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "DAILY_ACTIVITY_CATEGORY_DELETED",
    entityType: "DAILY_ACTIVITY_CATEGORY",
    entityId: existing.id,
    metadataJson: JSON.stringify({ name: existing.name })
  });
}
