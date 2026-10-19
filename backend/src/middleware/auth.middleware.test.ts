import { Router } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test/test-app.js";
import { authenticateAccessToken } from "./auth.middleware.js";
import { findActiveUserById, findUserProfileForCompany } from "../repositories/auth.repository.js";
import { verifyAccessToken } from "../lib/token.js";

vi.mock("../lib/token.js", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("../repositories/auth.repository.js", () => ({
  findActiveUserById: vi.fn(),
  findUserProfileForCompany: vi.fn()
}));

describe("sector operator API restrictions", () => {
  const router = Router();
  router.use(authenticateAccessToken);
  router.get("/finance/transactions", (_req, res) => res.status(200).json({ ok: true }));
  router.post("/finance/transactions", (_req, res) => res.status(201).json({ ok: true }));
  router.get("/finance/transactions/:transactionId", (_req, res) => res.status(200).json({ ok: true }));
  router.patch("/finance/transactions/:transactionId", (_req, res) => res.status(200).json({ ok: true }));
  router.delete("/finance/transactions/:transactionId", (_req, res) => res.status(200).json({ ok: true }));
  router.patch("/finance/transactions/:transactionId/review", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/finance/accounts", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/activities", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/activities/HARDWARE/articles", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/reports/overview", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/operations/tasks", (_req, res) => res.status(200).json({ ok: true }));
  router.get("/finance/salaries", (_req, res) => res.status(200).json({ ok: true }));
  const app = createTestApp(router);

  beforeEach(() => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "operator-1",
      companyId: "company-1",
      role: "HARDWARE_OPERATOR",
      email: "hardware@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "operator-1",
      email: "hardware@example.com",
      fullName: "Hardware Operator",
      role: "HARDWARE_OPERATOR"
    });
    vi.mocked(findActiveUserById).mockReset();
  });

  it("allows sector transaction entry and its required read APIs", async () => {
    expect((await request(app).get("/finance/transactions").set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).post("/finance/transactions").set("Authorization", "Bearer test")).status).toBe(201);
    expect((await request(app).get("/finance/accounts").set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).get("/activities").set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).get("/activities/HARDWARE/articles").set("Authorization", "Bearer test")).status).toBe(200);
  });

  it("allows operators to open and manage a transaction while keeping review restricted", async () => {
    const path = "/finance/transactions/123e4567-e89b-12d3-a456-426614174000";
    expect((await request(app).get(path).set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).patch(path).set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).delete(path).set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).patch(`${path}/review`).set("Authorization", "Bearer test")).status).toBe(403);
  });

  it.each(["/reports/overview", "/operations/tasks", "/finance/salaries"])(
    "rejects access to %s",
    async (path) => {
      const response = await request(app).get(path).set("Authorization", "Bearer test");
      expect(response.status).toBe(403);
    }
  );

  it("does not let a hydrocarbons operator read hardware articles", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "operator-1",
      companyId: "company-1",
      role: "HYDROCARBON_OPERATOR",
      email: "hydrocarbon@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "operator-1",
      email: "hydrocarbon@example.com",
      fullName: "Hydrocarbon Operator",
      role: "HYDROCARBON_OPERATOR"
    });

    const response = await request(app)
      .get("/activities/HARDWARE/articles")
      .set("Authorization", "Bearer test");
    expect(response.status).toBe(403);
  });

  it("allows a beverage depot operator to enter transactions only through the sector workflow", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "operator-2",
      companyId: "company-1",
      role: "BEVERAGE_DEPOT_OPERATOR",
      email: "beverage@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "operator-2",
      email: "beverage@example.com",
      fullName: "Beverage Operator",
      role: "BEVERAGE_DEPOT_OPERATOR"
    });

    expect((await request(app).get("/finance/transactions").set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).post("/finance/transactions").set("Authorization", "Bearer test")).status).toBe(201);
    expect((await request(app).get("/finance/accounts").set("Authorization", "Bearer test")).status).toBe(200);
    expect((await request(app).get("/reports/overview").set("Authorization", "Bearer test")).status).toBe(403);
  });
});
