import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));

vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));

import {
  getDashboardFinanceSummary,
  getReportFinanceBreakdown,
  getReportTaskBreakdown,
  listReportOperationalTransactions,
} from "./reporting.repository.js";

describe("reporting.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads dashboard finance counts and currency totals in one grouped query", async () => {
    queryRowsMock.mockResolvedValue([
      {
        currency: "EUR",
        totalTransactionsCount: 2,
        draftCount: 0,
        submittedCount: 0,
        approvedCount: 1,
        rejectedCount: 1,
        approvedCashInTotal: "0.00",
        approvedCashOutTotal: "250.00",
        netApprovedTotal: "-250.00"
      },
      {
        currency: "XOF",
        totalTransactionsCount: 3,
        draftCount: 1,
        submittedCount: 1,
        approvedCount: 1,
        rejectedCount: 0,
        approvedCashInTotal: "500000.00",
        approvedCashOutTotal: "50000.00",
        netApprovedTotal: "450000.00"
      }
    ]);

    const result = await getDashboardFinanceSummary("company-1", { activityCode: "MINING" });

    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(queryRowsMock.mock.calls[0][0]).toContain("GROUP BY currency");
    expect(queryRowsMock.mock.calls[0][1]).toEqual(["company-1", "MINING"]);
    expect(result).toEqual({
      totalTransactionsCount: 5,
      draftCount: 1,
      submittedCount: 1,
      approvedCount: 2,
      rejectedCount: 1,
      totalsByCurrency: [
        {
          currency: "EUR",
          approvedCashInTotal: "0.00",
          approvedCashOutTotal: "250.00",
          netApprovedTotal: "-250.00"
        },
        {
          currency: "XOF",
          approvedCashInTotal: "500000.00",
          approvedCashOutTotal: "50000.00",
          netApprovedTotal: "450000.00"
        }
      ]
    });
  });

  it("returns zero totals when the company has no transactions", async () => {
    queryRowsMock.mockResolvedValue([]);

    await expect(getDashboardFinanceSummary("company-1")).resolves.toEqual({
      totalTransactionsCount: 0,
      draftCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      totalsByCurrency: []
    });
  });

  it("scopes a single financial scan by company, period and sector and keeps decimal totals", async () => {
    queryRowsMock.mockResolvedValue([
      { dimension: "activity", bucket: "MINING", count: 4, totalAmount: "9007199254740993.25", approvedAmount: "9007199254740992.15" },
      { dimension: "status", bucket: "SUBMITTED", currency: "XOF", count: 2, totalAmount: "9007199254740992.15" },
      { dimension: "type", bucket: "CASH_OUT", currency: "EUR", count: 2, totalAmount: "1.10", approvedAmount: "0.00" }
    ]);
    const period = { activityCode: "MINING" as const, dateFrom: "2026-01-01", dateTo: "2026-01-31" };
    await expect(getReportFinanceBreakdown("company-1", period)).resolves.toEqual({
      byStatus: [{ status: "SUBMITTED", currency: "XOF", count: 2, totalAmount: "9007199254740992.15" }],
      byType: [{ type: "CASH_OUT", currency: "EUR", count: 2, totalAmount: "1.10", approvedAmount: "0.00" }],
      byActivity: [{ activityCode: "MINING", count: 4, totalAmount: "9007199254740993.25", approvedAmount: "9007199254740992.15" }]
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryRowsMock.mock.calls[0];
    expect(sql.match(/FROM transactions\b/g)).toHaveLength(1);
    expect(sql).toContain("occurred_at >= ? AND occurred_at <= ? AND activity_code = ?");
    expect(params).toEqual(["company-1", period.dateFrom, period.dateTo, period.activityCode]);
  });

  it("scopes a single task scan and uses the beverage business date for both breakdowns", async () => {
    queryRowsMock.mockResolvedValue([
      { dimension: "activity", bucket: "BEVERAGE_DEPOT", totalCount: 2, openCount: 1, blockedCount: 1, doneCount: 1 },
      { dimension: "status", bucket: "BLOCKED", totalCount: 1 },
      { dimension: "status", bucket: "DONE", totalCount: 1 }
    ]);
    await expect(getReportTaskBreakdown("company-1", { activityCode: "BEVERAGE_DEPOT", dateFrom: "2026-01-01" })).resolves.toEqual({
      byStatus: [{ status: "BLOCKED", count: 1 }, { status: "DONE", count: 1 }],
      byActivity: [{ activityCode: "BEVERAGE_DEPOT", totalCount: 2, openCount: 1, blockedCount: 1, doneCount: 1 }]
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryRowsMock.mock.calls[0];
    expect(sql.match(/FROM tasks\b/g)).toHaveLength(1);
    expect(sql).toContain("JSON_EXTRACT(metadata_json, '$.periodDate')");
    expect(params).toEqual(["company-1", "2026-01-01", "BEVERAGE_DEPOT"]);
  });

  it("includes sector transactions without filtering on financial-account scope", async () => {
    queryRowsMock.mockResolvedValue([
      {
        activityCode: "HYDROCARBON",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "120000.00",
        currency: "XOF",
        description: "Vente opérateur hydrocarbure",
        occurredAt: new Date("2026-10-12T09:00:00.000Z"),
        metadataJson: "{}"
      }
    ]);

    const result = await listReportOperationalTransactions("company-1", {
      activityCode: "HYDROCARBON"
    });

    const [sql, values] = queryRowsMock.mock.calls[0] as [string, string[]];
    expect(sql).toContain("FROM transactions");
    expect(sql).not.toContain("financial_accounts");
    expect(sql).not.toContain("scope_type");
    expect(values).toEqual(["company-1", "HYDROCARBON"]);
    expect(result).toMatchObject([
      {
        activityCode: "HYDROCARBON",
        status: "APPROVED",
        description: "Vente opérateur hydrocarbure"
      }
    ]);
  });

  it("includes beverage operator transactions in the sector report query", async () => {
    queryRowsMock.mockResolvedValue([
      {
        activityCode: "BEVERAGE_DEPOT",
        status: "APPROVED",
        type: "CASH_IN",
        amount: "60000.00",
        currency: "XOF",
        description: "Vente opérateur dépôt de boissons",
        occurredAt: new Date("2026-10-12T09:00:00.000Z"),
        metadataJson: JSON.stringify({ beverageOperationKind: "VENTE" })
      }
    ]);

    const result = await listReportOperationalTransactions("company-1", {
      activityCode: "BEVERAGE_DEPOT"
    });

    const [sql, values] = queryRowsMock.mock.calls[0] as [string, string[]];
    expect(sql).toContain("FROM transactions");
    expect(sql).not.toContain("financial_accounts");
    expect(sql).not.toContain("scope_type");
    expect(values).toEqual(["company-1", "BEVERAGE_DEPOT"]);
    expect(result).toMatchObject([
      {
        activityCode: "BEVERAGE_DEPOT",
        status: "APPROVED",
        description: "Vente opérateur dépôt de boissons",
        metadata: { beverageOperationKind: "VENTE" }
      }
    ]);
  });

});
