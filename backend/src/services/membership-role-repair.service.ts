import type { RoleCode } from "../types/role.js";

export type MembershipSnapshot = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  role: RoleCode;
  createdAt: string;
};

export type CompanyCreationSnapshot = {
  companyId: string;
  createdAt: string;
};

export type MembershipRoleChangeSnapshot = {
  membershipId: string;
  userId: string;
  companyId: string;
  role: RoleCode;
  createdAt: string;
};

export type SuspectMembershipRoleDowngrade = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  currentRole: "EMPLOYEE";
  suggestedRole: Exclude<RoleCode, "EMPLOYEE">;
  membershipCreatedAt: string;
  companyCreatedAt: string;
  referenceCompanies: string[];
  reason: string;
};

function rolePriority(role: RoleCode): number {
  switch (role) {
    case "OWNER":
      return 0;
    case "SYS_ADMIN":
      return 1;
    case "ACCOUNTANT":
      return 2;
    case "SUPERVISOR":
      return 3;
    case "EMPLOYEE":
    default:
      return 4;
  }
}

function isWithinCreationWindow(
  membershipCreatedAt: string,
  companyCreatedAt: string,
  creationWindowMinutes: number
): boolean {
  const membershipTime = new Date(membershipCreatedAt).getTime();
  const companyTime = new Date(companyCreatedAt).getTime();
  if (Number.isNaN(membershipTime) || Number.isNaN(companyTime) || membershipTime < companyTime) {
    return false;
  }

  const diffMs = membershipTime - companyTime;
  return diffMs <= creationWindowMinutes * 60_000;
}

export function findSuspectMembershipRoleDowngrades(input: {
  memberships: MembershipSnapshot[];
  companyCreations: CompanyCreationSnapshot[];
  roleChanges: MembershipRoleChangeSnapshot[];
  creationWindowMinutes?: number;
}): SuspectMembershipRoleDowngrade[] {
  const creationWindowMinutes = input.creationWindowMinutes ?? 10;
  const companyCreatedAtById = new Map(
    input.companyCreations.map((item) => [item.companyId, item.createdAt])
  );
  const membershipsByUserId = new Map<string, MembershipSnapshot[]>();
  const roleChangesByMembershipId = new Map<string, MembershipRoleChangeSnapshot[]>();

  for (const membership of input.memberships) {
    const items = membershipsByUserId.get(membership.userId) ?? [];
    items.push(membership);
    membershipsByUserId.set(membership.userId, items);
  }

  for (const roleChange of input.roleChanges) {
    const items = roleChangesByMembershipId.get(roleChange.membershipId) ?? [];
    items.push(roleChange);
    roleChangesByMembershipId.set(roleChange.membershipId, items);
  }

  for (const items of roleChangesByMembershipId.values()) {
    items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  const suspects: SuspectMembershipRoleDowngrade[] = [];

  for (const membership of input.memberships) {
    if (membership.role !== "EMPLOYEE") {
      continue;
    }

    const companyCreatedAt = companyCreatedAtById.get(membership.companyId);
    if (!companyCreatedAt) {
      continue;
    }

    if (!isWithinCreationWindow(membership.createdAt, companyCreatedAt, creationWindowMinutes)) {
      continue;
    }

    const targetRoleChanges = roleChangesByMembershipId.get(membership.membershipId) ?? [];
    if (targetRoleChanges.length > 0) {
      continue;
    }

    const siblingMemberships = (membershipsByUserId.get(membership.userId) ?? []).filter(
      (item) => item.membershipId !== membership.membershipId
    );
    const olderStrongerMemberships = siblingMemberships.filter((item) => {
      if (rolePriority(item.role) >= rolePriority("EMPLOYEE")) {
        return false;
      }
      return new Date(item.createdAt).getTime() <= new Date(membership.createdAt).getTime();
    });

    if (olderStrongerMemberships.length === 0) {
      continue;
    }

    const allStableBeforeTarget = olderStrongerMemberships.every((item) => {
      const roleChanges = roleChangesByMembershipId.get(item.membershipId) ?? [];
      return roleChanges.every(
        (roleChange) => new Date(roleChange.createdAt).getTime() <= new Date(membership.createdAt).getTime()
      );
    });
    if (!allStableBeforeTarget) {
      continue;
    }

    const distinctRoles = [...new Set(olderStrongerMemberships.map((item) => item.role))];
    if (distinctRoles.length !== 1) {
      continue;
    }

    const suggestedRole = distinctRoles[0];
    if (suggestedRole === "EMPLOYEE") {
      continue;
    }

    suspects.push({
      membershipId: membership.membershipId,
      userId: membership.userId,
      email: membership.email,
      fullName: membership.fullName,
      companyId: membership.companyId,
      companyCode: membership.companyCode,
      companyName: membership.companyName,
      currentRole: "EMPLOYEE",
      suggestedRole,
      membershipCreatedAt: membership.createdAt,
      companyCreatedAt,
      referenceCompanies: olderStrongerMemberships.map((item) => item.companyCode).sort(),
      reason:
        "Membership créé pendant la création de l'entreprise, sans changement de role explicite, alors que le même utilisateur avait déjà un role plus élevé stable dans une autre entreprise."
    });
  }

  return suspects.sort((left, right) => {
    const emailDiff = left.email.localeCompare(right.email);
    if (emailDiff !== 0) {
      return emailDiff;
    }
    return left.companyCode.localeCompare(right.companyCode);
  });
}
