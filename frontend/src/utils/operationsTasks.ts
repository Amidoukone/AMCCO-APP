import { ApiError } from "../lib/api";
import { formatAmountForDisplay } from "../lib/amountFormatting";
import type { ActivityFieldDefinition } from "../types/activities";
import type { OperationTaskMember, TaskStatus } from "../types/tasks";

export const TASKS_PAGE_SIZE = 50;
export const TASKS_SERVICE_SUGGESTION_HISTORY_SIZE = 200;
export const TASKS_MOBILE_PAGE_SIZE = 40;
export const TASKS_VISIBLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_TASKS_VISIBLE_PAGE_SIZE = 10;

export function getTasksFetchPageSize(): number {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
    ? TASKS_MOBILE_PAGE_SIZE
    : TASKS_PAGE_SIZE;
}

export const AGRICULTURE_TASK_KIND_KEY = "agricultureTaskKind";
export type AgricultureTaskKind =
  | "PREPARATION"
  | "SOWING"
  | "MAINTENANCE"
  | "TREATMENT"
  | "HARVEST"
  | "STORAGE"
  | "FOLLOW_UP";
export const AGRICULTURE_TASK_LABELS: Record<AgricultureTaskKind, string> = {
  PREPARATION: "Préparation",
  SOWING: "Semis",
  MAINTENANCE: "Entretien",
  TREATMENT: "Traitement",
  HARVEST: "Récolte",
  STORAGE: "Stockage",
  FOLLOW_UP: "Suivi terrain"
};

export const BTP_TASK_KIND_KEY = "btpTaskKind";
export type BtpTaskKind =
  | "SITE_PREPARATION"
  | "EARTHWORKS"
  | "FOUNDATION"
  | "STRUCTURAL_WORK"
  | "MASONRY"
  | "MEP"
  | "FINISHING"
  | "PROCUREMENT"
  | "QUALITY_CONTROL"
  | "RESERVE"
  | "HANDOVER"
  | "FOLLOW_UP";
export const BTP_TASK_LABELS: Record<BtpTaskKind, string> = {
  SITE_PREPARATION: "Préparation chantier",
  EARTHWORKS: "Terrassement",
  FOUNDATION: "Fondation",
  STRUCTURAL_WORK: "Structure",
  MASONRY: "Maconnerie",
  MEP: "Electricite / plomberie",
  FINISHING: "Finition",
  PROCUREMENT: "Approvisionnement",
  QUALITY_CONTROL: "Contrôle qualité",
  RESERVE: "Réserve / reprise",
  HANDOVER: "Réception",
  FOLLOW_UP: "Suivi chantier"
};

export const FOOD_TASK_KIND_KEY = "foodTaskKind";
export type FoodTaskKind =
  | "RECEPTION"
  | "STOCK_CONTROL"
  | "EXPIRY_CHECK"
  | "COLD_CHAIN_CHECK"
  | "SHELF_ROTATION"
  | "SUPPLIER_FOLLOW_UP"
  | "PRODUCT_WITHDRAWAL"
  | "CLEANING"
  | "INVENTORY"
  | "QUALITY_CONTROL"
  | "DELIVERY"
  | "FOLLOW_UP";
export const FOOD_TASK_LABELS: Record<FoodTaskKind, string> = {
  RECEPTION: "Réception stock",
  STOCK_CONTROL: "Contrôle stock",
  EXPIRY_CHECK: "Contrôle DLC",
  COLD_CHAIN_CHECK: "Contrôle froid",
  SHELF_ROTATION: "Rotation rayon",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  PRODUCT_WITHDRAWAL: "Retrait produit",
  CLEANING: "Nettoyage",
  INVENTORY: "Inventaire",
  QUALITY_CONTROL: "Contrôle qualité",
  DELIVERY: "Livraison",
  FOLLOW_UP: "Suivi alimentaire"
};

export const RENTAL_TASK_KIND_KEY = "rentalTaskKind";
export type RentalTaskKind = "RELANCE" | "VISIT" | "MOVE_IN" | "MOVE_OUT" | "MAINTENANCE" | "FOLLOW_UP";
export const RENTAL_TASK_LABELS: Record<RentalTaskKind, string> = {
  RELANCE: "Relance loyer",
  VISIT: "Visite",
  MOVE_IN: "Entree locataire",
  MOVE_OUT: "Sortie locataire",
  MAINTENANCE: "Maintenance",
  FOLLOW_UP: "Autre"
};

export const HOTEL_TASK_KIND_KEY = "hotelTaskKind";
export type HotelTaskKind =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "ROOM_PREPARATION"
  | "HOUSEKEEPING"
  | "MAINTENANCE"
  | "RESTAURANT_SERVICE"
  | "LAUNDRY"
  | "EVENT_SETUP"
  | "GUEST_FOLLOW_UP"
  | "SUPPLIER_FOLLOW_UP"
  | "NIGHT_AUDIT"
  | "FOLLOW_UP";
