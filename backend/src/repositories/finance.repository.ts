import { withBeverageStockWrite } from "./beverage-stock.repository.js";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import { buildListSearchFilters } from "../utils/list-search.js";
import { toMetadataStringMap } from "../utils/metadata.js";
import {
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

export type FinancialAccountScopeType = "GLOBAL" | "DEDICATED" | "RESTRICTED";
export type SalaryPaymentMethod = "BANK_TRANSFER" | "CASH" | "MOBILE_MONEY" | "CHEQUE";
export type SalaryConfirmationStatus = "NOT_REQUIRED" | "PENDING" | "CONFIRMED";

type AccountRow = RowDataPacket & {
  id: string;
  companyId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivitiesCsv: string | null;
  transactionsCount: number;
  createdAt: Date;
};

type FinancialAccountsSummaryRow = RowDataPacket & {
  totalCount: number | string;
  globalCount: number | string;
  dedicatedCount: number | string;
  restrictedCount: number | string;
  compatibleCount: number | string;
  dedicatedToSelectedActivityCount: number | string;
  restrictedToSelectedActivityCount: number | string;
};

type TransactionRow = RowDataPacket & {
  id: string;
  companyId: string;
  accountId: string;
  accountName: string;
  accountRef: string | null;
  accountScopeType: FinancialAccountScopeType;
  accountPrimaryActivityCode: BusinessActivityCode | null;
  accountAllowedActivitiesCsv: string | null;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string | null;
  metadataJson: unknown;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  requiresProof: number;
  createdById: string;
  createdByEmail: string;
  validatedById: string | null;
  validatedByEmail: string | null;
  salaryConfirmationStatus: SalaryConfirmationStatus;
  salaryConfirmedById: string | null;
  salaryConfirmedByEmail: string | null;
  salaryConfirmedAt: Date | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  proofsCount: number;
};

type ProofRow = RowDataPacket & {
  id: string;
  transactionId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
};

type TransactionMinimalRow = RowDataPacket & {
  id: string;
  companyId: string;
  createdById: string;
  activityCode: BusinessActivityCode | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  requiresProof: number;
  salaryConfirmationStatus: SalaryConfirmationStatus;
};

export type FinancialAccount = {
  id: string;
  companyId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  transactionsCount: number;
  createdAt: string;
};

export type FinancialTransaction = {
  id: string;
  companyId: string;
  accountId: string;
  accountName: string;
  accountRef: string | null;
  accountScopeType: FinancialAccountScopeType;
  accountPrimaryActivityCode: BusinessActivityCode | null;
  accountAllowedActivityCodes: BusinessActivityCode[];
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string | null;
  metadata: Record<string, string>;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  requiresProof: boolean;
  createdById: string;
  createdByEmail: string;
  validatedById: string | null;
  validatedByEmail: string | null;
  salaryConfirmationStatus: SalaryConfirmationStatus;
  salaryConfirmedById: string | null;
  salaryConfirmedByEmail: string | null;
  salaryConfirmedAt: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  proofsCount: number;
};

export type TransactionProof = {
  id: string;
  transactionId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

export type TransactionMinimal = {
  id: string;
  companyId: string;
  createdById: string;
  activityCode: BusinessActivityCode | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  requiresProof: boolean;
  salaryConfirmationStatus: SalaryConfirmationStatus;
};

export type SalaryTransaction = FinancialTransaction & {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: RoleCode;
  payPeriod: string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
  paymentMethod: SalaryPaymentMethod;
  note: string | null;
};

function toAllowedActivityCodes(
  scopeType: FinancialAccountScopeType,
  primaryActivityCode: BusinessActivityCode | null,
  raw: string | null
): BusinessActivityCode[] {
  if (scopeType === "DEDICATED" && primaryActivityCode) {
    return [primaryActivityCode];
  }

  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(isBusinessActivityCode)
    )
  );
}

