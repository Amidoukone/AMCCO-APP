import { describe, expect, it } from "vitest";
import { pickPreferredAuthUser } from "./auth.service.js";
import type { AuthUserRecord } from "../repositories/auth.repository.js";

function buildRecord(input: Partial<AuthUserRecord> & Pick<AuthUserRecord, "companyCode" | "role">): AuthUserRecord {
  return {
    userId: input.userId ?? "user-1",
    email: input.email ?? "user@example.com",
    fullName: input.fullName ?? "User Example",
    passwordHash: input.passwordHash ?? "hashed-password",
    userIsActive: input.userIsActive ?? 1,
    companyId: input.companyId ?? `${input.companyCode.toLowerCase()}-id`,
    companyCode: input.companyCode,
    companyIsActive: input.companyIsActive ?? 1,
    role: input.role
  };
}

describe("auth.service pickPreferredAuthUser", () => {
  it("prefers the strongest role before the default AMCCO company", () => {
    const result = pickPreferredAuthUser([
      buildRecord({ companyCode: "AMCCO", role: "EMPLOYEE" }),
      buildRecord({ companyCode: "BAMAKO", role: "ACCOUNTANT", companyId: "company-bko" })
    ]);

    expect(result?.companyId).toBe("company-bko");
    expect(result?.role).toBe("ACCOUNTANT");
  });

  it("uses AMCCO only as a tie-breaker between equal roles", () => {
    const result = pickPreferredAuthUser([
      buildRecord({ companyCode: "BAMAKO", role: "ACCOUNTANT", companyId: "company-bko" }),
      buildRecord({ companyCode: "AMCCO", role: "ACCOUNTANT", companyId: "company-amcco" })
    ]);

    expect(result?.companyId).toBe("company-amcco");
    expect(result?.role).toBe("ACCOUNTANT");
  });
});
