import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyRefreshToken: vi.fn(),
  findRefreshSessionById: vi.fn(),
  findUserCompanyMembership: vi.fn(),
  tokenHash: vi.fn()
}));

vi.mock("../lib/token.js", () => ({ verifyRefreshToken: mocks.verifyRefreshToken }));
vi.mock("../lib/token-hash.js", () => ({ tokenHash: mocks.tokenHash }));
vi.mock("../repositories/auth.repository.js", () => ({
  findRefreshSessionById: mocks.findRefreshSessionById
}));
vi.mock("../repositories/companies.repository.js", () => ({
  findUserCompanyMembership: mocks.findUserCompanyMembership
}));
vi.mock("../repositories/admin-users.repository.js", () => ({ updateUserPasswordHash: vi.fn() }));
vi.mock("../repositories/audit.repository.js", () => ({ createAuditLogRecord: vi.fn() }));

import { switchCompany } from "./auth.service.js";

describe("auth.service scoped operator company access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyRefreshToken.mockReturnValue({
      userId: "operator-1",
      companyId: "company-1",
      role: "HARDWARE_OPERATOR",
      email: "hardware@example.com",
      type: "refresh",
      sessionId: "729cfb0a-ae9e-478b-bdd4-43e22fb0c66c"
    });
    mocks.findRefreshSessionById.mockResolvedValue({
      id: "729cfb0a-ae9e-478b-bdd4-43e22fb0c66c",
      userId: "operator-1",
      companyId: "company-1",
      tokenHash: "valid-hash",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null
    });
    mocks.tokenHash.mockReturnValue("valid-hash");
    mocks.findUserCompanyMembership.mockResolvedValue({
      role: "EMPLOYEE",
      company: { id: "company-2", isActive: true }
    });
  });

  it("does not let a sector operator switch into another company membership", async () => {
    await expect(switchCompany({
      refreshToken: "refresh-token",
      targetCompanyId: "company-2"
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});
