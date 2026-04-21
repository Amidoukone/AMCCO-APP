import type { BusinessActivityCode } from "../config/businessActivities";
import type {
  ActivityReportHighlight,
  BusinessActivityProfile
} from "./activities";
import type { FinancialAccountScopeType } from "./finance";
import type { RoleCode } from "./role";

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

export type DashboardWorkloadItem = {
  userId: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  doneTasksCount: number;
};

export type DashboardActivitySummary = {
  activityCode: BusinessActivityCode;
  transactionsCount: number;
  submittedTransactionsCount: number;
  totalTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
};

export type DashboardSummary = {
  generatedAt: string;
  sectorRulesVersion: string;
  company: DashboardCompanySummary;
  finance: DashboardFinanceSummary;
  operations: DashboardOperationsSummary;
  activitySummary: DashboardActivitySummary[];
  activityProfiles: BusinessActivityProfile[];
  activityHighlightsByCode: Partial<Record<BusinessActivityCode, ActivityReportHighlight[]>>;
  recentTransactions: DashboardRecentTransaction[];
  recentTasks: DashboardRecentTask[];
  workload: DashboardWorkloadItem[];
};

export type DashboardSummaryResponse = {
  item: DashboardSummary;
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

export type ReportsOverviewResponse = {
  item: ReportsOverview;
};
