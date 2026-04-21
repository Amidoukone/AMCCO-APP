import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import type { RoleCode } from "../types/role.js";

type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

type AlertRow = RowDataPacket & {
  id: string;
  companyId: string;
  targetUserId: string;
  code: string;
  message: string;
  severity: AlertSeverity;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  readAt: Date | null;
  createdAt: Date;
};

type AlertRecipientRow = RowDataPacket & {
  userId: string;
};

type AlertCountRow = RowDataPacket & {
  total: number;
};

export type AlertItem = {
  id: string;
  companyId: string;
  targetUserId: string;
  code: string;
  message: string;
  severity: AlertSeverity;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
};

function safeParseMetadata(raw: string | null): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toAlertItem(row: AlertRow): AlertItem {
  return {
    id: row.id,
    companyId: row.companyId,
    targetUserId: row.targetUserId,
    code: row.code,
    message: row.message,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: safeParseMetadata(row.metadata),
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

export async function listCompanyActiveUserIdsByRoles(
  companyId: string,
  roles: RoleCode[]
): Promise<string[]> {
  if (roles.length === 0) {
    return [];
  }

  const placeholders = roles.map(() => "?").join(", ");
  const rows = await queryRows<AlertRecipientRow[]>(
    `
      SELECT DISTINCT
        m.user_id AS userId
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?
        AND u.is_active = 1
        AND m.role IN (${placeholders})
    `,
    [companyId, ...roles]
  );

  return rows.map((row) => row.userId);
}

export async function createAlertRecords(
  inputs: Array<{
    id: string;
    companyId: string;
    targetUserId: string;
    code: string;
    message: string;
    severity: AlertSeverity;
    entityType?: string | null;
    entityId?: string | null;
    metadataJson?: string | null;
  }>
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  const placeholders = inputs.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = inputs.flatMap((item) => [
    item.id,
    item.companyId,
    item.targetUserId,
    item.code,
    item.message,
    item.severity,
    item.entityType ?? null,
    item.entityId ?? null,
    item.metadataJson ?? null
  ]);

  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO alerts (
        id,
        company_id,
        target_user_id,
        code,
        message,
        severity,
        entity_type,
        entity_id,
        metadata
      )
      VALUES ${placeholders}
    `,
    values
  );
}

export async function listUserAlerts(input: {
  companyId: string;
  userId: string;
  limit: number;
  offset: number;
  unreadOnly?: boolean;
  severity?: AlertSeverity;
  entityType?: string;
  entityId?: string;
}): Promise<AlertItem[]> {
  const filters: string[] = ["company_id = ?", "target_user_id = ?"];
  const values: Array<string | number> = [input.companyId, input.userId];

  if (input.unreadOnly) {
    filters.push("read_at IS NULL");
  }

  if (input.severity) {
    filters.push("severity = ?");
    values.push(input.severity);
  }

  if (input.entityType) {
    filters.push("entity_type = ?");
    values.push(input.entityType);
  }

  if (input.entityId) {
    filters.push("entity_id = ?");
    values.push(input.entityId);
  }

  values.push(input.limit, input.offset);

  const rows = await queryRows<AlertRow[]>(
    `
      SELECT
        id AS id,
        company_id AS companyId,
        target_user_id AS targetUserId,
        code AS code,
        message AS message,
        severity AS severity,
        entity_type AS entityType,
        entity_id AS entityId,
        CAST(metadata AS CHAR) AS metadata,
        read_at AS readAt,
        created_at AS createdAt
      FROM alerts
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map(toAlertItem);
}

export async function countUserUnreadAlerts(companyId: string, userId: string): Promise<number> {
  const rows = await queryRows<AlertCountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM alerts
      WHERE company_id = ?
        AND target_user_id = ?
        AND read_at IS NULL
    `,
    [companyId, userId]
  );

  return rows[0]?.total ?? 0;
}

export async function markUserAlertAsRead(input: {
  companyId: string;
  userId: string;
  alertId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE alerts
      SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
      WHERE id = ?
        AND company_id = ?
        AND target_user_id = ?
    `,
    [input.alertId, input.companyId, input.userId]
  );
}

export async function markAllUserAlertsAsRead(input: {
  companyId: string;
  userId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE alerts
      SET read_at = UTC_TIMESTAMP()
      WHERE company_id = ?
        AND target_user_id = ?
        AND read_at IS NULL
    `,
    [input.companyId, input.userId]
  );
}
