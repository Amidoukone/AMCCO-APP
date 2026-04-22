import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import type { RoleCode } from "../types/role.js";

type CompanyUserRow = RowDataPacket & {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  isActive: number;
  role: RoleCode;
  membershipCreatedAt: Date;
};

type MembershipRow = RowDataPacket & {
  membershipId: string;
  userId: string;
  companyId: string;
  role: RoleCode;
  email: string;
  fullName: string;
  isActive: number;
};

type UserRow = RowDataPacket & {
  userId: string;
  email: string;
  fullName: string;
  isActive: number;
};

export type CompanyUser = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: RoleCode;
  membershipCreatedAt: string;
};

export type MembershipRecord = {
  membershipId: string;
  userId: string;
  companyId: string;
  role: RoleCode;
  email: string;
  fullName: string;
  isActive: boolean;
};

export type UserRecord = {
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
};

function toCompanyUser(row: CompanyUserRow): CompanyUser {
  return {
    membershipId: row.membershipId,
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive === 1,
    role: row.role,
    membershipCreatedAt: new Date(row.membershipCreatedAt).toISOString()
  };
}

function toMembershipRecord(row: MembershipRow): MembershipRecord {
  return {
    membershipId: row.membershipId,
    userId: row.userId,
    companyId: row.companyId,
    role: row.role,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive === 1
  };
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive === 1
  };
}

export async function listCompanyUsers(companyId: string): Promise<CompanyUser[]> {
  const rows = await queryRows<CompanyUserRow[]>(
    `
      SELECT
        m.id AS membershipId,
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        u.is_active AS isActive,
        m.role AS role,
        m.created_at AS membershipCreatedAt
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?
      ORDER BY u.full_name ASC, u.email ASC
    `,
    [companyId]
  );

  return rows.map(toCompanyUser);
}

export async function listCompanyUsersByRoles(
  companyId: string,
  roles: RoleCode[]
): Promise<CompanyUser[]> {
  if (roles.length === 0) {
    return [];
  }

  const placeholders = roles.map(() => "?").join(", ");
  const rows = await queryRows<CompanyUserRow[]>(
    `
      SELECT
        m.id AS membershipId,
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        u.is_active AS isActive,
        m.role AS role,
        m.created_at AS membershipCreatedAt
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?
        AND m.role IN (${placeholders})
      ORDER BY u.full_name ASC, u.email ASC
    `,
    [companyId, ...roles]
  );

  return rows.map(toCompanyUser);
}

export async function findMembershipByCompanyAndUser(
  companyId: string,
  userId: string
): Promise<MembershipRecord | null> {
  const rows = await queryRows<MembershipRow[]>(
    `
      SELECT
        m.id AS membershipId,
        m.user_id AS userId,
        m.company_id AS companyId,
        m.role AS role,
        u.email AS email,
        u.full_name AS fullName,
        u.is_active AS isActive
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?
        AND m.user_id = ?
      LIMIT 1
    `,
    [companyId, userId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toMembershipRecord(rows[0]);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await queryRows<UserRow[]>(
    `
      SELECT
        id AS userId,
        email AS email,
        full_name AS fullName,
        is_active AS isActive
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  if (rows.length === 0) {
    return null;
  }
  return toUserRecord(rows[0]);
}

export async function listAllUsers(): Promise<UserRecord[]> {
  const rows = await queryRows<UserRow[]>(
    `
      SELECT
        id AS userId,
        email AS email,
        full_name AS fullName,
        is_active AS isActive
      FROM users
      ORDER BY full_name ASC, email ASC
    `
  );

  return rows.map(toUserRecord);
}

export async function createUser(input: {
  userId: string;
  email: string;
  fullName: string;
  passwordHash: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO users (id, email, password_hash, full_name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `,
    [input.userId, input.email, input.passwordHash, input.fullName]
  );
}

export async function updateUserProfile(input: {
  userId: string;
  fullName?: string;
  isActive?: boolean;
}): Promise<void> {
  const fields: string[] = [];
  const values: Array<string | number> = [];

  if (typeof input.fullName === "string") {
    fields.push("full_name = ?");
    values.push(input.fullName);
  }
  if (typeof input.isActive === "boolean") {
    fields.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(input.userId);

  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = ?
    `,
    values
  );
}

export async function updateUserPasswordHash(input: {
  userId: string;
  passwordHash: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `,
    [input.passwordHash, input.userId]
  );
}

export async function createMembership(input: {
  membershipId: string;
  companyId: string;
  userId: string;
  role: RoleCode;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO memberships (id, user_id, company_id, role)
      VALUES (?, ?, ?, ?)
    `,
    [input.membershipId, input.userId, input.companyId, input.role]
  );
}

export async function createMembershipIfMissing(input: {
  membershipId: string;
  companyId: string;
  userId: string;
  role: RoleCode;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT IGNORE INTO memberships (id, user_id, company_id, role)
      VALUES (?, ?, ?, ?)
    `,
    [input.membershipId, input.userId, input.companyId, input.role]
  );
}

export async function updateMembershipRole(input: {
  companyId: string;
  userId: string;
  role: RoleCode;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE memberships
      SET role = ?
      WHERE company_id = ?
        AND user_id = ?
    `,
    [input.role, input.companyId, input.userId]
  );
}

export async function deleteMembership(companyId: string, userId: string): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM memberships
      WHERE company_id = ?
        AND user_id = ?
    `,
    [companyId, userId]
  );
}

export async function revokeRefreshSessionsForUserInCompany(
  companyId: string,
  userId: string
): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE refresh_sessions
      SET revoked_at = NOW()
      WHERE company_id = ?
        AND user_id = ?
        AND revoked_at IS NULL
    `,
    [companyId, userId]
  );
}

export async function countOwnersInCompany(companyId: string): Promise<number> {
  const rows = await queryRows<(RowDataPacket & { total: number })[]>(
    `
      SELECT COUNT(*) AS total
      FROM memberships
      WHERE company_id = ?
        AND role = 'OWNER'
    `,
    [companyId]
  );
  return rows[0]?.total ?? 0;
}
