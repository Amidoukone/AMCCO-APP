import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));

vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));

import {
  getDashboardFinanceSummary,
  listReportOperationalTransactions,
  listTransactionsForExport
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

  it("includes dedicated operator-account transactions in transaction exports", async () => {
    queryRowsMock.mockResolvedValue([
      {
        id: "beverage-export-1",
        occurredAt: new Date("2026-10-12T09:00:00.000Z"),
        status: "APPROVED",
        type: "CASH_IN",
        amount: "60000.00",
        currency: "XOF",
        activityCode: "BEVERAGE_DEPOT",
        accountName: "Caisse opérateur boissons",
        accountRef: "BEV-01",
        accountScopeType: "DEDICATED",
        accountPrimaryActivityCode: "BEVERAGE_DEPOT",
        accountAllowedActivityCodes: "BEVERAGE_DEPOT",
        createdByEmail: "operateur@example.com",
        validatedByEmail: "operateur@example.com",
        proofsCount: 0,
        description: "Vente opérateur",
        createdAt: new Date("2026-10-12T09:00:00.000Z"),
        updatedAt: new Date("2026-10-12T09:00:00.000Z")
      }
    ]);

    const result = await listTransactionsForExport("company-1", {
      activityCode: "BEVERAGE_DEPOT"
    });

    const [sql, values] = queryRowsMock.mock.calls[0] as [string, string[]];
    expect(sql).toContain("INNER JOIN financial_accounts fa");
    expect(sql).toContain("fa.scope_type AS accountScopeType");
    expect(sql).not.toContain("fa.scope_type =");
    expect(values).toEqual(["company-1", "BEVERAGE_DEPOT"]);
    expect(result).toMatchObject([
      {
        id: "beverage-export-1",
        activityCode: "BEVERAGE_DEPOT",
        accountScopeType: "DEDICATED",
        accountPrimaryActivityCode: "BEVERAGE_DEPOT",
        createdByEmail: "operateur@example.com"
      }
    ]);
  });
});
