import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { closeDbPool, getDbPool, queryRows } from "../lib/db.js";
import { hashPassword } from "../lib/password.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type Args = {
  apply: boolean;
  resetPassword: boolean;
  requireEmpty: boolean;
};

type BootstrapInput = {
  email: string;
  password: string;
  fullName: string;
  companyCode: string;
  companyName: string;
};

type UserRow = RowDataPacket & {
  userId: string;
  email: string;
  fullName: string;
  isActive: number;
};

type CompanyRecord = {
  companyId: string;
  companyCode: string;
  companyName: string;
  isActive: number;
};

type CompanyRow = RowDataPacket & CompanyRecord;

type MembershipRow = RowDataPacket & {
  membershipId: string;
  userId: string;
  companyId: string;
  role: RoleCode;
};

type CountRow = RowDataPacket & {
  total: number;
};

type DatabaseState = {
  usersCount: number;
  companiesCount: number;
  activeCompaniesCount: number;
};

type BootstrapSummary = {
  mode: "dry-run" | "apply";
  emptyProductionGuard: "passed" | "not-requested";
  databaseState: DatabaseState;
  email: string;
  fullName: string;
  targetRole: "SYS_ADMIN";
  passwordAction: "set-for-new-user" | "reset" | "unchanged";
  userAction: "create" | "activate" | "update-profile" | "unchanged";
  companyAction: "create-primary-company" | "use-existing-active-companies";
  companies: Array<{
    companyId: string;
    companyCode: string;
    companyName: string;
    membershipAction: "create" | "upgrade-to-sys-admin" | "unchanged";
    previousRole: RoleCode | null;
  }>;
};

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes("--apply"),
    resetPassword: argv.includes("--reset-password"),
    requireEmpty: argv.includes("--require-empty")
  };
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function normalizeCompanyCode(value: string | undefined): string {
  return (value ?? "AMCCO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getInputFromEnv(): BootstrapInput {
  const email = normalizeEmail(process.env.INITIAL_SYS_ADMIN_EMAIL);
  const password = process.env.INITIAL_SYS_ADMIN_PASSWORD ?? "";
  const fullName = (process.env.INITIAL_SYS_ADMIN_FULL_NAME ?? "").trim();
  const companyCode = normalizeCompanyCode(process.env.INITIAL_SYS_ADMIN_COMPANY_CODE);
  const companyName = (process.env.INITIAL_SYS_ADMIN_COMPANY_NAME ?? companyCode).trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INITIAL_SYS_ADMIN_EMAIL doit contenir un email valide.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("INITIAL_SYS_ADMIN_PASSWORD doit contenir entre 8 et 128 caracteres.");
  }
  if (fullName.length < 3 || fullName.length > 255) {
    throw new Error("INITIAL_SYS_ADMIN_FULL_NAME doit contenir entre 3 et 255 caracteres.");
  }
  if (companyCode.length < 2 || companyCode.length > 64) {
    throw new Error("INITIAL_SYS_ADMIN_COMPANY_CODE doit contenir entre 2 et 64 caracteres.");
  }
  if (companyName.length < 2 || companyName.length > 255) {
    throw new Error("INITIAL_SYS_ADMIN_COMPANY_NAME doit contenir entre 2 et 255 caracteres.");
  }

  return {
    email,
    password,
    fullName,
    companyCode,
    companyName
  };
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await queryRows<UserRow[]>(
    `
      SELECT
        id AS userId,
        email,
        full_name AS fullName,
        is_active AS isActive
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] ?? null;
}

async function listActiveCompanies(): Promise<CompanyRow[]> {
  return queryRows<CompanyRow[]>(
    `
      SELECT
        id AS companyId,
        code AS companyCode,
        name AS companyName,
        is_active AS isActive
      FROM companies
      WHERE is_active = 1
      ORDER BY
        CASE WHEN code = 'AMCCO' THEN 0 ELSE 1 END,
        code ASC,
        name ASC
    `
  );
}

async function findCompanyByCode(companyCode: string): Promise<CompanyRow | null> {
  const rows = await queryRows<CompanyRow[]>(
    `
      SELECT
        id AS companyId,
        code AS companyCode,
        name AS companyName,
        is_active AS isActive
      FROM companies
      WHERE code = ?
      LIMIT 1
    `,
    [companyCode]
  );

  return rows[0] ?? null;
}

async function findMembership(input: {
  userId: string;
  companyId: string;
}): Promise<MembershipRow | null> {
  const rows = await queryRows<MembershipRow[]>(
    `
      SELECT
        id AS membershipId,
        user_id AS userId,
        company_id AS companyId,
        role
      FROM memberships
      WHERE user_id = ?
        AND company_id = ?
      LIMIT 1
    `,
    [input.userId, input.companyId]
  );

  return rows[0] ?? null;
}

async function getDatabaseState(): Promise<DatabaseState> {
  const [userRows, companyRows, activeCompanyRows] = await Promise.all([
    queryRows<CountRow[]>(`SELECT COUNT(*) AS total FROM users`),
    queryRows<CountRow[]>(`SELECT COUNT(*) AS total FROM companies`),
    queryRows<CountRow[]>(`SELECT COUNT(*) AS total FROM companies WHERE is_active = 1`)
  ]);

  return {
    usersCount: userRows[0]?.total ?? 0,
    companiesCount: companyRows[0]?.total ?? 0,
    activeCompaniesCount: activeCompanyRows[0]?.total ?? 0
  };
}

async function getDatabaseStateForConnection(connection: PoolConnection): Promise<DatabaseState> {
  const [[userRows], [companyRows], [activeCompanyRows]] = await Promise.all([
    connection.query<CountRow[]>(`SELECT COUNT(*) AS total FROM users`),
    connection.query<CountRow[]>(`SELECT COUNT(*) AS total FROM companies`),
    connection.query<CountRow[]>(`SELECT COUNT(*) AS total FROM companies WHERE is_active = 1`)
  ]);

  return {
    usersCount: userRows[0]?.total ?? 0,
    companiesCount: companyRows[0]?.total ?? 0,
    activeCompaniesCount: activeCompanyRows[0]?.total ?? 0
  };
}

function assertEmptyProductionGuard(args: Args, databaseState: DatabaseState): void {
  if (!args.requireEmpty) {
    return;
  }

  if (databaseState.usersCount > 0 || databaseState.companiesCount > 0) {
    throw new Error(
      [
        "Bootstrap refuse: --require-empty est actif, mais la base contient deja des donnees.",
        `users=${databaseState.usersCount}`,
        `companies=${databaseState.companiesCount}`,
        "Retire --require-empty uniquement si tu veux reparer un bootstrap existant."
      ].join(" ")
    );
  }
}

async function seedCompanyActivities(connection: PoolConnection, companyId: string): Promise<void> {
  for (const activityCode of BUSINESS_ACTIVITY_CODES) {
    await connection.execute<ResultSetHeader>(
      `
        INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
        VALUES (?, ?, 1)
      `,
      [companyId, activityCode]
    );
  }
}

async function buildSummary(input: BootstrapInput, args: Args): Promise<BootstrapSummary> {
  const [existingUser, activeCompanies, databaseState] = await Promise.all([
    findUserByEmail(input.email),
    listActiveCompanies(),
    getDatabaseState()
  ]);
  assertEmptyProductionGuard(args, databaseState);

  let companyAction: BootstrapSummary["companyAction"] = "use-existing-active-companies";
  let companies: CompanyRecord[] = activeCompanies;

  if (activeCompanies.length === 0) {
    const existingTargetCompany = await findCompanyByCode(input.companyCode);
    if (existingTargetCompany && existingTargetCompany.isActive !== 1) {
      throw new Error(
        `L'entreprise ${input.companyCode} existe mais elle est inactive. Reactive-la manuellement ou choisis un autre code.`
      );
    }

    companyAction = "create-primary-company";
    companies = [
      existingTargetCompany
        ? {
            companyId: existingTargetCompany.companyId,
            companyCode: existingTargetCompany.companyCode,
            companyName: existingTargetCompany.companyName,
            isActive: existingTargetCompany.isActive
          }
        : {
            companyId: "<new-company-id>",
            companyCode: input.companyCode,
            companyName: input.companyName,
            isActive: 1
          }
    ];
  }

  const userAction: BootstrapSummary["userAction"] = !existingUser
    ? "create"
    : existingUser.isActive !== 1
      ? "activate"
      : existingUser.fullName !== input.fullName
        ? "update-profile"
        : "unchanged";

  const passwordAction: BootstrapSummary["passwordAction"] = !existingUser
    ? "set-for-new-user"
    : args.resetPassword
      ? "reset"
      : "unchanged";

  const membershipSummaries: BootstrapSummary["companies"] = [];
  for (const company of companies) {
    const membership =
      existingUser && !company.companyId.startsWith("<")
        ? await findMembership({
            userId: existingUser.userId,
            companyId: company.companyId
          })
        : null;

    membershipSummaries.push({
      companyId: company.companyId,
      companyCode: company.companyCode,
      companyName: company.companyName,
      previousRole: membership?.role ?? null,
      membershipAction: !membership
        ? "create"
        : membership.role === "SYS_ADMIN"
          ? "unchanged"
          : "upgrade-to-sys-admin"
    });
  }

  return {
    mode: args.apply ? "apply" : "dry-run",
    emptyProductionGuard: args.requireEmpty ? "passed" : "not-requested",
    databaseState,
    email: input.email,
    fullName: input.fullName,
    targetRole: "SYS_ADMIN",
    passwordAction,
    userAction,
    companyAction,
    companies: membershipSummaries
  };
}

