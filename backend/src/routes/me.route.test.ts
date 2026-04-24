import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meRouter } from "./me.route.js";
import { createTestApp } from "../test/test-app.js";
import { verifyAccessToken } from "../lib/token.js";
import { findActiveUserById, findUserProfileForCompany } from "../repositories/auth.repository.js";
import { changeOwnPassword } from "../services/auth.service.js";
import {
  findCompanyById,
  listUserCompanyMemberships
} from "../repositories/companies.repository.js";

vi.mock("../lib/token.js", () => ({
  verifyAccessToken: vi.fn()
}));

vi.mock("../repositories/auth.repository.js", () => ({
  findActiveUserById: vi.fn(),
  findUserProfileForCompany: vi.fn()
}));

vi.mock("../repositories/companies.repository.js", () => ({
  findCompanyById: vi.fn(),
  listUserCompanyMemberships: vi.fn()
}));

vi.mock("../services/auth.service.js", () => ({
  changeOwnPassword: vi.fn()
}));

describe("meRouter / RBAC", () => {
  const app = createTestApp(meRouter);

  beforeEach(() => {
    vi.mocked(verifyAccessToken).mockReset();
    vi.mocked(findActiveUserById).mockReset();
    vi.mocked(findUserProfileForCompany).mockReset();
    vi.mocked(findCompanyById).mockReset();
    vi.mocked(listUserCompanyMemberships).mockReset();
    vi.mocked(changeOwnPassword).mockReset();
  });

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
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "user-1",
      email: "employee@example.com",
      fullName: "Employee User",
      role: "EMPLOYEE"
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
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      fullName: "Owner User",
      role: "OWNER"
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
    vi.mocked(findUserProfileForCompany)
      .mockResolvedValueOnce({
        userId: "user-2",
        email: "supervisor@example.com",
        fullName: "Supervisor User",
        role: "SUPERVISOR"
      })
      .mockResolvedValueOnce({
        userId: "user-2",
        email: "supervisor@example.com",
        fullName: "Supervisor User",
        role: "SUPERVISOR"
      });
    vi.mocked(findCompanyById).mockResolvedValue({
      id: "company-1",
      name: "AMCCO",
      code: "AMCCO",
      legalName: null,
      registrationNumber: null,
      taxId: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      stateRegion: null,
      postalCode: null,
      country: null,
      businessSector: null,
      contactFullName: null,
      contactJobTitle: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    vi.mocked(listUserCompanyMemberships).mockResolvedValue([
      {
        companyId: "company-1",
        companyCode: "AMCCO",
        companyName: "AMCCO",
        role: "SUPERVISOR",
        isActive: true
      }
    ]);

    const response = await request(app)
      .get("/me")
      .set("Authorization", "Bearer supervisor-token");

    expect(response.status).toBe(200);
    expect(findUserProfileForCompany).toHaveBeenCalledWith("user-2", "company-1");
    expect(findCompanyById).toHaveBeenCalledWith("company-1");
    expect(listUserCompanyMemberships).toHaveBeenCalledWith("user-2");
    expect(response.body.user.email).toBe("supervisor@example.com");
    expect(response.body.company.code).toBe("AMCCO");
    expect(response.body.bootstrapMode).toBe(false);
    expect(response.body.memberships).toHaveLength(1);
  });

  it("GET /admin/ping rejects access token for a removed company membership", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-3",
      companyId: "company-1",
      role: "OWNER",
      email: "removed@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue(null);

    const response = await request(app)
      .get("/admin/ping")
      .set("Authorization", "Bearer removed-token");

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Session invalide pour cette entreprise.");
  });

  it("GET /me returns bootstrap profile when no active company exists yet", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-bootstrap",
      companyId: "__bootstrap__",
      role: "OWNER",
      email: "bootstrap@example.com",
      type: "access"
    });
    vi.mocked(findActiveUserById).mockResolvedValue({
      userId: "user-bootstrap",
      email: "bootstrap@example.com",
      fullName: "Bootstrap Owner"
    });
    vi.mocked(listUserCompanyMemberships).mockResolvedValue([]);

    const response = await request(app)
      .get("/me")
      .set("Authorization", "Bearer bootstrap-token");

    expect(response.status).toBe(200);
    expect(findActiveUserById).toHaveBeenCalledWith("user-bootstrap");
    expect(findUserProfileForCompany).not.toHaveBeenCalled();
    expect(findCompanyById).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      user: {
        id: "user-bootstrap",
        email: "bootstrap@example.com",
        fullName: "Bootstrap Owner",
        role: "OWNER"
      },
      company: null,
      memberships: [],
      bootstrapMode: true
    });
  });

  it("PATCH /me/password updates the authenticated user's password", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-2",
      companyId: "company-1",
      role: "EMPLOYEE",
      email: "employee@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "user-2",
      email: "employee@example.com",
      fullName: "Employee User",
      role: "EMPLOYEE"
    });

    const response = await request(app)
      .patch("/me/password")
      .set("Authorization", "Bearer employee-token")
      .send({
        currentPassword: "current-password-test-123",
        newPassword: "new-password-test-456"
      });

    expect(response.status).toBe(200);
    expect(changeOwnPassword).toHaveBeenCalledWith({
      userId: "user-2",
      companyId: "company-1",
      currentPassword: "current-password-test-123",
      newPassword: "new-password-test-456"
    });
    expect(response.body).toEqual({
      status: "password_changed"
    });
  });

  it("PATCH /me/password rejects invalid payload", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({
      userId: "user-2",
      companyId: "company-1",
      role: "EMPLOYEE",
      email: "employee@example.com",
      type: "access"
    });
    vi.mocked(findUserProfileForCompany).mockResolvedValue({
      userId: "user-2",
      email: "employee@example.com",
      fullName: "Employee User",
      role: "EMPLOYEE"
    });

    const response = await request(app)
      .patch("/me/password")
      .set("Authorization", "Bearer employee-token")
      .send({
        currentPassword: "",
        newPassword: "court"
      });

    expect(response.status).toBe(400);
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });
});
