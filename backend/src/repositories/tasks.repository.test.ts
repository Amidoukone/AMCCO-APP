import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock } = vi.hoisted(() => ({ queryRowsMock: vi.fn() }));
vi.mock("../lib/db.js", () => ({ queryRows: queryRowsMock }));
import { listOperationsTasks } from "./tasks.repository.js";

describe("task history search", () => {
  beforeEach(() => { vi.clearAllMocks(); queryRowsMock.mockResolvedValue([]); });

  it("searches before pagination while preserving company, sector and user filters", async () => {
    await listOperationsTasks({
      companyId: "company-1", activityCode: "BTP", assignedToId: "employee-1",
      status: "TODO", search: "chantier 50%", limit: 25, offset: 100
    });
    const [sql, values] = queryRowsMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("t.company_id = ? AND t.activity_code IS NOT NULL");
    expect(sql).toContain("t.assigned_to_id = ?");
    expect(sql).toContain("t.activity_code = ?");
    expect(sql.indexOf("LIKE ? ESCAPE")).toBeLessThan(sql.indexOf("LIMIT ? OFFSET ?"));
    expect(sql).not.toContain("chantier");
    expect(values.slice(0, 4)).toEqual(["company-1", "TODO", "BTP", "employee-1"]);
    expect(values.slice(4, -2)).toEqual([...Array(8).fill("%chantier%"), ...Array(8).fill("%50!%%")]);
    expect(values.slice(-2)).toEqual([25, 100]);
  });

  it("keeps task visibility constraints without a search", async () => {
    await listOperationsTasks({ companyId: "company-2", scopeUserId: "user-2", unassignedOnly: true, limit: 50, offset: 0 });
    const [sql, values] = queryRowsMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("(t.created_by_id = ? OR t.assigned_to_id = ?)");
    expect(sql).toContain("t.assigned_to_id IS NULL");
    expect(sql).not.toContain("LIKE");
    expect(values).toEqual(["company-2", "user-2", "user-2", 50, 0]);
  });
});
