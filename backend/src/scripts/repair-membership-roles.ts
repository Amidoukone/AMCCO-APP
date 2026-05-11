import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { closeDbPool, getDbPool, queryRows } from "../lib/db.js";
import {
  findSuspectMembershipRoleDowngrades,
  type CompanyCreationSnapshot,
  type MembershipRoleChangeSnapshot,
  type MembershipSnapshot
} from "../services/membership-role-repair.service.js";
import type { RoleCode } from "../types/role.js";

type MembershipRow = RowDataPacket & {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  role: RoleCode;
  createdAt: Date;
};

type CompanyCreationRow = RowDataPacket & {
  companyId: string;
  createdAt: Date;
};

type RoleChangeRow = RowDataPacket & {
  membershipId: string;
  userId: string | null;
  companyId: string;
  role: RoleCode | null;
  createdAt: Date;
};

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    windowMinutes: 10
  };
}

async function loadMemberships(): Promise<MembershipSnapshot[]> {
  const rows = await queryRows<MembershipRow[]>(
    `
      SELECT
        m.id AS membershipId,
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        c.id AS companyId,
        c.code AS companyCode,
        c.name AS companyName,
        m.role AS role,
        m.created_at AS createdAt
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      INNER JOIN companies c ON c.id = m.company_id
      WHERE u.is_active = 1
        AND c.is_active = 1
      ORDER BY u.email ASC, c.code ASC
    `
  );

  return rows.map((row) => ({
    membershipId: row.membershipId,
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    companyId: row.companyId,
    companyCode: row.companyCode,
    companyName: row.companyName,
    role: row.role,
    createdAt: new Date(row.createdAt).toISOString()
  }));
}

async function loadCompanyCreations(): Promise<CompanyCreationSnapshot[]> {
  const rows = await queryRows<CompanyCreationRow[]>(
    `
      SELECT
        entity_id AS companyId,
        created_at AS createdAt
      FROM audit_logs
      WHERE action = 'COMPANY_CREATED'
        AND entity_type = 'COMPANY'
      ORDER BY created_at ASC
    `
  );

  return rows.map((row) => ({
    companyId: row.companyId,
    createdAt: new Date(row.createdAt).toISOString()
  }));
}

async function loadRoleChanges(): Promise<MembershipRoleChangeSnapshot[]> {
  const rows = await queryRows<RoleChangeRow[]>(
    `
      SELECT
        entity_id AS membershipId,
        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.userId')) AS userId,
        company_id AS companyId,
        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.role')) AS role,
        created_at AS createdAt
      FROM audit_logs
      WHERE action = 'ADMIN_USER_ROLE_CHANGED'
        AND entity_type = 'MEMBERSHIP'
      ORDER BY created_at ASC
    `
  );

  return rows
    .filter((row): row is RoleChangeRow & { userId: string; role: RoleCode } => Boolean(row.userId && row.role))
    .map((row) => ({
      membershipId: row.membershipId,
      userId: row.userId,
      companyId: row.companyId,
      role: row.role,
      createdAt: new Date(row.createdAt).toISOString()
    }));
}

async function applyRepairs(
  suspects: ReturnType<typeof findSuspectMembershipRoleDowngrades>
): Promise<number> {
  if (suspects.length === 0) {
    return 0;
  }

  const connection = await getDbPool().getConnection();
  let appliedCount = 0;

  try {
    await connection.beginTransaction();

    for (const suspect of suspects) {
      const [result] = await connection.execute<ResultSetHeader>(
        `
          UPDATE memberships
          SET role = ?
          WHERE id = ?
            AND user_id = ?
            AND company_id = ?
            AND role = 'EMPLOYEE'
        `,
        [suspect.suggestedRole, suspect.membershipId, suspect.userId, suspect.companyId]
      );

      if (result.affectedRows !== 1) {
        continue;
      }

      await connection.execute<ResultSetHeader>(
        `
          UPDATE refresh_sessions
          SET revoked_at = NOW()
          WHERE company_id = ?
            AND user_id = ?
            AND revoked_at IS NULL
        `,
        [suspect.companyId, suspect.userId]
      );

      await connection.execute<ResultSetHeader>(
        `
          INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, 'DATA_REPAIR_MEMBERSHIP_ROLE_REALIGNED', 'MEMBERSHIP', ?, ?)
        `,
        [
          randomUUID(),
          suspect.companyId,
          suspect.userId,
          suspect.membershipId,
          JSON.stringify({
            userId: suspect.userId,
            email: suspect.email,
            previousRole: suspect.currentRole,
            repairedRole: suspect.suggestedRole,
            referenceCompanies: suspect.referenceCompanies,
            source: "repair-membership-roles-script"
          })
        ]
      );

      appliedCount += 1;
    }

    await connection.commit();
    return appliedCount;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [memberships, companyCreations, roleChanges] = await Promise.all([
    loadMemberships(),
    loadCompanyCreations(),
    loadRoleChanges()
  ]);

  const suspects = findSuspectMembershipRoleDowngrades({
    memberships,
    companyCreations,
    roleChanges,
    creationWindowMinutes: args.windowMinutes
  });

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        membershipsScanned: memberships.length,
        companyCreationsScanned: companyCreations.length,
        roleChangesScanned: roleChanges.length,
        suspectsFound: suspects.length,
        suspects
      },
      null,
      2
    )
  );

  if (!args.apply) {
    return;
  }

  const appliedCount = await applyRepairs(suspects);
  console.log(
    JSON.stringify(
      {
        mode: "apply",
        suspectsFound: suspects.length,
        repairsApplied: appliedCount
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