export const HOTEL_TASK_LABELS: Record<HotelTaskKind, string> = {
  CHECK_IN: "Check-in",
  CHECK_OUT: "Check-out",
  ROOM_PREPARATION: "Préparation chambre",
  HOUSEKEEPING: "Menage",
  MAINTENANCE: "Maintenance",
  RESTAURANT_SERVICE: "Service restauration",
  LAUNDRY: "Blanchisserie",
  EVENT_SETUP: "Préparation événement",
  GUEST_FOLLOW_UP: "Suivi client",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  NIGHT_AUDIT: "Audit nuit",
  FOLLOW_UP: "Suivi hotelier"
};

export const AGENCY_TASK_KIND_KEY = "agencyTaskKind";
export type AgencyTaskKind =
  | "MANDATE_INTAKE"
  | "PROPERTY_VALUATION"
  | "LISTING_PUBLICATION"
  | "CLIENT_PROSPECTING"
  | "VISIT_SCHEDULE"
  | "OFFER_FOLLOW_UP"
  | "DOCUMENT_COLLECTION"
  | "NOTARY_FOLLOW_UP"
  | "CONTRACT_SIGNING"
  | "OWNER_REPORTING"
  | "COMMISSION_COLLECTION"
  | "FOLLOW_UP";
export const AGENCY_TASK_LABELS: Record<AgencyTaskKind, string> = {
  MANDATE_INTAKE: "Prise mandat",
  PROPERTY_VALUATION: "Estimation bien",
  LISTING_PUBLICATION: "Publication annonce",
  CLIENT_PROSPECTING: "Prospection client",
  VISIT_SCHEDULE: "Visite",
  OFFER_FOLLOW_UP: "Suivi offre",
  DOCUMENT_COLLECTION: "Collecte documents",
  NOTARY_FOLLOW_UP: "Suivi notaire",
  CONTRACT_SIGNING: "Signature contrat",
  OWNER_REPORTING: "Reporting propriétaire",
  COMMISSION_COLLECTION: "Recouvrement commission",
  FOLLOW_UP: "Suivi dossier"
};

export const FISH_FARMING_TASK_KIND_KEY = "fishTaskKind";
export type FishFarmingTaskKind =
  | "FEEDING"
  | "WATER_CONTROL"
  | "TREATMENT"
  | "SORTING"
  | "HARVEST"
  | "STOCKING"
  | "FOLLOW_UP";
export const FISH_FARMING_TASK_LABELS: Record<FishFarmingTaskKind, string> = {
  FEEDING: "Nourrissage",
  WATER_CONTROL: "Contrôle eau",
  TREATMENT: "Traitement sanitaire",
  SORTING: "Tri / calibrage",
  HARVEST: "Récolte",
  STOCKING: "Mise en charge",
  FOLLOW_UP: "Suivi bassin"
};

export const LIVESTOCK_TASK_KIND_KEY = "livestockTaskKind";
export type LivestockTaskKind =
  | "FEEDING"
  | "HEALTH_CHECK"
  | "VACCINATION"
  | "TREATMENT"
  | "CLEANING"
  | "BREEDING"
  | "SALE_PREP"
  | "FOLLOW_UP";
export const LIVESTOCK_TASK_LABELS: Record<LivestockTaskKind, string> = {
  FEEDING: "Nourrissage",
  HEALTH_CHECK: "Contrôle sanitaire",
  VACCINATION: "Vaccination",
  TREATMENT: "Traitement",
  CLEANING: "Nettoyage enclos",
  BREEDING: "Reproduction",
  SALE_PREP: "Préparation vente",
  FOLLOW_UP: "Suivi élevage"
};

export const GENERAL_EXPENSE_KIND_KEY = "generalExpenseKind";
export type GeneralExpenseKind =
  | "PDG_SUPPLIES"
  | "PDG_TRANSPORT"
  | "PDG_SUPPLIER_PAYMENT"
  | "PDG_TRANSFER_ADVANCE"
  | "PDG_INVESTMENT"
  | "PDG_LOAN"
  | "PDG_OVERHEAD"
  | "EMPLOYEE_MEALS"
  | "EMPLOYEE_FUEL"
  | "EMPLOYEE_VEHICLE_UPKEEP"
  | "EMPLOYEE_SUPPLIES"
  | "EMPLOYEE_OTHER";
