export const ROLE_CODES = [
  "OWNER",
  "SYS_ADMIN",
  "ACCOUNTANT",
  "SUPERVISOR",
  "EMPLOYEE",
  "HARDWARE_OPERATOR",
  "HYDROCARBON_OPERATOR",
  "BEVERAGE_DEPOT_OPERATOR"
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.includes(value as RoleCode);
}

export function getRoleActivityCode(role: RoleCode): "HARDWARE" | "HYDROCARBON" | "BEVERAGE_DEPOT" | null {
  if (role === "HARDWARE_OPERATOR") return "HARDWARE";
  if (role === "HYDROCARBON_OPERATOR") return "HYDROCARBON";
  if (role === "BEVERAGE_DEPOT_OPERATOR") return "BEVERAGE_DEPOT";
  return null;
}
