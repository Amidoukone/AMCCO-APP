import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/token.js";
import { findUserProfileForCompany } from "../repositories/auth.repository.js";
import { createTestApp } from "../test/test-app.js";
import { financeRouter } from "./finance.route.js";
import { tasksRouter } from "./tasks.route.js";
import { listCompanyTransactions } from "../services/finance.service.js";
import { listCompanyTasks } from "../services/tasks.service.js";

vi.mock("../services/finance.service.js", () => ({ listCompanyTransactions: vi.fn() }));
vi.mock("../services/tasks.service.js", () => ({ listCompanyTasks: vi.fn() }));
vi.mock("../repositories/auth.repository.js", () => ({ findActiveUserById: vi.fn(), findUserProfileForCompany: vi.fn() }));

describe("list search HTTP contracts", () => {
  const finance = createTestApp(financeRouter);
  const tasks = createTestApp(tasksRouter);
  const token = signAccessToken({ userId: "user-test", companyId: "company-test", role: "ACCOUNTANT", email: "test@example.invalid", fullName: "Test" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findUserProfileForCompany).mockResolvedValue({ userId: "user-test", email: "test@example.invalid", fullName: "Test", role: "ACCOUNTANT" });
    vi.mocked(listCompanyTransactions).mockResolvedValue([]);
    vi.mocked(listCompanyTasks).mockResolvedValue([]);
  });

  it("passes the transaction search and pagination with the authenticated company", async () => {
    const response = await request(finance).get("/finance/transactions")
      .set("Authorization", `Bearer ${token}`)
      .query({ search: "  ancien ciment  ", activityCode: "HARDWARE", offset: 100, companyId: "another-company" });
    expect(response.status).toBe(200);
    expect(listCompanyTransactions).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-test", actorId: "user-test", search: "ancien ciment", activityCode: "HARDWARE", offset: 100 }));
  });

  it("passes task search without overriding the requested visibility scope", async () => {
    const response = await request(tasks).get("/operations/tasks")
      .set("Authorization", `Bearer ${token}`)
      .query({ search: "ancien chantier", scope: "ASSIGNED_TO_ME", activityCode: "BTP", offset: 100 });
    expect(response.status).toBe(200);
    expect(listCompanyTasks).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-test", actorId: "user-test" }), expect.objectContaining({ search: "ancien chantier", scope: "ASSIGNED_TO_ME", offset: 100 }));
  });

  it.each(["/finance/transactions", "/operations/tasks"])("rejects oversized search terms on %s", async (path) => {
    const app = path.startsWith("/finance") ? finance : tasks;
    const response = await request(app).get(path).set("Authorization", `Bearer ${token}`).query({ search: "x".repeat(201) });
    expect(response.status).toBe(400);
    expect(listCompanyTransactions).not.toHaveBeenCalled();
    expect(listCompanyTasks).not.toHaveBeenCalled();
  });

  it("keeps requests without search compatible", async () => {
    expect((await request(finance).get("/finance/transactions").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(tasks).get("/operations/tasks").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });
});
