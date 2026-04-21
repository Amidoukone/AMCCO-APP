import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

type AuditRow = RowDataPacket & {
  id: string;
  companyId: string;
  actorId: string;
  actorEmail: string;
  actorFullName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string | null;
  createdAt: Date;
};

export type AuditLogItem = {
  id: string;
  companyId: string;
  actorId: string;
  actorEmail: string;
  actorFullName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
};

export async function createAuditLogRecord(input: {
  auditId: string;
  companyId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson?: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.auditId,
      input.companyId,
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      input.metadataJson ?? null
    ]
  );
}

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

export async function listAuditLogsByCompany(input: {
  companyId: string;
  limit: number;
  offset: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}): Promise<AuditLogItem[]> {
  const filters: string[] = ["a.company_id = ?"];
  const values: Array<string | number> = [input.companyId];

  if (input.action) {
    filters.push("a.action = ?");
    values.push(input.action);
  }

  if (input.actorId) {
    filters.push("a.actor_id = ?");
    values.push(input.actorId);
  }

  if (input.entityType) {
    filters.push("a.entity_type = ?");
    values.push(input.entityType);
  }

  if (input.entityId) {
    filters.push("a.entity_id = ?");
    values.push(input.entityId);
  }

  values.push(input.limit, input.offset);

  const rows = await queryRows<AuditRow[]>(
    `
      SELECT
        a.id AS id,
        a.company_id AS companyId,
        a.actor_id AS actorId,
        u.email AS actorEmail,
        u.full_name AS actorFullName,
        a.action AS action,
        a.entity_type AS entityType,
        a.entity_id AS entityId,
        CAST(a.metadata AS CHAR) AS metadata,
        a.created_at AS createdAt
      FROM audit_logs a
      INNER JOIN users u ON u.id = a.actor_id
      WHERE ${filters.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorFullName: row.actorFullName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: safeParseMetadata(row.metadata),
    createdAt: new Date(row.createdAt).toISOString()
  }));
}

export async function listAuditLogsByEntity(input: {
  companyId: string;
  entityType: string;
  entityId: string;
  limit: number;
  offset: number;
  actions?: string[];
}): Promise<AuditLogItem[]> {
  const filters: string[] = ["a.company_id = ?", "a.entity_type = ?", "a.entity_id = ?"];
  const values: Array<string | number> = [input.companyId, input.entityType, input.entityId];

  if (input.actions && input.actions.length > 0) {
    const placeholders = input.actions.map(() => "?").join(", ");
    filters.push(`a.action IN (${placeholders})`);
    values.push(...input.actions);
  }

  values.push(input.limit, input.offset);

  const rows = await queryRows<AuditRow[]>(
    `
      SELECT
        a.id AS id,
        a.company_id AS companyId,
        a.actor_id AS actorId,
        u.email AS actorEmail,
        u.full_name AS actorFullName,
        a.action AS action,
        a.entity_type AS entityType,
        a.entity_id AS entityId,
        CAST(a.metadata AS CHAR) AS metadata,
        a.created_at AS createdAt
      FROM audit_logs a
      INNER JOIN users u ON u.id = a.actor_id
      WHERE ${filters.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorFullName: row.actorFullName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: safeParseMetadata(row.metadata),
    createdAt: new Date(row.createdAt).toISOString()
  }));
}
