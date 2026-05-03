import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCompanyForActor,
  deleteCompanyForActor,
  updateCompanyForActor
} from "./companies.service.js";
import { createRoleTargetedAlerts } from "./alerts.service.js";
import { createMembershipIfMissing, listAllUsers } from "../repositories/admin-users.repository.js";
import {
  createCompany,
  deactivateCompany,
  findCompanyByCode,
  findUserCompanyMembership,
  listCompaniesForUser,
  permanentlyDeleteCompany,
  updateCompanyProfile
} from "../repositories/companies.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn()
}));

vi.mock("../repositories/admin-users.repository.js", () => ({
  createMembershipIfMissing: vi.fn(),
  listAllUsers: vi.fn()
}));

vi.mock("../repositories/companies.repository.js", () => ({
  createCompany: vi.fn(),
  deactivateCompany: vi.fn(),
  findCompanyByCode: vi.fn(),
  findUserCompanyMembership: vi.fn(),
  listCompaniesForUser: vi.fn(),
  permanentlyDeleteCompany: vi.fn(),
  updateCompanyProfile: vi.fn()
}));

vi.mock("../repositories/audit.repository.js", () => ({
  createAuditLogRecord: vi.fn()
}));

vi.mock("./alerts.service.js", () => ({
  createRoleTargetedAlerts: vi.fn()
}));

