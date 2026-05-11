import { describe, expect, it } from "vitest";
import {
  findSuspectMembershipRoleDowngrades,
  type CompanyCreationSnapshot,
  type MembershipRoleChangeSnapshot,
  type MembershipSnapshot
} from "./membership-role-repair.service.js";

function membership(input: Partial<MembershipSnapshot> & Pick<MembershipSnapshot, "membershipId" | "userId" | "companyId" | "companyCode" | "companyName" | "role" | "createdAt">): MembershipSnapshot {
  return {
    membershipId: input.membershipId,
    userId: input.userId,
    email: input.email ?? "user@example.com",
    fullName: input.fullName ?? "User Example",
    companyId: input.companyId,
    companyCode: input.companyCode,
    companyName: input.companyName,
    role: input.role,
    createdAt: input.createdAt
  };
}

function companyCreation(companyId: string, createdAt: string): CompanyCreationSnapshot {
  return { companyId, createdAt };
}

function roleChange(
  membershipId: string,
  userId: string,
  companyId: string,
  role: MembershipRoleChangeSnapshot["role"],
  createdAt: string
): MembershipRoleChangeSnapshot {
  return { membershipId, userId, companyId, role, createdAt };
}

describe("membership-role-repair.service", () => {
  it("flags an inherited employee membership when the user already had a stable higher role elsewhere", () => {
    const memberships = [
      membership({
        membershipId: "m-source",
        userId: "user-1",
        companyId: "company-source",
        companyCode: "AMCCO",
        companyName: "AMCCO",
        role: "ACCOUNTANT",
        createdAt: "2026-05-01T09:00:00.000Z"
      }),
      membership({
        membershipId: "m-target",
        userId: "user-1",
        companyId: "company-target",
        companyCode: "BKO",
        companyName: "Bamako",
        role: "EMPLOYEE",
        createdAt: "2026-05-02T10:03:00.000Z"
      })
    ];

    const suspects = findSuspectMembershipRoleDowngrades({
      memberships,
      companyCreations: [companyCreation("company-target", "2026-05-02T10:00:00.000Z")],
      roleChanges: []
    });

    expect(suspects).toHaveLength(1);
    expect(suspects[0]).toMatchObject({
      membershipId: "m-target",
      suggestedRole: "ACCOUNTANT"
    });
  });

  it("skips a membership when the stronger role may have been assigned later", () => {
    const memberships = [
      membership({
        membershipId: "m-source",
        userId: "user-1",
        companyId: "company-source",
        companyCode: "AMCCO",
        companyName: "AMCCO",
        role: "ACCOUNTANT",
        createdAt: "2026-05-01T09:00:00.000Z"
      }),
      membership({
        membershipId: "m-target",
        userId: "user-1",
        companyId: "company-target",
        companyCode: "BKO",
        companyName: "Bamako",
        role: "EMPLOYEE",
        createdAt: "2026-05-02T10:03:00.000Z"
      })
    ];

    const suspects = findSuspectMembershipRoleDowngrades({
      memberships,
      companyCreations: [companyCreation("company-target", "2026-05-02T10:00:00.000Z")],
      roleChanges: [
        roleChange(
          "m-source",
          "user-1",
          "company-source",
          "ACCOUNTANT",
          "2026-05-03T08:00:00.000Z"
        )
      ]
    });

    expect(suspects).toHaveLength(0);
  });

  it("skips ambiguous users with different stronger roles across older companies", () => {
    const memberships = [
      membership({
        membershipId: "m-owner",
        userId: "user-1",
        companyId: "company-1",
        companyCode: "AMCCO",
        companyName: "AMCCO",
        role: "SYS_ADMIN",
        createdAt: "2026-05-01T09:00:00.000Z"
      }),
      membership({
        membershipId: "m-accountant",
        userId: "user-1",
        companyId: "company-2",
        companyCode: "SND",
        companyName: "SND",
        role: "ACCOUNTANT",
        createdAt: "2026-05-01T10:00:00.000Z"
      }),
      membership({
        membershipId: "m-target",
        userId: "user-1",
        companyId: "company-target",
        companyCode: "BKO",
        companyName: "Bamako",
        role: "EMPLOYEE",
        createdAt: "2026-05-02T10:03:00.000Z"
      })
    ];

    const suspects = findSuspectMembershipRoleDowngrades({
      memberships,
      companyCreations: [companyCreation("company-target", "2026-05-02T10:00:00.000Z")],
      roleChanges: []
    });

    expect(suspects).toHaveLength(0);
  });
});
