import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/token.js";
import { findUserProfileForCompany } from "../repositories/auth.repository.js";
import { getCompanyDashboardSummary } from "../services/reporting.service.js";
import { createTestApp } from "../test/test-app.js";
import { reportingRouter } from "./reporting.route.js";

vi.mock("../services/reporting.service.js", () => ({
  getCompanyDashboardSummary: vi.fn(async () => ({ marker: "dashboard-test" })),
  getCompanyGeneralStoreLedgerRows: vi.fn(),
  getCompanyReportsOverview: vi.fn(),
  exportCompanyReportsPdf: vi.fn()
}));
vi.mock("../repositories/auth.repository.js", () => ({
  findActiveUserById: vi.fn(), findUserProfileForCompany: vi.fn()
}));

describe("dashboard detail HTTP contract", () => {
  const app = createTestApp(reportingRouter);
  const token = signAccessToken({ userId: "user-test", companyId: "company-test", role: "ACCOUNTANT", email: "test@example.invalid", fullName: "Test" });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findUserProfileForCompany).mockResolvedValue({ userId: "user-test", email: "test@example.invalid", fullName: "Test", role: "ACCOUNTANT" });
  });

  it.each([undefined, "true", "false"])("preserves authentication and sector filters (details=%s)", async (details) => {
    const response = await request(app).get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .query({ activityCode: "MINING", companyId: "untrusted-company", ...(details ? { details } : {}) });
    expect(response.status).toBe(200);
    expect(response.body.item.marker).toBe("dashboard-test");
    expect(getCompanyDashboardSummary).toHaveBeenCalledWith(
      { actorId: "user-test", companyId: "company-test", role: "ACCOUNTANT" },
      { activityCode: "MINING", includeDetails: details !== "false" }
    );
  });

  it("rejects an invalid detail mode before querying dashboard data", async () => {
    const response = await request(app).get("/dashboard/summary?details=invalid")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(400);
    expect(getCompanyDashboardSummary).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated lightweight requests", async () => {
    const response = await request(app).get("/dashboard/summary?details=false");
    expect(response.status).toBe(401);
    expect(getCompanyDashboardSummary).not.toHaveBeenCalled();
  });
});
