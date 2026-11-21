import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlertRecords, listCompanyActiveUserIdsByRoles } from "../repositories/alerts.repository.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";

vi.mock("../repositories/alerts.repository.js", () => ({
  createAlertRecords: vi.fn(),
  listCompanyActiveUserIdsByRoles: vi.fn()
}));

describe("actionable alert delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCompanyActiveUserIdsByRoles).mockResolvedValue(["manager-1", "actor-1"]);
  });

  const input = {
    companyId: "company-1",
    recipientRoles: ["OWNER", "SYS_ADMIN"] as ("OWNER" | "SYS_ADMIN")[],
    excludeUserIds: ["actor-1"],
    message: "Test notification",
    severity: "INFO" as const,
    entityType: "TASK",
    entityId: "task-1"
  };

  it.each([
    "TASK_CREATED_BY_EMPLOYEE", "FINANCE_TRANSACTION_SUBMITTED",
    "FINANCE_SALARY_SUBMITTED", "FINANCE_SALARY_CREATED", "FINANCE_SALARY_UPDATED"
  ])("skips routine broadcasts before any recipient query: %s", async (code) => {
    await createRoleTargetedAlerts({ ...input, code });
    expect(listCompanyActiveUserIdsByRoles).not.toHaveBeenCalled();
    expect(createAlertRecords).not.toHaveBeenCalled();
  });

  it.each(["WARNING", "CRITICAL"] as const)("keeps elevated payroll alerts (%s) scoped and excludes the actor", async (severity) => {
    await createRoleTargetedAlerts({ ...input, code: "FINANCE_SALARY_UPDATED", severity });
    expect(listCompanyActiveUserIdsByRoles).toHaveBeenCalledWith("company-1", ["OWNER", "SYS_ADMIN"]);
    expect(createAlertRecords).toHaveBeenCalledWith([
      expect.objectContaining({ companyId: "company-1", targetUserId: "manager-1", severity })
    ]);
  });

  it("keeps operational broadcasts and unknown codes rather than silently losing alerts", async () => {
    await createRoleTargetedAlerts({ ...input, code: "TASK_BLOCKED" });
    await createRoleTargetedAlerts({ ...input, code: "NEW_OPERATIONAL_EVENT" });
    expect(createAlertRecords).toHaveBeenCalledTimes(2);
  });

  it.each(["TASK_ASSIGNED", "TASK_DONE", "FINANCE_SALARY_CREATED", "FINANCE_SALARY_UPDATED"])("keeps direct user notifications and deduplicates recipients: %s", async (code) => {
    await createUserTargetedAlerts({
      ...input, code, recipientUserIds: [" employee-1 ", "employee-1", ""],
      metadata: { transactionId: "salary-1" }
    });
    expect(listCompanyActiveUserIdsByRoles).not.toHaveBeenCalled();
    expect(createAlertRecords).toHaveBeenCalledWith([
      expect.objectContaining({ targetUserId: "employee-1", code, metadataJson: '{"transactionId":"salary-1"}' })
    ]);
  });

  it("does no database work for an empty recipient group", async () => {
    await createRoleTargetedAlerts({ ...input, code: "TASK_BLOCKED", recipientRoles: [] });
    await createUserTargetedAlerts({ ...input, code: "TASK_ASSIGNED", recipientUserIds: [" "] });
    expect(listCompanyActiveUserIdsByRoles).not.toHaveBeenCalled();
    expect(createAlertRecords).not.toHaveBeenCalled();
  });
});
