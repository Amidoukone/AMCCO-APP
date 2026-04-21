import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportCompanyTransactionsCsv,
  getCompanyDashboardSummary,
  getCompanyReportsOverview
} from "./reporting.service.js";
import {
  getDashboardCompanySummary,
  getDashboardFinanceSummary,
  getDashboardOperationsSummary,
  listDashboardFinanceActivitySummary,
  listDashboardRecentTasks,
  listDashboardRecentTransactions,
  listDashboardTaskActivitySummary,
  listDashboardWorkload,
  listReportFinanceByActivity,
  listReportFinanceByStatus,
  listReportFinanceByType,
  listReportRoleDistribution,
  listReportTaskByActivity,
  listReportTaskByStatus,
  listTransactionsForExport,
  toTransactionExportRecord
} from "../repositories/reporting.repository.js";
import { listFinancialAccounts } from "../repositories/finance.repository.js";

vi.mock("../repositories/reporting.repository.js", () => ({
  getDashboardCompanySummary: vi.fn(),
  listDashboardFinanceActivitySummary: vi.fn(),
  getDashboardFinanceSummary: vi.fn(),
  getDashboardOperationsSummary: vi.fn(),
  listDashboardRecentTasks: vi.fn(),
  listDashboardRecentTransactions: vi.fn(),
  listDashboardTaskActivitySummary: vi.fn(),
  listDashboardWorkload: vi.fn(),
  listReportFinanceByActivity: vi.fn(),
  listReportFinanceByStatus: vi.fn(),
  listReportFinanceByType: vi.fn(),
  listReportRoleDistribution: vi.fn(),
  listReportTaskByActivity: vi.fn(),
  listReportTaskByStatus: vi.fn(),
  listTasksForExport: vi.fn(),
  listTransactionsForExport: vi.fn(),
  toTaskExportRecord: vi.fn(),
  toTransactionExportRecord: vi.fn()
}));

vi.mock("../repositories/finance.repository.js", () => ({
  listFinancialAccounts: vi.fn()
}));

