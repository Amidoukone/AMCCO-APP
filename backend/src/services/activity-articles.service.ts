import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createActivityArticle,
  deleteActivityArticle,
  findActivityArticleById,
  listActivityArticles,
  updateActivityArticle
} from "../repositories/activity-articles.repository.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
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

function canManageActivityArticles(role: RoleCode): boolean {
  return role === "SYS_ADMIN" || role === "ACCOUNTANT" || role === "SUPERVISOR";
}

export async function listCompanyActivityArticles(input: {
  companyId: string;
  activityCode: BusinessActivityCode;
}) {
  return listActivityArticles(input);
}

export async function createCompanyActivityArticle(
  actor: ActorContext,
  input: {
    activityCode: BusinessActivityCode;
    name: string;
    defaultMargin?: string;
    defaultPurchaseUnitPrice?: string;
  }
) {
  if (!canManageActivityArticles(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour créer un article.");
  }

  const articleId = randomUUID();
  try {
    await createActivityArticle({
      id: articleId,
      companyId: actor.companyId,
      activityCode: input.activityCode,
      name: input.name.trim(),
      defaultMargin: input.defaultMargin ?? null,
      defaultPurchaseUnitPrice: input.defaultPurchaseUnitPrice ?? null
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un article avec ce nom existe déjà.");
    }
    throw error;
  }

  const created = await findActivityArticleById(actor.companyId, articleId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger l'article créé.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ACTIVITY_ARTICLE_CREATED",
    entityType: "ACTIVITY_ARTICLE",
    entityId: created.id,
    metadataJson: JSON.stringify({
      activityCode: created.activityCode,
      name: created.name,
      defaultMargin: created.defaultMargin,
      defaultPurchaseUnitPrice: created.defaultPurchaseUnitPrice
    })
  });

  return created;
}

export async function updateCompanyActivityArticle(
  actor: ActorContext,
  input: {
    articleId: string;
    name: string;
    defaultMargin?: string;
    defaultPurchaseUnitPrice?: string;
  }
) {
  if (!canManageActivityArticles(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier un article.");
  }

  const existing = await findActivityArticleById(actor.companyId, input.articleId);
  if (!existing) {
    throw new HttpError(404, "Article introuvable.");
  }

  try {
    await updateActivityArticle({
      companyId: actor.companyId,
      articleId: input.articleId,
      name: input.name.trim(),
      defaultMargin: input.defaultMargin ?? null,
      defaultPurchaseUnitPrice: input.defaultPurchaseUnitPrice ?? null
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Un article avec ce nom existe déjà.");
    }
    throw error;
  }

  const updated = await findActivityArticleById(actor.companyId, input.articleId);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger l'article modifié.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ACTIVITY_ARTICLE_UPDATED",
    entityType: "ACTIVITY_ARTICLE",
    entityId: updated.id,
    metadataJson: JSON.stringify({
      activityCode: updated.activityCode,
      name: updated.name,
      defaultMargin: updated.defaultMargin,
      defaultPurchaseUnitPrice: updated.defaultPurchaseUnitPrice
    })
  });

  return updated;
}

export async function deleteCompanyActivityArticle(
  actor: ActorContext,
  input: {
    articleId: string;
  }
) {
  if (!canManageActivityArticles(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer un article.");
  }

  const existing = await findActivityArticleById(actor.companyId, input.articleId);
  if (!existing) {
    throw new HttpError(404, "Article introuvable.");
  }

  await deleteActivityArticle({
    companyId: actor.companyId,
    articleId: input.articleId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "ACTIVITY_ARTICLE_DELETED",
    entityType: "ACTIVITY_ARTICLE",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      activityCode: existing.activityCode,
      name: existing.name
    })
  });
}