function toAccount(row: AccountRow): FinancialAccount {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    accountRef: row.accountRef,
    balance: row.balance,
    scopeType: row.scopeType,
    primaryActivityCode: row.primaryActivityCode,
    allowedActivityCodes: toAllowedActivityCodes(
      row.scopeType,
      row.primaryActivityCode,
      row.allowedActivitiesCsv
    ),
    transactionsCount: row.transactionsCount ?? 0,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

function toTransaction(row: TransactionRow): FinancialTransaction {
  return {
    id: row.id,
    companyId: row.companyId,
    accountId: row.accountId,
    accountName: row.accountName,
    accountRef: row.accountRef,
    accountScopeType: row.accountScopeType,
    accountPrimaryActivityCode: row.accountPrimaryActivityCode,
    accountAllowedActivityCodes: toAllowedActivityCodes(
      row.accountScopeType,
      row.accountPrimaryActivityCode,
      row.accountAllowedActivitiesCsv
    ),
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    activityCode: row.activityCode,
    description: row.description,
    metadata: toMetadataStringMap(row.metadataJson),
    status: row.status,
    requiresProof: row.requiresProof === 1,
    createdById: row.createdById,
    createdByEmail: row.createdByEmail,
    validatedById: row.validatedById,
    validatedByEmail: row.validatedByEmail,
    salaryConfirmationStatus: row.salaryConfirmationStatus,
    salaryConfirmedById: row.salaryConfirmedById,
    salaryConfirmedByEmail: row.salaryConfirmedByEmail,
    salaryConfirmedAt: row.salaryConfirmedAt ? new Date(row.salaryConfirmedAt).toISOString() : null,
    occurredAt: new Date(row.occurredAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    proofsCount: row.proofsCount ?? 0
  };
}

function toProof(row: ProofRow): TransactionProof {
  return {
    id: row.id,
    transactionId: row.transactionId,
    storageKey: row.storageKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    uploadedAt: new Date(row.uploadedAt).toISOString()
  };
}

function toTransactionMinimal(row: TransactionMinimalRow): TransactionMinimal {
  return {
    id: row.id,
    companyId: row.companyId,
    createdById: row.createdById,
    activityCode: row.activityCode,
    status: row.status,
    requiresProof: row.requiresProof === 1,
    salaryConfirmationStatus: row.salaryConfirmationStatus
  };
}

export async function listFinancialAccounts(input: {
  companyId: string;
  activityCode?: BusinessActivityCode;
  sectorOnly?: boolean;
}): Promise<FinancialAccount[]> {
  const filters: string[] = ["fa.company_id = ?"];
  const filterValues: Array<string | number> = [];

  if (input.activityCode) {
    if (input.sectorOnly) {
      filters.push(`(
        (fa.scope_type = 'DEDICATED' AND fa.primary_activity_code = ?)
        OR (fa.scope_type = 'RESTRICTED'
          AND EXISTS (SELECT 1 FROM financial_account_activities faa WHERE faa.account_id = fa.id AND faa.activity_code = ?)
          AND NOT EXISTS (SELECT 1 FROM financial_account_activities other_faa WHERE other_faa.account_id = fa.id AND other_faa.activity_code <> ?))
      )`);
      filterValues.push(input.activityCode, input.activityCode, input.activityCode);
    } else {
      filters.push(`(
        fa.scope_type = 'GLOBAL'
        OR (fa.scope_type = 'DEDICATED' AND fa.primary_activity_code = ?)
        OR (fa.scope_type = 'RESTRICTED' AND EXISTS (
          SELECT 1 FROM financial_account_activities faa
          WHERE faa.account_id = fa.id AND faa.activity_code = ?
        ))
      )`);
      filterValues.push(input.activityCode, input.activityCode);
    }
  }

  const countActivityFilter = input.sectorOnly && input.activityCode ? "AND t.activity_code = ?" : "";
  const values: Array<string | number> = [
    ...(countActivityFilter ? [input.activityCode as BusinessActivityCode] : []),
    input.companyId,
    ...filterValues
  ];

  const rows = await queryRows<AccountRow[]>(
    `
      SELECT
        fa.id AS id,
        fa.company_id AS companyId,
        fa.name AS name,
        fa.account_ref AS accountRef,
        CAST(fa.balance AS CHAR) AS balance,
        fa.scope_type AS scopeType,
        fa.primary_activity_code AS primaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS allowedActivitiesCsv,
        (
          SELECT COUNT(*)
          FROM transactions t
          WHERE t.account_id = fa.id ${countActivityFilter}
        ) AS transactionsCount,
        fa.created_at AS createdAt
      FROM financial_accounts fa
      WHERE ${filters.join(" AND ")}
      ORDER BY fa.name ASC
    `,
    values
  );
  return rows.map(toAccount);
}

export async function getFinancialAccountsSummary(input: {
  companyId: string;
  activityCode?: BusinessActivityCode;
}): Promise<{
  totalCount: number;
  globalCount: number;
  dedicatedCount: number;
  restrictedCount: number;
  compatibleCount: number;
  incompatibleCount: number;
  dedicatedToSelectedActivityCount: number;
  restrictedToSelectedActivityCount: number;
}> {
  const activityCode = input.activityCode;
  const compatibleCountSql = activityCode
    ? `COALESCE(SUM(CASE WHEN
        fa.scope_type = 'GLOBAL'
        OR fa.primary_activity_code = ?
        OR EXISTS (
          SELECT 1
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
            AND faa.activity_code = ?
        )
      THEN 1 ELSE 0 END), 0)`
    : "COUNT(*)";
  const dedicatedCountSql = activityCode
    ? "COALESCE(SUM(CASE WHEN fa.scope_type = 'DEDICATED' AND fa.primary_activity_code = ? THEN 1 ELSE 0 END), 0)"
    : "0";
  const restrictedCountSql = activityCode
    ? `COALESCE(SUM(CASE WHEN
        fa.scope_type = 'RESTRICTED'
        AND EXISTS (
          SELECT 1
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
            AND faa.activity_code = ?
        )
      THEN 1 ELSE 0 END), 0)`
    : "0";
  const values: string[] = activityCode
    ? [activityCode, activityCode, activityCode, activityCode, input.companyId]
    : [input.companyId];

  const rows = await queryRows<FinancialAccountsSummaryRow[]>(
    `
      SELECT
        COUNT(*) AS totalCount,
        COALESCE(SUM(fa.scope_type = 'GLOBAL'), 0) AS globalCount,
        COALESCE(SUM(fa.scope_type = 'DEDICATED'), 0) AS dedicatedCount,
        COALESCE(SUM(fa.scope_type = 'RESTRICTED'), 0) AS restrictedCount,
        ${compatibleCountSql} AS compatibleCount,
        ${dedicatedCountSql} AS dedicatedToSelectedActivityCount,
        ${restrictedCountSql} AS restrictedToSelectedActivityCount
      FROM financial_accounts fa
      WHERE fa.company_id = ?
    `,
    values
  );

  const summary = rows[0];
  const totalCount = Number(summary?.totalCount ?? 0);
  const compatibleCount = Number(summary?.compatibleCount ?? 0);
  return {
    totalCount,
    globalCount: Number(summary?.globalCount ?? 0),
    dedicatedCount: Number(summary?.dedicatedCount ?? 0),
    restrictedCount: Number(summary?.restrictedCount ?? 0),
    compatibleCount,
    incompatibleCount: Math.max(totalCount - compatibleCount, 0),
    dedicatedToSelectedActivityCount: Number(summary?.dedicatedToSelectedActivityCount ?? 0),
    restrictedToSelectedActivityCount: Number(summary?.restrictedToSelectedActivityCount ?? 0)
  };
}

export async function createFinancialAccount(input: {
  id: string;
  companyId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO financial_accounts (
        id, company_id, name, account_ref, balance, scope_type, primary_activity_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.id,
      input.companyId,
      input.name,
      input.accountRef,
      input.balance,
      input.scopeType,
      input.primaryActivityCode
    ]
  );

  if (input.allowedActivityCodes.length > 0) {
    const valuesSql = input.allowedActivityCodes.map(() => "(?, ?)").join(", ");
    const values: Array<string> = [];

    for (const activityCode of input.allowedActivityCodes) {
      values.push(input.id, activityCode);
    }

    await getDbPool().execute<ResultSetHeader>(
      `
        INSERT INTO financial_account_activities (account_id, activity_code)
        VALUES ${valuesSql}
      `,
      values
    );
  }
}

export async function updateFinancialAccount(input: {
  companyId: string;
  accountId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): Promise<void> {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      `
        UPDATE financial_accounts
        SET
          name = ?,
          account_ref = ?,
          balance = ?,
          scope_type = ?,
          primary_activity_code = ?
        WHERE company_id = ?
          AND id = ?
      `,
      [
        input.name,
        input.accountRef,
        input.balance,
        input.scopeType,
        input.primaryActivityCode,
        input.companyId,
        input.accountId
      ]
    );
    await connection.execute<ResultSetHeader>(
      `
        DELETE FROM financial_account_activities
        WHERE account_id = ?
      `,
      [input.accountId]
    );

    if (input.allowedActivityCodes.length > 0) {
      const valuesSql = input.allowedActivityCodes.map(() => "(?, ?)").join(", ");
      const values: Array<string> = [];

      for (const activityCode of input.allowedActivityCodes) {
        values.push(input.accountId, activityCode);
      }

      await connection.execute<ResultSetHeader>(
        `
          INSERT INTO financial_account_activities (account_id, activity_code)
          VALUES ${valuesSql}
        `,
        values
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteFinancialAccount(input: {
  companyId: string;
  accountId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM financial_accounts
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.accountId]
  );
}

export async function findFinancialAccountById(
  companyId: string,
  accountId: string
): Promise<FinancialAccount | null> {
  const rows = await queryRows<AccountRow[]>(
    `
      SELECT
        fa.id AS id,
        fa.company_id AS companyId,
        fa.name AS name,
        fa.account_ref AS accountRef,
        CAST(fa.balance AS CHAR) AS balance,
        fa.scope_type AS scopeType,
        fa.primary_activity_code AS primaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS allowedActivitiesCsv,
        (
          SELECT COUNT(*)
          FROM transactions t
          WHERE t.account_id = fa.id
        ) AS transactionsCount,
        fa.created_at AS createdAt
      FROM financial_accounts fa
      WHERE fa.company_id = ?
        AND fa.id = ?
      LIMIT 1
    `,
    [companyId, accountId]
  );
  if (rows.length === 0) {
    return null;
  }
  return toAccount(rows[0]);
}

export async function createFinancialTransaction(input: {
  id: string;
  companyId: string;
  accountId: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string | null;
  metadata: Record<string, string>;
  requiresProof: boolean;
  salaryConfirmationStatus?: SalaryConfirmationStatus;
  createdById: string;
  occurredAt: Date;
}): Promise<void> {
  const persist = async (executor: Pick<PoolConnection, "execute">, metadata: Record<string, string> = input.metadata) => {
    await executor.execute<ResultSetHeader>(
      `
        INSERT INTO transactions (
          id, company_id, account_id, type, amount, currency, activity_code, description, metadata_json,
          status, requires_proof, salary_confirmation_status, created_by_id, occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
      `,
      [
        input.id,
        input.companyId,
        input.accountId,
        input.type,
        input.amount,
        input.currency,
        input.activityCode,
        input.description,
        JSON.stringify(metadata),
        input.requiresProof ? 1 : 0,
        input.salaryConfirmationStatus ?? "NOT_REQUIRED",
        input.createdById,
        input.occurredAt
      ]
    );
  };
  if (input.activityCode === "BEVERAGE_DEPOT") {
    await withBeverageStockWrite({ companyId: input.companyId, transactionId: input.id, action: "create", activityCode: input.activityCode, metadata: input.metadata, occurredAt: input.occurredAt }, async (connection, metadata) => {
      Object.keys(input.metadata).forEach((key) => { delete input.metadata[key]; });
      Object.assign(input.metadata, metadata);
      await persist(connection, metadata);
    });
  } else {
    await persist(getDbPool());
  }
}

export async function updateFinancialTransaction(input: {
  stockControlled?: boolean;
  companyId: string;
  transactionId: string;
  accountId: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string | null;
  metadata: Record<string, string>;
  requiresProof: boolean;
  salaryConfirmationStatus?: SalaryConfirmationStatus;
  occurredAt: Date;
}): Promise<void> {
  const persist = async (executor: Pick<PoolConnection, "execute">, metadata: Record<string, string> = input.metadata) => {
    await executor.execute<ResultSetHeader>(
      `
        UPDATE transactions
        SET account_id = ?,
            type = ?,
            amount = ?,
            currency = ?,
            activity_code = ?,
            description = ?,
            metadata_json = ?,
            requires_proof = ?,
            status = 'DRAFT',
            validated_by_id = NULL,
            salary_confirmation_status = ?,
            salary_confirmed_by_id = NULL,
            salary_confirmed_at = NULL,
            occurred_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ?
          AND id = ?
      `,
      [
        input.accountId,
        input.type,
        input.amount,
        input.currency,
        input.activityCode,
        input.description,
        JSON.stringify(metadata),
        input.requiresProof ? 1 : 0,
        input.salaryConfirmationStatus ?? "NOT_REQUIRED",
        input.occurredAt,
        input.companyId,
        input.transactionId
      ]
    );
  };
  if (input.stockControlled || input.activityCode === "BEVERAGE_DEPOT") {
    await withBeverageStockWrite({ companyId: input.companyId, transactionId: input.transactionId, action: "update", activityCode: input.activityCode, metadata: input.metadata, occurredAt: input.occurredAt }, async (connection, metadata) => {
      Object.keys(input.metadata).forEach((key) => { delete input.metadata[key]; });
      Object.assign(input.metadata, metadata);
      await persist(connection, metadata);
    });
  } else {
    await persist(getDbPool());
  }
}

export async function deleteFinancialTransaction(input: {
  stockControlled?: boolean;
  companyId: string;
  transactionId: string;
}): Promise<void> {
  const persist = async (executor: Pick<PoolConnection, "execute">, metadata: Record<string, string> = {}) => {
    await executor.execute<ResultSetHeader>(
      `
        DELETE FROM transactions
        WHERE company_id = ?
          AND id = ?
      `,
      [input.companyId, input.transactionId]
    );
  };
  if (input.stockControlled) {
    await withBeverageStockWrite({ companyId: input.companyId, transactionId: input.transactionId, action: "delete" }, persist);
  } else {
    await persist(getDbPool());
  }
}

export async function listFinancialTransactions(input: {
  search?: string;
  companyId: string;
  limit: number;
  offset: number;
  createdById?: string;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  type?: "CASH_IN" | "CASH_OUT";
  activityCode?: BusinessActivityCode;
}): Promise<FinancialTransaction[]> {
  const filters: string[] = ["t.company_id = ?", "t.activity_code IS NOT NULL"];
  const values: Array<string | number> = [input.companyId];

  if (input.createdById) {
    filters.push("t.created_by_id = ?");
    values.push(input.createdById);
  }

  if (input.status) {
    filters.push("t.status = ?");
    values.push(input.status);
  }
  if (input.type) {
    filters.push("t.type = ?");
    values.push(input.type);
  }
  if (input.activityCode) {
    filters.push("t.activity_code = ?");
    values.push(input.activityCode);
  }

  const search = buildListSearchFilters(input.search, [
    "t.id", "t.description", "fa.name", "fa.account_ref", "cu.email",
    "CAST(t.amount AS CHAR)", "t.currency", "CAST(t.metadata_json AS CHAR)"
  ]);
  filters.push(...search.filters);
  values.push(...search.values, input.limit, input.offset);

  const rows = await queryRows<TransactionRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.account_id AS accountId,
        fa.name AS accountName,
        fa.account_ref AS accountRef,
        fa.scope_type AS accountScopeType,
        fa.primary_activity_code AS accountPrimaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS accountAllowedActivitiesCsv,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        t.description AS description,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.requires_proof AS requiresProof,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        t.validated_by_id AS validatedById,
        vu.email AS validatedByEmail,
        t.salary_confirmation_status AS salaryConfirmationStatus,
        t.salary_confirmed_by_id AS salaryConfirmedById,
        su.email AS salaryConfirmedByEmail,
        t.salary_confirmed_at AS salaryConfirmedAt,
        t.occurred_at AS occurredAt,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM transaction_proofs tp
          WHERE tp.transaction_id = t.id
        ) AS proofsCount
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users vu ON vu.id = t.validated_by_id
      LEFT JOIN users su ON su.id = t.salary_confirmed_by_id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map(toTransaction);
}

export async function summarizeDumpTruckTransactions(input: {
  companyId: string;
  period: string;
}): Promise<Array<{
  currency: string;
  operationsCount: number;
  incomeTotal: string;
  amccoTotal: string;
  expensesTotal: string;
  netSettlementTotal: string;
}>> {
  const rows = await queryRows<Array<RowDataPacket & {
    currency: string;
    operationsCount: number;
    incomeTotal: string;
    amccoTotal: string;
    expensesTotal: string;
    netSettlementTotal: string;
  }>>(
    `
      SELECT
        currency AS currency,
        COUNT(*) AS operationsCount,
        COALESCE(CAST(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END) AS CHAR), '0.00') AS incomeTotal,
        COALESCE(CAST(SUM(CASE
          WHEN type = 'CASH_IN' THEN COALESCE(
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.amccoAmount')), '') AS DECIMAL(18, 2)),
            0
          )
          ELSE 0
        END) AS CHAR), '0.00') AS amccoTotal,
        COALESCE(CAST(SUM(CASE
          WHEN type = 'CASH_OUT' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.dumpTruckOperationKind')), '') <> 'VERSEMENT_AMCCO'
            THEN amount
          ELSE 0
        END) AS CHAR), '0.00') AS expensesTotal,
        COALESCE(CAST(
          SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END) -
          SUM(CASE
            WHEN type = 'CASH_IN' THEN COALESCE(
              CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.amccoAmount')), '') AS DECIMAL(18, 2)),
              0
            )
            ELSE 0
          END) -
          SUM(CASE
            WHEN type = 'CASH_OUT' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.dumpTruckOperationKind')), '') <> 'VERSEMENT_AMCCO'
              THEN amount
            ELSE 0
          END)
        AS CHAR), '0.00') AS netSettlementTotal
      FROM transactions
      WHERE company_id = ?
        AND activity_code = 'TRANSPORT'
        AND status IN ('SUBMITTED', 'APPROVED')
        AND occurred_at >= CONCAT(?, '-01')
        AND occurred_at < DATE_ADD(CONCAT(?, '-01'), INTERVAL 1 MONTH)
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.transportCategory')) = 'Camion benne'
      GROUP BY currency
      ORDER BY currency ASC
    `,
    [input.companyId, input.period, input.period]
  );

  return rows;
}

export async function listSalaryTransactions(input: {
  companyId: string;
  limit: number;
  offset: number;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  employeeUserId?: string;
  payPeriod?: string;
}): Promise<FinancialTransaction[]> {
  const filters: string[] = [
    "t.company_id = ?",
    "t.type = 'CASH_OUT'",
    "t.activity_code IS NULL",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.entryCategory')) = 'SALARY'"
  ];
  const values: Array<string | number> = [input.companyId];

  if (input.status) {
    filters.push("t.status = ?");
    values.push(input.status);
  }
  if (input.employeeUserId) {
    filters.push("JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeUserId')) = ?");
    values.push(input.employeeUserId);
  }
  if (input.payPeriod) {
    filters.push("JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.payPeriod')) = ?");
    values.push(input.payPeriod);
  }

  values.push(input.limit, input.offset);

  const rows = await queryRows<TransactionRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.account_id AS accountId,
        fa.name AS accountName,
        fa.account_ref AS accountRef,
        fa.scope_type AS accountScopeType,
        fa.primary_activity_code AS accountPrimaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS accountAllowedActivitiesCsv,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        t.description AS description,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.requires_proof AS requiresProof,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        t.validated_by_id AS validatedById,
        vu.email AS validatedByEmail,
        t.salary_confirmation_status AS salaryConfirmationStatus,
        t.salary_confirmed_by_id AS salaryConfirmedById,
        su.email AS salaryConfirmedByEmail,
        t.salary_confirmed_at AS salaryConfirmedAt,
        t.occurred_at AS occurredAt,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM transaction_proofs tp
          WHERE tp.transaction_id = t.id
        ) AS proofsCount
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users vu ON vu.id = t.validated_by_id
      LEFT JOIN users su ON su.id = t.salary_confirmed_by_id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map(toTransaction);
}

type SalarySummaryAggregateRow = RowDataPacket & {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  paymentMethod: SalaryPaymentMethod;
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: string;
  count: number | string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

export type SalarySummaryAggregate = {
  status: SalarySummaryAggregateRow["status"];
  paymentMethod: SalaryPaymentMethod;
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: string;
  count: number;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

export async function summarizeSalaryTransactions(input: {
  companyId: string;
  payPeriod: string;
  employeeUserId?: string;
}): Promise<SalarySummaryAggregate[]> {
  const filters = [
    "t.company_id = ?",
    "t.type = 'CASH_OUT'",
    "t.activity_code IS NULL",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.entryCategory')) = 'SALARY'",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.payPeriod')) = ?",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeUserId')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeFullName')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeEmail')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeRole')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.grossAmount')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.bonusAmount')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.deductionAmount')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.netAmount')) <> ''",
    "JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.paymentMethod')) IN ('BANK_TRANSFER', 'CASH', 'MOBILE_MONEY', 'CHEQUE')"
  ];
  const values: string[] = [input.companyId, input.payPeriod];

  if (input.employeeUserId) {
    filters.push("JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeUserId')) = ?");
    values.push(input.employeeUserId);
  }

  const rows = await queryRows<SalarySummaryAggregateRow[]>(
    `
      SELECT
        t.status AS status,
        JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.paymentMethod')) AS paymentMethod,
        JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeUserId')) AS employeeUserId,
        JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeFullName')) AS employeeFullName,
        JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeEmail')) AS employeeEmail,
        JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeRole')) AS employeeRole,
        COUNT(*) AS count,
        CAST(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.grossAmount')) AS DECIMAL(18, 2))) AS CHAR) AS grossAmount,
        CAST(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.bonusAmount')) AS DECIMAL(18, 2))) AS CHAR) AS bonusAmount,
        CAST(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.deductionAmount')) AS DECIMAL(18, 2))) AS CHAR) AS deductionAmount,
        CAST(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.netAmount')) AS DECIMAL(18, 2))) AS CHAR) AS netAmount
      FROM transactions t
      WHERE ${filters.join(" AND ")}
      GROUP BY
        t.status,
        paymentMethod,
        employeeUserId,
        employeeFullName,
        employeeEmail,
        employeeRole
    `,
    values
  );

  return rows.map((row) => ({
    status: row.status,
    paymentMethod: row.paymentMethod,
    employeeUserId: row.employeeUserId,
    employeeFullName: row.employeeFullName,
    employeeEmail: row.employeeEmail,
    employeeRole: row.employeeRole,
    count: Number(row.count),
    grossAmount: row.grossAmount,
    bonusAmount: row.bonusAmount,
    deductionAmount: row.deductionAmount,
    netAmount: row.netAmount
  }));
}

export async function findSalaryTransactionByEmployeeAndPeriod(input: {
  companyId: string;
  employeeUserId: string;
  payPeriod: string;
}): Promise<FinancialTransaction | null> {
  const rows = await queryRows<TransactionRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.account_id AS accountId,
        fa.name AS accountName,
        fa.account_ref AS accountRef,
        fa.scope_type AS accountScopeType,
        fa.primary_activity_code AS accountPrimaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS accountAllowedActivitiesCsv,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        t.description AS description,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.requires_proof AS requiresProof,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        t.validated_by_id AS validatedById,
        vu.email AS validatedByEmail,
        t.salary_confirmation_status AS salaryConfirmationStatus,
        t.salary_confirmed_by_id AS salaryConfirmedById,
        su.email AS salaryConfirmedByEmail,
        t.salary_confirmed_at AS salaryConfirmedAt,
        t.occurred_at AS occurredAt,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM transaction_proofs tp
          WHERE tp.transaction_id = t.id
        ) AS proofsCount
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users vu ON vu.id = t.validated_by_id
      LEFT JOIN users su ON su.id = t.salary_confirmed_by_id
      WHERE t.company_id = ?
        AND t.type = 'CASH_OUT'
        AND t.activity_code IS NULL
        AND t.status <> 'REJECTED'
        AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.entryCategory')) = 'SALARY'
        AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.employeeUserId')) = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.payPeriod')) = ?
      ORDER BY t.created_at DESC
      LIMIT 1
    `,
    [input.companyId, input.employeeUserId, input.payPeriod]
  );

  if (rows.length === 0) {
    return null;
  }
  return toTransaction(rows[0]);
}

export async function findTransactionById(
  companyId: string,
  transactionId: string
): Promise<TransactionMinimal | null> {
  const rows = await queryRows<TransactionMinimalRow[]>(
    `
      SELECT
        id AS id,
        company_id AS companyId,
        created_by_id AS createdById,
        activity_code AS activityCode,
        status AS status,
        requires_proof AS requiresProof,
        salary_confirmation_status AS salaryConfirmationStatus
      FROM transactions
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, transactionId]
  );
  if (rows.length === 0) {
    return null;
  }
  return toTransactionMinimal(rows[0]);
}

