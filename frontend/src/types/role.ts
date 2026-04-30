export const ROLE_CODES = [
  "OWNER",
  "SYS_ADMIN",
  "ACCOUNTANT",
  "SUPERVISOR",
  "EMPLOYEE"
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.includes(value as RoleCode);
}