async function applyBootstrap(input: BootstrapInput, args: Args): Promise<BootstrapSummary> {
  const connection = await getDbPool().getConnection();

  try {
    await connection.beginTransaction();

    const databaseState = await getDatabaseStateForConnection(connection);
    assertEmptyProductionGuard(args, databaseState);

    const [userRows] = await connection.query<UserRow[]>(
      `
        SELECT
          id AS userId,
          email,
          full_name AS fullName,
          is_active AS isActive
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [input.email]
    );
    const existingUser = userRows[0] ?? null;
    const userId = existingUser?.userId ?? randomUUID();
    const passwordHash = await hashPassword(input.password);

    let userAction: BootstrapSummary["userAction"] = "unchanged";
    let passwordAction: BootstrapSummary["passwordAction"] = "unchanged";

    if (!existingUser) {
      await connection.execute<ResultSetHeader>(
        `
          INSERT INTO users (id, email, password_hash, full_name, is_active)
          VALUES (?, ?, ?, ?, 1)
        `,
        [userId, input.email, passwordHash, input.fullName]
      );
      userAction = "create";
      passwordAction = "set-for-new-user";
    } else {
      const shouldUpdateProfile = existingUser.fullName !== input.fullName || existingUser.isActive !== 1;
      if (shouldUpdateProfile) {
        await connection.execute<ResultSetHeader>(
          `
            UPDATE users
            SET full_name = ?, is_active = 1
            WHERE id = ?
          `,
          [input.fullName, userId]
        );
        userAction = existingUser.isActive !== 1 ? "activate" : "update-profile";
      }

      if (args.resetPassword) {
        await connection.execute<ResultSetHeader>(
          `
            UPDATE users
            SET password_hash = ?
            WHERE id = ?
          `,
          [passwordHash, userId]
        );
        passwordAction = "reset";
      }
    }

    const [companyRows] = await connection.query<CompanyRow[]>(
      `
        SELECT
          id AS companyId,
          code AS companyCode,
          name AS companyName,
          is_active AS isActive
        FROM companies
        WHERE is_active = 1
        ORDER BY
          CASE WHEN code = 'AMCCO' THEN 0 ELSE 1 END,
          code ASC,
          name ASC
      `
    );

    let companyAction: BootstrapSummary["companyAction"] = "use-existing-active-companies";
    let companies: CompanyRecord[] = companyRows;

    if (companies.length === 0) {
      const [targetCompanyRows] = await connection.query<CompanyRow[]>(
        `
          SELECT
            id AS companyId,
            code AS companyCode,
            name AS companyName,
            is_active AS isActive
          FROM companies
          WHERE code = ?
          LIMIT 1
        `,
        [input.companyCode]
      );

      const existingTargetCompany = targetCompanyRows[0] ?? null;
      if (existingTargetCompany && existingTargetCompany.isActive !== 1) {
        throw new Error(
          `L'entreprise ${input.companyCode} existe mais elle est inactive. Reactive-la manuellement ou choisis un autre code.`
        );
      }

      const companyId = existingTargetCompany?.companyId ?? randomUUID();
      if (!existingTargetCompany) {
        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO companies (id, name, code, is_active)
            VALUES (?, ?, ?, 1)
          `,
          [companyId, input.companyName, input.companyCode]
        );
      }

      companyAction = "create-primary-company";
      companies = [
        {
          companyId,
          companyCode: input.companyCode,
          companyName: input.companyName,
          isActive: 1
        }
      ];
    }

    const membershipSummaries: BootstrapSummary["companies"] = [];
    for (const company of companies) {
      await seedCompanyActivities(connection, company.companyId);

      const [membershipRows] = await connection.query<MembershipRow[]>(
        `
          SELECT
            id AS membershipId,
            user_id AS userId,
            company_id AS companyId,
            role
          FROM memberships
          WHERE user_id = ?
            AND company_id = ?
          LIMIT 1
        `,
        [userId, company.companyId]
      );
      const membership = membershipRows[0] ?? null;
      const previousRole = membership?.role ?? null;
      let membershipAction: BootstrapSummary["companies"][number]["membershipAction"] = "unchanged";
      const membershipId = membership?.membershipId ?? randomUUID();

      if (!membership) {
        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO memberships (id, user_id, company_id, role)
            VALUES (?, ?, ?, 'SYS_ADMIN')
          `,
          [membershipId, userId, company.companyId]
        );
        membershipAction = "create";
      } else if (membership.role !== "SYS_ADMIN") {
        await connection.execute<ResultSetHeader>(
          `
            UPDATE memberships
            SET role = 'SYS_ADMIN'
            WHERE id = ?
          `,
          [membership.membershipId]
        );
        membershipAction = "upgrade-to-sys-admin";
      }

      if (
        membershipAction !== "unchanged" ||
        userAction !== "unchanged" ||
        passwordAction === "reset" ||
        passwordAction === "set-for-new-user"
      ) {
        await connection.execute<ResultSetHeader>(
          `
            UPDATE refresh_sessions
            SET revoked_at = NOW()
            WHERE user_id = ?
              AND company_id = ?
              AND revoked_at IS NULL
          `,
          [userId, company.companyId]
        );

        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
            VALUES (?, ?, ?, 'SYSTEM_ADMIN_BOOTSTRAPPED', 'USER', ?, ?)
          `,
          [
            randomUUID(),
            company.companyId,
            userId,
            userId,
            JSON.stringify({
              source: "bootstrap-system-admin-script",
              email: input.email,
              fullName: input.fullName,
              userAction,
              membershipAction,
              previousRole,
              role: "SYS_ADMIN",
              passwordAction
            })
          ]
        );
      }

      membershipSummaries.push({
        companyId: company.companyId,
        companyCode: company.companyCode,
        companyName: company.companyName,
        membershipAction,
        previousRole
      });
    }

    await connection.commit();

    return {
      mode: "apply",
      emptyProductionGuard: args.requireEmpty ? "passed" : "not-requested",
      databaseState,
      email: input.email,
      fullName: input.fullName,
      targetRole: "SYS_ADMIN",
      passwordAction,
      userAction,
      companyAction,
      companies: membershipSummaries
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input = getInputFromEnv();
  const summary = args.apply ? await applyBootstrap(input, args) : await buildSummary(input, args);

  console.log(JSON.stringify(summary, null, 2));

  if (!args.apply) {
    console.log("Dry-run uniquement. Relance avec --apply pour creer ou reparer le SYS_ADMIN.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