export const GENERAL_EXPENSE_KIND_LABELS: Record<GeneralExpenseKind, string> = {
  PDG_SUPPLIES: "PDG - Achat matériel / fournitures",
  PDG_TRANSPORT: "PDG - Carburant / transport",
  PDG_SUPPLIER_PAYMENT: "PDG - Paiement fournisseur / prestataire",
  PDG_TRANSFER_ADVANCE: "PDG - Virement / avance / transfert",
  PDG_INVESTMENT: "PDG - Investissement",
  PDG_LOAN: "PDG - Prêt",
  PDG_OVERHEAD: "PDG - Frais généraux / divers",
  EMPLOYEE_MEALS: "Employé - Repas",
  EMPLOYEE_FUEL: "Employé - Carburant",
  EMPLOYEE_VEHICLE_UPKEEP: "Employé - Entretien véhicule",
  EMPLOYEE_SUPPLIES: "Employé - Fournitures / consommables",
  EMPLOYEE_OTHER: "Employé - Autre dépense"
};

export function isGeneralExpenseKind(value: string | undefined): value is GeneralExpenseKind {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(GENERAL_EXPENSE_KIND_LABELS, value as string);
}

export const DAILY_ACTIVITY_KIND_KEY = "dailyActivityKind";
export const DAILY_ACTIVITY_AMOUNT_KEY = "amount";
export const DAILY_PROTOCOL_CATEGORY = "Protocole d'accord";

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function statusLabel(status: TaskStatus): string {
  if (status === "TODO") {
    return "À faire";
  }
  if (status === "IN_PROGRESS") {
    return "En cours";
  }
  if (status === "DONE") {
    return "Terminée";
  }
  return "Bloquée";
}

export function statusToneClass(status: TaskStatus): string {
  if (status === "TODO") {
    return "todo";
  }
  if (status === "IN_PROGRESS") {
    return "in-progress";
  }
  if (status === "DONE") {
    return "done";
  }
  return "blocked";
}

export function statusShortMetric(status: TaskStatus): string {
  if (status === "TODO") {
    return "À lancer";
  }
  if (status === "IN_PROGRESS") {
    return "En exécution";
  }
  if (status === "DONE") {
    return "Clôturées";
  }
  return "À débloquer";
}

export function memberLabel(member: OperationTaskMember): string {
  return `${member.fullName} (${member.role})`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

export function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return { ...previous, ...Object.fromEntries(fields.map((field) => [field.key, previous[field.key] ?? ""])) };
}

export function isAgricultureTaskKind(value: string | undefined): value is AgricultureTaskKind {
  return (
    value === "PREPARATION" ||
    value === "SOWING" ||
    value === "MAINTENANCE" ||
    value === "TREATMENT" ||
    value === "HARVEST" ||
    value === "STORAGE" ||
    value === "FOLLOW_UP"
  );
}

export function isBtpTaskKind(value: string | undefined): value is BtpTaskKind {
  return (
    value === "SITE_PREPARATION" ||
    value === "EARTHWORKS" ||
    value === "FOUNDATION" ||
    value === "STRUCTURAL_WORK" ||
    value === "MASONRY" ||
    value === "MEP" ||
    value === "FINISHING" ||
    value === "PROCUREMENT" ||
    value === "QUALITY_CONTROL" ||
    value === "RESERVE" ||
    value === "HANDOVER" ||
    value === "FOLLOW_UP"
  );
}

export function isFoodTaskKind(value: string | undefined): value is FoodTaskKind {
  return (
    value === "RECEPTION" ||
    value === "STOCK_CONTROL" ||
    value === "EXPIRY_CHECK" ||
    value === "COLD_CHAIN_CHECK" ||
    value === "SHELF_ROTATION" ||
    value === "SUPPLIER_FOLLOW_UP" ||
    value === "PRODUCT_WITHDRAWAL" ||
    value === "CLEANING" ||
    value === "INVENTORY" ||
    value === "QUALITY_CONTROL" ||
    value === "DELIVERY" ||
    value === "FOLLOW_UP"
  );
}

export function isRentalTaskKind(value: string | undefined): value is RentalTaskKind {
  return (
    value === "RELANCE" ||
    value === "VISIT" ||
    value === "MOVE_IN" ||
    value === "MOVE_OUT" ||
    value === "MAINTENANCE" ||
    value === "FOLLOW_UP"
  );
}

export function isHotelTaskKind(value: string | undefined): value is HotelTaskKind {
  return (
    value === "CHECK_IN" ||
    value === "CHECK_OUT" ||
    value === "ROOM_PREPARATION" ||
    value === "HOUSEKEEPING" ||
    value === "MAINTENANCE" ||
    value === "RESTAURANT_SERVICE" ||
    value === "LAUNDRY" ||
    value === "EVENT_SETUP" ||
    value === "GUEST_FOLLOW_UP" ||
    value === "SUPPLIER_FOLLOW_UP" ||
    value === "NIGHT_AUDIT" ||
    value === "FOLLOW_UP"
  );
}

