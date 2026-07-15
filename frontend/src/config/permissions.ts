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
  myWork: ["SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  alerts: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  adminCompanies: ["SYS_ADMIN"],
  adminUsers: ["SYS_ADMIN"],
  adminActivities: ["SYS_ADMIN"],
  financeTransactions: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  financeSalaries: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  operationsTasks: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  reports: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"],
  settingsSecurity: ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"]
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: "dashboard", label: "Tableau de bord", to: "/dashboard", section: "Pilotage" },
  { key: "myWork", label: "Mon travail", to: "/my-work", section: "Pilotage" },
  { key: "alerts", label: "Alertes", to: "/alerts", section: "Pilotage" },
  { key: "reports", label: "Rapports", to: "/reports", section: "Pilotage" },
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

export function isReadOnlyOwnerRole(role: RoleCode): boolean {
  return role === "OWNER";
}

export function getNavigationForRole(role: RoleCode): NavigationItem[] {
  const items = NAVIGATION_ITEMS.filter((item) => canAccessFeature(role, item.key));
  if (role !== "OWNER") {
    return items;
  }

  return items.map((item) => {
    if (item.key === "financeTransactions") {
      return { ...item, label: "Contrôle finance" };
    }
    if (item.key === "financeSalaries") {
      return { ...item, label: "Suivi salaires" };
    }
    if (item.key === "operationsTasks") {
      return { ...item, label: "Suivi tâches" };
    }
    return item;
  });
}

export function getDefaultRouteForRole(role: RoleCode): string {
  return getNavigationForRole(role)[0]?.to ?? "/dashboard";
}
