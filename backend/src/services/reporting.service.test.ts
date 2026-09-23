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
  listReportBtpTransactions,
  listReportGeneralStoreInventorySnapshots,
  listReportGeneralStoreTransactions,
  listReportOperationalTasks,
  listReportOperationalTransactions,
  listReportRentalTransactions,
  listReportRoleDistribution,
  listReportTaskByActivity,
  listReportTaskByStatus,
  listTransactionsForExport,
  toTransactionExportRecord
} from "../repositories/reporting.repository.js";
import { listFinancialAccounts } from "../repositories/finance.repository.js";
import { listRentalTenants } from "../repositories/rental-tenants.repository.js";
import { listGeneralStoreShops } from "../repositories/general-store-shops.repository.js";
import { listBtpProjects } from "../repositories/btp-projects.repository.js";

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
  listReportBtpTransactions: vi.fn(),
  listReportGeneralStoreInventorySnapshots: vi.fn(),
  listReportGeneralStoreTransactions: vi.fn(),
  listReportOperationalTasks: vi.fn(),
  listReportOperationalTransactions: vi.fn(),
  listReportRentalTransactions: vi.fn(),
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

vi.mock("../repositories/rental-tenants.repository.js", () => ({
  listRentalTenants: vi.fn()
}));

vi.mock("../repositories/general-store-shops.repository.js", () => ({
  listGeneralStoreShops: vi.fn()
}));