describe("companies.service", () => {
  beforeEach(() => {
    vi.mocked(createMembershipIfMissing).mockReset();
    vi.mocked(listAllUsers).mockReset();
    vi.mocked(createCompany).mockReset();
    vi.mocked(deactivateCompany).mockReset();
    vi.mocked(findCompanyByCode).mockReset();
    vi.mocked(findUserCompanyMembership).mockReset();
    vi.mocked(listCompaniesForUser).mockReset();
    vi.mocked(permanentlyDeleteCompany).mockReset();
    vi.mocked(updateCompanyProfile).mockReset();
    vi.mocked(createAuditLogRecord).mockReset();
    vi.mocked(createRoleTargetedAlerts).mockReset();
    vi.mocked(randomUUID).mockReset();
  });

  it("creates the company and propagates memberships to all existing users", async () => {
    vi.mocked(findCompanyByCode).mockResolvedValue(null);
    vi.mocked(listAllUsers).mockResolvedValue([
      {
        userId: "owner-2",
        email: "owner2@example.com",
        fullName: "Owner 2",
        isActive: true,
      },
      {
        userId: "employee-1",
        email: "employee1@example.com",
        fullName: "Employee 1",
        isActive: true,
      },
      {
        userId: "owner-1",
        email: "owner1@example.com",
        fullName: "Owner 1",
        isActive: true,
      }
    ]);
    vi.mocked(listCompaniesForUser).mockResolvedValue([
      {
        company: {
          id: "generated-company-id",
          name: "Mali Services",
          code: "MALI-SERVICES",
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
          country: "Mali",
          businessSector: null,
          contactFullName: null,
          contactJobTitle: null,
          isActive: true,
          createdAt: "2026-04-22T00:00:00.000Z",
          updatedAt: "2026-04-22T00:00:00.000Z"
        },
        role: "OWNER"
      }
    ]);

    vi.mocked(randomUUID)
      .mockReturnValueOnce("generated-company-id")
      .mockReturnValueOnce("membership-1")
      .mockReturnValueOnce("membership-2")
      .mockReturnValueOnce("membership-3")
      .mockReturnValueOnce("audit-1");

    const result = await createCompanyForActor(
      {
        userId: "owner-1",
        companyId: "company-source",
        role: "OWNER",
        email: "owner1@example.com"
      },
      {
        name: "Mali Services",
        code: "mali services",
        country: "Mali"
      }
    );

    expect(listAllUsers).toHaveBeenCalledTimes(1);
    expect(createCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-company-id",
        name: "Mali Services",
        code: "MALI-SERVICES",
        country: "Mali"
      })
    );
    expect(createMembershipIfMissing).toHaveBeenCalledTimes(3);
    expect(createMembershipIfMissing).toHaveBeenCalledWith({
      membershipId: "membership-1",
      companyId: "generated-company-id",
      userId: "owner-2",
      role: "EMPLOYEE"
    });
    expect(createMembershipIfMissing).toHaveBeenCalledWith({
      membershipId: "membership-2",
      companyId: "generated-company-id",
      userId: "employee-1",
      role: "EMPLOYEE"
    });
    expect(createMembershipIfMissing).toHaveBeenCalledWith({
      membershipId: "membership-3",
      companyId: "generated-company-id",
      userId: "owner-1",
      role: "OWNER"
    });
    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-1",
        companyId: "generated-company-id",
        actorId: "owner-1"
      })
    );
    expect(result.company.code).toBe("MALI-SERVICES");
  });

  it("updates a company and alerts owners when a sys admin performs the change", async () => {
    vi.mocked(findUserCompanyMembership)
      .mockResolvedValueOnce({
        company: {
          id: "company-2",
          name: "AMCCO BKO",
          code: "AMCCO-BKO",
          legalName: null,
          registrationNumber: null,
          taxId: null,
          email: "old@example.com",
          phone: null,
          website: null,
          addressLine1: null,
          addressLine2: null,
          city: "Bamako",
          stateRegion: null,
          postalCode: null,
          country: "Mali",
          businessSector: "Services",
          contactFullName: null,
          contactJobTitle: null,
          isActive: true,
          createdAt: "2026-04-22T00:00:00.000Z",
          updatedAt: "2026-04-22T00:00:00.000Z"
        },
        role: "SYS_ADMIN"
      })
      .mockResolvedValueOnce({
        company: {
          id: "company-2",
          name: "AMCCO Bamako",
          code: "AMCCO-BKO",
          legalName: null,
          registrationNumber: null,
          taxId: null,
          email: "contact@example.com",
          phone: null,
          website: null,
          addressLine1: null,
          addressLine2: null,
          city: "Bamako",
          stateRegion: null,
          postalCode: null,
          country: "Mali",
          businessSector: "Services",
          contactFullName: null,
          contactJobTitle: null,
          isActive: true,
          createdAt: "2026-04-22T00:00:00.000Z",
          updatedAt: "2026-04-22T00:00:00.000Z"
        },
        role: "SYS_ADMIN"
      });
    vi.mocked(randomUUID).mockReturnValueOnce("audit-update-1");

    const result = await updateCompanyForActor(
      {
        userId: "sysadmin-1",
        companyId: "company-source",
        role: "SYS_ADMIN",
        email: "sysadmin@example.com"
      },
      {
        companyId: "company-2",
        name: "AMCCO Bamako",
        email: "contact@example.com"
      }
    );

    expect(updateCompanyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-2",
        name: "AMCCO Bamako",
        email: "contact@example.com",
        city: "Bamako"
      })
    );
    expect(createRoleTargetedAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-2",
        recipientRoles: ["OWNER"],
        excludeUserIds: ["sysadmin-1"],
        code: "COMPANY_UPDATED"
      })
    );
    expect(result.company.name).toBe("AMCCO Bamako");
  });

  it("deactivates a company when its owner deletes it from another active company", async () => {
    vi.mocked(findUserCompanyMembership).mockResolvedValue({
      company: {
        id: "company-3",
        name: "Filiale Test",
        code: "FILIALE-TEST",
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
        country: "Mali",
        businessSector: null,
        contactFullName: null,
        contactJobTitle: null,
        isActive: true,
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      role: "OWNER"
    });
    vi.mocked(randomUUID).mockReturnValueOnce("audit-delete-1");

    await deleteCompanyForActor(
      {
        userId: "owner-1",
        companyId: "company-source",
        role: "OWNER",
        email: "owner@example.com"
      },
      {
        companyId: "company-3"
      }
    );

    expect(deactivateCompany).toHaveBeenCalledWith("company-3");
    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-delete-1",
        companyId: "company-3",
        action: "COMPANY_DELETED"
      })
    );
  });

  it("permanently deletes an inactive company and logs the purge in the actor company", async () => {
    vi.mocked(findUserCompanyMembership).mockResolvedValue({
      company: {
        id: "company-4",
        name: "Filiale Archivee",
        code: "FILIALE-ARCHIVEE",
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
        country: "Mali",
        businessSector: null,
        contactFullName: null,
        contactJobTitle: null,
        isActive: false,
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      role: "SYS_ADMIN"
    });
    vi.mocked(randomUUID).mockReturnValueOnce("audit-purge-1");

    await deleteCompanyForActor(
      {
        userId: "sysadmin-1",
        companyId: "company-source",
        role: "SYS_ADMIN",
        email: "sysadmin@example.com"
      },
      {
        companyId: "company-4"
      }
    );

    expect(permanentlyDeleteCompany).toHaveBeenCalledWith("company-4");
    expect(deactivateCompany).not.toHaveBeenCalled();
    expect(createAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-purge-1",
        companyId: "company-source",
        action: "COMPANY_PURGED",
        entityId: "company-4"
      })
    );
  });
});