export function isAgencyTaskKind(value: string | undefined): value is AgencyTaskKind {
  return (
    value === "MANDATE_INTAKE" ||
    value === "PROPERTY_VALUATION" ||
    value === "LISTING_PUBLICATION" ||
    value === "CLIENT_PROSPECTING" ||
    value === "VISIT_SCHEDULE" ||
    value === "OFFER_FOLLOW_UP" ||
    value === "DOCUMENT_COLLECTION" ||
    value === "NOTARY_FOLLOW_UP" ||
    value === "CONTRACT_SIGNING" ||
    value === "OWNER_REPORTING" ||
    value === "COMMISSION_COLLECTION" ||
    value === "FOLLOW_UP"
  );
}

export function isFishFarmingTaskKind(value: string | undefined): value is FishFarmingTaskKind {
  return (
    value === "FEEDING" ||
    value === "WATER_CONTROL" ||
    value === "TREATMENT" ||
    value === "SORTING" ||
    value === "HARVEST" ||
    value === "STOCKING" ||
    value === "FOLLOW_UP"
  );
}

export function isLivestockTaskKind(value: string | undefined): value is LivestockTaskKind {
  return (
    value === "FEEDING" ||
    value === "HEALTH_CHECK" ||
    value === "VACCINATION" ||
    value === "TREATMENT" ||
    value === "CLEANING" ||
    value === "BREEDING" ||
    value === "SALE_PREP" ||
    value === "FOLLOW_UP"
  );
}

export function formatMetadataValue(key: string, value: string): string {
  if (key === AGRICULTURE_TASK_KIND_KEY && isAgricultureTaskKind(value)) {
    return AGRICULTURE_TASK_LABELS[value];
  }
  if (key === BTP_TASK_KIND_KEY && isBtpTaskKind(value)) {
    return BTP_TASK_LABELS[value];
  }
  if (key === FOOD_TASK_KIND_KEY && isFoodTaskKind(value)) {
    return FOOD_TASK_LABELS[value];
  }
  if (key === RENTAL_TASK_KIND_KEY && isRentalTaskKind(value)) {
    return RENTAL_TASK_LABELS[value];
  }
  if (key === HOTEL_TASK_KIND_KEY && isHotelTaskKind(value)) {
    return HOTEL_TASK_LABELS[value];
  }
  if (key === AGENCY_TASK_KIND_KEY && isAgencyTaskKind(value)) {
    return AGENCY_TASK_LABELS[value];
  }
  if (key === FISH_FARMING_TASK_KIND_KEY && isFishFarmingTaskKind(value)) {
    return FISH_FARMING_TASK_LABELS[value];
  }
  if (key === LIVESTOCK_TASK_KIND_KEY && isLivestockTaskKind(value)) {
    return LIVESTOCK_TASK_LABELS[value];
  }
  if (key === GENERAL_EXPENSE_KIND_KEY && isGeneralExpenseKind(value)) {
    return GENERAL_EXPENSE_KIND_LABELS[value];
  }
  if (key === DAILY_ACTIVITY_AMOUNT_KEY) {
    return `${formatAmountForDisplay(value)} XOF`;
  }
  if (key === "agreementCapitalAmount" || key === "agreementProfitAmount") {
    return `${formatAmountForDisplay(value)} XOF`;
  }
  return value;
}

export function formatMetadataSummary(
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): string {
  const items = fields
    .map((field) => {
      const value = metadata[field.key]?.trim();
      return value ? `${field.label}: ${formatMetadataValue(field.key, value)}` : null;
    })
    .filter((value): value is string => value !== null);

  if (items.length > 0) {
    return items.join(" | ");
  }

  const fallbackItems = Object.entries(metadata)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${formatMetadataValue(key, value)}`);
  return fallbackItems.length > 0 ? fallbackItems.join(" | ") : "-";
}

export function isRequiredDailyAgreementField(fieldKey: string, metadata: Record<string, string>): boolean {
  if (metadata[DAILY_ACTIVITY_KIND_KEY] !== DAILY_PROTOCOL_CATEGORY) return false;
  if (["agreementRef", "partnerName", "agreementType"].includes(fieldKey)) return true;
  return fieldKey === "agreementCapitalAmount" && metadata.agreementType === "Financier";
}

export function createDefaultTaskForm(): {
  title: string;
  description: string;
  dueDate: string;
  assignedToId: string;
  metadata: Record<string, string>;
} {
  return {
    title: "",
    description: "",
    dueDate: "",
    assignedToId: "",
    metadata: {}
  };
}
