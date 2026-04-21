import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import {
  countUserUnreadAlerts,
  createAlertRecords,
  listCompanyActiveUserIdsByRoles,
  listUserAlerts,
  markAllUserAlertsAsRead,
  markUserAlertAsRead,
  type AlertItem
} from "../repositories/alerts.repository.js";
import type { RoleCode } from "../types/role.js";

type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

function normalizeRecipientIds(recipientIds: string[]): string[] {
  return Array.from(new Set(recipientIds.map((id) => id.trim()).filter(Boolean)));
}

export async function createUserTargetedAlerts(input: {
  companyId: string;
  recipientUserIds: string[];
  code: string;
  message: string;
  severity: AlertSeverity;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const recipientUserIds = normalizeRecipientIds(input.recipientUserIds);
  if (recipientUserIds.length === 0) {
    return;
  }

  await createAlertRecords(
    recipientUserIds.map((targetUserId) => ({
      id: randomUUID(),
      companyId: input.companyId,
      targetUserId,
      code: input.code,
      message: input.message,
      severity: input.severity,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null
    }))
  );
}

export async function createRoleTargetedAlerts(input: {
  companyId: string;
  recipientRoles: RoleCode[];
  excludeUserIds?: string[];
  code: string;
  message: string;
  severity: AlertSeverity;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const targetUserIds = await listCompanyActiveUserIdsByRoles(input.companyId, input.recipientRoles);
  const excluded = new Set((input.excludeUserIds ?? []).map((id) => id.trim()).filter(Boolean));

  await createUserTargetedAlerts({
    companyId: input.companyId,
    recipientUserIds: targetUserIds.filter((userId) => !excluded.has(userId)),
    code: input.code,
    message: input.message,
    severity: input.severity,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata
  });
}

export async function listCurrentUserAlerts(
  actor: ActorContext,
  input: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    severity?: AlertSeverity;
    entityType?: string;
    entityId?: string;
  }
): Promise<{
  items: AlertItem[];
  unreadCount: number;
}> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const [items, unreadCount] = await Promise.all([
    listUserAlerts({
      companyId: actor.companyId,
      userId: actor.actorId,
      limit,
      offset,
      unreadOnly: input.unreadOnly,
      severity: input.severity,
      entityType: input.entityType,
      entityId: input.entityId
    }),
    countUserUnreadAlerts(actor.companyId, actor.actorId)
  ]);

  return {
    items,
    unreadCount
  };
}

export async function getCurrentUserAlertsSummary(actor: ActorContext): Promise<{
  unreadCount: number;
}> {
  return {
    unreadCount: await countUserUnreadAlerts(actor.companyId, actor.actorId)
  };
}

export async function markCurrentUserAlertAsRead(
  actor: ActorContext,
  input: {
    alertId: string;
  }
): Promise<void> {
  if (!input.alertId.trim()) {
    throw new HttpError(400, "Identifiant d'alerte invalide.");
  }

  await markUserAlertAsRead({
    companyId: actor.companyId,
    userId: actor.actorId,
    alertId: input.alertId
  });
}

export async function markAllCurrentUserAlertsAsRead(actor: ActorContext): Promise<void> {
  await markAllUserAlertsAsRead({
    companyId: actor.companyId,
    userId: actor.actorId
  });
}