vi.mock("../repositories/btp-projects.repository.js", () => ({
  listBtpProjects: vi.fn()
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
    vi.mocked(listReportRentalTransactions).mockResolvedValue([]);
    vi.mocked(listRentalTenants).mockResolvedValue([]);
    vi.mocked(listReportGeneralStoreTransactions).mockResolvedValue([]);
    vi.mocked(listGeneralStoreShops).mockResolvedValue([]);
    vi.mocked(listReportGeneralStoreInventorySnapshots).mockResolvedValue([]);
    vi.mocked(listReportBtpTransactions).mockResolvedValue([]);
    vi.mocked(listBtpProjects).mockResolvedValue([]);
  });

  it("filters dashboard finance and opérations by the selected activity", async () => {
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
        name: "Caisse élevage",
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

  it("builds the filtered hardware purchases report from item metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "SUBMITTED", currency: "XOF", count: 3, totalAmount: "250000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 3,
        totalAmount: "250000.00",
        approvedAmount: "250000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "HARDWARE",
        count: 3,
        totalAmount: "250000.00",
        approvedAmount: "250000.00"
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
        type: "CASH_OUT",
        amount: "120000.00",
        currency: "XOF",
        occurredAt: "2026-05-03T09:00:00.000Z",
        metadata: {
          hardwareOperationKind: "ITEM_ENTRY",
          itemName: "CIMENT ET FER",
          quantity: "10",
          purchaseUnitPrice: "12000",
          marginAmount: "15000",
          recipientRef: "Quincaillerie Almoustapha"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-05-03T14:00:00.000Z",
        metadata: {
          hardwareOperationKind: "ITEM_ENTRY",
          itemName: "CIMENT ET FER",
          quantity: "2",
          purchaseUnitPrice: "15000",
          marginAmount: "5000"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "DRAFT",
        type: "CASH_OUT",
        amount: "9000.00",
        currency: "XOF",
        occurredAt: "2026-05-04T08:00:00.000Z",
        metadata: {
          hardwareOperationKind: "ITEM_ENTRY",
          itemName: "BROUETTE",
          quantity: "1",
          purchaseUnitPrice: "9000"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "60000.00",
        currency: "XOF",
        description: "Achat comptoir plomberie",
        occurredAt: "2026-05-04T16:00:00.000Z",
        metadata: {
          hardwareOperationKind: "GLOBAL"
        }
      },
      {
        activityCode: "HARDWARE",
        status: "APPROVED",
        type: "CASH_OUT",
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
        recipientRef: "Quincaillerie Almoustapha",
        quantity: 10,
        purchaseUnitPrice: "12000.00",
        purchaseAmount: "120000.00",
        grossProfit: "15000.00",
        transactionsCount: 1,
        currency: "XOF"
      },
      {
        date: "2026-05-03",
        designation: "CIMENT ET FER",
        recipientRef: "-",
        quantity: 2,
        purchaseUnitPrice: "15000.00",
        purchaseAmount: "30000.00",
        grossProfit: "5000.00",
        transactionsCount: 1,
        currency: "XOF"
      },
      {
        date: "2026-05-04",
        designation: "Achat comptoir plomberie",
        recipientRef: "-",
        quantity: 0,
        purchaseUnitPrice: "0.00",
        purchaseAmount: "60000.00",
        grossProfit: "0.00",
        transactionsCount: 1,
        currency: "XOF"
      }
    ]);
    expect(result.hardwareMonthlyReport?.totals).toMatchObject({
      quantity: 12,
      purchaseUnitPrice: "27000.00",
      purchaseAmount: "210000.00",
      grossProfit: "20000.00",
      transactionsCount: 3,
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

  it("builds the general expenses report split between PDG and employees", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([]);
    vi.mocked(listReportRoleDistribution).mockResolvedValue([]);
    vi.mocked(listDashboardWorkload).mockResolvedValue([]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "GENERAL_EXPENSES",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "2000.00",
        currency: "XOF",
        description: "Diner",
        occurredAt: "2026-06-01T09:00:00.000Z",
        metadata: { generalExpenseKind: "EMPLOYEE_MEALS" }
      },
      {
        activityCode: "GENERAL_EXPENSES",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "46000.00",
        currency: "XOF",
        description: "Gazoil groupe",
        occurredAt: "2026-06-02T09:00:00.000Z",
        metadata: { generalExpenseKind: "EMPLOYEE_FUEL" }
      },
      {
        activityCode: "GENERAL_EXPENSES",
        status: "DRAFT",
        type: "CASH_OUT",
        amount: "2000.00",
        currency: "XOF",
        description: "Diner brouillon",
        occurredAt: "2026-06-03T09:00:00.000Z",
        metadata: { generalExpenseKind: "EMPLOYEE_MEALS" }
      },
      {
        activityCode: "GENERAL_EXPENSES",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "100000.00",
        currency: "XOF",
        description: "Achat ciment",
        occurredAt: "2026-06-05T09:00:00.000Z",
        metadata: { generalExpenseKind: "PDG_SUPPLIES", quantity: "2", unitPrice: "50000" }
      },
      {
        activityCode: "GENERAL_EXPENSES",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "500000.00",
        currency: "XOF",
        description: "Avance chantier",
        occurredAt: "2026-06-10T09:00:00.000Z",
        metadata: { generalExpenseKind: "PDG_TRANSFER_ADVANCE" }
      },
      {
        activityCode: "GENERAL_EXPENSES",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "999999.00",
        currency: "XOF",
        description: "Ne doit pas apparaitre",
        occurredAt: "2026-06-12T09:00:00.000Z",
        metadata: { generalExpenseKind: "PDG_SUPPLIES" }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "GENERAL_EXPENSES",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(result.generalExpensesReport?.rows).toEqual([
      expect.objectContaining({
        date: "2026-06-01",
        ownerType: "EMPLOYE",
        categoryLabel: "Repas",
        designation: "Diner",
        amount: "2000.00"
      }),
      expect.objectContaining({
        date: "2026-06-02",
        ownerType: "EMPLOYE",
        categoryLabel: "Carburant",
        designation: "Gazoil groupe",
        amount: "46000.00"
      }),
      expect.objectContaining({
        date: "2026-06-05",
        ownerType: "PDG",
        categoryLabel: "Achat matériel / fournitures",
        designation: "Achat ciment",
        quantity: 2,
        unitPrice: "50000.00",
        amount: "100000.00"
      }),
      expect.objectContaining({
        date: "2026-06-10",
        ownerType: "PDG",
        categoryLabel: "Virement / avance / transfert",
        designation: "Avance chantier",
        amount: "500000.00"
      })
    ]);
    expect(result.generalExpensesReport?.breakdownRows).toEqual([
      expect.objectContaining({
        ownerType: "PDG",
        categoryLabel: "Virement / avance / transfert",
        transactionsCount: 1,
        amount: "500000.00"
      }),
      expect.objectContaining({
        ownerType: "PDG",
        categoryLabel: "Achat matériel / fournitures",
        transactionsCount: 1,
        amount: "100000.00"
      }),
      expect.objectContaining({
        ownerType: "EMPLOYE",
        categoryLabel: "Carburant",
        transactionsCount: 1,
        amount: "46000.00"
      }),
      expect.objectContaining({
        ownerType: "EMPLOYE",
        categoryLabel: "Repas",
        transactionsCount: 1,
        amount: "2000.00"
      })
    ]);
    expect(result.generalExpensesReport?.totals).toMatchObject({
      transactionsCount: 4,
      pdgAmount: "600000.00",
      employeeAmount: "48000.00",
      totalAmount: "648000.00",
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "GENERAL_EXPENSES",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("requires a selected activity for reports", async () => {
    await expect(getCompanyReportsOverview(actor, {})).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it("builds generic operational performance for sectors without a focused report", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "SUBMITTED", currency: "XOF", count: 2, totalAmount: "180000.00" },
      { status: "DRAFT", currency: "XOF", count: 1, totalAmount: "200000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 2,
        totalAmount: "350000.00",
        approvedAmount: "150000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 1,
        totalAmount: "30000.00",
        approvedAmount: "30000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "TRANSPORT",
        count: 3,
        totalAmount: "380000.00",
        approvedAmount: "180000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "TRANSPORT",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportRoleDistribution).mockResolvedValue([]);
    vi.mocked(listDashboardWorkload).mockResolvedValue([]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "TRANSPORT",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "150000.00",
        currency: "XOF",
        occurredAt: "2026-09-05T10:00:00.000Z",
        metadata: {
          transportService: "Location camion",
          assetType: "Camion benne",
          vehicleRef: "TR-001"
        }
      },
      {
        activityCode: "TRANSPORT",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-09-06T10:00:00.000Z",
        metadata: {
          transportService: "Location camion",
          assetType: "Camion benne",
          vehicleRef: "TR-001"
        }
      },
      {
        activityCode: "TRANSPORT",
        status: "DRAFT",
        type: "CASH_IN",
        amount: "200000.00",
        currency: "XOF",
        occurredAt: "2026-09-07T10:00:00.000Z",
        metadata: {
          transportService: "Location camion",
          assetType: "Camion benne",
          vehicleRef: "TR-001"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "TRANSPORT",
        status: "DONE",
        dueDate: "2026-09-08T10:00:00.000Z",
        metadata: {
          transportService: "Location camion",
          assetType: "Camion benne",
          vehicleRef: "TR-001"
        }
      },
      {
        activityCode: "TRANSPORT",
        status: "BLOCKED",
        dueDate: "2026-09-09T10:00:00.000Z",
        metadata: {
          transportService: "Location camion",
          assetType: "Camion benne",
          vehicleRef: "TR-001"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "TRANSPORT",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(result.btpOperationsReport).toBeNull();
    expect(result.fishFarmingOperationsReport).toBeNull();
    expect(result.operationalPerformance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "ACTIVITY",
          activityCode: "TRANSPORT",
          itemLabel: "Transport",
          transactionsCount: 2,
          approvedTransactionsCount: 2,
          approvedCashIn: "150000.00",
          approvedCashOut: "30000.00",
          netProfit: "120000.00",
          totalTasksCount: 2,
          doneTasksCount: 1,
          openTasksCount: 1,
          blockedTasksCount: 1,
          executionRate: 50
        }),
        expect.objectContaining({
          scope: "SUBSECTION",
          activityCode: "TRANSPORT",
          dimensionKey: "transportService",
          itemLabel: "Location camion",
          approvedCashIn: "150000.00",
          approvedCashOut: "30000.00",
          totalTasksCount: 2
        })
      ])
    );

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "TRANSPORT",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the agriculture opérations report from campaign metadata", async () => {
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
        expect.objectContaining({ operationLabel: "Vente récolte", cashInAmount: "120000.00" }),
        expect.objectContaining({ operationLabel: "Tâche: Semis", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Récolte", tasksCount: 1 })
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

    expect(unfilteredResult.agricultureOperationsReport?.periodLabel).toBe("Toutes périodes");
  });

  it("builds the général store opérations report as a per-boutique ledger", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 3, totalAmount: "190000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 1,
        totalAmount: "40000.00",
        approvedAmount: "40000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 2,
        totalAmount: "150000.00",
        approvedAmount: "150000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "GENERAL_STORE",
        count: 3,
        totalAmount: "190000.00",
        approvedAmount: "190000.00"
      }
    ]);
    vi.mocked(listGeneralStoreShops).mockResolvedValue([
      {
        id: "shop-nord",
        companyId: actor.companyId,
        name: "Boutique Nord",
        location: "Marché central",
        phone: null,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "shop-sud",
        companyId: actor.companyId,
        name: "Boutique Sud",
        location: null,
        phone: null,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    vi.mocked(listReportGeneralStoreTransactions).mockResolvedValue([
      {
        activityCode: "GENERAL_STORE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "100000.00",
        currency: "XOF",
        occurredAt: "2026-09-05T09:00:00.000Z",
        metadata: {
          storeOperationKind: "ACHAT",
          shopRef: "Boutique Nord"
        }
      },
      {
        activityCode: "GENERAL_STORE",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "40000.00",
        currency: "XOF",
        occurredAt: "2026-09-12T09:00:00.000Z",
        metadata: {
          storeOperationKind: "RECOUVREMENT",
          shopRef: "Boutique Nord"
        }
      },
      {
        activityCode: "GENERAL_STORE",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-09-03T09:00:00.000Z",
        metadata: {
          storeOperationKind: "ACHAT",
          shopRef: "Boutique Sud"
        }
      }
    ]);
    vi.mocked(listReportGeneralStoreInventorySnapshots).mockResolvedValue([
      {
        shopRef: "Boutique Nord",
        remainingStockValue: "30000.00",
        recordedAt: "2026-09-20T09:00:00.000Z"
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "GENERAL_STORE",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(result.generalStoreOperationsReport?.rows).toEqual([
      expect.objectContaining({
        shopRef: "Boutique Nord",
        purchaseAmount: "100000.00",
        collectedAmount: "40000.00",
        balanceAmount: "60000.00",
        remainingStockValue: "30000.00",
        estimatedSoldAmount: "70000.00",
        varianceAmount: "30000.00",
        currency: "XOF"
      }),
      expect.objectContaining({
        shopRef: "Boutique Sud",
        purchaseAmount: "50000.00",
        collectedAmount: "0.00",
        balanceAmount: "50000.00",
        remainingStockValue: null,
        estimatedSoldAmount: null,
        varianceAmount: null,
        currency: "XOF"
      })
    ]);
    expect(result.generalStoreOperationsReport?.totals).toMatchObject({
      shopsCount: 2,
      purchaseAmount: "150000.00",
      collectedAmount: "40000.00",
      balanceAmount: "110000.00",
      transactionsCount: 3,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "GENERAL_STORE",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the food opérations report from product and batch metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 3, totalAmount: "260000.00" },
      { status: "SUBMITTED", currency: "XOF", count: 1, totalAmount: "15000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 1,
        totalAmount: "150000.00",
        approvedAmount: "150000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 3,
        totalAmount: "125000.00",
        approvedAmount: "110000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "FOOD",
        count: 4,
        totalAmount: "275000.00",
        approvedAmount: "260000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "FOOD",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "FOOD",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "100000.00",
        currency: "XOF",
        occurredAt: "2026-12-03T09:00:00.000Z",
        metadata: {
          foodOperationKind: "PRODUCT_PURCHASE",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          expiryDate: "2027-03-31",
          storageArea: "Réserve",
          quantity: "100",
          unit: "carton",
          purchaseUnitPrice: "1000",
          supplierRef: "Grossiste Bamako",
          invoiceRef: "FAC-FOOD-01"
        }
      },
      {
        activityCode: "FOOD",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "150000.00",
        currency: "XOF",
        occurredAt: "2026-12-05T09:00:00.000Z",
        metadata: {
          foodOperationKind: "PRODUCT_SALE",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          expiryDate: "2027-03-31",
          storageArea: "Réserve",
          quantity: "60",
          unit: "carton",
          saleUnitPrice: "2500",
          buyerRef: "Boutique A",
          paymentRef: "CAISSE-01"
        }
      },
      {
        activityCode: "FOOD",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "10000.00",
        currency: "XOF",
        occurredAt: "2026-12-08T09:00:00.000Z",
        metadata: {
          foodOperationKind: "STOCK_LOSS",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          expiryDate: "2027-03-31",
          storageArea: "Réserve",
          lossQuantity: "10",
          unit: "carton",
          purchaseUnitPrice: "1000",
          lossReason: "Casse"
        }
      },
      {
        activityCode: "FOOD",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "15000.00",
        currency: "XOF",
        occurredAt: "2026-12-10T09:00:00.000Z",
        metadata: {
          foodOperationKind: "COLD_CHAIN_EXPENSE",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          storageArea: "Réserve",
          temperatureRange: "4-8 C",
          supplierRef: "Technicien froid",
          invoiceRef: "FAC-FROID-01",
          invoiceAmount: "15000"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "FOOD",
        status: "DONE",
        dueDate: "2026-12-12T09:00:00.000Z",
        metadata: {
          foodTaskKind: "EXPIRY_CHECK",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          expiryDate: "2027-03-31",
          storageArea: "Réserve"
        }
      },
      {
        activityCode: "FOOD",
        status: "BLOCKED",
        dueDate: "2026-12-14T09:00:00.000Z",
        metadata: {
          foodTaskKind: "COLD_CHAIN_CHECK",
          productFamily: "Boissons",
          productName: "Jus mangue",
          batchRef: "LOT-JM-01",
          expiryDate: "2027-03-31",
          storageArea: "Réserve",
          issueRef: "Température instable"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "FOOD",
      dateFrom: "2026-12-01T00:00:00.000Z",
      dateTo: "2026-12-31T23:59:59.999Z"
    });

    expect(result.foodOperationsReport?.periodLabel).toBe("décembre 2026");
    expect(result.foodOperationsReport?.rows).toEqual([
      expect.objectContaining({
        productFamily: "Boissons",
        productName: "Jus mangue",
        batchRef: "LOT-JM-01",
        storageArea: "Réserve",
        purchaseQuantity: 100,
        soldQuantity: 60,
        lossQuantity: 10,
        purchaseAmount: "100000.00",
        salesAmount: "150000.00",
        lossAmount: "10000.00",
        expenseAmount: "15000.00",
        transactionsCount: 4,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "150000.00",
        cashOutAmount: "125000.00",
        netAmount: "25000.00",
        grossMargin: "40000.00",
        marginRate: 26.67,
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.foodOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Achat stock", cashOutAmount: "100000.00" }),
        expect.objectContaining({ operationLabel: "Vente produit", cashInAmount: "150000.00" }),
        expect.objectContaining({ operationLabel: "Perte / péremption", cashOutAmount: "10000.00" }),
        expect.objectContaining({ operationLabel: "Chaîne du froid", cashOutAmount: "15000.00" }),
        expect.objectContaining({ operationLabel: "Tâche: Contrôle DLC", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Contrôle froid", tasksCount: 1 })
      ])
    );
    expect(result.foodOperationsReport?.totals).toMatchObject({
      productFamiliesCount: 1,
      productsCount: 1,
      batchesCount: 1,
      purchaseQuantity: 100,
      soldQuantity: 60,
      lossQuantity: 10,
      purchaseAmount: "100000.00",
      salesAmount: "150000.00",
      lossAmount: "10000.00",
      expenseAmount: "15000.00",
      transactionsCount: 4,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "150000.00",
      cashOutAmount: "125000.00",
      netAmount: "25000.00",
      grossMargin: "40000.00",
      marginRate: 26.67,
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "FOOD",
      dateFrom: "2026-12-01T00:00:00.000Z",
      dateTo: "2026-12-31T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the BTP opérations report as a per-chantier cost ledger", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 5, totalAmount: "725000.00" },
      { status: "SUBMITTED", currency: "XOF", count: 1, totalAmount: "90000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 1,
        totalAmount: "500000.00",
        approvedAmount: "500000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 5,
        totalAmount: "325000.00",
        approvedAmount: "225000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "BTP",
        count: 6,
        totalAmount: "825000.00",
        approvedAmount: "725000.00"
      }
    ]);
    vi.mocked(listBtpProjects).mockResolvedValue([
      {
        id: "project-kalaban",
        companyId: actor.companyId,
        name: "Chantier Kalaban",
        clientRef: "Client AMCCO",
        contractRef: "DEV-2026-10",
        location: "Kalaban",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    vi.mocked(listReportBtpTransactions).mockResolvedValue([
      {
        activityCode: "BTP",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "500000.00",
        currency: "XOF",
        occurredAt: "2026-10-03T09:00:00.000Z",
        metadata: {
          btpOperationKind: "CLIENT_PAYMENT",
          projectRef: "Chantier Kalaban",
          invoiceRef: "SIT-01",
          progressPercent: "40",
          retentionAmount: "25000"
        }
      },
      {
        activityCode: "BTP",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "120000.00",
        currency: "XOF",
        occurredAt: "2026-10-05T09:00:00.000Z",
        metadata: {
          btpOperationKind: "MATERIAL_PURCHASE",
          projectRef: "Chantier Kalaban",
          materialName: "Ciment",
          quantity: "100",
          unit: "sac",
          unitPrice: "1200",
          supplierRef: "Depot ciment"
        }
      },
      {
        activityCode: "BTP",
        status: "SUBMITTED",
        type: "CASH_OUT",
        amount: "90000.00",
        currency: "XOF",
        occurredAt: "2026-10-10T09:00:00.000Z",
        metadata: {
          btpOperationKind: "LABOR_PAYMENT",
          projectRef: "Chantier Kalaban",
          teamRef: "Equipe macons",
          workerCount: "5",
          workDays: "6",
          dailyRate: "3000"
        }
      },
      {
        activityCode: "BTP",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "40000.00",
        currency: "XOF",
        occurredAt: "2026-10-12T09:00:00.000Z",
        metadata: {
          btpOperationKind: "EQUIPMENT_RENTAL",
          projectRef: "Chantier Kalaban",
          equipmentRef: "Betonniere",
          equipmentHours: "10",
          hourlyRate: "4000",
          progressPercent: "60",
          retentionAmount: "5000"
        }
      },
      {
        activityCode: "BTP",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "60000.00",
        currency: "XOF",
        occurredAt: "2026-10-14T09:00:00.000Z",
        metadata: {
          btpOperationKind: "SUBCONTRACTING",
          projectRef: "Chantier Kalaban",
          subcontractorRef: "Artisan Traore"
        }
      },
      {
        activityCode: "BTP",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "15000.00",
        currency: "XOF",
        occurredAt: "2026-10-15T09:00:00.000Z",
        metadata: {
          btpOperationKind: "SITE_EXPENSE",
          projectRef: "Chantier Kalaban",
          expenseLabel: "Manutention"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "BTP",
      dateFrom: "2026-10-01T00:00:00.000Z",
      dateTo: "2026-10-31T23:59:59.999Z"
    });

    expect(result.btpOperationsReport?.rows).toEqual([
      expect.objectContaining({
        projectRef: "Chantier Kalaban",
        clientRef: "Client AMCCO",
        location: "Kalaban",
        cashInAmount: "500000.00",
        materialAmount: "120000.00",
        laborAmount: "90000.00",
        equipmentAmount: "40000.00",
        subcontractingAmount: "60000.00",
        siteExpenseAmount: "15000.00",
        totalCostAmount: "325000.00",
        netAmount: "175000.00",
        retentionAmount: "30000.00",
        lastProgressPercent: 60,
        transactionsCount: 6,
        currency: "XOF"
      })
    ]);
    expect(result.btpOperationsReport?.totals).toMatchObject({
      projectsCount: 1,
      cashInAmount: "500000.00",
      materialAmount: "120000.00",
      laborAmount: "90000.00",
      equipmentAmount: "40000.00",
      subcontractingAmount: "60000.00",
      siteExpenseAmount: "15000.00",
      totalCostAmount: "325000.00",
      netAmount: "175000.00",
      transactionsCount: 6,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "BTP",
      dateFrom: "2026-10-01T00:00:00.000Z",
      dateTo: "2026-10-31T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the rental arrears ledger from the tenant roster and cumulative loyer payments", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 2, totalAmount: "95000.00" },
      { status: "SUBMITTED", currency: "XOF", count: 1, totalAmount: "20000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "RENTAL",
        count: 5,
        totalAmount: "590000.00",
        approvedAmount: "570000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([]);
    vi.mocked(listRentalTenants).mockResolvedValue([
      {
        id: "tenant-issa",
        companyId: actor.companyId,
        name: "Issa Guido",
        unitLabel: "Appartement 2 pièces salon",
        monthlyRent: "30000.00",
        phone: null,
        tenancyStart: "2026-01",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "tenant-dramane",
        companyId: actor.companyId,
        name: "Dramane Manta",
        unitLabel: "Chambre salon",
        monthlyRent: "20000.00",
        phone: null,
        tenancyStart: "2026-06",
        isActive: true,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z")
      },
      {
        id: "tenant-cisse",
        companyId: actor.companyId,
        name: "Mahamadou Cisse",
        unitLabel: "Boutique",
        monthlyRent: "20000.00",
        phone: null,
        tenancyStart: "2025-01",
        isActive: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z")
      }
    ]);
    vi.mocked(listReportRentalTransactions).mockResolvedValue([
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "150000.00",
        currency: "XOF",
        occurredAt: "2026-03-10T09:00:00.000Z",
        metadata: { rentalOperationKind: "LOYER", tenantRef: "Issa Guido" }
      },
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "150000.00",
        currency: "XOF",
        occurredAt: "2026-09-15T09:00:00.000Z",
        metadata: { rentalOperationKind: "LOYER", tenantRef: "Issa Guido" }
      },
      {
        activityCode: "RENTAL",
        status: "SUBMITTED",
        type: "CASH_IN",
        amount: "20000.00",
        currency: "XOF",
        occurredAt: "2026-06-10T09:00:00.000Z",
        metadata: { rentalOperationKind: "LOYER", tenantRef: "Dramane Manta" }
      },
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "20000.00",
        currency: "XOF",
        occurredAt: "2026-11-05T09:00:00.000Z",
        metadata: { rentalOperationKind: "LOYER", tenantRef: "Dramane Manta" }
      },
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "460000.00",
        currency: "XOF",
        occurredAt: "2026-02-01T09:00:00.000Z",
        metadata: { rentalOperationKind: "LOYER", tenantRef: "Mahamadou Cisse" }
      },
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "60000.00",
        currency: "XOF",
        occurredAt: "2026-11-02T09:00:00.000Z",
        metadata: { rentalOperationKind: "CAUTION", tenantRef: "Issa Guido" }
      },
      {
        activityCode: "RENTAL",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "15000.00",
        currency: "XOF",
        occurredAt: "2026-11-08T09:00:00.000Z",
        metadata: { rentalOperationKind: "AUTRE" }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "RENTAL",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-30T23:59:59.999Z"
    });

    expect(result.rentalOperationsReport?.asOfLabel).toBe("30/11/2026");
    expect(result.rentalOperationsReport?.rows).toEqual([
      expect.objectContaining({
        tenantRef: "Dramane Manta",
        unitRef: "Chambre salon",
        monthlyRent: "20000.00",
        totalDue: "100000.00",
        totalPaid: "40000.00",
        balanceAmount: "60000.00",
        status: "EN_RETARD",
        statusDetail: "En retard depuis août 2026"
      }),
      expect.objectContaining({
        tenantRef: "Issa Guido",
        unitRef: "Appartement 2 pièces salon",
        monthlyRent: "30000.00",
        totalDue: "300000.00",
        totalPaid: "300000.00",
        balanceAmount: "0.00",
        status: "A_JOUR",
        statusDetail: "À jour"
      }),
      expect.objectContaining({
        tenantRef: "Mahamadou Cisse",
        unitRef: "Boutique",
        monthlyRent: "20000.00",
        totalDue: "440000.00",
        totalPaid: "460000.00",
        balanceAmount: "-20000.00",
        status: "AVANCE",
        statusDetail: "Payé d'avance jusqu'à novembre 2026"
      })
    ]);
    expect(result.rentalOperationsReport?.operationRows).toEqual([
      expect.objectContaining({
        operationKind: "20000.00",
        operationLabel: "1 loyer payé à 20 000 F CFA",
        transactionsCount: 1,
        cashInAmount: "20000.00"
      })
    ]);
    expect(result.rentalOperationsReport?.totals).toMatchObject({
      tenantsCount: 3,
      upToDateTenantsCount: 2,
      lateTenantsCount: 1,
      totalArrearsAmount: "60000.00",
      collectedAmount: "20000.00",
      depositAmount: "60000.00",
      cashInAmount: "80000.00",
      cashOutAmount: "15000.00",
      netAmount: "65000.00",
      executionRate: 66.7,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "RENTAL",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the hotel opérations report from booking and stay metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 6, totalAmount: "295000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 3,
        totalAmount: "260000.00",
        approvedAmount: "260000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 3,
        totalAmount: "35000.00",
        approvedAmount: "35000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "HOTEL_LODGING",
        count: 6,
        totalAmount: "295000.00",
        approvedAmount: "295000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "HOTEL_LODGING",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "180000.00",
        currency: "XOF",
        occurredAt: "2026-04-03T09:00:00.000Z",
        metadata: {
          hotelOperationKind: "ROOM_PAYMENT",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          checkInDate: "2026-04-02",
          checkOutDate: "2026-04-05",
          nightsCount: "3",
          roomRate: "60000",
          guestCount: "2",
          paymentRef: "PAY-ROOM-01"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-04-03T10:00:00.000Z",
        metadata: {
          hotelOperationKind: "BOOKING_DEPOSIT",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          paymentRef: "PAY-DEP-01"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-04-04T12:00:00.000Z",
        metadata: {
          hotelOperationKind: "RESTAURANT_SALE",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          mealCount: "3",
          mealUnitPrice: "10000",
          paymentRef: "PAY-REST-01"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "20000.00",
        currency: "XOF",
        occurredAt: "2026-04-05T08:00:00.000Z",
        metadata: {
          hotelOperationKind: "ROOM_MAINTENANCE",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          supplierRef: "Technicien clim",
          invoiceRef: "FAC-MAINT-01",
          invoiceAmount: "20000"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "10000.00",
        currency: "XOF",
        occurredAt: "2026-04-05T09:00:00.000Z",
        metadata: {
          hotelOperationKind: "COMMISSION_FEE",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          commissionAmount: "10000"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "5000.00",
        currency: "XOF",
        occurredAt: "2026-04-05T10:00:00.000Z",
        metadata: {
          hotelOperationKind: "TAX_PAYMENT",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          taxAmount: "5000"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "HOTEL_LODGING",
        status: "DONE",
        dueDate: "2026-04-02T14:00:00.000Z",
        metadata: {
          hotelTaskKind: "CHECK_IN",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          checkInDate: "2026-04-02"
        }
      },
      {
        activityCode: "HOTEL_LODGING",
        status: "BLOCKED",
        dueDate: "2026-04-05T10:00:00.000Z",
        metadata: {
          hotelTaskKind: "MAINTENANCE",
          bookingRef: "BKG-01",
          stayRef: "STAY-01",
          guestRef: "Client Diarra",
          roomRef: "Chambre 12",
          roomType: "Double",
          serviceLine: "Hebergement",
          issueRef: "Climatisation à contrôler"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "HOTEL_LODGING",
      dateFrom: "2026-04-01T00:00:00.000Z",
      dateTo: "2026-04-30T23:59:59.999Z"
    });

    expect(result.hotelOperationsReport?.periodLabel).toBe("avril 2026");
    expect(result.hotelOperationsReport?.rows).toEqual([
      expect.objectContaining({
        serviceLine: "Hebergement",
        roomRef: "Chambre 12",
        roomType: "Double",
        bookingRef: "BKG-01",
        guestRef: "Client Diarra",
        nightsCount: 3,
        guestCount: 2,
        roomRevenue: "180000.00",
        depositAmount: "50000.00",
        restaurantAmount: "30000.00",
        serviceAmount: "0.00",
        maintenanceAmount: "20000.00",
        commissionAmount: "10000.00",
        taxAmount: "5000.00",
        refundAmount: "0.00",
        expenseAmount: "0.00",
        transactionsCount: 6,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "260000.00",
        cashOutAmount: "35000.00",
        netAmount: "225000.00",
        averageRoomRate: 60000,
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.hotelOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Paiement chambre", cashInAmount: "180000.00" }),
        expect.objectContaining({ operationLabel: "Acompte réservation", cashInAmount: "50000.00" }),
        expect.objectContaining({ operationLabel: "Restauration", cashInAmount: "30000.00" }),
        expect.objectContaining({ operationLabel: "Maintenance chambre", cashOutAmount: "20000.00" }),
        expect.objectContaining({ operationLabel: "Commission", cashOutAmount: "10000.00" }),
        expect.objectContaining({ operationLabel: "Taxe séjour", cashOutAmount: "5000.00" }),
        expect.objectContaining({ operationLabel: "Tâche: Check-in", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Maintenance", tasksCount: 1 })
      ])
    );
    expect(result.hotelOperationsReport?.totals).toMatchObject({
      bookingsCount: 1,
      roomsCount: 1,
      guestsCount: 1,
      nightsCount: 3,
      guestCount: 2,
      roomRevenue: "180000.00",
      depositAmount: "50000.00",
      restaurantAmount: "30000.00",
      serviceAmount: "0.00",
      maintenanceAmount: "20000.00",
      commissionAmount: "10000.00",
      taxAmount: "5000.00",
      refundAmount: "0.00",
      expenseAmount: "0.00",
      transactionsCount: 6,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "260000.00",
      cashOutAmount: "35000.00",
      netAmount: "225000.00",
      averageRoomRate: 60000,
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "HOTEL_LODGING",
      dateFrom: "2026-04-01T00:00:00.000Z",
      dateTo: "2026-04-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the water opérations report from facility and network metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 9, totalAmount: "360000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 4,
        totalAmount: "250000.00",
        approvedAmount: "250000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 5,
        totalAmount: "110000.00",
        approvedAmount: "110000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "WATER",
        count: 9,
        totalAmount: "360000.00",
        approvedAmount: "360000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "WATER",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);
    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "17700.00",
        currency: "XOF",
        occurredAt: "2026-05-03T09:00:00.000Z",
        metadata: {
          waterOperationKind: "WATER_SALE",
          quantity: "59",
          unitPrice: "300"
        }
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "58200.00",
        currency: "XOF",
        occurredAt: "2026-05-04T09:00:00.000Z",
        metadata: {
          waterOperationKind: "WATER_SALE",
          quantity: "194",
          unitPrice: "300"
        }
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "20000.00",
        currency: "XOF",
        occurredAt: "2026-05-05T10:00:00.000Z",
        metadata: { waterOperationKind: "WATER_OTHER_INCOME" },
        description: "Appui mairie"
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "2000.00",
        currency: "XOF",
        occurredAt: "2026-05-03T18:00:00.000Z",
        metadata: { waterOperationKind: "WATER_EXPENSE_MEALS" },
        description: "Diner"
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "46000.00",
        currency: "XOF",
        occurredAt: "2026-05-05T09:00:00.000Z",
        metadata: { waterOperationKind: "WATER_EXPENSE_FUEL" },
        description: "Gazoil"
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "6000.00",
        currency: "XOF",
        occurredAt: "2026-05-06T09:00:00.000Z",
        metadata: { waterOperationKind: "WATER_EXPENSE_VEHICLE_UPKEEP" },
        description: "Vidange moto"
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-05-07T09:00:00.000Z",
        metadata: { waterOperationKind: "WATER_BILLING" },
        description: "Ancienne facture"
      },
      {
        activityCode: "WATER",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "12000.00",
        currency: "XOF",
        occurredAt: "2026-05-08T09:00:00.000Z",
        metadata: { waterOperationKind: "MAINTENANCE_EXPENSE" },
        description: "Ancienne reparation"
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "WATER",
      dateFrom: "2026-05-01T00:00:00.000Z",
      dateTo: "2026-05-31T23:59:59.999Z"
    });

    expect(result.waterOperationsReport?.periodLabel).toBe("mai 2026");
    expect(result.waterOperationsReport?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Vente de paquets d'eau",
          quantity: 59,
          unitPrice: "300.00",
          amount: "17700.00"
        }),
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Vente de paquets d'eau",
          quantity: 194,
          unitPrice: "300.00",
          amount: "58200.00"
        }),
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Autre recette",
          designation: "Appui mairie",
          amount: "20000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Repas",
          designation: "Diner",
          amount: "2000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Carburant (essence / gazoil)",
          designation: "Gazoil",
          amount: "46000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Entretien moto / véhicule",
          designation: "Vidange moto",
          amount: "6000.00"
        }),
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Vente de paquets d'eau",
          designation: "Ancienne facture",
          amount: "30000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Entretien équipement / réparation",
          designation: "Ancienne reparation",
          amount: "12000.00"
        })
      ])
    );
    expect(result.waterOperationsReport?.rows).toHaveLength(8);
    expect(result.waterOperationsReport?.breakdownRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Vente de paquets d'eau",
          transactionsCount: 3,
          amount: "105900.00"
        }),
        expect.objectContaining({
          kind: "IN",
          categoryLabel: "Autre recette",
          transactionsCount: 1,
          amount: "20000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Repas",
          transactionsCount: 1,
          amount: "2000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Carburant (essence / gazoil)",
          transactionsCount: 1,
          amount: "46000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Entretien moto / véhicule",
          transactionsCount: 1,
          amount: "6000.00"
        }),
        expect.objectContaining({
          kind: "OUT",
          categoryLabel: "Entretien équipement / réparation",
          transactionsCount: 1,
          amount: "12000.00"
        })
      ])
    );
    expect(result.waterOperationsReport?.totals).toMatchObject({
      transactionsCount: 8,
      packagesSold: 253,
      averagePackagePrice: "418.58",
      salesAmount: "125900.00",
      expensesAmount: "66000.00",
      netAmount: "59900.00",
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "WATER",
      dateFrom: "2026-05-01T00:00:00.000Z",
      dateTo: "2026-05-31T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the real estate agency opérations report from mandate and deal metadata", async () => {
    vi.mocked(listReportFinanceByStatus).mockResolvedValue([
      { status: "APPROVED", currency: "XOF", count: 10, totalAmount: "655000.00" }
    ]);
    vi.mocked(listReportFinanceByType).mockResolvedValue([
      {
        type: "CASH_IN",
        currency: "XOF",
        count: 5,
        totalAmount: "515000.00",
        approvedAmount: "515000.00"
      },
      {
        type: "CASH_OUT",
        currency: "XOF",
        count: 5,
        totalAmount: "140000.00",
        approvedAmount: "140000.00"
      }
    ]);
    vi.mocked(listReportFinanceByActivity).mockResolvedValue([
      {
        activityCode: "REAL_ESTATE_AGENCY",
        count: 10,
        totalAmount: "655000.00",
        approvedAmount: "655000.00"
      }
    ]);
    vi.mocked(listReportTaskByStatus).mockResolvedValue([
      { status: "DONE", count: 1 },
      { status: "BLOCKED", count: 1 }
    ]);
    vi.mocked(listReportTaskByActivity).mockResolvedValue([
      {
        activityCode: "REAL_ESTATE_AGENCY",
        totalCount: 2,
        openCount: 1,
        blockedCount: 1,
        doneCount: 1
      }
    ]);

    const commonMetadata = {
      mandateRef: "MAND-01",
      propertyRef: "Villa Faso",
      mandateType: "Vente / location",
      propertyType: "Villa",
      locationZone: "ACI",
      ownerRef: "Propriétaire Traore",
      clientRef: "Client Diallo",
      prospectRef: "Lead-01",
      dealRef: "AFF-01",
      dealStage: "Compromis"
    };

    vi.mocked(listReportOperationalTransactions).mockResolvedValue([
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "300000.00",
        currency: "XOF",
        occurredAt: "2026-06-03T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "SALE_COMMISSION",
          dealAmount: "10000000",
          commissionRate: "3",
          commissionAmount: "300000",
          invoiceRef: "COM-V-01",
          paymentRef: "PAY-COM-V-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "120000.00",
        currency: "XOF",
        occurredAt: "2026-06-04T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "RENTAL_COMMISSION",
          dealAmount: "2400000",
          commissionRate: "5",
          commissionAmount: "120000",
          invoiceRef: "COM-L-01",
          paymentRef: "PAY-COM-L-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "50000.00",
        currency: "XOF",
        occurredAt: "2026-06-05T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "MANDATE_FEE",
          feeAmount: "50000",
          documentRef: "MANDAT-SIGNE",
          paymentRef: "PAY-MAND-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "20000.00",
        currency: "XOF",
        occurredAt: "2026-06-06T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "VISIT_FEE",
          visitCount: "2",
          unitPrice: "10000",
          paymentRef: "PAY-VIS-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "25000.00",
        currency: "XOF",
        occurredAt: "2026-06-07T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "FILE_FEE",
          feeAmount: "25000",
          documentRef: "DOSSIER-01",
          paymentRef: "PAY-DOS-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "30000.00",
        currency: "XOF",
        occurredAt: "2026-06-08T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "ADVERTISING_EXPENSE",
          advertisingChannel: "Portail immobilier",
          supplierRef: "Annonceur",
          invoiceRef: "ADV-01",
          expenseAmount: "30000"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "10000.00",
        currency: "XOF",
        occurredAt: "2026-06-09T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "FIELD_VISIT_EXPENSE",
          visitCount: "2",
          unitPrice: "5000",
          supplierRef: "Carburant",
          invoiceRef: "DEP-01",
          expenseAmount: "10000"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "60000.00",
        currency: "XOF",
        occurredAt: "2026-06-10T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "BROKER_PAYOUT",
          supplierRef: "Courtier Keita",
          payoutAmount: "60000",
          paymentRef: "PAY-COURT-01"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "15000.00",
        currency: "XOF",
        occurredAt: "2026-06-11T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "DOCUMENT_EXPENSE",
          documentRef: "Attestation",
          supplierRef: "Mairie",
          invoiceRef: "DOC-01",
          expenseAmount: "15000"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "APPROVED",
        type: "CASH_OUT",
        amount: "25000.00",
        currency: "XOF",
        occurredAt: "2026-06-12T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyOperationKind: "CUSTOMER_REFUND",
          refundAmount: "5000",
          expenseAmount: "20000",
          paymentRef: "PAY-REM-01"
        }
      }
    ]);
    vi.mocked(listReportOperationalTasks).mockResolvedValue([
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "DONE",
        dueDate: "2026-06-13T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyTaskKind: "VISIT_SCHEDULE"
        }
      },
      {
        activityCode: "REAL_ESTATE_AGENCY",
        status: "BLOCKED",
        dueDate: "2026-06-14T09:00:00.000Z",
        metadata: {
          ...commonMetadata,
          agencyTaskKind: "DOCUMENT_COLLECTION",
          issueRef: "Titre foncier manquant"
        }
      }
    ]);

    const result = await getCompanyReportsOverview(actor, {
      activityCode: "REAL_ESTATE_AGENCY",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(result.agencyOperationsReport?.periodLabel).toBe("juin 2026");
    expect(result.agencyOperationsReport?.rows).toEqual([
      expect.objectContaining({
        mandateRef: "MAND-01",
        propertyRef: "Villa Faso",
        mandateType: "Vente / location",
        propertyType: "Villa",
        locationZone: "ACI",
        clientRef: "Client Diallo",
        dealStage: "Compromis",
        dealAmount: "12400000.00",
        saleCommissionAmount: "300000.00",
        rentalCommissionAmount: "120000.00",
        mandateFeeAmount: "50000.00",
        visitFeeAmount: "20000.00",
        fileFeeAmount: "25000.00",
        advertisingExpenseAmount: "30000.00",
        fieldVisitExpenseAmount: "10000.00",
        brokerPayoutAmount: "60000.00",
        documentExpenseAmount: "15000.00",
        officeExpenseAmount: "0.00",
        refundAmount: "25000.00",
        transactionsCount: 10,
        tasksCount: 2,
        doneTasksCount: 1,
        openTasksCount: 1,
        blockedTasksCount: 1,
        cashInAmount: "515000.00",
        cashOutAmount: "140000.00",
        netAmount: "375000.00",
        commissionRate: 3.39,
        executionRate: 50,
        currency: "XOF"
      })
    ]);
    expect(result.agencyOperationsReport?.operationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationLabel: "Commission vente", cashInAmount: "300000.00" }),
        expect.objectContaining({ operationLabel: "Commission location", cashInAmount: "120000.00" }),
        expect.objectContaining({ operationLabel: "Frais mandat", cashInAmount: "50000.00" }),
        expect.objectContaining({ operationLabel: "Frais visite", cashInAmount: "20000.00" }),
        expect.objectContaining({ operationLabel: "Frais dossier", cashInAmount: "25000.00" }),
        expect.objectContaining({ operationLabel: "Publicité", cashOutAmount: "30000.00" }),
        expect.objectContaining({ operationLabel: "Déplacement visite", cashOutAmount: "10000.00" }),
        expect.objectContaining({ operationLabel: "Reversement courtier", cashOutAmount: "60000.00" }),
        expect.objectContaining({ operationLabel: "Frais document", cashOutAmount: "15000.00" }),
        expect.objectContaining({ operationLabel: "Remboursement client", cashOutAmount: "25000.00" }),
        expect.objectContaining({ operationLabel: "Tâche: Visite", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Collecte documents", tasksCount: 1 })
      ])
    );
    expect(result.agencyOperationsReport?.totals).toMatchObject({
      mandatesCount: 1,
      propertiesCount: 1,
      clientsCount: 1,
      dealAmount: "12400000.00",
      saleCommissionAmount: "300000.00",
      rentalCommissionAmount: "120000.00",
      mandateFeeAmount: "50000.00",
      visitFeeAmount: "20000.00",
      fileFeeAmount: "25000.00",
      advertisingExpenseAmount: "30000.00",
      fieldVisitExpenseAmount: "10000.00",
      brokerPayoutAmount: "60000.00",
      documentExpenseAmount: "15000.00",
      officeExpenseAmount: "0.00",
      refundAmount: "25000.00",
      transactionsCount: 10,
      tasksCount: 2,
      doneTasksCount: 1,
      openTasksCount: 1,
      blockedTasksCount: 1,
      cashInAmount: "515000.00",
      cashOutAmount: "140000.00",
      netAmount: "375000.00",
      commissionRate: 3.39,
      executionRate: 50,
      currency: "XOF"
    });

    const pdf = await exportCompanyReportsPdf(actor, {
      activityCode: "REAL_ESTATE_AGENCY",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds the fish farming opérations report from pond and cycle metadata", async () => {
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
        expect.objectContaining({ operationLabel: "Tâche: Nourrissage", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Contrôle eau", tasksCount: 1 })
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

  it("builds the livestock opérations report from herd and batch metadata", async () => {
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
        expect.objectContaining({ operationLabel: "Tâche: Vaccination", tasksCount: 1 }),
        expect.objectContaining({ operationLabel: "Tâche: Contrôle sanitaire", tasksCount: 1 })
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
