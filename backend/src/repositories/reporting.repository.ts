import type { RowDataPacket } from "mysql2/promise";
import { queryRows } from "../lib/db.js";
import type {
  ActivityReportHighlight,
  BusinessActivityProfile
} from "../config/business-activity-profiles.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";
import type { FinancialAccountScopeType } from "./finance.repository.js";

export type DashboardCompanySummary = {
  companyId: string;
  companyName: string;
  companyCode: string;
  activeUsersCount: number;
  totalMembershipsCount: number;
  financialAccountsCount: number;
  unreadAlertsCount: number;
  auditEventsLast7Days: number;
};

export type DashboardFinanceSummary = {
  totalTransactionsCount: number;
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  accountsSummary: FinancialAccountsScopeSummary;
  totalsByCurrency: Array<{
    currency: string;
    approvedCashInTotal: string;
    approvedCashOutTotal: string;
    netApprovedTotal: string;
  }>;
};

export type DashboardFinanceMetrics = Omit<DashboardFinanceSummary, "accountsSummary">;

export type DashboardOperationsSummary = {
  totalTasksCount: number;
  todoCount: number;
  inProgressCount: number;
  blockedCount: number;
  doneCount: number;
  overdueCount: number;
  dueSoonCount: number;
  unassignedCount: number;
  myOpenTasksCount: number;
};

export type DashboardRecentTransaction = {
  id: string;
  accountName: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  occurredAt: string;
};

export type DashboardRecentTask = {
  id: string;
  title: string;
  activityCode: BusinessActivityCode | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  assignedToFullName: string | null;
  dueDate: string | null;
  updatedAt: string;
};

export type DashboardActivitySummary = {
  activityCode: BusinessActivityCode;
  transactionsCount: number;
  submittedTransactionsCount: number;
  totalTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
};

export type DashboardWorkloadItem = {
  userId: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  doneTasksCount: number;
};

export type DashboardSummary = {
  generatedAt: string;
  company: DashboardCompanySummary;
  finance: DashboardFinanceSummary;
  operations: DashboardOperationsSummary;
  sectorRulesVersion: string;
  activitySummary: DashboardActivitySummary[];
  activityProfiles: BusinessActivityProfile[];
  activityHighlightsByCode: Partial<Record<BusinessActivityCode, ActivityReportHighlight[]>>;
  recentTransactions: DashboardRecentTransaction[];
  recentTasks: DashboardRecentTask[];
  workload: DashboardWorkloadItem[];
};

export type ReportFinanceByStatus = {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  currency: string;
  count: number;
  totalAmount: string;
};

