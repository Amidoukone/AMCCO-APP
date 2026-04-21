import { randomUUID } from "node:crypto";
import {
  getBusinessActivityProfile,
  listBusinessActivityProfiles
} from "../config/business-activity-profiles.js";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  getCompanyLegacyActivitySummary,
  isCompanyActivityEnabled,
  listCompanyActivities,
  reclassifyLegacyTasks,
  reclassifyLegacyTransactions,
  upsertCompanyActivity
} from "../repositories/company-activities.repository.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

type LegacyReclassificationScope = "TRANSACTIONS" | "TASKS" | "BOTH";

function ensureAdminActivityAccess(role: RoleCode): void {
  if (role !== "OWNER" && role !== "SYS_ADMIN") {
    throw new HttpError(403, "Permissions insuffisantes pour administrer les activites.");
  }
}

export async function listAvailableCompanyActivities(companyId: string) {
  const items = await listCompanyActivities(companyId);
  return {
    items,
    profiles: listBusinessActivityProfiles()
  };
}

export async function getAdminCompanyActivities(actor: ActorContext) {
  ensureAdminActivityAccess(actor.role);
  const [items, legacySummary] = await Promise.all([
    listCompanyActivities(actor.companyId),
    getCompanyLegacyActivitySummary(actor.companyId)
  ]);

  return {
    items,
    legacySummary,
    profiles: listBusinessActivityProfiles()
  };
}

export function getCompanyActivityProfile(activityCode: BusinessActivityCode) {
  return getBusinessActivityProfile(activityCode);
}

export async function ensureCompanyActivityEnabledOrThrow(
  companyId: string,
  activityCode: BusinessActivityCode
): Promise<void> {
  const isEnabled = await isCompanyActivityEnabled(companyId, activityCode);
  if (!isEnabled) {
    throw new HttpError(
      400,
      "Cette activite est desactivee pour cette entreprise. Contactez un administrateur."
    );
  }
}

export async function updateCompanyActivityState(
  actor: ActorContext,
  input: {
    activityCode: BusinessActivityCode;
    isEnabled: boolean;
  }
) {
  ensureAdminActivityAccess(actor.role);

  const currentItems = await listCompanyActivities(actor.companyId);
  const enabledCount = currentItems.filter((item) => item.isEnabled).length;
  const current = currentItems.find((item) => item.code === input.activityCode);

  if (!current) {
    throw new HttpError(404, "Activite introuvable.");
  }

  if (current.isEnabled && !input.isEnabled && enabledCount <= 1) {
    throw new HttpError(400, "Au moins une activite doit rester active pour l'entreprise.");
  }

  await upsertCompanyActivity({
    companyId: actor.companyId,
    activityCode: input.activityCode,
    isEnabled: input.isEnabled
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: input.isEnabled ? "COMPANY_ACTIVITY_ENABLED" : "COMPANY_ACTIVITY_DISABLED",
    entityType: "COMPANY_ACTIVITY",
    entityId: input.activityCode,
    metadataJson: JSON.stringify({
      activityCode: input.activityCode,
      isEnabled: input.isEnabled
    })
  });

  const updatedItems = await listCompanyActivities(actor.companyId);
  const item = updatedItems.find((row) => row.code === input.activityCode);
  if (!item) {
    throw new HttpError(500, "Impossible de recharger l'activite mise a jour.");
  }

  return item;
}

export async function reclassifyLegacyCompanyData(
  actor: ActorContext,
  input: {
    targetActivityCode: BusinessActivityCode;
    scope: LegacyReclassificationScope;
  }
) {
  ensureAdminActivityAccess(actor.role);
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, input.targetActivityCode);

  let updatedTransactionsCount = 0;
  let updatedTasksCount = 0;

  if (input.scope === "TRANSACTIONS" || input.scope === "BOTH") {
    updatedTransactionsCount = await reclassifyLegacyTransactions(
      actor.companyId,
      input.targetActivityCode
    );
  }

  if (input.scope === "TASKS" || input.scope === "BOTH") {
    updatedTasksCount = await reclassifyLegacyTasks(actor.companyId, input.targetActivityCode);
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "COMPANY_ACTIVITY_LEGACY_RECLASSIFIED",
    entityType: "COMPANY_ACTIVITY",
    entityId: input.targetActivityCode,
    metadataJson: JSON.stringify({
      targetActivityCode: input.targetActivityCode,
      scope: input.scope,
      updatedTransactionsCount,
      updatedTasksCount
    })
  });

  return {
    targetActivityCode: input.targetActivityCode,
    scope: input.scope,
    updatedTransactionsCount,
    updatedTasksCount
  };
}