describe("reporting.service", () => {
  const actor = {
    actorId: "accountant-1",
    companyId: "company-1",
    role: "ACCOUNTANT" as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listFinancialAccounts).mockResolvedValue([]);
  });

  it("filters dashboard finance and operations by the selected activity", async () => {
    vi.mocked(getDashboardCompanySummary).mockResolvedValue({
      companyId: "company-1",
      companyName: "AMCCO",
      companyCode: "AMCCO-01",
      activeUsersCount: 5,
      totalMembershipsCount: 5,
      financialAccountsCount: 2,
      unreadAlertsCount: 1,
      auditEventsLast7Days: 3
    });
    vi.mocked(getDashboardFinanceSummary).mockResolvedValue({
      totalTransactionsCount: 4,
      draftCount: 1,
      submittedCount: 2,
      approvedCount: 1,
      rejectedCount: 0,
      totalsByCurrency: []
    });
    vi.mocked(getDashboardOperationsSummary).mockResolvedValue({
      totalTasksCount: 6,
      todoCount: 2,
      inProgressCount: 2,
      blockedCount: 1,
      doneCount: 1,
      overdueCount: 0,
      dueSoonCount: 1,
      unassignedCount: 0,
      myOpenTasksCount: 1
    });
    vi.mocked(listDashboardRecentTransactions).mockResolvedValue([]);
    vi.mocked(listDashboardRecentTasks).mockResolvedValue([]);
    vi.mocked(listDashboardWorkload).mockResolvedValue([]);
    vi.mocked(listFinancialAccounts).mockResolvedValue([
      {
        id: "account-1",
        companyId: actor.companyId,
        name: "Caisse mine",
        accountRef: "MIN-01",
        balance: "2000.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "MINING",
        allowedActivityCodes: ["MINING"],
        createdAt: "2026-04-21T08:00:00.000Z"
      },
      {
        id: "account-2",
        companyId: actor.companyId,
        name: "Caisse globale",
        accountRef: "GLB-01",
        balance: "5000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-21T08:05:00.000Z"
      }
    ]);
    vi.mocked(listDashboardFinanceActivitySummary).mockResolvedValue([
      {
        activityCode: "MINING",
        transactionsCount: 4,
        submittedTransactionsCount: 2
      }
    ]);
    vi.mocked(listDashboardTaskActivitySummary).mockResolvedValue([
      {
        activityCode: "MINING",
        totalTasksCount: 6,
        openTasksCount: 5,
        blockedTasksCount: 1
      }
    ]);

    const result = await getCompanyDashboardSummary(actor, {
      activityCode: "MINING"
    });

    expect(getDashboardFinanceSummary).toHaveBeenCalledWith(actor.companyId, {
      activityCode: "MINING"
    });
    expect(getDashboardOperationsSummary).toHaveBeenCalledWith(
      actor.companyId,
      actor.actorId,
      { activityCode: "MINING" }
    );
    expect(listDashboardRecentTransactions).toHaveBeenCalledWith(actor.companyId, 6, {
      activityCode: "MINING"
    });
    expect(listDashboardRecentTasks).toHaveBeenCalledWith(
      actor.companyId,
      6,
      actor.role,
      actor.actorId,
      { activityCode: "MINING" }
    );
    expect(listDashboardWorkload).toHaveBeenCalledWith(actor.companyId, 5, {
      activityCode: "MINING"
    });
    expect(result.finance.totalTransactionsCount).toBe(4);
    expect(result.finance.accountsSummary.compatibleCount).toBe(2);
    expect(result.finance.accountsSummary.dedicatedToSelectedActivityCount).toBe(1);
    expect(result.operations.totalTasksCount).toBe(6);
  });

  it("adds sector profile and dedicated highlights when an activity filter is applied", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "SUBMITTED", currency: "USD", count: 2, totalAmount: "5000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_OUT",
        currency: "USD",
        count: 3,
        totalAmount: "7000.00",
        approvedAmount: "3000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "MINING",
        count: 3,
        totalAmount: "7000.00",
        approvedAmount: "3000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "IN_PROGRESS", count: 2 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "MINING",
        totalCount: 4,
        openCount: 3,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportRoleDistribution).mockResolvedValue([
      { role: "ACCOUNTANT", count: 1 }
    ]);
    vi.mocked(listDashboardWorkload).mockResolvedValue([]);
    vi.mocked(listFinancialAccounts).mockResolvedValue([
      {
        id: "account-2",
        companyId: actor.companyId,
        name: "Caisse transverse",
        accountRef: "CT-01",
        balance: "5000.00",
        scopeType: "RESTRICTED",
        primaryActivityCode: null,
        allowedActivityCodes: ["MINING", "FOOD"],
        createdAt: "2026-04-21T08:00:00.000Z"
      },
      {
        id: "account-3",
        companyId: actor.companyId,
        name: "Caisse elevage",
        accountRef: "LIV-01",
        balance: "1800.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "LIVESTOCK",
        allowedActivityCodes: ["LIVESTOCK"],
        createdAt: "2026-04-21T08:05:00.000Z"
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "MINING"
    });

    expect(listDashboardWorkload).toHaveBeenCalledWith(actor.companyId, 10, {
      activityCode: "MINING"
    });
    expect(result.activityProfile?.activityCode).toBe("MINING");
    expect(result.availableActivityProfiles.length).toBeGreaterThanOrEqual(9);
    expect(result.activityHighlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "mining-pending-review",
          value: 2,
          emphasis: "WARNING"
        }),
        expect.objectContaining({
          code: "mining-critical-blockers",
          value: 1,
          emphasis: "WARNING"
        })
      ])
    );
    expect(result.financeAccountsSummary.compatibleCount).toBe(1);
    expect(result.financeAccountsSummary.incompatibleCount).toBe(1);
    expect(result.financeAccounts[0]?.isCompatibleWithSelectedActivity).toBe(true);
  });

  it("exports transaction governance columns in CSV", async () => {
    vi.mocked(listTransactionsForExport).mockResolvedValue([
      {
        id: "txn-1"
      } as never
    ]);
    vi.mocked(toTransactionExportRecord).mockReturnValue({
      id: "txn-1",
      occurredAt: "2026-04-21T10:00:00.000Z",
      status: "APPROVED",
      type: "CASH_OUT",
      amount: "1200.00",
      currency: "XOF",
      activityCode: "MINING",
      accountName: "Caisse mine",
      accountRef: "MIN-01",
      accountScopeType: "DEDICATED",
      accountPrimaryActivityCode: "MINING",
      accountAllowedActivityCodes: ["MINING"],
      accountSupportsTransactionActivity: true,
      createdByEmail: "owner@amcco.test",
      validatedByEmail: "acc@amcco.test",
      proofsCount: 2,
      description: "Achat terrain",
      createdAt: "2026-04-21T09:00:00.000Z",
      updatedAt: "2026-04-21T10:05:00.000Z"
    });

    const csv = await exportCompanyTransactionsCsv(actor, {
      activityCode: "MINING"
    });

    expect(csv).toContain("account_scope_type");
    expect(csv).toContain("account_allowed_activity_codes");
    expect(csv).toContain("\"DEDICATED\"");
    expect(csv).toContain("\"MINING\"");
    expect(csv).toContain("\"YES\"");
  });
});
