import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));

vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));

import { getDashboardFinanceSummary } from "./reporting.repository.js";

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
});