export async function findFinancialTransactionById(
  companyId: string,
  transactionId: string
): Promise<FinancialTransaction | null> {
  const rows = await queryRows<TransactionRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.account_id AS accountId,
        fa.name AS accountName,
        fa.account_ref AS accountRef,
        fa.scope_type AS accountScopeType,
        fa.primary_activity_code AS accountPrimaryActivityCode,
        (
          SELECT GROUP_CONCAT(faa.activity_code ORDER BY faa.activity_code SEPARATOR ',')
          FROM financial_account_activities faa
          WHERE faa.account_id = fa.id
        ) AS accountAllowedActivitiesCsv,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        t.description AS description,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.requires_proof AS requiresProof,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        t.validated_by_id AS validatedById,
        vu.email AS validatedByEmail,
        t.salary_confirmation_status AS salaryConfirmationStatus,
        t.salary_confirmed_by_id AS salaryConfirmedById,
        su.email AS salaryConfirmedByEmail,
        t.salary_confirmed_at AS salaryConfirmedAt,
        t.occurred_at AS occurredAt,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM transaction_proofs tp
          WHERE tp.transaction_id = t.id
        ) AS proofsCount
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users vu ON vu.id = t.validated_by_id
      LEFT JOIN users su ON su.id = t.salary_confirmed_by_id
      WHERE t.company_id = ?
        AND t.id = ?
      LIMIT 1
    `,
    [companyId, transactionId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toTransaction(rows[0]);
}

export async function addTransactionProof(input: {
  id: string;
  transactionId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO transaction_proofs (id, transaction_id, storage_key, file_name, mime_type, file_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [input.id, input.transactionId, input.storageKey, input.fileName, input.mimeType, input.fileSize]
  );
}

export async function listTransactionProofs(transactionId: string): Promise<TransactionProof[]> {
  const rows = await queryRows<ProofRow[]>(
    `
      SELECT
        id AS id,
        transaction_id AS transactionId,
        storage_key AS storageKey,
        file_name AS fileName,
        mime_type AS mimeType,
        file_size AS fileSize,
        uploaded_at AS uploadedAt
      FROM transaction_proofs
      WHERE transaction_id = ?
      ORDER BY uploaded_at DESC
    `,
    [transactionId]
  );
  return rows.map(toProof);
}

export async function countTransactionProofs(transactionId: string): Promise<number> {
  const rows = await queryRows<(RowDataPacket & { total: number })[]>(
    `
      SELECT COUNT(*) AS total
      FROM transaction_proofs
      WHERE transaction_id = ?
    `,
    [transactionId]
  );
  return rows[0]?.total ?? 0;
}

export async function submitTransaction(input: {
  companyId: string;
  transactionId: string;
  salaryConfirmationStatus?: SalaryConfirmationStatus;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE transactions
      SET status = 'SUBMITTED',
          salary_confirmation_status = ?
      WHERE company_id = ?
        AND id = ?
        AND status = 'DRAFT'
    `,
    [input.salaryConfirmationStatus ?? "NOT_REQUIRED", input.companyId, input.transactionId]
  );
}

