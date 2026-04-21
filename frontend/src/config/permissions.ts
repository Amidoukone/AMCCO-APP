import type { RoleCode } from "../types/role";

export type FeatureKey =
  | "dashboard"
  | "alerts"
  | "adminUsers"
  | "adminActivities"
  | "financeTransactions"
  | "operationsTasks"
  | "reports"
  | "settingsSecurity";

export type NavigationItem = {
  key: FeatureKey;
  label: string;
  to: string;
  section: "Pilotage" | "Execution" | "Administration";
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  OWNER: "Proprietaire",
  SYS_ADMIN: "Admin Systeme",
  ACCOUNTANT: "Comptable",
  SUPERVISOR: "Superviseur",
  EMPLOYEE: "Employe"
};

const FEATURE_ACCESS: Record<FeatureKey, RoleCode[]> = {
  dashboard: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  alerts: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  adminUsers: ["OWNER", "SYS_ADMIN"],
  adminActivities: ["OWNER", "SYS_ADMIN"],
  financeTransactions: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  operationsTasks: ["OWNER", "SYS_ADMIN", "SUPERVISOR", "EMPLOYEE"],
  reports: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"],
  settingsSecurity: ["OWNER", "SYS_ADMIN"]
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: "dashboard", label: "Tableau de bord", to: "/dashboard", section: "Pilotage" },
  { key: "alerts", label: "Alertes", to: "/alerts", section: "Pilotage" },
  { key: "reports", label: "Rapports", to: "/reports", section: "Pilotage" },
  {
    key: "financeTransactions",
    label: "Transactions",
    to: "/finance/transactions",
    section: "Execution"
  },
  { key: "operationsTasks", label: "Taches", to: "/operations/tasks", section: "Execution" },
  { key: "adminUsers", label: "Utilisateurs", to: "/admin/users", section: "Administration" },
  {
    key: "adminActivities",
    label: "Secteurs",
    to: "/admin/activities",
    section: "Administration"
  },
  {
    key: "settingsSecurity",
    label: "Securite",
    to: "/settings/security",
    section: "Administration"
  }
];

export function canAccessFeature(role: RoleCode, feature: FeatureKey): boolean {
  return FEATURE_ACCESS[feature].includes(role);
}

export function getNavigationForRole(role: RoleCode): NavigationItem[] {
  return NAVIGATION_ITEMS.filter((item) => canAccessFeature(role, item.key));
}

export function getDefaultRouteForRole(role: RoleCode): string {
  return getNavigationForRole(role)[0]?.to ?? "/dashboard";
}
