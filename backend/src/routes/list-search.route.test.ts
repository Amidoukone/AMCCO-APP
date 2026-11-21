import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/token.js";
import { findUserProfileForCompany } from "../repositories/auth.repository.js";
import { createTestApp } from "../test/test-app.js";
import { financeRouter } from "./finance.route.js";
import { tasksRouter } from "./tasks.route.js";
import { createCompanyTransaction, listCompanyTransactions } from "../services/finance.service.js";
import { createCompanyTask, listCompanyTasks } from "../services/tasks.service.js";

vi.mock("../services/finance.service.js", () => ({ createCompanyTransaction: vi.fn(), listCompanyTransactions: vi.fn() }));
vi.mock("../services/tasks.service.js", () => ({ createCompanyTask: vi.fn(), listCompanyTasks: vi.fn() }));
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

  it("rejects new transactions for the retired real estate agency sector", async () => {
    const response = await request(finance)
      .post("/finance/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: "account-test",
        type: "CASH_IN",
        amount: "1000",
        currency: "XOF",
        activityCode: "REAL_ESTATE_AGENCY",
        description: "Legacy sector must not accept new transactions",
      });

    expect(response.status).toBe(400);
    expect(createCompanyTransaction).not.toHaveBeenCalled();
  });

  it("rejects new tasks for the retired real estate agency sector", async () => {
    const response = await request(tasks)
      .post("/operations/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Legacy sector task",
        activityCode: "REAL_ESTATE_AGENCY",
      });

    expect(response.status).toBe(400);
    expect(createCompanyTask).not.toHaveBeenCalled();
  });

  it("keeps rental transaction creation available", async () => {
    const response = await request(finance).post("/finance/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ accountId: "account-test", type: "CASH_IN", amount: "1000", activityCode: "RENTAL" });
    expect(response.status).toBe(201);
    expect(createCompanyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-test", role: "ACCOUNTANT" }),
      expect.objectContaining({ activityCode: "RENTAL" })
    );
  });

  it("keeps rental task creation available", async () => {
    const response = await request(tasks).post("/operations/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Suivi du locataire", activityCode: "RENTAL" });
    expect(response.status).toBe(201);
    expect(createCompanyTask).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-test", role: "ACCOUNTANT" }),
      expect.objectContaining({ activityCode: "RENTAL" })
    );
  });
});
