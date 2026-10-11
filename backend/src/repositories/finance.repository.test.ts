import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));

vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));

import { getFinancialAccountsSummary } from "./finance.repository.js";

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
});