export async function reviewTransaction(input: {
  stockControlled?: boolean;
  companyId: string;
  transactionId: string;
  reviewerId: string;
  status: "APPROVED" | "REJECTED";
}): Promise<void> {
  const persist = async (executor: Pick<PoolConnection, "execute">, metadata: Record<string, string> = {}) => {
    await executor.execute<ResultSetHeader>(
      `
        UPDATE transactions
        SET status = ?, validated_by_id = ?
        WHERE company_id = ?
          AND id = ?
          AND status = 'SUBMITTED'
      `,
      [input.status, input.reviewerId, input.companyId, input.transactionId]
    );
  };
  if (input.stockControlled) {
    await withBeverageStockWrite({ companyId: input.companyId, transactionId: input.transactionId, action: input.status === "REJECTED" ? "reject" : "approve" }, persist);
  } else {
    await persist(getDbPool());
  }
}

export async function confirmSalaryReceipt(input: {
  companyId: string;
  transactionId: string;
  confirmerId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE transactions
      SET salary_confirmation_status = 'CONFIRMED',
          salary_confirmed_by_id = ?,
          salary_confirmed_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND id = ?
        AND status = 'SUBMITTED'
        AND salary_confirmation_status = 'PENDING'
    `,
    [input.confirmerId, input.companyId, input.transactionId]
  );
}
