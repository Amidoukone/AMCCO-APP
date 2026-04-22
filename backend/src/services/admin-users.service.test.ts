import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCompanyUser, deleteCompanyUser } from "./admin-users.service.js";
import {
  countOwnersInCompany,
  createMembership,
  createMembershipIfMissing,
  createUser,
  deleteMembership,
  findMembershipByCompanyAndUser,
  findUserByEmail,
  revokeRefreshSessionsForUserInCompany
} from "../repositories/admin-users.repository.js";
import { listAllCompanyIds } from "../repositories/companies.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import { hashPassword } from "../lib/password.js";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn()
}));

vi.mock("../repositories/admin-users.repository.js", () => ({
  createMembership: vi.fn(),
  createMembershipIfMissing: vi.fn(),
  createUser: vi.fn(),
  deleteMembership: vi.fn(),
  findMembershipByCompanyAndUser: vi.fn(),
  findUserByEmail: vi.fn(),
  listAllUsers: vi.fn(),
  listCompanyUsers: vi.fn(),
  revokeRefreshSessionsForUserInCompany: vi.fn(),
  updateMembershipRole: vi.fn(),
  updateUserPasswordHash: vi.fn(),
  updateUserProfile: vi.fn(),
  countOwnersInCompany: vi.fn()
}));

vi.mock("../repositories/companies.repository.js", () => ({
  listAllCompanyIds: vi.fn()
}));

vi.mock("../repositories/audit.repository.js", () => ({
  createAuditLogRecord: vi.fn()
}));

vi.mock("../lib/password.js", () => ({
  hashPassword: vi.fn()
}));

describe("admin-users.service", () => {
  beforeEach(() => {
    vi.mocked(randomUUID).mockReset();
    vi.mocked(countOwnersInCompany).mockReset();
    vi.mocked(createMembership).mockReset();
    vi.mocked(createMembershipIfMissing).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(deleteMembership).mockReset();
    vi.mocked(findMembershipByCompanyAndUser).mockReset();
    vi.mocked(findUserByEmail).mockReset();
    vi.mocked(listAllCompanyIds).mockReset();
    vi.mocked(revokeRefreshSessionsForUserInCompany).mockReset();
    vi.mocked(createAuditLogRecord).mockReset();
    vi.mocked(hashPassword).mockReset();
  });

  it("creates a user and attaches it to all existing companies", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
    vi.mocked(listAllCompanyIds).mockResolvedValue(["company-1", "company-2", "company-3"]);
    vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
      membershipId: "membership-current",
      userId: "user-1",
      companyId: "company-1",
      role: "ACCOUNTANT",
      email: "user@example.com",
      fullName: "User Example",
      isActive: true
    });

    vi.mocked(randomUUID)
      .mockReturnValueOnce("user-1")
      .mockReturnValueOnce("membership-1")
      .mockReturnValueOnce("membership-2")
      .mockReturnValueOnce("membership-3")
      .mockReturnValueOnce("audit-1");

    const result = await createCompanyUser(
      {
        actorId: "owner-1",
        companyId: "company-1"
      },
      {
        email: "user@example.com",
        fullName: "User Example",
        password: "Secret123!",
        role: "ACCOUNTANT"
      }
    );

    expect(createUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "user@example.com",
      fullName: "User Example",
      passwordHash: "hashed-password"
    });
    expect(createMembership).toHaveBeenCalledWith({
      membershipId: "membership-1",
      companyId: "company-1",
      userId: "user-1",
      role: "ACCOUNTANT"
    });
    expect(createMembershipIfMissing).toHaveBeenCalledTimes(2);
    expect(createMembershipIfMissing).toHaveBeenCalledWith({
      membershipId: "membership-2",
      companyId: "company-2",
      userId: "user-1",
      role: "ACCOUNTANT"
    });
    expect(createMembershipIfMissing).toHaveBeenCalledWith({
      membershipId: "membership-3",
      companyId: "company-3",
      userId: "user-1",
      role: "ACCOUNTANT"
    });
    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-1",
        companyId: "company-1",
        actorId: "owner-1"
      })
    );
    expect(result.userId).toBe("user-1");
  });

  it("deletes a company membership and revokes company refresh sessions", async () => {
    vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
      membershipId: "membership-1",
      userId: "user-9",
      companyId: "company-1",
      role: "ACCOUNTANT",
      email: "user9@example.com",
      fullName: "User Nine",
      isActive: true
    });
    vi.mocked(randomUUID).mockReturnValueOnce("audit-9");

    await deleteCompanyUser(
      {
        actorId: "owner-1",
        companyId: "company-1"
      },
      "user-9"
    );

    expect(deleteMembership).toHaveBeenCalledWith("company-1", "user-9");
    expect(revokeRefreshSessionsForUserInCompany).toHaveBeenCalledWith("company-1", "user-9");
    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-9",
        action: "ADMIN_USER_REMOVED",
        entityId: "membership-1"
      })
    );
  });
});
