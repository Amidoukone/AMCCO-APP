import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRouter } from "./auth.route.js";
import { createTestApp } from "../test/test-app.js";
import { login, logout, refresh, switchCompany } from "../services/auth.service.js";

vi.mock("../services/auth.service.js", () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  switchCompany: vi.fn()
}));

describe("authRouter", () => {
  const app = createTestApp(authRouter);

  beforeEach(() => {
    vi.mocked(login).mockReset();
    vi.mocked(refresh).mockReset();
    vi.mocked(logout).mockReset();
    vi.mocked(switchCompany).mockReset();
  });

  it("POST /auth/login normalizes payload and returns service response", async () => {
    vi.mocked(login).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token-value-1234567890",
      user: {
        id: "user-1",
        email: "user@example.com",
        fullName: "User Example",
        role: "OWNER",
        companyId: "company-1",
        companyCode: "AMCCO",
        bootstrapMode: false
      }
    });

    const response = await request(app)
      .post("/auth/login")
      .set("user-agent", "vitest")
      .send({
        email: "USER@EXAMPLE.COM",
        password: "secret"
      });

    expect(response.status).toBe(200);
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        password: "secret",
        meta: expect.objectContaining({
          userAgent: "vitest",
          ipAddress: expect.any(String)
        })
      })
    );
    expect(response.body.accessToken).toBe("access-token");
  });

  it("POST /auth/login rejects invalid payload with 400", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "not-an-email",
      password: ""
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Erreur de validation");
    expect(login).not.toHaveBeenCalled();
  });

  it("POST /auth/refresh forwards refresh token and returns payload", async () => {
    vi.mocked(refresh).mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh-token-value-1234567890"
    });

    const response = await request(app).post("/auth/refresh").send({
      refreshToken: "refresh-token-value-1234567890"
    });

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: "refresh-token-value-1234567890",
        meta: expect.objectContaining({
          ipAddress: expect.any(String)
        })
      })
    );
    expect(response.body.accessToken).toBe("new-access");
  });

  it("POST /auth/logout accepts missing refresh token and returns 200", async () => {
    vi.mocked(logout).mockResolvedValue(undefined);

    const response = await request(app).post("/auth/logout").send({});

    expect(response.status).toBe(200);
    expect(logout).toHaveBeenCalledWith({ refreshToken: undefined });
    expect(response.body.status).toBe("logged_out");
  });

  it("POST /auth/switch-company forwards payload and returns tokens", async () => {
    vi.mocked(switchCompany).mockResolvedValue({
      accessToken: "switch-access",
      refreshToken: "switch-refresh-token-value-1234567890"
    });

    const response = await request(app)
      .post("/auth/switch-company")
      .set("user-agent", "vitest")
      .send({
        refreshToken: "refresh-token-value-1234567890",
        targetCompanyId: "57e12f5b-41f6-4523-973b-b5d3f9da1edc"
      });

    expect(response.status).toBe(200);
    expect(switchCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: "refresh-token-value-1234567890",
        targetCompanyId: "57e12f5b-41f6-4523-973b-b5d3f9da1edc",
        meta: expect.objectContaining({
          userAgent: "vitest",
          ipAddress: expect.any(String)
        })
      })
    );
    expect(response.body.accessToken).toBe("switch-access");
  });
});