export type ReportFinanceByType = {
  type: "CASH_IN" | "CASH_OUT";
  currency: string;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

export type ReportFinanceByActivity = {
  activityCode: BusinessActivityCode;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

export type ReportTaskByStatus = {
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  count: number;
};

export type ReportTaskByActivity = {
  activityCode: BusinessActivityCode;
  totalCount: number;
  openCount: number;
  blockedCount: number;
  doneCount: number;
};

export type ReportRoleDistribution = {
  role: RoleCode;
  count: number;
};

export type FinancialAccountsScopeSummary = {
  totalCount: number;
  globalCount: number;
  dedicatedCount: number;
  restrictedCount: number;
  compatibleCount: number;
  incompatibleCount: number;
  dedicatedToSelectedActivityCount: number;
  restrictedToSelectedActivityCount: number;
};

export type FinancialAccountGovernanceItem = {
  id: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  isCompatibleWithSelectedActivity: boolean;
};

export type ReportsOverview = {
  generatedAt: string;
  sectorRulesVersion: string;
  filters: {
    dateFrom: string | null;
    dateTo: string | null;
    activityCode: BusinessActivityCode | null;
  };
  activityProfile: BusinessActivityProfile | null;
  availableActivityProfiles: BusinessActivityProfile[];
  activityHighlights: ActivityReportHighlight[];
  financeByStatus: ReportFinanceByStatus[];
  financeByType: ReportFinanceByType[];
  financeByActivity: ReportFinanceByActivity[];
  financeAccountsSummary: FinancialAccountsScopeSummary;
  financeAccounts: FinancialAccountGovernanceItem[];
  taskByStatus: ReportTaskByStatus[];
  taskByActivity: ReportTaskByActivity[];
  roleDistribution: ReportRoleDistribution[];
  topAssignees: DashboardWorkloadItem[];
};

export type ReportPeriodFilter = {
  dateFrom?: string;
  dateTo?: string;
  activityCode?: BusinessActivityCode;
};

type DashboardCompanyRow = RowDataPacket & {
  companyId: string;
  companyName: string;
  companyCode: string;
  activeUsersCount: number;
  totalMembershipsCount: number;
  financialAccountsCount: number;
  unreadAlertsCount: number;
  auditEventsLast7Days: number;
};

type DashboardFinanceRow = RowDataPacket & {
  totalTransactionsCount: number;
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
};

type DashboardFinanceCurrencyRow = RowDataPacket & {
  currency: string;
  approvedCashInTotal: string;
  approvedCashOutTotal: string;
  netApprovedTotal: string;
};

type DashboardOperationsRow = RowDataPacket & {
  totalTasksCount: number;
  todoCount: number;
  inProgressCount: number;
  blockedCount: number;
  doneCount: number;
  overdueCount: number;
  dueSoonCount: number;
  unassignedCount: number;
  myOpenTasksCount: number;
};

type DashboardRecentTransactionRow = RowDataPacket & {
  id: string;
  accountName: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  occurredAt: Date;
};

type DashboardRecentTaskRow = RowDataPacket & {
  id: string;
  title: string;
  activityCode: BusinessActivityCode | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  assignedToFullName: string | null;
  dueDate: Date | null;
  updatedAt: Date;
};

type DashboardFinanceActivityRow = RowDataPacket & {
  activityCode: BusinessActivityCode | null;
  transactionsCount: number;
  submittedTransactionsCount: number;
};

type DashboardTaskActivityRow = RowDataPacket & {
  activityCode: BusinessActivityCode | null;
  totalTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
};

type DashboardWorkloadRow = RowDataPacket & {
  userId: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  doneTasksCount: number;
};

type ReportFinanceByStatusRow = RowDataPacket & {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  currency: string;
  count: number;
  totalAmount: string;
};

type ReportFinanceByTypeRow = RowDataPacket & {
  type: "CASH_IN" | "CASH_OUT";
  currency: string;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

type ReportFinanceByActivityRow = RowDataPacket & {
  activityCode: BusinessActivityCode | null;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

type ReportTaskByStatusRow = RowDataPacket & {
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  count: number;
};

type ReportTaskByActivityRow = RowDataPacket & {
  activityCode: BusinessActivityCode | null;
  totalCount: number;
  openCount: number;
  blockedCount: number;
  doneCount: number;
};

type ReportRoleDistributionRow = RowDataPacket & {
  role: RoleCode;
  count: number;
};

type TransactionExportRow = RowDataPacket & {
  id: string;
  occurredAt: Date;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  accountName: string;
  accountRef: string | null;
  accountScopeType: FinancialAccountScopeType;
  accountPrimaryActivityCode: BusinessActivityCode | null;
  accountAllowedActivityCodes: string | null;
  createdByEmail: string;
  validatedByEmail: string | null;
  proofsCount: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TaskExportRow = RowDataPacket & {
  id: string;
  title: string;
  description: string | null;
  activityCode: BusinessActivityCode | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  createdByFullName: string;
  createdByEmail: string;
  assignedToFullName: string | null;
  assignedToEmail: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toIso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toDashboardRecentTransaction(
  row: DashboardRecentTransactionRow
): DashboardRecentTransaction {
  return {
    id: row.id,
    accountName: row.accountName,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    activityCode: row.activityCode,
    status: row.status,
    occurredAt: new Date(row.occurredAt).toISOString()
  };
}

function toDashboardRecentTask(row: DashboardRecentTaskRow): DashboardRecentTask {
  return {
    id: row.id,
    title: row.title,
    activityCode: row.activityCode,
    status: row.status,
    assignedToFullName: row.assignedToFullName,
    dueDate: toIso(row.dueDate),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

function toDashboardWorkloadItem(row: DashboardWorkloadRow): DashboardWorkloadItem {
  return {
    userId: row.userId,
    fullName: row.fullName,
    role: row.role,
    openTasksCount: row.openTasksCount ?? 0,
    inProgressTasksCount: row.inProgressTasksCount ?? 0,
    blockedTasksCount: row.blockedTasksCount ?? 0,
    doneTasksCount: row.doneTasksCount ?? 0
  };
}

function appendPeriodFilters(
  filters: string[],
  values: Array<string | number>,
  column: string,
  period?: ReportPeriodFilter
): void {
  if (period?.dateFrom) {
    filters.push(`${column} >= ?`);
    values.push(period.dateFrom);
  }

  if (period?.dateTo) {
    filters.push(`${column} <= ?`);
    values.push(period.dateTo);
  }
}

function appendActivityFilter(
  filters: string[],
  values: Array<string | number>,
  column: string,
  period?: ReportPeriodFilter
): void {
  if (period?.activityCode) {
    filters.push(`${column} = ?`);
    values.push(period.activityCode);
  }
}

export async function getDashboardCompanySummary(
  companyId: string,
  actorId: string
): Promise<DashboardCompanySummary> {
  const rows = await queryRows<DashboardCompanyRow[]>(
    `
      SELECT
        c.id AS companyId,
        c.name AS companyName,
        c.code AS companyCode,
        COUNT(DISTINCT CASE WHEN u.is_active = 1 THEN m.user_id END) AS activeUsersCount,
        COUNT(DISTINCT m.user_id) AS totalMembershipsCount,
        (
          SELECT COUNT(*)
          FROM financial_accounts fa
          WHERE fa.company_id = c.id
        ) AS financialAccountsCount,
        (
          SELECT COUNT(*)
          FROM alerts al
          WHERE al.company_id = c.id
            AND al.target_user_id = ?
            AND al.read_at IS NULL
        ) AS unreadAlertsCount,
        (
          SELECT COUNT(*)
          FROM audit_logs aud
          WHERE aud.company_id = c.id
            AND aud.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
        ) AS auditEventsLast7Days
      FROM companies c
      LEFT JOIN memberships m ON m.company_id = c.id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE c.id = ?
      GROUP BY c.id, c.name, c.code
      LIMIT 1
    `,
    [actorId, companyId]
  );

  return rows[0];
}

export async function getDashboardFinanceSummary(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<DashboardFinanceMetrics> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<DashboardFinanceRow[]>(
    `
      SELECT
        COUNT(*) AS totalTransactionsCount,
        COALESCE(SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END), 0) AS draftCount,
        COALESCE(SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END), 0) AS submittedCount,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END), 0) AS approvedCount,
        COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS rejectedCount
      FROM transactions
      WHERE ${filters.join(" AND ")}
    `,
    values
  );

  const currencyFilters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const currencyValues: Array<string | number> = [companyId];
  appendActivityFilter(currencyFilters, currencyValues, "activity_code", period);

  const totalsByCurrencyRows = await queryRows<DashboardFinanceCurrencyRow[]>(
    `
      SELECT
        currency AS currency,
        COALESCE(CAST(SUM(CASE WHEN status = 'APPROVED' AND type = 'CASH_IN' THEN amount ELSE 0 END) AS CHAR), '0.00') AS approvedCashInTotal,
        COALESCE(CAST(SUM(CASE WHEN status = 'APPROVED' AND type = 'CASH_OUT' THEN amount ELSE 0 END) AS CHAR), '0.00') AS approvedCashOutTotal,
        COALESCE(
          CAST(
            SUM(CASE WHEN status = 'APPROVED' AND type = 'CASH_IN' THEN amount ELSE 0 END) -
            SUM(CASE WHEN status = 'APPROVED' AND type = 'CASH_OUT' THEN amount ELSE 0 END)
          AS CHAR),
          '0.00'
        ) AS netApprovedTotal
      FROM transactions
      WHERE ${currencyFilters.join(" AND ")}
      GROUP BY currency
      ORDER BY currency ASC
    `,
    currencyValues
  );

  const base = rows[0] ?? {
    totalTransactionsCount: 0,
    draftCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    rejectedCount: 0
  };

  return {
    ...base,
    totalsByCurrency: totalsByCurrencyRows.map((row) => ({
      currency: row.currency,
      approvedCashInTotal: row.approvedCashInTotal,
      approvedCashOutTotal: row.approvedCashOutTotal,
      netApprovedTotal: row.netApprovedTotal
    }))
  };
}

export async function getDashboardOperationsSummary(
  companyId: string,
  actorId: string,
  period?: ReportPeriodFilter
): Promise<DashboardOperationsSummary> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const filterValues: Array<string | number> = [companyId];
  const values: Array<string | number> = [actorId];
  appendActivityFilter(filters, filterValues, "activity_code", period);
  values.push(...filterValues);

  const rows = await queryRows<DashboardOperationsRow[]>(
    `
      SELECT
        COUNT(*) AS totalTasksCount,
        COALESCE(SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END), 0) AS todoCount,
        COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgressCount,
        COALESCE(SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedCount,
        COALESCE(SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END), 0) AS doneCount,
        COALESCE(SUM(CASE WHEN status <> 'DONE' AND due_date IS NOT NULL AND due_date < UTC_TIMESTAMP() THEN 1 ELSE 0 END), 0) AS overdueCount,
        COALESCE(SUM(CASE WHEN status <> 'DONE' AND due_date IS NOT NULL AND due_date >= UTC_TIMESTAMP() AND due_date <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY) THEN 1 ELSE 0 END), 0) AS dueSoonCount,
        COALESCE(SUM(CASE WHEN assigned_to_id IS NULL AND status <> 'DONE' THEN 1 ELSE 0 END), 0) AS unassignedCount,
        COALESCE(SUM(CASE WHEN assigned_to_id = ? AND status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS myOpenTasksCount
      FROM tasks
      WHERE ${filters.join(" AND ")}
    `,
    [...values, actorId]
  );

  return rows[0] ?? {
    totalTasksCount: 0,
    todoCount: 0,
    inProgressCount: 0,
    blockedCount: 0,
    doneCount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    unassignedCount: 0,
    myOpenTasksCount: 0
  };
}

export async function listDashboardRecentTransactions(
  companyId: string,
  limit: number,
  period?: ReportPeriodFilter
): Promise<DashboardRecentTransaction[]> {
  const filters: string[] = ["t.company_id = ?", "t.activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendActivityFilter(filters, values, "t.activity_code", period);
  values.push(limit);

  const rows = await queryRows<DashboardRecentTransactionRow[]>(
    `
      SELECT
        t.id AS id,
        fa.name AS accountName,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        t.status AS status,
        t.occurred_at AS occurredAt
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.occurred_at DESC, t.created_at DESC
      LIMIT ?
    `,
    values
  );

  return rows.map(toDashboardRecentTransaction);
}

export async function listDashboardRecentTasks(
  companyId: string,
  limit: number,
  actorRole: RoleCode,
  actorId: string,
  period?: ReportPeriodFilter
): Promise<DashboardRecentTask[]> {
  const filters: string[] = ["t.company_id = ?"];
  const values: Array<string | number> = [companyId];
  filters.push("t.activity_code IS NOT NULL");
  appendActivityFilter(filters, values, "t.activity_code", period);

  if (actorRole === "EMPLOYEE") {
    filters.push("(t.created_by_id = ? OR t.assigned_to_id = ?)");
    values.push(actorId, actorId);
  }

  values.push(limit);

  const rows = await queryRows<DashboardRecentTaskRow[]>(
    `
      SELECT
        t.id AS id,
        t.title AS title,
        t.activity_code AS activityCode,
        t.status AS status,
        au.full_name AS assignedToFullName,
        t.due_date AS dueDate,
        t.updated_at AS updatedAt
      FROM tasks t
      LEFT JOIN users au ON au.id = t.assigned_to_id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.updated_at DESC, t.created_at DESC
      LIMIT ?
    `,
    values
  );

  return rows.map(toDashboardRecentTask);
}

export async function listDashboardWorkload(
  companyId: string,
  limit: number,
  period?: ReportPeriodFilter
): Promise<DashboardWorkloadItem[]> {
  const joinFilters: string[] = ["t.company_id = m.company_id", "t.assigned_to_id = u.id"];
  const values: Array<string | number> = [];
  appendPeriodFilters(joinFilters, values, "t.updated_at", period);
  appendActivityFilter(joinFilters, values, "t.activity_code", period);
  values.push(companyId, limit);

  const rows = await queryRows<DashboardWorkloadRow[]>(
    `
      SELECT
        u.id AS userId,
        u.full_name AS fullName,
        m.role AS role,
        COALESCE(SUM(CASE WHEN t.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS openTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgressTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END), 0) AS doneTasksCount
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN tasks t ON ${joinFilters.join(" AND ")}
      WHERE m.company_id = ?
        AND u.is_active = 1
        AND m.role IN ('SUPERVISOR', 'EMPLOYEE')
      GROUP BY u.id, u.full_name, m.role
      ORDER BY openTasksCount DESC, blockedTasksCount DESC, inProgressTasksCount DESC, u.full_name ASC
      LIMIT ?
    `,
    values
  );

  return rows.map(toDashboardWorkloadItem);
}

export async function listDashboardFinanceActivitySummary(
  companyId: string
): Promise<Array<{ activityCode: BusinessActivityCode | null; transactionsCount: number; submittedTransactionsCount: number }>> {
  const rows = await queryRows<DashboardFinanceActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        COUNT(*) AS transactionsCount,
        COALESCE(SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END), 0) AS submittedTransactionsCount
      FROM transactions
      WHERE company_id = ?
        AND activity_code IS NOT NULL
      GROUP BY activity_code
    `,
    [companyId]
  );

  return rows.map((row) => ({
    activityCode: row.activityCode,
    transactionsCount: row.transactionsCount ?? 0,
    submittedTransactionsCount: row.submittedTransactionsCount ?? 0
  }));
}

export async function listDashboardTaskActivitySummary(
  companyId: string
): Promise<Array<{ activityCode: BusinessActivityCode | null; totalTasksCount: number; openTasksCount: number; blockedTasksCount: number }>> {
  const rows = await queryRows<DashboardTaskActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        COUNT(*) AS totalTasksCount,
        COALESCE(SUM(CASE WHEN status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS openTasksCount,
        COALESCE(SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedTasksCount
      FROM tasks
      WHERE company_id = ?
        AND activity_code IS NOT NULL
      GROUP BY activity_code
    `,
    [companyId]
  );

  return rows.map((row) => ({
    activityCode: row.activityCode,
    totalTasksCount: row.totalTasksCount ?? 0,
    openTasksCount: row.openTasksCount ?? 0,
    blockedTasksCount: row.blockedTasksCount ?? 0
  }));
}

export async function listReportFinanceByStatus(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<ReportFinanceByStatus[]> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "occurred_at", period);
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<ReportFinanceByStatusRow[]>(
    `
      SELECT
        status AS status,
        currency AS currency,
        COUNT(*) AS count,
        COALESCE(CAST(SUM(amount) AS CHAR), '0.00') AS totalAmount
      FROM transactions
      WHERE ${filters.join(" AND ")}
      GROUP BY status, currency
      ORDER BY FIELD(status, 'SUBMITTED', 'DRAFT', 'APPROVED', 'REJECTED'), currency ASC
    `,
    values
  );

  return rows.map((row) => ({
    status: row.status,
    currency: row.currency,
    count: row.count,
    totalAmount: row.totalAmount
  }));
}

export async function listReportFinanceByType(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<ReportFinanceByType[]> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "occurred_at", period);
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<ReportFinanceByTypeRow[]>(
    `
      SELECT
        type AS type,
        currency AS currency,
        COUNT(*) AS count,
        COALESCE(CAST(SUM(amount) AS CHAR), '0.00') AS totalAmount,
        COALESCE(CAST(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END) AS CHAR), '0.00') AS approvedAmount
      FROM transactions
      WHERE ${filters.join(" AND ")}
      GROUP BY type, currency
      ORDER BY FIELD(type, 'CASH_IN', 'CASH_OUT'), currency ASC
    `,
    values
  );

  return rows.map((row) => ({
    type: row.type,
    currency: row.currency,
    count: row.count,
    totalAmount: row.totalAmount,
    approvedAmount: row.approvedAmount
  }));
}

export async function listReportFinanceByActivity(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<Array<{
  activityCode: BusinessActivityCode | null;
  count: number;
  totalAmount: string;
  approvedAmount: string;
}>> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "occurred_at", period);
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<ReportFinanceByActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        COUNT(*) AS count,
        COALESCE(CAST(SUM(amount) AS CHAR), '0.00') AS totalAmount,
        COALESCE(CAST(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END) AS CHAR), '0.00') AS approvedAmount
      FROM transactions
      WHERE ${filters.join(" AND ")}
      GROUP BY activity_code
      ORDER BY activity_code ASC
    `,
    values
  );

  return rows.map((row) => ({
    activityCode: row.activityCode,
    count: row.count ?? 0,
    totalAmount: row.totalAmount,
    approvedAmount: row.approvedAmount
  }));
}

export async function listReportTaskByStatus(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<ReportTaskByStatus[]> {
  const filters: string[] = ["company_id = ?", "activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "updated_at", period);
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<ReportTaskByStatusRow[]>(
    `
      SELECT
        status AS status,
        COUNT(*) AS count
      FROM tasks
      WHERE ${filters.join(" AND ")}
      GROUP BY status
      ORDER BY FIELD(status, 'BLOCKED', 'IN_PROGRESS', 'TODO', 'DONE')
    `,
    values
  );

  return rows.map((row) => ({
    status: row.status,
    count: row.count
  }));
}

export async function listReportTaskByActivity(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<Array<{
  activityCode: BusinessActivityCode | null;
  totalCount: number;
  openCount: number;
  blockedCount: number;
  doneCount: number;
}>> {
  const filters: string[] = ["company_id = ?"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "updated_at", period);
  appendActivityFilter(filters, values, "activity_code", period);

  const rows = await queryRows<ReportTaskByActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        COUNT(*) AS totalCount,
        COALESCE(SUM(CASE WHEN status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS openCount,
        COALESCE(SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedCount,
        COALESCE(SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END), 0) AS doneCount
      FROM tasks
      WHERE ${filters.join(" AND ")}
      GROUP BY activity_code
      ORDER BY activity_code ASC
    `,
    values
  );

  return rows.map((row) => ({
    activityCode: row.activityCode,
    totalCount: row.totalCount ?? 0,
    openCount: row.openCount ?? 0,
    blockedCount: row.blockedCount ?? 0,
    doneCount: row.doneCount ?? 0
  }));
}

export async function listReportRoleDistribution(companyId: string): Promise<ReportRoleDistribution[]> {
  const rows = await queryRows<ReportRoleDistributionRow[]>(
    `
      SELECT
        m.role AS role,
        COUNT(*) AS count
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?
        AND u.is_active = 1
      GROUP BY m.role
      ORDER BY FIELD(m.role, 'OWNER', 'SYS_ADMIN', 'ACCOUNTANT', 'SUPERVISOR', 'EMPLOYEE')
    `,
    [companyId]
  );

  return rows.map((row) => ({
    role: row.role,
    count: row.count
  }));
}

export async function listTransactionsForExport(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<TransactionExportRow[]> {
  const filters: string[] = ["t.company_id = ?", "t.activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "t.occurred_at", period);
  appendActivityFilter(filters, values, "t.activity_code", period);

  return queryRows<TransactionExportRow[]>(
    `
      SELECT
        t.id AS id,
        t.occurred_at AS occurredAt,
        t.status AS status,
        t.type AS type,
        CAST(t.amount AS CHAR) AS amount,
        t.currency AS currency,
        t.activity_code AS activityCode,
        fa.name AS accountName,
        fa.account_ref AS accountRef,
        fa.scope_type AS accountScopeType,
        fa.primary_activity_code AS accountPrimaryActivityCode,
        GROUP_CONCAT(DISTINCT faa.activity_code ORDER BY faa.activity_code SEPARATOR ',') AS accountAllowedActivityCodes,
        cu.email AS createdByEmail,
        vu.email AS validatedByEmail,
        (
          SELECT COUNT(*)
          FROM transaction_proofs tp
          WHERE tp.transaction_id = t.id
        ) AS proofsCount,
        t.description AS description,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM transactions t
      INNER JOIN financial_accounts fa ON fa.id = t.account_id
      LEFT JOIN financial_account_activities faa ON faa.account_id = fa.id
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users vu ON vu.id = t.validated_by_id
      WHERE ${filters.join(" AND ")}
      GROUP BY
        t.id,
        t.occurred_at,
        t.status,
        t.type,
        t.amount,
        t.currency,
        t.activity_code,
        fa.name,
        fa.account_ref,
        fa.scope_type,
        fa.primary_activity_code,
        cu.email,
        vu.email,
        t.description,
        t.created_at,
        t.updated_at
      ORDER BY t.occurred_at DESC, t.created_at DESC
    `,
    values
  );
}

export async function listTasksForExport(
  companyId: string,
  period?: ReportPeriodFilter
): Promise<TaskExportRow[]> {
  const filters: string[] = ["t.company_id = ?", "t.activity_code IS NOT NULL"];
  const values: Array<string | number> = [companyId];
  appendPeriodFilters(filters, values, "t.updated_at", period);
  appendActivityFilter(filters, values, "t.activity_code", period);

  return queryRows<TaskExportRow[]>(
    `
      SELECT
        t.id AS id,
        t.title AS title,
        t.description AS description,
        t.activity_code AS activityCode,
        t.status AS status,
        cu.full_name AS createdByFullName,
        cu.email AS createdByEmail,
        au.full_name AS assignedToFullName,
        au.email AS assignedToEmail,
        t.due_date AS dueDate,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM tasks t
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users au ON au.id = t.assigned_to_id
      WHERE ${filters.join(" AND ")}
      ORDER BY t.updated_at DESC, t.created_at DESC
    `,
    values
  );
}

export function toTransactionExportRecord(row: TransactionExportRow) {
  const accountAllowedActivityCodes = row.accountAllowedActivityCodes
    ? row.accountAllowedActivityCodes
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is BusinessActivityCode => item.length > 0)
    : [];
  const accountSupportsTransactionActivity =
    row.activityCode === null ||
    row.accountScopeType === "GLOBAL" ||
    row.accountPrimaryActivityCode === row.activityCode ||
    accountAllowedActivityCodes.includes(row.activityCode);

  return {
    id: row.id,
    occurredAt: new Date(row.occurredAt).toISOString(),
    status: row.status,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    activityCode: row.activityCode,
    accountName: row.accountName,
    accountRef: row.accountRef,
    accountScopeType: row.accountScopeType,
    accountPrimaryActivityCode: row.accountPrimaryActivityCode,
    accountAllowedActivityCodes,
    accountSupportsTransactionActivity,
    createdByEmail: row.createdByEmail,
    validatedByEmail: row.validatedByEmail,
    proofsCount: row.proofsCount ?? 0,
    description: row.description,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export function toTaskExportRecord(row: TaskExportRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    activityCode: row.activityCode,
    status: row.status,
    createdByFullName: row.createdByFullName,
    createdByEmail: row.createdByEmail,
    assignedToFullName: row.assignedToFullName,
    assignedToEmail: row.assignedToEmail,
    dueDate: toIso(row.dueDate),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}
