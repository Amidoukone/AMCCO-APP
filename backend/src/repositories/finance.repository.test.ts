import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));

vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));

import {
  getFinancialAccountsSummary,
  listFinancialAccounts,
  listFinancialTransactions
} from "./finance.repository.js";

describe("finance.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dashboard account counts with one scoped aggregate query", async () => {
    queryRowsMock.mockResolvedValue([
      {
        totalCount: "4",
        globalCount: "1",
        dedicatedCount: "2",
        restrictedCount: "1",
        compatibleCount: "3",
        dedicatedToSelectedActivityCount: "1",
        restrictedToSelectedActivityCount: "1"
      }
    ]);

    await expect(
      getFinancialAccountsSummary({ companyId: "company-1", activityCode: "MINING" })
    ).resolves.toEqual({
      totalCount: 4,
      globalCount: 1,
      dedicatedCount: 2,
      restrictedCount: 1,
      compatibleCount: 3,
      incompatibleCount: 1,
      dedicatedToSelectedActivityCount: 1,
      restrictedToSelectedActivityCount: 1
    });

    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(queryRowsMock.mock.calls[0][0]).toContain("EXISTS (");
    expect(queryRowsMock.mock.calls[0][1]).toEqual([
      "MINING",
      "MINING",
      "MINING",
      "MINING",
      "company-1"
    ]);
  });

  it("treats every account as compatible when the dashboard has no activity filter", async () => {
    queryRowsMock.mockResolvedValue([
      {
        totalCount: 2,
        globalCount: 1,
        dedicatedCount: 1,
        restrictedCount: 0,
        compatibleCount: 2,
        dedicatedToSelectedActivityCount: 0,
        restrictedToSelectedActivityCount: 0
      }
    ]);

    await expect(getFinancialAccountsSummary({ companyId: "company-1" })).resolves.toMatchObject({
      totalCount: 2,
      compatibleCount: 2,
      incompatibleCount: 0,
      dedicatedToSelectedActivityCount: 0,
      restrictedToSelectedActivityCount: 0
    });

    expect(queryRowsMock.mock.calls[0][1]).toEqual(["company-1"]);
  });

  it("applies the creator filter before transaction pagination", async () => {
    queryRowsMock.mockResolvedValue([]);

    await listFinancialTransactions({
      companyId: "company-1",
      createdById: "operator-1",
      activityCode: "HARDWARE",
      limit: 25,
      offset: 10
    });

    const [sql, values] = queryRowsMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("t.created_by_id = ?");
    expect(sql.indexOf("t.created_by_id = ?")).toBeLessThan(sql.indexOf("LIMIT ? OFFSET ?"));
    expect(values).toEqual(["company-1", "operator-1", "HARDWARE", 25, 10]);
  });

  it("limits a sector operator to dedicated accounts and sector-only counts", async () => {
    queryRowsMock.mockResolvedValue([]);

    await listFinancialAccounts({
      companyId: "company-1",
      activityCode: "HARDWARE",
      sectorOnly: true
    });

    const [sql, values] = queryRowsMock.mock.calls[0] as [string, string[]];
    expect(sql).toContain("fa.scope_type = 'DEDICATED'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM financial_account_activities other_faa");
    expect(sql).toContain("AND t.activity_code = ?");
    expect(values).toEqual(["HARDWARE", "company-1", "HARDWARE", "HARDWARE", "HARDWARE"]);
  });
});
