import type { RoleCode } from "../types/role";

export type FeatureKey =
  | "dashboard"
  | "myWork"
  | "alerts"
  | "adminCompanies"
  | "adminUsers"
  | "adminActivities"
  | "financeTransactions"
  | "financeSalaries"
  | "operationsTasks"
  | "reports"
  | "settingsSecurity";

export type NavigationItem = {
  key: FeatureKey;
  label: string;
  to: string;
  section: "Pilotage" | "Exécution" | "Administration" | "Compte";
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  OWNER: "Propriétaire",
  SYS_ADMIN: "Admin Système",
  ACCOUNTANT: "Comptable",
  SUPERVISOR: "Superviseur",
  EMPLOYEE: "Employé"
};

const FEATURE_ACCESS: Record<FeatureKey, RoleCode[]> = {
  dashboard: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  myWork: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  alerts: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  adminCompanies: ["OWNER", "SYS_ADMIN"],
  adminUsers: ["OWNER", "SYS_ADMIN"],
  adminActivities: ["OWNER", "SYS_ADMIN"],
  financeTransactions: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  financeSalaries: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  operationsTasks: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  reports: [],
  settingsSecurity: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"]
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: "dashboard", label: "Tableau de bord", to: "/dashboard", section: "Pilotage" },
  { key: "myWork", label: "Mon travail", to: "/my-work", section: "Pilotage" },
  { key: "alerts", label: "Alertes", to: "/alerts", section: "Pilotage" },
  {
    key: "financeTransactions",
    label: "Transactions",
    to: "/finance/transactions",
    section: "Exécution"
  },
  {
    key: "financeSalaries",
    label: "Salaires",
    to: "/finance/salaries",
    section: "Exécution"
  },
  { key: "operationsTasks", label: "Tâches", to: "/operations/tasks", section: "Exécution" },
  {
    key: "adminCompanies",
    label: "Entreprises",
    to: "/admin/companies",
    section: "Administration"
  },
  { key: "adminUsers", label: "Utilisateurs", to: "/admin/users", section: "Administration" },
  {
    key: "adminActivities",
    label: "Secteurs",
    to: "/admin/activities",
    section: "Administration"
  },
  {
    key: "settingsSecurity",
    label: "Sécurité",
    to: "/settings/security",
    section: "Compte"
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
