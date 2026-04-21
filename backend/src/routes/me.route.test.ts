import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { meRouter } from "./me.route.js";
import { createTestApp } from "../test/test-app.js";
import { verifyAccessToken } from "../lib/token.js";
import { findUserProfileForCompany } from "../repositories/auth.repository.js";

vi.mock("../lib/token.js", () => ({
  verifyAccessToken: vi.fn()
}));

vi.mock("../repositories/auth.repository.js", () => ({
  findUserProfileForCompany: vi.fn()
}));

describe("meRouter / RBAC", () => {
  const app = createTestApp(meRouter);

  it("GET /admin/ping rejects missing auth header", async () => {
    const response = await request(app).get("/admin/ping");

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("En-tete d'autorisation manquant ou invalide.");
  });

  it("GET /admin/ping rejects authenticated user without admin role", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-1",
      companyId: "company-1",
      role: "EMPLOYEE",
      email: "employee@example.com",
      type: "access"
    });

    const response = await request(app)
      .get("/admin/ping")
      .set("Authorization", "Bearer employee-token");

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe("Permissions insuffisantes.");
  });

  it("GET /admin/ping allows OWNER role", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-1",
      companyId: "company-1",
      role: "OWNER",
      email: "owner@example.com",
      type: "access"
    });

    const response = await request(app)
      .get("/admin/ping")
      .set("Authorization", "Bearer owner-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      scope: "admin"
    });
  });

  it("GET /me returns current profile for authenticated user", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-2",
      companyId: "company-1",
      role: "SUPERVISOR",
      email: "supervisor@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "user-2",
      email: "supervisor@example.com",
      fullName: "Supervisor User",
      role: "SUPERVISOR"
    });

    const response = await request(app)
      .get("/me")
      .set("Authorization", "Bearer supervisor-token");

    expect(response.status).toBe(200);
    expect(findUserProfileForCompany).toHaveBeenCalledWith("user-2", "company-1");
    expect(response.body.user.email).toBe("supervisor@example.com");
    expect(response.body.companyId).toBe("company-1");
  });
});
