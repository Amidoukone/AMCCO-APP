import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import type { RoleCode } from "../types/role.js";

export type AuthUserRecord = {
  userId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  userIsActive: number;
  companyId: string;
  companyCode: string;
  companyIsActive: number;
  role: RoleCode;
};

export type RefreshSessionRecord = {
  id: string;
  userId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

type AuthUserRow = RowDataPacket & AuthUserRecord;
type RefreshSessionRow = RowDataPacket & {
  id: string;
  user_id: string;
  company_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

export async function findAuthUserByEmailAndCompanyCode(
  email: string,
  companyCode: string
): Promise<AuthUserRecord | null> {
  const rows = await queryRows<AuthUserRow[]>(
    `
      SELECT
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        u.password_hash AS passwordHash,
        u.is_active AS userIsActive,
        c.id AS companyId,
        c.code AS companyCode,
        c.is_active AS companyIsActive,
        m.role AS role
      FROM users u
      INNER JOIN memberships m ON m.user_id = u.id
      INNER JOIN companies c ON c.id = m.company_id
      WHERE u.email = ?
        AND c.code = ?
      LIMIT 1
    `,
    [email, companyCode]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

export async function upsertRefreshSession(input: {
  id: string;
  userId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO refresh_sessions (id, user_id, company_id, token_hash, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        token_hash = VALUES(token_hash),
        expires_at = VALUES(expires_at),
        revoked_at = NULL,
        ip_address = VALUES(ip_address),
        user_agent = VALUES(user_agent)
    `,
    [
      input.id,
      input.userId,
      input.companyId,
      input.tokenHash,
      input.expiresAt,
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );
}

export async function findRefreshSessionById(sessionId: string): Promise<RefreshSessionRecord | null> {
  const rows = await queryRows<RefreshSessionRow[]>(
    `
      SELECT id, user_id, company_id, token_hash, expires_at, revoked_at
      FROM refresh_sessions
      WHERE id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}

export async function revokeRefreshSession(sessionId: string): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE id = ?
        AND revoked_at IS NULL
    `,
    [sessionId]
  );
}

export async function findUserProfileForCompany(
  userId: string,
  companyId: string
): Promise<{ userId: string; email: string; fullName: string; role: RoleCode } | null> {
  const rows = await queryRows<
    (RowDataPacket & { userId: string; email: string; fullName: string; role: RoleCode })[]
  >(
    `
      SELECT
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        m.role AS role
      FROM users u
      INNER JOIN memberships m ON m.user_id = u.id
      INNER JOIN companies c ON c.id = m.company_id
      WHERE u.id = ?
        AND c.id = ?
        AND u.is_active = 1
        AND c.is_active = 1
      LIMIT 1
    `,
    [userId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }
  return rows[0];
}

