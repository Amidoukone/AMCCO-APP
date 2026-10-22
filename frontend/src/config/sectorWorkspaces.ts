import type { BusinessActivityCode } from "./businessActivities";
import type { RoleCode } from "../types/role";

export type SectorReferenceView = {
  view: "articles" | "shops" | "tenants" | "projects" | "categories";
  pathname?: string;
  label: string;
  createLabel: string;
  sectionId: string;
};

const REFERENCE_VIEWS: Partial<Record<BusinessActivityCode, SectorReferenceView>> = {
  DAILY_ACTIVITIES: { view: "categories", pathname: "/operations/tasks", label: "Catégories", createLabel: "Ajouter une catégorie", sectionId: "daily-activity-categories" },
  HARDWARE: { view: "articles", label: "Articles", createLabel: "Ajouter un article", sectionId: "article-management" },
  GENERAL_STORE: { view: "shops", label: "Boutiques", createLabel: "Ajouter une boutique", sectionId: "shop-management" },
  RENTAL: { view: "tenants", label: "Locataires", createLabel: "Ajouter un locataire", sectionId: "tenant-management" },
  BTP: { view: "projects", label: "Chantiers", createLabel: "Ajouter un chantier", sectionId: "project-management" }
};

export function hasSectorReferenceWorkspace(activityCode: BusinessActivityCode | null): boolean {
  return Boolean(activityCode && REFERENCE_VIEWS[activityCode]);
}

export function getSectorReferenceView(
  activityCode: BusinessActivityCode | null,
  role: RoleCode | undefined
): SectorReferenceView | null {
  if (!activityCode || !role || !["SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"].includes(role)) return null;
  return REFERENCE_VIEWS[activityCode] ?? null;
}

export function getActiveSectorReferenceView(
  pathname: string,
  search: string,
  activityCode: BusinessActivityCode | null,
  role: RoleCode | undefined
): SectorReferenceView | null {
  const reference = getSectorReferenceView(activityCode, role);
  return reference && pathname === (reference.pathname ?? "/finance/transactions") &&
    new URLSearchParams(search).get("view") === reference.view ? reference : null;
}
