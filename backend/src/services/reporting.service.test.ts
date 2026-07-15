import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportCompanyReportsPdf,
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
  listReportOperationalTasks,
  listReportOperationalTransactions,
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
  listReportOperationalTasks: vi.fn(),
  listReportOperationalTransactions: vi.fn(),
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
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([]);
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

    expect(listDashboardWorkload).not.toHaveBeenCalled();
    expect(result.activityProfile?.activityCode).toBe("MINING");
    expect(result.availableActivityProfiles).toHaveLength(1);
    expect(result.availableActivityProfiles[0]?.activityCode).toBe("MINING");
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
    expect(result.financeAccountsSummary.incompatibleCount).toBe(0);
    expect(result.financeAccounts).toHaveLength(1);
    expect(result.financeAccounts[0]?.isCompatibleWithSelectedActivity).toBe(true);
    expect(result.roleDistribution).toEqual([]);
    expect(result.topAssignees).toEqual([]);
  });

  it("builds the filtered hardware sales report from item metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "SUBMITTED", currency: "XOF", count: 2, totalAmount: "190000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 2,
        totalAmount: "190000.00",
        approvedAmount: "150000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "HARDWARE",
        count: 2,
        totalAmount: "190000.00",
        approvedAmount: "150000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([]);
    vi.mocked(listReportRoleDistribution).mockResolvedValue([]);
    vi.mocked(listDashboardWorkload).mockResolvedValue([]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "HARDWARE",
        status: "SUBMITTED",
        type: "CASH_IN",
        amount: "150000.00",
        currency: "XOF",
        occurredAt: "2026-05-03T09:00:00.000Z",
        metadata: {
          itemName: "CIMENT ET FER",
          quantity: "10",
          purchaseUnitPrice: "12000",
          saleUnitPrice: "15000",
          dailyPayment: "50000"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "40000.00",
        currency: "XOF",
        occurredAt: "2026-05-03T14:00:00.000Z",
        metadata: {
          itemName: "CIMENT ET FER",
          quantity: "2",
          purchaseUnitPrice: "15000",
          saleUnitPrice: "20000",
          dailyPayment: "40000"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "DRAFT",
        type: "CASH_IN",
        amount: "9000.00",
        currency: "XOF",
        occurredAt: "2026-05-04T08:00:00.000Z",
        metadata: {
          itemName: "BROUETTE",
          quantity: "1",
          saleUnitPrice: "9000"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "25000.00",
        currency: "XOF",
        occurredAt: "2026-05-05T08:00:00.000Z",
        metadata: {
          hardwareOperationKind: "GLOBAL"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "HARDWARE",
      dateFrom: "2026-05-01T00:00:00.000Z",
      dateTo: "2026-05-31T23:59:59.999Z"
    });

    expect(result.hardwareMonthlyReport?.rows).toEqual([
      {
        date: "2026-05-03",
        designation: "CIMENT ET FER",
        quantity: 12,
        salesAmount: "190000.00",
        paymentAmount: "90000.00",
        purchaseAmount: "150000.00",
        grossProfit: "40000.00",
        marginRate: 21.1,
        transactionsCount: 2,
        currency: "XOF"
      }
    ]);
    expect(result.hardwareMonthlyReport?.totals).toMatchObject({
      quantity: 12,
      salesAmount: "190000.00",
      paymentAmount: "90000.00",
      purchaseAmount: "150000.00",
      grossProfit: "40000.00",
      marginRate: 21.1,
      transactionsCount: 2,
      currency: "XOF"
    });
    expect(result.hardwareMonthlyReport?.periodLabel).toBe("mai 2026");

    const quarterlyResult = await getCompanyReportsOverview(actor, {
      activityCode: "HARDWARE",
      dateFrom: "2026-04-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });
    expect(quarterlyResult.hardwareMonthlyReport?.periodLabel).toBe("2e trimestre 2026");

    const yearlyResult = await getCompanyReportsOverview(actor, {
      activityCode: "HARDWARE",
      dateFrom: "2026-01-01T00:00:00.000Z",
      dateTo: "2026-12-31T23:59:59.999Z"
    });
    expect(yearlyResult.hardwareMonthlyReport?.periodLabel).toBe("annee 2026");

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "HARDWARE",
      dateFrom: "2026-05-01T00:00:00.000Z",
      dateTo: "2026-05-31T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("requires a selected activity for reports", async () => {
    await expect(getCompanyReportsOverview(actor, {})).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it("builds the agriculture operations report from campaign metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 2, totalAmount: "170000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 1,
        totalAmount: "120000.00",
        approvedAmount: "120000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 1,
        totalAmount: "50000.00",
        approvedAmount: "50000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "AGRICULTURE",
        count: 2,
        totalAmount: "170000.00",
        approvedAmount: "170000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "AGRICULTURE",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "AGRICULTURE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-06-03T09:00:00.000Z",
        metadata: {
          agricultureOperationKind: "INPUT_PURCHASE",
          campaignRef: "Campagne 2026",
          parcelRef: "P-01",
          fieldType: "Riz",
          cropType: "Riz local",
          surfaceArea: "2.5",
          inputName: "Semence",
          quantity: "10",
          unit: "sac",
          unitPrice: "5000"
        }
      },
      {
        activityCode: "AGRICULTURE",
        status: "SUBMITTED",
        type: "CASH_IN",
        amount: "120000.00",
        currency: "XOF",
        occurredAt: "2026-06-20T09:00:00.000Z",
        metadata: {
          agricultureOperationKind: "HARVEST_SALE",
          campaignRef: "Campagne 2026",
          parcelRef: "P-01",
          fieldType: "Riz",
          cropType: "Riz local",
          surfaceArea: "2.5",
          quantity: "4",
          unit: "tonne",
          unitPrice: "30000"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "AGRICULTURE",
        status: "DONE",
        dueDate: "2026-06-04T09:00:00.000Z",
        metadata: {
          agricultureTaskKind: "SOWING",
          campaignRef: "Campagne 2026",
          parcelRef: "P-01",
          fieldType: "Riz",
          cropType: "Riz local",
          surfaceArea: "2.5"
        }
      },
      {
        activityCode: "AGRICULTURE",
        status: "BLOCKED",
        dueDate: "2026-06-18T09:00:00.000Z",
        metadata: {
          agricultureTaskKind: "HARVEST",
          campaignRef: "Campagne 2026",
          parcelRef: "P-01",
          fieldType: "Riz",
          cropType: "Riz local",
          surfaceArea: "2.5"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "AGRICULTURE",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(result.agricultureOperationsReport?.periodLabel).toBe("juin 2026");
    expect(result.agricultureOperationsReport?.rows).toEqual([
      expect.objectContaining({
        campaignRef: "Campagne 2026",
        parcelRef: "P-01",
        fieldType: "Riz",
        cropType: "Riz local",
        surfaceArea: 2.5,
        transactionsCount: 2,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "120000.00",
        cashOutAmount: "50000.00",
        netAmount: "70000.00",
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.agricultureOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Achat intrants", cashOutAmount: "50000.00" }),
        expect.objectContaining({ operationLabel: "Vente recolte", cashInAmount: "120000.00" }),
        expect.objectContaining({ operationLabel: "Tache: Semis", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tache: Recolte", tasksCount: 1 })
      ])
    );
    expect(result.agricultureOperationsReport?.totals).toMatchObject({
      parcelsCount: 1,
      surfaceArea: 2.5,
      transactionsCount: 2,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "120000.00",
      cashOutAmount: "50000.00",
      netAmount: "70000.00",
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "AGRICULTURE",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);

    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "AGRICULTURE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-06-03T09:00:00.000Z",
        metadata: {
          agricultureOperationKind: "INPUT_PURCHASE",
          campaignRef: "01",
          parcelRef: "P-01",
          fieldType: "Riz"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([]);

    const unfilteredResult = await getCompanyReportsOverview(actor, {
      activityCode: "AGRICULTURE"
    });

    expect(unfilteredResult.agricultureOperationsReport?.periodLabel).toBe("Toutes periodes");
  });

  it("builds the fish farming operations report from pond and cycle metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 3, totalAmount: "155000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 1,
        totalAmount: "80000.00",
        approvedAmount: "80000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 2,
        totalAmount: "75000.00",
        approvedAmount: "75000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "FISH_FARMING",
        count: 3,
        totalAmount: "155000.00",
        approvedAmount: "155000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "FISH_FARMING",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "FISH_FARMING",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-07-03T09:00:00.000Z",
        metadata: {
          fishOperationKind: "FINGERLING_PURCHASE",
          pondRef: "Bassin 01",
          cycleRef: "Cycle 2026-A",
          species: "Tilapia",
          fingerlingBatchRef: "Lot A",
          quantity: "1000",
          unit: "piece",
          unitPrice: "30"
        }
      },
      {
        activityCode: "FISH_FARMING",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "45000.00",
        currency: "XOF",
        occurredAt: "2026-07-07T09:00:00.000Z",
        metadata: {
          fishOperationKind: "FEED_PURCHASE",
          pondRef: "Bassin 01",
          cycleRef: "Cycle 2026-A",
          species: "Tilapia",
          feedName: "Aliment croissance",
          quantity: "15",
          unit: "sac",
          unitPrice: "3000"
        }
      },
      {
        activityCode: "FISH_FARMING",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "80000.00",
        currency: "XOF",
        occurredAt: "2026-07-22T09:00:00.000Z",
        metadata: {
          fishOperationKind: "FISH_SALE",
          pondRef: "Bassin 01",
          cycleRef: "Cycle 2026-A",
          species: "Tilapia",
          quantity: "200",
          unit: "kg",
          unitPrice: "400",
          buyerRef: "Client Bamako"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "FISH_FARMING",
        status: "DONE",
        dueDate: "2026-07-04T09:00:00.000Z",
        metadata: {
          fishTaskKind: "FEEDING",
          pondRef: "Bassin 01",
          cycleRef: "Cycle 2026-A",
          species: "Tilapia",
          mortalityCount: "3"
        }
      },
      {
        activityCode: "FISH_FARMING",
        status: "BLOCKED",
        dueDate: "2026-07-16T09:00:00.000Z",
        metadata: {
          fishTaskKind: "WATER_CONTROL",
          pondRef: "Bassin 01",
          cycleRef: "Cycle 2026-A",
          species: "Tilapia",
          waterQuality: "Oxygene faible"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "FISH_FARMING",
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-31T23:59:59.999Z"
    });

    expect(result.fishFarmingOperationsReport?.periodLabel).toBe("juillet 2026");
    expect(result.fishFarmingOperationsReport?.rows).toEqual([
      expect.objectContaining({
        pondRef: "Bassin 01",
        cycleRef: "Cycle 2026-A",
        species: "Tilapia",
        fingerlingsQuantity: 1000,
        feedQuantity: 15,
        soldQuantity: 200,
        mortalityCount: 3,
        transactionsCount: 3,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "80000.00",
        cashOutAmount: "75000.00",
        netAmount: "5000.00",
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.fishFarmingOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Achat alevins", cashOutAmount: "30000.00" }),
        expect.objectContaining({ operationLabel: "Achat aliment", cashOutAmount: "45000.00" }),
        expect.objectContaining({ operationLabel: "Vente poisson", cashInAmount: "80000.00" }),
        expect.objectContaining({ operationLabel: "Tache: Nourrissage", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tache: Controle eau", tasksCount: 1 })
      ])
    );
    expect(result.fishFarmingOperationsReport?.totals).toMatchObject({
      pondsCount: 1,
      cyclesCount: 1,
      fingerlingsQuantity: 1000,
      feedQuantity: 15,
      soldQuantity: 200,
      mortalityCount: 3,
      transactionsCount: 3,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "80000.00",
      cashOutAmount: "75000.00",
      netAmount: "5000.00",
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "FISH_FARMING",
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-31T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the livestock operations report from herd and batch metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 3, totalAmount: "550000.00" },
      { status: "SUBMITTED", currency: "XOF", count: 1, totalAmount: "50000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 2,
        totalAmount: "250000.00",
        approvedAmount: "250000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 2,
        totalAmount: "350000.00",
        approvedAmount: "300000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "LIVESTOCK",
        count: 4,
        totalAmount: "600000.00",
        approvedAmount: "550000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "LIVESTOCK",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "LIVESTOCK",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "300000.00",
        currency: "XOF",
        occurredAt: "2026-09-03T09:00:00.000Z",
        metadata: {
          livestockOperationKind: "ANIMAL_PURCHASE",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          animalCount: "2",
          unit: "tete",
          unitPrice: "150000",
          supplierRef: "Fournisseur Sikasso"
        }
      },
      {
        activityCode: "LIVESTOCK",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-09-05T09:00:00.000Z",
        metadata: {
          livestockOperationKind: "FEED_PURCHASE",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          feedName: "Aliment croissance",
          feedQuantity: "10",
          unit: "sac",
          unitPrice: "5000"
        }
      },
      {
        activityCode: "LIVESTOCK",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "220000.00",
        currency: "XOF",
        occurredAt: "2026-09-22T09:00:00.000Z",
        metadata: {
          livestockOperationKind: "ANIMAL_SALE",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          animalCount: "1",
          unit: "tete",
          unitPrice: "220000",
          buyerRef: "Client Bamako"
        }
      },
      {
        activityCode: "LIVESTOCK",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-09-24T09:00:00.000Z",
        metadata: {
          livestockOperationKind: "PRODUCT_SALE",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          productName: "Lait",
          productQuantity: "30",
          unit: "litre",
          unitPrice: "1000"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "LIVESTOCK",
        status: "DONE",
        dueDate: "2026-09-04T09:00:00.000Z",
        metadata: {
          livestockTaskKind: "VACCINATION",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          treatmentName: "Vaccin annuel",
          mortalityCount: "0"
        }
      },
      {
        activityCode: "LIVESTOCK",
        status: "BLOCKED",
        dueDate: "2026-09-16T09:00:00.000Z",
        metadata: {
          livestockTaskKind: "HEALTH_CHECK",
          herdRef: "Troupeau bovins",
          batchRef: "Lot 2026-A",
          species: "Boeuf",
          healthStatus: "A surveiller",
          mortalityCount: "1"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "LIVESTOCK",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(result.livestockOperationsReport?.periodLabel).toBe("septembre 2026");
    expect(result.livestockOperationsReport?.rows).toEqual([
      expect.objectContaining({
        herdRef: "Troupeau bovins",
        batchRef: "Lot 2026-A",
        species: "Boeuf",
        animalPurchaseCount: 2,
        feedQuantity: 10,
        soldAnimalCount: 1,
        productQuantity: 30,
        mortalityCount: 1,
        transactionsCount: 4,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "250000.00",
        cashOutAmount: "350000.00",
        netAmount: "-100000.00",
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.livestockOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Achat animaux", cashOutAmount: "300000.00" }),
        expect.objectContaining({ operationLabel: "Achat aliment", cashOutAmount: "50000.00" }),
        expect.objectContaining({ operationLabel: "Vente animaux", cashInAmount: "220000.00" }),
        expect.objectContaining({ operationLabel: "Vente produits", cashInAmount: "30000.00" }),
        expect.objectContaining({ operationLabel: "Tache: Vaccination", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tache: Controle sanitaire", tasksCount: 1 })
      ])
    );
    expect(result.livestockOperationsReport?.totals).toMatchObject({
      herdsCount: 1,
      batchesCount: 1,
      animalPurchaseCount: 2,
      feedQuantity: 10,
      soldAnimalCount: 1,
      productQuantity: 30,
      mortalityCount: 1,
      transactionsCount: 4,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "250000.00",
      cashOutAmount: "350000.00",
      netAmount: "-100000.00",
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "LIVESTOCK",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
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
