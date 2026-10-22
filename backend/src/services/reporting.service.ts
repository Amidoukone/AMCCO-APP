import { drawSectorReportHeader, drawSectorReportFooter, drawReportTable } from "./report-pdf-layout.js";
import { Buffer } from "node:buffer";
import { listBeverageProducts, listBeverageStockAdjustments } from "../repositories/beverage-stock.repository.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import {
  buildActivityReportHighlights,
  getBusinessActivityProfile,
} from "../config/business-activity-profiles.js";
import { HttpError } from "../errors/http-error.js";
import {
  getDashboardCompanySummary,
  listDashboardFinanceActivitySummary,
  getDashboardFinanceSummary,
  getDashboardOperationsSummary,
  listGeneralStoreLedgerTransactions,
  listDashboardOperationalTasks,
  listDashboardOperationalTransactions,
  listDashboardRecentTasks,
  listDashboardRecentTransactions,
  listDashboardTaskActivitySummary,
  listDashboardWorkload,
  listReportFinanceByActivity,
  listReportFinanceByStatus,
  listReportFinanceByType,
  listReportBtpTransactions,
  listReportGeneralStoreInventorySnapshots,
  listReportGeneralStoreTransactions,
  listReportHardwareTransactions,
  listReportOperationalTasks,
  listReportOperationalTransactions,
  listReportRentalTransactions,
  listReportTaskByActivity,
  listReportTaskByStatus,
  listTasksForExport,
  listTransactionsForExport,
  toTaskExportRecord,
  toTransactionExportRecord,
  type ReportPeriodFilter,
  type AgricultureOperationsReport,
  type AgencyOperationsReport,
  type BtpOperationsReport,
  type DailyActivitiesReport,
  type BeverageDepotReport,
  type DashboardSummary,
  type DashboardOperationalMetadataKeys,
  type DashboardOperationalTask,
  type DashboardOperationalTransaction,
  type FishFarmingOperationsReport,
  type FoodOperationsReport,
  type GeneralExpensesReport,
  type GeneralStoreInventorySnapshot,
  type GeneralStoreOperationsReport,
  type GeneralStoreOperationsReportRow,
  type HardwareMonthlyReport,
  type HydrocarbonOperationsReport,
  type HotelOperationsReport,
  type LivestockOperationsReport,
  type RentalOperationsReport,
  type WaterOperationsReport,
  type ReportOperationalMetric,
  type ReportOperationalTask,
  type ReportOperationalTransaction,
  type ReportsOverview,
  type TransportOperationsReport
} from "../repositories/reporting.repository.js";
import {
  getFinancialAccountsSummary,
  listFinancialAccounts,
  type FinancialAccount
} from "../repositories/finance.repository.js";
import { listRentalTenants, type RentalTenant } from "../repositories/rental-tenants.repository.js";
import {
  listGeneralStoreShops,
  type GeneralStoreShop
} from "../repositories/general-store-shops.repository.js";
import {
  listBtpProjects,
  type BtpProject
} from "../repositories/btp-projects.repository.js";
import {
  BUSINESS_ACTIVITIES,
  BUSINESS_ACTIVITY_LABELS,
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

type ReportFiltersInput = {
  dateFrom?: string;
  dateTo?: string;
  activityCode?: string;
};

const DASHBOARD_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"];
const REPORTING_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"];
type DashboardOperationalDimensions = NonNullable<
  ReturnType<typeof getBusinessActivityProfile>["reporting"]["operationalDimensions"]
>;
const DASHBOARD_OPERATIONAL_DIMENSIONS_BY_ACTIVITY = Object.fromEntries(
  BUSINESS_ACTIVITIES.map(({ code }) => [
    code,
    getBusinessActivityProfile(code).reporting.operationalDimensions ?? []
  ])
) as Record<BusinessActivityCode, DashboardOperationalDimensions>;
const DASHBOARD_OPERATIONAL_METADATA_KEYS = Object.fromEntries(
  BUSINESS_ACTIVITIES.map(({ code }) => [
    code,
    DASHBOARD_OPERATIONAL_DIMENSIONS_BY_ACTIVITY[code].map(({ key }) => key)
  ])
) as DashboardOperationalMetadataKeys;
const SECTOR_RULES_VERSION = "amcco-sector-rules-v2";
const PDF_PAGE_MARGIN = 40;
const PDF_CONTENT_TOP = 96;
const PDF_CONTENT_BOTTOM = 70;
const AMCCO_LOGO_PATH = fileURLToPath(
  new URL("../../../frontend/images/LOGO AMCCO.jpg.jpeg", import.meta.url)
);
const HARDWARE_REPORT_BRANDING = {
  title: "QUINCAILLERIE GENERALE 2020",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const GENERAL_EXPENSES_REPORT_BRANDING = {
  title: "DÉPENSES GÉNÉRALES",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const GENERAL_EXPENSE_KIND_LABELS: Record<string, string> = {
  PDG_SUPPLIES: "Achat matériel / fournitures",
  PDG_TRANSPORT: "Carburant / transport",
  PDG_SUPPLIER_PAYMENT: "Paiement fournisseur / prestataire",
  PDG_TRANSFER_ADVANCE: "Virement / avance / transfert",
  PDG_INVESTMENT: "Investissement",
  PDG_LOAN: "Prêt",
  PDG_OVERHEAD: "Frais généraux / divers",
  EMPLOYEE_MEALS: "Repas",
  EMPLOYEE_FUEL: "Carburant",
  EMPLOYEE_VEHICLE_UPKEEP: "Entretien véhicule",
  EMPLOYEE_SUPPLIES: "Fournitures / consommables",
  EMPLOYEE_OTHER: "Autre dépense",
  // Conservés uniquement pour libeller correctement les anciennes dépenses
  // déjà enregistrées avant que les salaires ne soient déplacés vers le
  // module Salaires dédié. Ne plus proposer à la saisie.
  PDG_PAYROLL: "Salaire / cotisation (ancien)",
  EMPLOYEE_PAYROLL: "Salaire (ancien)"
};
const REPORT_READING_GUIDE_ROWS: Array<{
  term: string;
  definition: string;
  formula: string;
  useCase: string;
  includeInPdf: boolean;
}> = [
  {
    term: "Comptabilisé",
    definition: "Transaction enregistrée ou finalisée, prise en compte dans les soldes.",
    formula: "SUBMITTED + APPROVED",
    useCase: "Base des totaux financiers et de la rentabilité.",
    includeInPdf: true
  },
  {
    term: "Entrées XOF",
    definition: "Recettes comptabilisées en franc CFA sur le périmètre filtré.",
    formula: "Somme CASH_IN XOF",
    useCase: "Lecture des encaissements du secteur.",
    includeInPdf: false
  },
  {
    term: "Sorties XOF",
    definition: "Dépenses comptabilisées en franc CFA sur le périmètre filtré.",
    formula: "Somme CASH_OUT XOF",
    useCase: "Lecture des charges et coûts terrain.",
    includeInPdf: false
  },
  {
    term: "Net XOF",
    definition: "Solde opérationnel du périmètre filtré.",
    formula: "Entrées XOF - Sorties XOF",
    useCase: "Repérer le résultat par secteur ou sous-section.",
    includeInPdf: true
  },
  {
    term: "Marge",
    definition: "Part du solde conservée sur les recettes.",
    formula: "Net XOF / Entrées XOF",
    useCase: "Comparer la qualité des recettes.",
    includeInPdf: true
  },
  {
    term: "Rent. coûts",
    definition: "Rentabilité sur les coûts engagés.",
    formula: "Net XOF / Sorties XOF",
    useCase: "Mesurer le retour obtenu sur les dépenses.",
    includeInPdf: true
  },
  {
    term: "EXEC",
    definition: "Taux d'exécution des tâches du périmètre.",
    formula: "Tâches terminées / Total tâches",
    useCase: "Suivre l'avancement terrain.",
    includeInPdf: true
  },
  {
    term: "Blocages / Retards",
    definition: "Blocages: tâches bloquées. Retards: tâches ouvertes après échéance.",
    formula: "Comptage tâches",
    useCase: "Identifier les points à arbitrer rapidement.",
    includeInPdf: true
  }
];
const AGRICULTURE_OPERATION_LABELS: Record<string, string> = {
  INPUT_PURCHASE: "Achat intrants",
  FIELD_EXPENSE: "Travaux champ",
  HARVEST_SALE: "Vente récolte",
  SUPPORT_INCOME: "Appui / subvention"
};
const AGRICULTURE_TASK_LABELS: Record<string, string> = {
  PREPARATION: "Préparation",
  SOWING: "Semis",
  MAINTENANCE: "Entretien",
  TREATMENT: "Traitement",
  HARVEST: "Récolte",
  STORAGE: "Stockage",
  FOLLOW_UP: "Suivi terrain"
};
const AGRICULTURE_REPORT_BRANDING = {
  title: "ACTIVITE AGRICOLE",
  subtitle: "Suivi de campagne, parcelles, cultures et opérations terrain",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO"
};
const GENERAL_STORE_OPERATION_LABELS: Record<string, string> = {
  ACHAT: "Achat boutique",
  RECOUVREMENT: "Recouvrement"
};
const GENERAL_STORE_REPORT_BRANDING = {
  title: "MAGASIN (COMMERCE GENERAL)",
  subtitle: "Suivi des achats livrés et des recouvrements par boutique",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const FOOD_OPERATION_LABELS: Record<string, string> = {
  PRODUCT_SALE: "Vente produit",
  PRODUCT_PURCHASE: "Achat stock",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  STOCK_LOSS: "Perte / péremption",
  COLD_CHAIN_EXPENSE: "Chaîne du froid",
  PACKAGING_EXPENSE: "Emballage",
  CUSTOMER_REFUND: "Remboursement client"
};
const FOOD_TASK_LABELS: Record<string, string> = {
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
const FOOD_REPORT_BRANDING = {
  title: "ALIMENTATION",
  subtitle: "Suivi des achats, ventes, lots, DLC, pertes, chaîne du froid et contrôles",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const RENTAL_REPORT_BRANDING = {
  title: "LOCATION IMMOBILIÈRE",
  subtitle: "Suivi mensuel des paiements de loyer par locataire",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const HOTEL_OPERATION_LABELS: Record<string, string> = {
  ROOM_PAYMENT: "Paiement chambre",
  BOOKING_DEPOSIT: "Acompte réservation",
  RESTAURANT_SALE: "Restauration",
  EVENT_SERVICE: "Evenement / salle",
  LAUNDRY_SERVICE: "Blanchisserie",
  ROOM_MAINTENANCE: "Maintenance chambre",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  COMMISSION_FEE: "Commission",
  TAX_PAYMENT: "Taxe séjour",
  GUEST_REFUND: "Remboursement client"
};
const HOTEL_TASK_LABELS: Record<string, string> = {
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
const HOTEL_REPORT_BRANDING = {
  title: "HOTELLERIE / AUBERGE",
  subtitle: "Suivi des réservations, chambres, nuitées, restauration, services, charges et maintenance",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const WATER_OPERATION_LABELS: Record<string, string> = {
  WATER_SALE: "Vente de paquets d'eau",
  WATER_OTHER_INCOME: "Autre recette",
  WATER_EXPENSE_MEALS: "Repas",
  WATER_EXPENSE_FUEL: "Carburant (essence / gazoil)",
  WATER_EXPENSE_VEHICLE_UPKEEP: "Entretien moto / véhicule",
  WATER_EXPENSE_PACKAGING_LOSS: "Emballage / paquet perdu",
  WATER_EXPENSE_SUPPLIES: "Fournitures (lait, sucre, etc.)",
  WATER_EXPENSE_ENERGY: "Énergie / combustible",
  WATER_EXPENSE_CLEANING: "Nettoyage / balayage",
  WATER_EXPENSE_MAINTENANCE: "Entretien équipement / réparation",
  WATER_EXPENSE_SUPPLIER: "Paiement fournisseur",
  WATER_EXPENSE_OTHER: "Autre dépense"
};
const WATER_REPORT_BRANDING = {
  title: "PRODUCTION D'EAU POTABLE",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const AGENCY_OPERATION_LABELS: Record<string, string> = {
  SALE_COMMISSION: "Commission vente",
  RENTAL_COMMISSION: "Commission location",
  MANDATE_FEE: "Frais mandat",
  VISIT_FEE: "Frais visite",
  FILE_FEE: "Frais dossier",
  ADVERTISING_EXPENSE: "Publicité",
  FIELD_VISIT_EXPENSE: "Déplacement visite",
  BROKER_PAYOUT: "Reversement courtier",
  DOCUMENT_EXPENSE: "Frais document",
  CUSTOMER_REFUND: "Remboursement client",
  OFFICE_EXPENSE: "Charge agence"
};
const AGENCY_TASK_LABELS: Record<string, string> = {
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
const AGENCY_REPORT_BRANDING = {
  title: "AGENCE IMMOBILIERE",
  subtitle: "Suivi des mandats, biens, visites, offres, commissions, frais et closing",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const BTP_OPERATION_LABELS: Record<string, string> = {
  CLIENT_PAYMENT: "Encaissement client",
  MATERIAL_PURCHASE: "Achat matériaux",
  LABOR_PAYMENT: "Main-d'oeuvre",
  EQUIPMENT_RENTAL: "Location engin",
  SUBCONTRACTING: "Sous-traitance",
  SITE_EXPENSE: "Charge chantier"
};
const BTP_REPORT_BRANDING = {
  title: "BÂTIMENT ET TRAVAUX PUBLICS",
  subtitle: "Encaissements, coûts par nature et marge par chantier",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};
const FISH_FARMING_OPERATION_LABELS: Record<string, string> = {
  FINGERLING_PURCHASE: "Achat alevins",
  FEED_PURCHASE: "Achat aliment",
  POND_EXPENSE: "Charge bassin",
  FISH_SALE: "Vente poisson",
  SUPPORT_INCOME: "Appui / subvention"
};
const FISH_FARMING_TASK_LABELS: Record<string, string> = {
  FEEDING: "Nourrissage",
  WATER_CONTROL: "Contrôle eau",
  TREATMENT: "Traitement sanitaire",
  SORTING: "Tri / calibrage",
  HARVEST: "Récolte",
  STOCKING: "Mise en charge",
  FOLLOW_UP: "Suivi bassin"
};
const FISH_FARMING_REPORT_BRANDING = {
  title: "PISCICULTURE",
  subtitle: "Suivi des bassins, cycles d'élevage, aliments, ventes et alertes sanitaires",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO"
};
const LIVESTOCK_OPERATION_LABELS: Record<string, string> = {
  ANIMAL_PURCHASE: "Achat animaux",
  FEED_PURCHASE: "Achat aliment",
  VET_CARE: "Soins veterinaires",
  FARM_EXPENSE: "Charge élevage",
  ANIMAL_SALE: "Vente animaux",
  PRODUCT_SALE: "Vente produits",
  SUPPORT_INCOME: "Appui / subvention"
};
const LIVESTOCK_TASK_LABELS: Record<string, string> = {
  FEEDING: "Nourrissage",
  HEALTH_CHECK: "Contrôle sanitaire",
  VACCINATION: "Vaccination",
  TREATMENT: "Traitement",
  CLEANING: "Nettoyage enclos",
  BREEDING: "Reproduction",
  SALE_PREP: "Préparation vente",
  FOLLOW_UP: "Suivi élevage"
};
const LIVESTOCK_REPORT_BRANDING = {
  title: "ELEVAGE",
  subtitle: "Suivi des troupeaux, lots, espèces, alimentation, soins, ventes et mortalité",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO"
};

function ensureDashboardAccess(role: RoleCode): void {
  if (!DASHBOARD_ROLES.includes(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour acceder au tableau de bord.");
  }
}

function ensureReportingAccess(role: RoleCode): void {
  if (!REPORTING_ROLES.includes(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour acceder aux rapports.");
  }
}

function ensureSectorReportFilter(
  filters: ReportPeriodFilter
): asserts filters is ReportPeriodFilter & { activityCode: BusinessActivityCode } {
  if (!filters.activityCode) {
    throw new HttpError(400, "Sélectionnez un secteur pour consulter le rapport.");
  }
}

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(",");
  const lines = rows.map((row) => row.map((value) => escapeCsvValue(value)).join(","));
  return [headerLine, ...lines].join("\n");
}

function toDisplayPeriodLabel(filters: { dateFrom?: string; dateTo?: string }): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  const fromLabel = filters.dateFrom
    ? new Date(filters.dateFrom).toLocaleDateString("fr-FR")
    : "origine";
  const toLabel = filters.dateTo
    ? new Date(filters.dateTo).toLocaleDateString("fr-FR")
    : "aujourd'hui";

  return `${fromLabel} -> ${toLabel}`;
}

function toGeneralExpensesPeriodLabel(filters: { dateFrom?: string; dateTo?: string }): string {
  const fromLabel = filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString("fr-FR") : null;
  const toLabel = filters.dateTo ? new Date(filters.dateTo).toLocaleDateString("fr-FR") : null;

  if (fromLabel && toLabel) return `Du ${fromLabel} au ${toLabel}`;
  if (fromLabel) return `Depuis le ${fromLabel}`;
  if (toLabel) return `Jusqu'au ${toLabel}`;
  return "Toutes périodes";
}

function toDisplayActivityLabel(activityCode?: BusinessActivityCode): string {
  if (!activityCode) {
    return "Toutes activités";
  }
  return BUSINESS_ACTIVITY_LABELS[activityCode];
}

function toDisplayAccountScopeLabel(input: {
  scopeType: "GLOBAL" | "DEDICATED" | "RESTRICTED";
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): string {
  if (input.scopeType === "GLOBAL") {
    return "Global entreprise";
  }

  if (input.scopeType === "DEDICATED") {
    return input.primaryActivityCode
      ? `Dedie: ${BUSINESS_ACTIVITY_LABELS[input.primaryActivityCode]}`
      : "Dedie";
  }

  return input.allowedActivityCodes.length > 0
    ? `Restreint: ${input.allowedActivityCodes
        .map((activityCode) => BUSINESS_ACTIVITY_LABELS[activityCode])
        .join(", ")}`
    : "Restreint";
}

function toDisplayAccountCompatibilityLabel(isCompatible: boolean): string {
  return isCompatible ? "Compatible" : "Hors secteur";
}

function resolveWorksheetColumns(
  rows: Array<Record<string, unknown>>,
  configuredColumns?: string[]
): string[] {
  if (configuredColumns && configuredColumns.length > 0) {
    return configuredColumns;
  }

  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return Array.from(columns);
}

function formatWorksheetForExport(
  worksheet: XLSX.WorkSheet,
  rows: Array<Record<string, unknown>>,
  columns: string[]
): void {
  if (columns.length === 0) {
    return;
  }

  const range = worksheet["!ref"]
    ? XLSX.utils.decode_range(worksheet["!ref"])
    : {
        s: { c: 0, r: 0 },
        e: { c: columns.length - 1, r: Math.max(rows.length, 0) }
      };

  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { c: range.s.c, r: range.s.r },
      e: { c: range.e.c, r: range.s.r }
    })
  };

  worksheet["!cols"] = columns.map((column) => {
    const maxContentLength = rows.reduce((max, row) => {
      const value = row[column];
      if (value === null || value === undefined) {
        return max;
      }
      return Math.max(max, String(value).length);
    }, column.length);

    return {
      wch: Math.min(Math.max(maxContentLength + 2, 12), 48)
    };
  });
}

function buildWorkbookBuffer(
  sheets: Array<{
    name: string;
    rows: Array<Record<string, unknown>>;
    columns?: string[];
  }>
): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const columns = resolveWorksheetColumns(sheet.rows, sheet.columns);
    const worksheet =
      sheet.rows.length > 0
        ? XLSX.utils.json_to_sheet(sheet.rows, {
            header: columns
          })
        : XLSX.utils.aoa_to_sheet([columns]);
    formatWorksheetForExport(worksheet, sheet.rows, columns);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  }) as Buffer;
}

function buildOverviewMetadataRows(filters: ReportPeriodFilter): Array<Record<string, unknown>> {
  return [
    {
      generatedAt: new Date().toISOString(),
      period: toDisplayPeriodLabel(filters),
      activity: toDisplayActivityLabel(filters.activityCode),
      dateFrom: filters.dateFrom ?? "",
      dateTo: filters.dateTo ?? ""
    }
  ];
}

function buildReportReadingGuideRows(): Array<Record<string, unknown>> {
  return REPORT_READING_GUIDE_ROWS.map((item) => ({
    term: item.term,
    definition: item.definition,
    formula: item.formula,
    useCase: item.useCase
  }));
}

type BufferedPdfPage = {
  content?: {
    uncompressedLength?: number;
    buffer?: Buffer[];
  };
};

type BufferedPdfDocument = {
  _pageBuffer?: BufferedPdfPage[];
  page: unknown;
};

function getBufferedPdfPageContentLength(page: BufferedPdfPage): number {
  const explicitLength = page.content?.uncompressedLength;
  if (typeof explicitLength === "number") {
    return explicitLength;
  }
  return page.content?.buffer?.reduce((sum, item) => sum + item.length, 0) ?? 0;
}

function trimTrailingBlankPdfPages(doc: PDFKit.PDFDocument): void {
  const bufferedDoc = doc as unknown as BufferedPdfDocument;
  const pageBuffer = bufferedDoc._pageBuffer;
  if (!pageBuffer || pageBuffer.length <= 1) {
    return;
  }

  while (pageBuffer.length > 1) {
    const lastPage = pageBuffer[pageBuffer.length - 1];
    if (!lastPage || getBufferedPdfPageContentLength(lastPage) > 24) {
      break;
    }
    pageBuffer.pop();
  }

  const currentPage = pageBuffer[pageBuffer.length - 1];
  if (currentPage) {
    bufferedDoc.page = currentPage;
  }
}

function needsPdfPageBreak(doc: PDFKit.PDFDocument, requiredHeight: number): boolean {
  return doc.y + requiredHeight > doc.page.height - PDF_CONTENT_BOTTOM;
}

async function buildPdfBuffer(
  render: (doc: PDFKit.PDFDocument) => void,
  decorate?: (doc: PDFKit.PDFDocument, pageNumber: number, totalPages: number) => void,
  options?: { layout?: "portrait" | "landscape" }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: options?.layout ?? "portrait",
      margin: 40,
      bufferPages: true
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    render(doc);
    trimTrailingBlankPdfPages(doc);

    if (decorate) {
      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
        doc.switchToPage(pageRange.start + pageIndex);
        decorate(doc, pageIndex + 1, pageRange.count);
      }
    }

    doc.end();
  });
}

function writePdfSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown();
  doc.fontSize(14).text(title, {
    underline: true
  });
  doc.moveDown(0.4);
}

function writePdfList(
  doc: PDFKit.PDFDocument,
  rows: string[],
  emptyMessage: string
): void {
  if (rows.length === 0) {
    doc.fontSize(10).text(emptyMessage);
    return;
  }

  for (const row of rows) {
    doc.fontSize(10).text(`- ${row}`);
  }
}

function limitPdfRows(rows: string[], limit = 20): string[] {
  if (rows.length <= limit) {
    return rows;
  }

  return [
    ...rows.slice(0, limit),
    `${rows.length - limit} ligne(s) supplementaire(s) disponibles dans l'export Excel.`
  ];
}

function toDisplayTransactionStatusLabel(
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"
): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "SUBMITTED") {
    return "Enregistrée";
  }
  if (status === "APPROVED") {
    return "Finalisée";
  }
  return "Rejetée";
}

function isReportableFinancialStatus(
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"
): boolean {
  return status === "SUBMITTED" || status === "APPROVED";
}

function isSectorReportableTransaction(
  transaction: ReportOperationalTransaction,
  activityCode: BusinessActivityCode
): boolean {
  return (
    transaction.activityCode === activityCode &&
    transaction.currency === "XOF" &&
    isReportableFinancialStatus(transaction.status)
  );
}

function toDisplayTransactionTypeLabel(type: "CASH_IN" | "CASH_OUT"): string {
  return type === "CASH_IN" ? "Entrée" : "Sortie";
}

function toDisplayTaskStatusLabel(status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"): string {
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

function drawAmccoPdfLogo(doc: PDFKit.PDFDocument, x: number, y: number, size = 28): void {
  doc.save();
  if (existsSync(AMCCO_LOGO_PATH)) {
    try {
      doc.image(AMCCO_LOGO_PATH, x, y, {
        fit: [size, size],
        align: "center",
        valign: "center"
      });
      doc.restore();
      return;
    } catch {
      // Keep the PDF export available even if the local image cannot be decoded.
    }
  }

  doc.roundedRect(x, y, size, size, Math.max(6, size / 4)).fill("#0f2544");
  doc
    .fillColor("#ffffff")
    .fontSize(size * 0.56)
    .font("Helvetica-Bold")
    .text("A", x + size * 0.3, y + size * 0.2, {
      width: size * 0.4,
      align: "center"
    });
  doc.restore();
}

function drawPdfBrandingFrame(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string,
  reportTitle = "Rapport consolide"
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc.rect(0, 0, pageWidth, 74).fill("#f4f7fb");
  doc.moveTo(margin, 74).lineTo(pageWidth - margin, 74).strokeColor("#d7e3f1").lineWidth(1).stroke();

  drawAmccoPdfLogo(doc, margin, 22);

  doc
    .fillColor("#0f2544")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("AMCCO", margin + 40, 24, {
      width: 120
    });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(9)
    .text(reportTitle, margin + 40, 44, {
      width: 160
    });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(9)
    .text(`Période: ${periodLabel}`, pageWidth - margin - 190, 28, {
      width: 190,
      align: "right"
    });

  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#d7e3f1")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text("AMCCO APP - Export reporting", margin, pageHeight - 32, {
      width: 180,
      lineBreak: false
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right",
      lineBreak: false
    });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

function normalizePdfSpacing(value: string): string {
  return value.replace(/\u00a0|\u202f/g, " ");
}

function formatPdfDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return normalizePdfSpacing(new Intl.DateTimeFormat("fr-FR").format(date));
}

function formatPdfNumber(value: string | number, maximumFractionDigits = 0): string {
  return normalizePdfSpacing(
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits
    }).format(toNumberAmount(value))
  );
}

function formatPdfMoney(value: string | number): string {
  return `${formatPdfNumber(value)} F CFA`;
}

function truncatePdfText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}.`;
}

function drawHardwareInventoryMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.lineWidth(0.8).strokeColor("#111827");

  const palletY = y + 45;
  for (let index = 0; index < 3; index += 1) {
    doc.rect(x + index * 3, palletY + index * 4, 62, 6).fillAndStroke("#c88a3d", "#111827");
  }

  doc.strokeColor("#4b5563").lineWidth(2.2);
  for (let index = 0; index < 5; index += 1) {
    doc
      .moveTo(x + 58 + index * 5, y + 12)
      .lineTo(x + 98 + index * 5, y + 5)
      .stroke();
  }

  doc.lineWidth(0.8).strokeColor("#111827");
  doc.roundedRect(x + 8, y + 5, 44, 36, 4).fillAndStroke("#e5b15b", "#111827");
  doc
    .fillColor("#7f1d1d")
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("CIMENT", x + 13, y + 19, {
      width: 34,
      align: "center"
    });

  doc.rect(x + 55, y + 21, 10, 24).fillAndStroke("#d1d5db", "#111827");
  doc.rect(x + 70, y + 18, 10, 27).fillAndStroke("#d1d5db", "#111827");
  doc.rect(x + 85, y + 15, 10, 30).fillAndStroke("#d1d5db", "#111827");
  doc.restore();
}

type PdfTableColumn = {
  label: string;
  width: number;
  align: "left" | "center" | "right";
};

const HARDWARE_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "DATE", width: 72, align: "center" },
  { label: "DÉSIGNATION", width: 169, align: "center" },
  { label: "QUANTITÉ", width: 68, align: "center" },
  { label: "PRIX UNITAIRE", width: 105, align: "center" },
  { label: "MONTANT", width: 105, align: "center" },
  { label: "BÉNÉFICE", width: 105, align: "center" },
  { label: "DESTINATAIRE", width: 137, align: "center" }
];

function fitPdfColumns(doc: PDFKit.PDFDocument, columns: PdfTableColumn[]): PdfTableColumn[] {
  const scale = (doc.page.width - PDF_PAGE_MARGIN * 2) / columns.reduce((sum, column) => sum + column.width, 0);
  return columns.map((column) => ({ ...column, width: column.width * scale }));
}

function drawPdfTableCell(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    align?: "left" | "center" | "right";
    fill?: string;
    font?: "Helvetica" | "Helvetica-Bold";
    fontSize?: number;
    textColor?: string;
    borderColor?: string;
    verticalAlign?: "center" | "top";
  } = {}
): void {
  const align = options.align ?? "left";
  const fontSize = options.fontSize ?? 8;
  const font = options.font ?? "Helvetica";
  const borderColor = options.borderColor ?? "#111827";

  doc.save();
  if (options.fill) {
    doc.rect(x, y, width, height).fill(options.fill);
  }
  doc.rect(x, y, width, height).strokeColor(borderColor).lineWidth(0.7).stroke();
  doc
    .fillColor(options.textColor ?? "#111827")
    .font(font)
    .fontSize(fontSize)
    .text(text, x + 4, options.verticalAlign === "top" ? y + 5 : y + Math.max(3, (height - fontSize) / 2 - 1), {
      width: width - 8,
      height: height - 4,
      align
  });
  doc.restore();
}

function drawPdfReadingGuideBox(doc: PDFKit.PDFDocument): void {
  const rows = REPORT_READING_GUIDE_ROWS.filter((item) => item.includeInPdf);
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;
  const titleHeight = 24;
  const headerHeight = 18;
  const rowHeight = 30;
  const totalHeight = titleHeight + headerHeight + rows.length * rowHeight + 14;

  if (needsPdfPageBreak(doc, totalHeight)) {
    doc.addPage();
    doc.y = PDF_CONTENT_TOP;
  }

  const y = doc.y;
  doc.roundedRect(margin, y, tableWidth, totalHeight, 4).fill("#f8fafc");
  doc.rect(margin, y, tableWidth, totalHeight).strokeColor("#d9e2ec").lineWidth(0.8).stroke();
  doc
    .fillColor("#102a43")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Guide de lecture des colonnes", margin + 10, y + 8, {
      width: tableWidth - 20
    });

  const columns: PdfTableColumn[] = [
    { label: "ELEMENT", width: 82, align: "left" },
    { label: "DEFINITION", width: 265, align: "left" },
    { label: "CALCUL / USAGE", width: tableWidth - 347, align: "left" }
  ];
  let tableY = y + titleHeight;
  let x = margin;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, tableY, column.width, headerHeight, {
      align: column.align,
      fill: "#e5eef8",
      font: "Helvetica-Bold",
      fontSize: 6.8,
      borderColor: "#cbd5e1"
    });
    x += column.width;
  }
  tableY += headerHeight;

  for (const row of rows) {
    const values = [
      row.term,
      row.definition,
      row.formula ? `${row.formula}. ${row.useCase}` : row.useCase
    ];
    x = margin;
    values.forEach((value, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, value, x, tableY, column.width, rowHeight, {
        align: column.align,
        font: index === 0 ? "Helvetica-Bold" : "Helvetica",
        fontSize: 6.5,
        borderColor: "#d9e2ec"
      });
      x += column.width;
    });
    tableY += rowHeight;
  }

  doc.y = y + totalHeight + 10;
}

function drawHardwareReportHeader(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  drawSectorReportHeader(doc, "QUINCAILLERIE", toHardwarePdfTitle(report), (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawHardwareContinuationHeader(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  drawSectorContinuationHeader(doc, toHardwarePdfTitle(report), report.periodLabel);
}

function drawSectorContinuationHeader(doc: PDFKit.PDFDocument, title: string, periodLabel: string): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;

  drawAmccoPdfLogo(doc, margin, 22, 34);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${title} - suite`, margin + 44, 28, {
      width: pageWidth - margin * 2 - 88
    });
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Période : ${periodLabel}`, margin + 44, 43, {
      width: pageWidth - margin * 2 - 88
    });
  doc
    .moveTo(margin, 62)
    .lineTo(pageWidth - margin, 62)
    .strokeColor("#d7e3f1")
    .lineWidth(1)
    .stroke();
  doc.y = 76;
}

function drawHardwareMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: HardwareMonthlyReport,
  _filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = report.periodLabel;

  doc.roundedRect(margin, y, width, 50, 4).fill("#f8fafc");
  doc.rect(margin, y, width, 50).strokeColor("#d7e3f1").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Période", margin + 10, y + 10, { width: 160 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(period, margin + 10, y + 26, { width: 190 });
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Secteur", margin + 220, y + 10, { width: 110 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text("Quincaillerie", margin + 220, y + 26, { width: 130 });
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Généré le", pageWidth - margin - 160, y + 10, {
      width: 150,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 160, y + 26, {
      width: 150,
      align: "right"
    });
  doc.y = y + 64;
}

function drawHardwareMetricCards(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Quantité totale", value: formatPdfNumber(report.totals.quantity, 2) },
    { label: "Montant total achats", value: formatPdfMoney(report.totals.purchaseAmount) },
    { label: "Bénéfice total", value: formatPdfMoney(report.totals.grossProfit) },
    { label: "Lignes d'achat", value: formatPdfNumber(report.totals.transactionsCount, 0) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 54, 4).fill("#f7fbf4");
    doc.rect(x, y, cardWidth, 54).strokeColor("#c9d8bf").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(metric.label, x + 8, y + 10, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(metric.value, x + 8, y + 27, {
        width: cardWidth - 16,
        align: "center"
      });
  });
  doc.y = y + 70;
}

function toHardwarePdfTitle(_report: HardwareMonthlyReport): string {
  return "RAPPORT DES ACHATS - QUINCAILLERIE";
}

function drawHardwareTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of HARDWARE_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: column.align,
      fill: "#e7f1dc",
      font: "Helvetica-Bold",
      fontSize: 8.5
    });
    x += column.width;
  }
  return y + 27;
}

function drawHardwareDataRow(
  doc: PDFKit.PDFDocument,
  row: HardwareMonthlyReport["rows"][number],
  y: number
): number {
  const values = [
    { value: formatPdfDate(row.date), align: "center" as const },
    { value: truncatePdfText(row.designation, 24), align: "center" as const },
    { value: row.quantity > 0 ? formatPdfNumber(row.quantity, 2) : "—", align: "center" as const },
    {
      value: toNumberAmount(row.purchaseUnitPrice) > 0 ? formatPdfMoney(row.purchaseUnitPrice) : "—",
      align: "center" as const
    },
    { value: formatPdfMoney(row.purchaseAmount), align: "center" as const },
    { value: formatPdfMoney(row.grossProfit), align: "center" as const },
    { value: truncatePdfText(row.recipientRef, 25), align: "center" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = HARDWARE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 24, {
      align: item.align,
      fontSize: 10.5
    });
    x += column.width;
  });
  return y + 24;
}

function drawHardwareTotalsRow(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport, y: number): number {
  const firstColumnsWidth = HARDWARE_PDF_COLUMNS[0].width + HARDWARE_PDF_COLUMNS[1].width;
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 27, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  x += firstColumnsWidth;

  const totalValues = [
    formatPdfNumber(report.totals.quantity, 2),
    "—",
    formatPdfMoney(report.totals.purchaseAmount),
    formatPdfMoney(report.totals.grossProfit)
  ];
  for (let index = 0; index < totalValues.length; index += 1) {
    const column = HARDWARE_PDF_COLUMNS[index + 2];
    drawPdfTableCell(doc, totalValues[index], x, y, column.width, 27, {
      align: "center",
      fill: index === 0 ? "#e7f1dc" : "#f7fbf4",
      font: "Helvetica-Bold",
      fontSize: 11
    });
    x += column.width;
  }

  const recipientColumn = HARDWARE_PDF_COLUMNS[6];
  drawPdfTableCell(doc, "", x, y, recipientColumn.width, 27, {
    fill: "#f7fbf4"
  });

  return y + 27;
}

function drawHardwareEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#fff7ed");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#fed7aa").lineWidth(0.8).stroke();
  doc
    .fillColor("#9a3412")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Aucun achat détaillé à afficher", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#7c2d12")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Le tableau reprend les acquisitions avec une désignation d'article. Vérifiez la période ou les informations de l'achat si ce résultat est inattendu.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawHardwareMonthlyTable(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  if (report.rows.length === 0) {
    drawHardwareEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (doc.y + 27 + 24 + 27 > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
  }
  let y = drawHardwareTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 24 + 27 > tableBottom) {
      doc.addPage();
      drawHardwareContinuationHeader(doc, report);
      y = drawHardwareTableHeader(doc, doc.y);
    }
    y = drawHardwareDataRow(doc, row, y);
  }

  if (y + 27 > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
    y = drawHardwareTableHeader(doc, doc.y);
  }
  doc.y = drawHardwareTotalsRow(doc, report, y) + 12;
}

function drawHardwareRecipientTable(
  doc: PDFKit.PDFDocument,
  report: HardwareMonthlyReport,
  asOfDateLabel: string
): void {
  if (report.recipientRows.length === 0) return;

  const margin = PDF_PAGE_MARGIN;
  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const widths = [0.19, 0.135, 0.135, 0.135, 0.135, 0.135, 0.135]
    .map((part) => (doc.page.width - margin * 2) * part);
  const rowHeight = 25;
  const totalHeight = 30;
  const noteReserve = 30;
  const firstPageRows = Math.min(report.recipientRows.length, 2);
  const firstRecipientBlockHeight = 20 + 28 + firstPageRows * rowHeight +
    (report.recipientRows.length <= 2 ? totalHeight + 10 + noteReserve : 0);
  const headers = ["DESTINATAIRE", "ACHATS", "BÉNÉFICE", "ATTENDU", "RECOUVRÉ", "ÉCART ACHATS", "RESTE"];
  const drawHeader = (startY: number): number => {
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11)
      .text(`SITUATION CUMULATIVE DES REMISES ET RECOUVREMENTS AU ${asOfDateLabel}`, margin, startY, {
        width: doc.page.width - margin * 2
      });
    let x = margin;
    const y = startY + 20;
    headers.forEach((header, index) => {
      drawPdfTableCell(doc, header, x, y, widths[index], 28, {
        align: "center", fill: "#e7f1dc", font: "Helvetica-Bold", fontSize: 8
      });
      x += widths[index];
    });
    return y + 28;
  };
  if (doc.y + firstRecipientBlockHeight > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
  }
  let y = drawHeader(doc.y);
  for (const [index, row] of report.recipientRows.entries()) {
    const remainingRows = report.recipientRows.length - index;
    const requiredHeight = remainingRows <= 3
      ? remainingRows * rowHeight + totalHeight + 10 + noteReserve
      : rowHeight * 2;
    if (y + requiredHeight > tableBottom) {
      doc.addPage();
      drawHardwareContinuationHeader(doc, report);
      y = drawHeader(doc.y);
    }
    const values = [row.recipientRef, row.purchaseAmount, row.grossProfit,
      row.expectedReturnAmount, row.collectedAmount, row.purchaseVarianceAmount, row.balanceAmount];
    let x = margin;
    values.forEach((value, index) => {
      drawPdfTableCell(doc, index === 0 ? truncatePdfText(value, 30) : formatPdfMoney(value),
        x, y, widths[index], rowHeight, { align: "center", fontSize: 8 });
      x += widths[index];
    });
    y += rowHeight;
  }
  if (y + totalHeight + 10 + noteReserve > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
    y = drawHeader(doc.y);
  }
  const totals = report.totals;
  const totalValues = ["TOTAL", totals.assignedPurchaseAmount, totals.assignedGrossProfit,
    totals.expectedReturnAmount, totals.collectedAmount, totals.purchaseVarianceAmount, totals.balanceAmount];
  let x = margin;
  totalValues.forEach((value, index) => {
    drawPdfTableCell(doc, index === 0 ? value : formatPdfMoney(value), x, y, widths[index], totalHeight,
      { align: "center", fill: "#f7fbf4", font: "Helvetica-Bold", fontSize: 8 });
    x += widths[index];
  });
  doc.y = y + 40;
}

function buildEmptyHardwareMonthlyReport(filters: ReportPeriodFilter): HardwareMonthlyReport {
  return {
    periodLabel: toHardwarePeriodLabel(filters),
    rows: [],
    recipientRows: [],
    totals: {
      quantity: 0,
      purchaseUnitPrice: "0.00",
      purchaseAmount: "0.00",
      grossProfit: "0.00",
      assignedPurchaseAmount: "0.00",
      assignedGrossProfit: "0.00",
      expectedReturnAmount: "0.00",
      collectedAmount: "0.00",
      purchaseVarianceAmount: "0.00",
      balanceAmount: "0.00",
      unassignedPurchasesCount: 0,
      unassignedCollectionsCount: 0,
      transactionsCount: 0,
      currency: "XOF"
    }
  };
}

function drawHardwarePdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Rapport quincaillerie", periodLabel, pageNumber, totalPages);
}

function renderHardwareReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.hardwareMonthlyReport ?? buildEmptyHardwareMonthlyReport(filters);

  drawHardwareReportHeader(doc, report);
  drawHardwareMetadataStrip(doc, report, filters, overview.generatedAt);
  drawHardwareMetricCards(doc, report);
  drawHardwareMonthlyTable(doc, report);
  drawHardwareRecipientTable(doc, report, formatPdfDate(filters.dateTo ?? overview.generatedAt));

  const hasUnassignedTransactions =
    report.totals.unassignedPurchasesCount > 0 || report.totals.unassignedCollectionsCount > 0;
  if (report.recipientRows.length === 0 && !hasUnassignedTransactions) return;

  const note = report.recipientRows.length > 0
    ? `Lecture : écart achats = achats remis - recouvré ; reste attendu = achats + bénéfice prévu - recouvré.${
        hasUnassignedTransactions
          ? ` Sans destinataire : ${report.totals.unassignedPurchasesCount} achat(s), ${report.totals.unassignedCollectionsCount} recouvrement(s) exclus du suivi par destinataire.`
          : ""
      }`
    : `Sans destinataire : ${report.totals.unassignedPurchasesCount} achat(s), ${report.totals.unassignedCollectionsCount} recouvrement(s) exclus du suivi des remises.`;
  const noteWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  doc.font("Helvetica-Bold").fontSize(10);
  const noteHeight = doc.heightOfString(note, {
    width: noteWidth
  });
  if (doc.y + noteHeight > doc.page.height - PDF_CONTENT_BOTTOM) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
  }
  doc.fillColor("#486581").text(note, PDF_PAGE_MARGIN, doc.y, { width: noteWidth });
}

function drawGeneralExpensesIcon(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 6, y + 10, 104, 58, 8).fillAndStroke("#fef3c7", "#92400e");
  doc.roundedRect(x + 6, y + 10, 104, 16, 8).fill("#f59e0b");
  doc.rect(x + 6, y + 18, 104, 8).fill("#f59e0b");
  doc.circle(x + 92, y + 52, 15).fillAndStroke("#fde68a", "#92400e");
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("F", x + 85, y + 45, { width: 14, align: "center" });
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("DÉPENSES", x + 14, y + 36, { width: 68, align: "center" });
  doc.restore();
}

const GENERAL_EXPENSES_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "DATE", width: 65, align: "center" },
  { label: "CATÉGORIE", width: 197, align: "center" },
  { label: "DÉSIGNATION", width: 197, align: "center" },
  { label: "QUANTITÉ", width: 76, align: "center" },
  { label: "PRIX UNITAIRE", width: 105, align: "center" },
  { label: "MONTANT", width: 121, align: "center" }
];

function getGeneralExpensesPdfColumns(doc: PDFKit.PDFDocument): PdfTableColumn[] {
  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const fixedColumns = GENERAL_EXPENSES_PDF_COLUMNS.slice(0, -1);
  const fixedWidth = fixedColumns.reduce((sum, column) => sum + column.width, 0);
  const amountColumn = GENERAL_EXPENSES_PDF_COLUMNS[GENERAL_EXPENSES_PDF_COLUMNS.length - 1];

  return [...fixedColumns, { ...amountColumn, width: availableWidth - fixedWidth }];
}

function drawGeneralExpensesReportHeader(doc: PDFKit.PDFDocument, report: GeneralExpensesReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 118;
  const centerWidth = pageWidth - margin * 2 - 220;

  drawGeneralExpensesIcon(doc, margin, 18);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 15, 72);

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(GENERAL_EXPENSES_REPORT_BRANDING.title, centerX, 24, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(GENERAL_EXPENSES_REPORT_BRANDING.agency, centerX, 43, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(`"${GENERAL_EXPENSES_REPORT_BRANDING.brand}"`, centerX, 57, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(`${GENERAL_EXPENSES_REPORT_BRANDING.fiscal}     ${GENERAL_EXPENSES_REPORT_BRANDING.phone}`, centerX, 72, {
      width: centerWidth,
      align: "center"
    });

  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#f59e0b")
    .lineWidth(2)
    .stroke();

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(`DÉPENSES GÉNÉRALES — ${report.periodLabel.toUpperCase()}`, margin, 116, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 144;
}

function drawGeneralExpensesContinuationHeader(doc: PDFKit.PDFDocument, report: GeneralExpensesReport): void {
  drawSectorContinuationHeader(doc, GENERAL_EXPENSES_REPORT_BRANDING.title, report.periodLabel);
}

function drawGeneralExpensesMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: GeneralExpensesReport,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;

  doc.roundedRect(margin, y, width, 50, 4).fill("#fffbeb");
  doc.rect(margin, y, width, 50).strokeColor("#fde68a").lineWidth(0.8).stroke();
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Période", margin + 10, y + 10, { width: 160 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(report.periodLabel, margin + 10, y + 26, { width: 190 });
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Secteur", margin + 220, y + 10, { width: 130 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text("Dépenses générales", margin + 220, y + 26, { width: 190 });
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Généré le", pageWidth - margin - 160, y + 10, {
      width: 150,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 160, y + 26, {
      width: 150,
      align: "right"
    });
  doc.y = y + 64;
}

function drawGeneralExpensesMetricCards(doc: PDFKit.PDFDocument, report: GeneralExpensesReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Dépenses du PDG", value: formatPdfMoney(report.totals.pdgAmount) },
    { label: "Dépenses des employés", value: formatPdfMoney(report.totals.employeeAmount) },
    { label: "Total des dépenses", value: formatPdfMoney(report.totals.totalAmount) },
    { label: "Transactions", value: formatPdfNumber(report.totals.transactionsCount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 54, 4).fill("#fffbeb");
    doc.rect(x, y, cardWidth, 54).strokeColor("#fde68a").lineWidth(0.8).stroke();
    doc
      .fillColor("#92400e")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(metric.label, x + 8, y + 10, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(metric.value, x + 8, y + 27, {
        width: cardWidth - 16,
        align: "left"
      });
  });
  doc.y = y + 70;
}

function drawGeneralExpensesTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of getGeneralExpensesPdfColumns(doc)) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: column.align,
      fill: "#fde68a",
      font: "Helvetica-Bold",
      fontSize: 10.5
    });
    x += column.width;
  }
  return y + 27;
}

function drawGeneralExpensesDataRow(
  doc: PDFKit.PDFDocument,
  row: GeneralExpensesReport["rows"][number],
  y: number
): number {
  const values = [
    formatPdfDate(row.date),
    truncatePdfText(row.categoryLabel, 40),
    truncatePdfText(row.designation, 28),
    row.quantity > 0 ? formatPdfNumber(row.quantity, 2) : "-",
    row.quantity > 0 ? formatPdfMoney(row.unitPrice) : "-",
    formatPdfMoney(row.amount)
  ];
  const columns = getGeneralExpensesPdfColumns(doc);
  let x = PDF_PAGE_MARGIN;
  values.forEach((value, index) => {
    const column = columns[index];
    drawPdfTableCell(doc, value, x, y, column.width, 24, {
      align: column.align,
      fontSize: 10
    });
    x += column.width;
  });
  return y + 24;
}

function drawGeneralExpensesTotalsRow(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  amount: string
): number {
  const columns = getGeneralExpensesPdfColumns(doc);
  const amountColumn = columns[columns.length - 1];
  const firstColumnsWidth = columns
    .slice(0, -1)
    .reduce((sum, column) => sum + column.width, 0);
  drawPdfTableCell(doc, label, PDF_PAGE_MARGIN, y, firstColumnsWidth, 27, {
    align: "center",
    fill: "#fffbeb",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  drawPdfTableCell(
    doc,
    formatPdfMoney(amount),
    PDF_PAGE_MARGIN + firstColumnsWidth,
    y,
    amountColumn.width,
    27,
    {
      align: "center",
      fill: "#fde68a",
      font: "Helvetica-Bold",
      fontSize: 11
    }
  );
  return y + 27;
}

function drawGeneralExpensesEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#fffbeb");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#fde68a").lineWidth(0.8).stroke();
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Aucune dépense générale reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#78350f")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Le rapport reprend les dépenses du PDG et des employés comptabilisées sur la période. Vérifiez la période filtrée si le tableau doit être alimenté.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawGeneralExpensesSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  const pageWidth = doc.page.width;
  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(title, PDF_PAGE_MARGIN, doc.y, { width: pageWidth - PDF_PAGE_MARGIN * 2 });
  doc.y += 18;
}

function drawGeneralExpensesOwnerTable(
  doc: PDFKit.PDFDocument,
  report: GeneralExpensesReport,
  rows: GeneralExpensesReport["rows"],
  title: string,
  totalLabel: string,
  totalAmount: string
): void {
  if (rows.length === 0) {
    if (needsPdfPageBreak(doc, 18 + 20)) {
      doc.addPage();
      drawGeneralExpensesContinuationHeader(doc, report);
    }
    drawGeneralExpensesSectionTitle(doc, title);
    doc
      .fillColor("#78350f")
      .font("Helvetica")
      .fontSize(9)
      .text("Aucune dépense sur la période.", PDF_PAGE_MARGIN, doc.y);
    doc.y += 20;
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const minimumSectionHeight = 18 + 27 + 24 + 27;
  if (needsPdfPageBreak(doc, minimumSectionHeight)) {
    doc.addPage();
    drawGeneralExpensesContinuationHeader(doc, report);
  }
  drawGeneralExpensesSectionTitle(doc, title);
  let y = drawGeneralExpensesTableHeader(doc, doc.y);

  for (const row of rows) {
    if (y + 24 + 27 > tableBottom) {
      doc.addPage();
      drawGeneralExpensesContinuationHeader(doc, report);
      y = drawGeneralExpensesTableHeader(doc, doc.y);
    }
    y = drawGeneralExpensesDataRow(doc, row, y);
  }

  if (y + 27 > tableBottom) {
    doc.addPage();
    drawGeneralExpensesContinuationHeader(doc, report);
    y = drawGeneralExpensesTableHeader(doc, doc.y);
  }
  doc.y = drawGeneralExpensesTotalsRow(doc, y, totalLabel, totalAmount) + 18;
}

function drawGeneralExpensesTable(doc: PDFKit.PDFDocument, report: GeneralExpensesReport): void {
  if (report.rows.length === 0) {
    drawGeneralExpensesEmptyState(doc);
    return;
  }

  const pdgRows = report.rows.filter((row) => row.ownerType === "PDG");
  const employeeRows = report.rows.filter((row) => row.ownerType === "EMPLOYE");

  drawGeneralExpensesOwnerTable(doc, report, pdgRows, "DÉPENSES DU PDG", "TOTAL PDG", report.totals.pdgAmount);
  drawGeneralExpensesOwnerTable(
    doc,
    report,
    employeeRows,
    "DÉPENSES DES EMPLOYÉS",
    "TOTAL DES EMPLOYÉS",
    report.totals.employeeAmount
  );
}

function drawGeneralExpensesBreakdownTable(
  doc: PDFKit.PDFDocument,
  report: GeneralExpensesReport,
  rows: GeneralExpensesReport["breakdownRows"],
  title: string
): void {
  if (rows.length === 0) {
    return;
  }

  const breakdownHeight = 20 + 24 + rows.length * 24;
  if (needsPdfPageBreak(doc, breakdownHeight)) {
    doc.addPage();
    drawGeneralExpensesContinuationHeader(doc, report);
  }

  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(title, PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.3);

  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const categoryWidth = availableWidth * 0.525;
  const countWidth = availableWidth * 0.17;
  const columns: PdfTableColumn[] = [
    { label: "CATÉGORIE", width: categoryWidth, align: "center" },
    { label: "LIGNES", width: countWidth, align: "center" },
    { label: "MONTANT", width: availableWidth - categoryWidth - countWidth, align: "center" }
  ];
  const drawHeaderRow = (headerY: number): number => {
    let headerX = PDF_PAGE_MARGIN;
    for (const column of columns) {
      drawPdfTableCell(doc, column.label, headerX, headerY, column.width, 24, {
        align: column.align,
        fill: "#fde68a",
        font: "Helvetica-Bold",
        fontSize: 10.5
      });
      headerX += column.width;
    }
    return headerY + 24;
  };

  let y = drawHeaderRow(doc.y);

  for (const row of rows) {
    if (y + 24 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawGeneralExpensesContinuationHeader(doc, report);
      y = drawHeaderRow(doc.y);
    }
    let x = PDF_PAGE_MARGIN;
    const values = [
      row.categoryLabel,
      formatPdfNumber(row.transactionsCount),
      formatPdfMoney(row.amount)
    ];
    values.forEach((value, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, value, x, y, column.width, 24, {
        align: column.align,
        fontSize: 10
      });
      x += column.width;
    });
    y += 24;
  }
  doc.y = y + 14;
}

function drawGeneralExpensesBreakdown(doc: PDFKit.PDFDocument, report: GeneralExpensesReport): void {
  if (report.breakdownRows.length === 0) {
    return;
  }

  doc
    .fillColor("#92400e")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Répartition par catégorie de dépense", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const pdgBreakdownRows = report.breakdownRows.filter((row) => row.ownerType === "PDG");
  const employeeBreakdownRows = report.breakdownRows.filter((row) => row.ownerType === "EMPLOYE");

  drawGeneralExpensesBreakdownTable(doc, report, pdgBreakdownRows, "Répartition PDG");
  drawGeneralExpensesBreakdownTable(doc, report, employeeBreakdownRows, "Répartition employés");
}

function buildEmptyGeneralExpensesReport(filters: ReportPeriodFilter): GeneralExpensesReport {
  return {
    periodLabel: toGeneralExpensesPeriodLabel(filters),
    rows: [],
    breakdownRows: [],
    totals: {
      transactionsCount: 0,
      pdgAmount: "0.00",
      employeeAmount: "0.00",
      totalAmount: "0.00",
      currency: "XOF"
    }
  };
}

function drawGeneralExpensesPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#fde68a")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`AMCCO - Dépenses générales | ${periodLabel}`, margin, pageHeight - 32, {
      width: 300,
      lineBreak: false
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right",
      lineBreak: false
    });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

const HYDROCARBON_REPORT_BRANDING = {
  title: "HYDROCARBURES",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};

function drawHydrocarbonReportHeader(doc: PDFKit.PDFDocument, report: HydrocarbonOperationsReport): void {
  drawSectorReportHeader(doc, HYDROCARBON_REPORT_BRANDING.title, `${HYDROCARBON_REPORT_BRANDING.title} — ${report.periodLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawHydrocarbonContinuationHeader(doc: PDFKit.PDFDocument, report: HydrocarbonOperationsReport): void {
  drawSectorContinuationHeader(doc, HYDROCARBON_REPORT_BRANDING.title, report.periodLabel);
}

function drawHydrocarbonPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Hydrocarbures", periodLabel, pageNumber, totalPages);
}

function formatHydrocarbonMoney(value: string, currency: string): string {
  const amount = normalizePdfSpacing(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
    .format(toNumberAmount(value)));
  return `${amount} ${currency === "XOF" ? "F CFA" : currency}`;
}

function drawHydrocarbonMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: HydrocarbonOperationsReport,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const gap = 8;
  const itemWidth = (width - gap * 2) / 3;
  const y = doc.y;
  const items = [
    { label: "PÉRIODE", value: report.periodLabel },
    { label: "SECTEUR", value: "Hydrocarbures" },
    { label: "GÉNÉRÉ LE", value: formatPdfDate(generatedAt) }
  ];

  items.forEach((item, index) => {
    const x = margin + index * (itemWidth + gap);
    doc.roundedRect(x, y, itemWidth, 46, 4).fill("#f8fafc");
    doc.rect(x, y, itemWidth, 46).strokeColor("#cbd5e1").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica-Bold").fontSize(8.5)
      .text(item.label, x + 9, y + 7, { width: itemWidth - 18, align: "center" });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10)
      .text(truncatePdfText(item.value, 44), x + 9, y + 22, { width: itemWidth - 18, align: "center" });
  });
  doc.y = y + 56;
}

function drawHydrocarbonTable(
  doc: PDFKit.PDFDocument,
  report: HydrocarbonOperationsReport,
  title: string,
  columns: PdfTableColumn[],
  rows: string[][],
  emptyMessage: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const tableWidth = doc.page.width - margin * 2;
  const headerHeight = 23;
  const rowHeight = 18;
  const bottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const drawTitle = (continuation = false): void => {
    const y = doc.y;
    doc.fillColor("#334155").font("Helvetica-Bold").fontSize(11.5)
      .text(`${title}${continuation ? " (suite)" : ""}`, margin, y, { width: tableWidth });
    doc.y = y + 18;
  };
  const drawHeader = (): number => {
    const headerY = doc.y;
    let x = margin;
    for (const column of columns) {
      drawPdfTableCell(doc, column.label, x, headerY, column.width, headerHeight, {
        align: "center", fill: "#e2e8f0", font: "Helvetica-Bold", fontSize: 8.2, borderColor: "#cbd5e1"
      });
      x += column.width;
    }
    return headerY + headerHeight;
  };

  if (needsPdfPageBreak(doc, 18 + headerHeight + rowHeight)) {
    doc.addPage();
    drawHydrocarbonContinuationHeader(doc, report);
  }
  drawTitle();
  if (rows.length === 0) {
    const y = doc.y;
    drawPdfTableCell(doc, emptyMessage, margin, y, tableWidth, rowHeight, {
      align: "center", fontSize: 8.5, textColor: "#64748b", borderColor: "#cbd5e1"
    });
    doc.y = y + rowHeight + 12;
    return;
  }

  let y = drawHeader();
  for (const row of rows) {
    if (y + rowHeight > bottom) {
      doc.addPage();
      drawHydrocarbonContinuationHeader(doc, report);
      drawTitle(true);
      y = drawHeader();
    }
    let x = margin;
    columns.forEach((column, index) => {
      drawPdfTableCell(doc, truncatePdfText(row[index] ?? "", column.width < 100 ? 18 : 44), x, y, column.width, rowHeight, {
        align: "center", fontSize: 8.2, borderColor: "#cbd5e1"
      });
      x += column.width;
    });
    y += rowHeight;
  }
  doc.y = y + 12;
}

function renderHydrocarbonReportsPdf(
  doc: PDFKit.PDFDocument,
  report: HydrocarbonOperationsReport,
  generatedAt: string
): void {
  doc.on("pageAdded", () => {
    doc.y = PDF_CONTENT_TOP;
  });
  drawHydrocarbonReportHeader(doc, report);
  drawHydrocarbonMetadataStrip(doc, report, generatedAt);

  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const summaryColumns: PdfTableColumn[] = [
    { label: "DEVISE", width: availableWidth * 0.13, align: "center" },
    { label: "OPÉRATIONS", width: availableWidth * 0.14, align: "center" },
    { label: "ENTRÉES", width: availableWidth * 0.23, align: "center" },
    { label: "SORTIES", width: availableWidth * 0.23, align: "center" },
    { label: "SOLDE NET", width: availableWidth * 0.27, align: "center" }
  ];
  drawHydrocarbonTable(
    doc,
    report,
    "Synthèse financière par devise",
    summaryColumns,
    report.currencySummaries.map((row) => [
      row.currency,
      formatPdfNumber(row.transactionsCount),
      formatHydrocarbonMoney(row.cashInAmount, row.currency),
      formatHydrocarbonMoney(row.cashOutAmount, row.currency),
      formatHydrocarbonMoney(row.netAmount, row.currency)
    ]),
    "Aucun flux financier reportable sur la période sélectionnée."
  );

  const transactionColumns: PdfTableColumn[] = [
    { label: "DATE", width: 72, align: "center" },
    { label: "CATÉGORIE", width: 84, align: "center" },
    { label: "RÉFÉRENCE", width: 84, align: "center" },
    { label: "SENS", width: 66, align: "center" },
    { label: "DESCRIPTION", width: availableWidth - 72 - 84 - 84 - 66 - 132, align: "left" },
    { label: "MONTANT", width: 132, align: "right" }
  ];
  drawHydrocarbonTable(
    doc,
    report,
    `Flux financiers détaillés (${formatPdfNumber(report.rows.length)} ligne(s))`,
    transactionColumns,
    report.rows.map((row) => [
      formatPdfDate(row.date),
      row.categoryLabel,
      row.assetRef,
      row.direction === "CASH_IN" ? "Entrée" : "Sortie",
      row.description,
      formatHydrocarbonMoney(row.amount, row.currency)
    ]),
    "Aucun flux financier reportable sur la période sélectionnée."
  );

  const taskColumns: PdfTableColumn[] = [
    { label: "ÉTAT DES ACTIONS", width: availableWidth * 0.62, align: "center" },
    { label: "NOMBRE", width: availableWidth * 0.38, align: "center" }
  ];
  const taskStatusLabels: Record<HydrocarbonOperationsReport["taskStatusSummary"][number]["status"], string> = {
    TODO: "À faire",
    IN_PROGRESS: "En cours",
    DONE: "Terminées",
    BLOCKED: "Bloquées"
  };
  drawHydrocarbonTable(
    doc,
    report,
    "Suivi des actions",
    taskColumns,
    report.taskStatusSummary
      .filter((row) => row.count > 0)
      .map((row) => [taskStatusLabels[row.status], formatPdfNumber(row.count)]),
    "Aucune action enregistrée sur la période sélectionnée."
  );

  if (report.tasks.length > 0) {
    const taskDetailColumns: PdfTableColumn[] = [
      { label: "ÉCHÉANCE", width: 75, align: "center" },
      { label: "ACTION", width: 210, align: "center" },
      { label: "DÉTAIL", width: 350, align: "center" },
      { label: "ÉTAT", width: availableWidth - 635, align: "center" }
    ];
    drawHydrocarbonTable(
      doc,
      report,
      `Actions détaillées (${formatPdfNumber(report.tasks.length)} ligne(s))`,
      taskDetailColumns,
      report.tasks.map((task) => [
        task.dueDate ? formatPdfDate(task.dueDate) : "—",
        task.title,
        task.description,
        taskStatusLabels[task.status]
      ]),
      "Aucune action enregistrée sur la période sélectionnée."
    );
  }

  if (needsPdfPageBreak(doc, 44)) {
    doc.addPage();
    drawHydrocarbonContinuationHeader(doc, report);
  }
  const noteY = doc.y;
  doc.roundedRect(PDF_PAGE_MARGIN, noteY, availableWidth, 38, 4).fill("#f8fafc");
  doc.rect(PDF_PAGE_MARGIN, noteY, availableWidth, 38).strokeColor("#cbd5e1").lineWidth(0.8).stroke();
  doc.fillColor("#334155").font("Helvetica").fontSize(8.5)
    .text(
      "Lecture : le solde net correspond aux entrées moins les sorties. Les totaux sont calculés séparément pour chaque devise, sans conversion. Seules les transactions enregistrées ou finalisées sont incluses.",
      PDF_PAGE_MARGIN + 10,
      noteY + 8,
      { width: availableWidth - 20, height: 25 }
    );
  doc.y = noteY + 48;
}

const BEVERAGE_DEPOT_REPORT_BRANDING = {
  title: "DÉPÔT DE BOISSONS",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};

function drawBeverageDepotIcon(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 6, y + 10, 104, 58, 8).fillAndStroke("#fffbeb", "#92400e");
  doc.roundedRect(x + 6, y + 10, 104, 16, 8).fill("#f59e0b");
  doc.rect(x + 6, y + 18, 104, 8).fill("#f59e0b");
  doc.roundedRect(x + 22, y + 34, 18, 26, 4).fillAndStroke("#fef3c7", "#92400e");
  doc.roundedRect(x + 48, y + 30, 18, 30, 4).fillAndStroke("#fef3c7", "#92400e");
  doc.roundedRect(x + 74, y + 34, 18, 26, 4).fillAndStroke("#fef3c7", "#92400e");
  doc.rect(x + 27, y + 30, 8, 5).fill("#92400e");
  doc.rect(x + 53, y + 26, 8, 5).fill("#92400e");
  doc.rect(x + 79, y + 30, 8, 5).fill("#92400e");
  doc.restore();
}

function drawBeverageDepotReportHeader(doc: PDFKit.PDFDocument, report: BeverageDepotReport): void {
  drawSectorReportHeader(doc, BEVERAGE_DEPOT_REPORT_BRANDING.title, `${BEVERAGE_DEPOT_REPORT_BRANDING.title} — ${report.periodLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawBeverageDepotContinuationHeader(doc: PDFKit.PDFDocument, report: BeverageDepotReport): void {
  drawSectorContinuationHeader(doc, BEVERAGE_DEPOT_REPORT_BRANDING.title, report.periodLabel);
}

function drawBeverageDepotPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "D\u00e9p\u00f4t de boissons", periodLabel, pageNumber, totalPages);
}

function buildEmptyBeverageDepotReport(filters: ReportPeriodFilter): BeverageDepotReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    transactions: [],
    inventory: [],
    reconciliations: [],
    totals: {
      salesAmount: "0.00",
      purchasesAmount: "0.00",
      expensesAmount: "0.00",
      otherIncomeAmount: "0.00",
      grossMarginAmount: "0.00",
      stockValue: "0.00",
      currency: "XOF"
    }
  };
}

function drawBeverageDepotMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: BeverageDepotReport,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const y = doc.y;
  const gap = 8;
  const columnWidth = (width - gap * 2) / 3;
  const items = [
    { label: "PÉRIODE", value: report.periodLabel },
    { label: "SECTEUR", value: "Dépôt de boissons" },
    { label: "GÉNÉRÉ LE", value: formatPdfDate(generatedAt) }
  ];

  items.forEach((item, index) => {
    const x = margin + index * (columnWidth + gap);
    doc.roundedRect(x, y, columnWidth, 48, 4).fill("#fffbeb");
    doc.rect(x, y, columnWidth, 48).strokeColor("#fde68a").lineWidth(0.8).stroke();
    doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(8.5)
      .text(item.label, x + 9, y + 8, { width: columnWidth - 18, align: "center" });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10)
      .text(truncatePdfText(item.value, 46), x + 9, y + 23, { width: columnWidth - 18, align: "center" });
  });
  doc.y = y + 60;
}

function drawBeverageDepotMetricCards(doc: PDFKit.PDFDocument, report: BeverageDepotReport): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const gap = 8;
  const columns = 3;
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = 48;
  const cardsY = doc.y;
  const metrics = [
    { label: "Ventes", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Achats de stock", value: formatPdfMoney(report.totals.purchasesAmount) },
    { label: "Dépenses d'exploitation", value: formatPdfMoney(report.totals.expensesAmount) },
    { label: "Autres recettes", value: formatPdfMoney(report.totals.otherIncomeAmount) },
    { label: "Marge brute calculable", value: formatPdfMoney(report.totals.grossMarginAmount) },
    { label: "Valeur du stock clôturé", value: formatPdfMoney(report.totals.stockValue) }
  ];

  metrics.forEach((metric, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = margin + column * (cardWidth + gap);
    const y = cardsY + row * (cardHeight + 7);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4).fill("#fffbeb");
    doc.rect(x, y, cardWidth, cardHeight).strokeColor("#fde68a").lineWidth(0.8).stroke();
    doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(8.5)
      .text(metric.label, x + 9, y + 8, { width: cardWidth - 18, align: "center" });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11)
      .text(metric.value, x + 9, y + 24, { width: cardWidth - 18, align: "center" });
  });
  const countLineY = cardsY + 2 * (cardHeight + 7) + 8;
  const transactionCount = report.transactions.length;
  const inventoryCount = report.inventory.length;
  const reconciliationCount = report.reconciliations.length;
  doc.fillColor("#475569").font("Helvetica").fontSize(8.5).text(
    `${formatPdfNumber(transactionCount)} opération${transactionCount > 1 ? "s" : ""} · ${formatPdfNumber(inventoryCount)} inventaire${inventoryCount > 1 ? "s" : ""} · ${formatPdfNumber(reconciliationCount)} rapprochement${reconciliationCount > 1 ? "s" : ""}`,
    margin,
    countLineY,
    { width, align: "center" }
  );
  doc.y = countLineY + 20;
}

type BeverageDepotPdfRow = Array<{ value: string; align?: "left" | "center" | "right" }>;

function drawBeverageDepotTable(
  doc: PDFKit.PDFDocument,
  report: BeverageDepotReport,
  title: string,
  columns: PdfTableColumn[],
  rows: BeverageDepotPdfRow[],
  emptyMessage: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const tableWidth = doc.page.width - margin * 2;
  const headerHeight = 23;
  const rowHeight = 23;
  const bottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const drawSectionTitle = (isContinuation = false): void => {
    const titleY = doc.y;
    doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(11.5)
      .text(`${title}${isContinuation ? " (suite)" : ""}`, margin, titleY, { width: tableWidth });
    doc.y = titleY + 18;
  };
  const drawHeader = (): number => {
    const headerY = doc.y;
    let x = margin;
    columns.forEach((column) => {
      drawPdfTableCell(doc, column.label, x, headerY, column.width, headerHeight, {
        align: column.align ?? "center",
        fill: "#fde68a",
        font: "Helvetica-Bold",
        fontSize: 8,
        borderColor: "#cbd5e1"
      });
      x += column.width;
    });
    return headerY + headerHeight;
  };

  if (needsPdfPageBreak(doc, 18 + headerHeight + rowHeight)) {
    doc.addPage();
    drawBeverageDepotContinuationHeader(doc, report);
  }
  drawSectionTitle();
  let y = drawHeader();

  if (rows.length === 0) {
    if (y + rowHeight > bottom) {
      doc.addPage();
      drawBeverageDepotContinuationHeader(doc, report);
      drawSectionTitle(true);
      y = drawHeader();
    }
    drawPdfTableCell(doc, emptyMessage, margin, y, tableWidth, rowHeight, {
      align: "center",
      fontSize: 8.5,
      textColor: "#64748b",
      borderColor: "#d9e2ec"
    });
    doc.y = y + rowHeight + 14;
    return;
  }

  for (const row of rows) {
    if (y + rowHeight > bottom) {
      doc.addPage();
      drawBeverageDepotContinuationHeader(doc, report);
      drawSectionTitle(true);
      y = drawHeader();
    }
    let x = margin;
    columns.forEach((column, index) => {
      const cell = row[index];
      drawPdfTableCell(doc, cell?.value ?? "", x, y, column.width, rowHeight, {
        align: cell?.align ?? column.align ?? "left",
        fontSize: 8.2,
        borderColor: "#d9e2ec"
      });
      x += column.width;
    });
    y += rowHeight;
  }
  doc.y = y + 14;
}

function drawBeverageDepotReadingNotes(doc: PDFKit.PDFDocument, report: BeverageDepotReport): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const readingText = "Lecture : pour les ventes liées au stock, la marge brute utilise le coût moyen pondéré enregistré par le serveur lors de la vente. Les anciennes ventes conservent leur coût déclaré et ne modifient pas le stock de départ compté. Le résultat d'exploitation correspond à la marge brute + autres recettes - dépenses + écarts de stock valorisés. Le stock disponible est une situation actuelle. La valeur du stock clôturé reprend le dernier inventaire clôturé sur la période pour chaque produit. Les versements ne sont pas de nouvelles ventes.";
  doc.font("Helvetica").fontSize(8.5);
  const height = doc.heightOfString(readingText, { width: width - 20 }) + 20;
  if (needsPdfPageBreak(doc, height + 12)) {
    doc.addPage();
    drawBeverageDepotContinuationHeader(doc, report);
  }
  const y = doc.y;
  doc.roundedRect(margin, y, width, height, 4).fill("#f8fafc");
  doc.rect(margin, y, width, height).strokeColor("#d9e2ec").lineWidth(0.8).stroke();
  doc.fillColor("#334e68").font("Helvetica").fontSize(8.5)
    .text(
      readingText,
      margin + 10,
      y + 9,
      { width: width - 20 }
    );
  doc.y = y + height + 12;
}

function renderBeverageDepotReportsPdf(
  doc: PDFKit.PDFDocument,
  report: BeverageDepotReport,
  generatedAt: string
): void {
  doc.on("pageAdded", () => {
    doc.y = PDF_CONTENT_TOP;
  });
  drawBeverageDepotReportHeader(doc, report);
  drawBeverageDepotMetadataStrip(doc, report, generatedAt);
  drawBeverageDepotMetricCards(doc, report);

  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const summaryColumns: PdfTableColumn[] = [
    { label: "POSTE", width: availableWidth * 0.55, align: "center" },
    { label: "OPÉRATIONS", width: availableWidth * 0.18, align: "center" },
    { label: "MONTANT", width: availableWidth * 0.27, align: "center" }
  ];
  const countCategory = (category: BeverageDepotReport["transactions"][number]["category"]): number =>
    report.transactions.filter((row) => row.category === category).length;
  drawBeverageDepotTable(
    doc,
    report,
    "Synthèse financière",
    summaryColumns,
    [
      [{ value: "Ventes" }, { value: formatPdfNumber(countCategory("VENTE")) }, { value: formatPdfMoney(report.totals.salesAmount) }],
      [{ value: "Achats de stock" }, { value: formatPdfNumber(countCategory("ACHAT_STOCK")) }, { value: formatPdfMoney(report.totals.purchasesAmount) }],
      [{ value: "Dépenses courantes" }, { value: formatPdfNumber(countCategory("DEPENSE")) }, { value: formatPdfMoney(report.totals.expensesAmount) }],
      [{ value: "Autres recettes" }, { value: formatPdfNumber(countCategory("AUTRE_RECETTE")) }, { value: formatPdfMoney(report.totals.otherIncomeAmount) }]
    ],
    "Aucune opération financière sur la période sélectionnée."
  );

  const transactionFixedWidths = [58, 82, 132, 50, 92, 92, 100];
  const transactionColumns: PdfTableColumn[] = [
    { label: "DATE", width: transactionFixedWidths[0], align: "center" },
    { label: "NATURE", width: transactionFixedWidths[1], align: "center" },
    { label: "PRODUIT", width: transactionFixedWidths[2], align: "center" },
    { label: "QTÉ", width: transactionFixedWidths[3], align: "center" },
    { label: "PRIX ACHAT", width: transactionFixedWidths[4], align: "center" },
    { label: "PRIX VENTE", width: transactionFixedWidths[5], align: "center" },
    { label: "MONTANT", width: transactionFixedWidths[6], align: "center" },
    { label: "RÉFÉRENCE / MOTIF", width: availableWidth - transactionFixedWidths.reduce((sum, item) => sum + item, 0), align: "center" }
  ];
  const categoryLabel = (category: BeverageDepotReport["transactions"][number]["category"]): string => {
    switch (category) {
      case "VENTE": return "Vente";
      case "ACHAT_STOCK": return "Achat de stock";
      case "DEPENSE": return "Dépense";
      default: return "Autre recette";
    }
  };
  drawBeverageDepotTable(
    doc,
    report,
    `Transactions détaillées (${formatPdfNumber(report.transactions.length)} ligne(s))`,
    transactionColumns,
    report.transactions.map((row) => [
      { value: formatPdfDate(row.date), align: "center" },
      { value: categoryLabel(row.category) },
      { value: truncatePdfText(row.productName, 24) },
      { value: row.quantity === null ? "—" : formatPdfNumber(row.quantity, 2), align: "center" },
      { value: row.purchaseUnitPrice ? formatPdfMoney(row.purchaseUnitPrice) : "—", align: "center" },
      { value: row.saleUnitPrice ? formatPdfMoney(row.saleUnitPrice) : "—", align: "center" },
      { value: formatPdfMoney(row.amount), align: "center" },
      { value: truncatePdfText(row.description, 32) }
    ]),
    "Aucune transaction sur la période sélectionnée."
  );

  const inventoryFixedWidths = [75, 195, 78, 128, 135];
  const inventoryColumns: PdfTableColumn[] = [
    { label: "DATE", width: inventoryFixedWidths[0], align: "center" },
    { label: "PRODUIT", width: inventoryFixedWidths[1], align: "center" },
    { label: "QUANTITÉ", width: inventoryFixedWidths[2], align: "center" },
    { label: "COÛT UNITAIRE", width: inventoryFixedWidths[3], align: "center" },
    { label: "VALEUR DU STOCK", width: inventoryFixedWidths[4], align: "center" },
    { label: "ÉTAT", width: availableWidth - inventoryFixedWidths.reduce((sum, item) => sum + item, 0), align: "center" }
  ];
  drawBeverageDepotTable(
    doc,
    report,
    `Inventaire hors caisse (${formatPdfNumber(report.inventory.length)} ligne(s))`,
    inventoryColumns,
    report.inventory.map((row) => [
      { value: row.date ? formatPdfDate(row.date) : "—", align: "center" },
      { value: truncatePdfText(row.productName, 38) },
      { value: row.quantity === null ? "—" : formatPdfNumber(row.quantity, 2), align: "center" },
      { value: row.purchaseUnitPrice ? formatPdfMoney(row.purchaseUnitPrice) : "—", align: "center" },
      { value: row.stockValue ? formatPdfMoney(row.stockValue) : "—", align: "center" },
      { value: toDisplayTaskStatusLabel(row.status) }
    ]),
    "Aucun inventaire enregistré sur la période sélectionnée."
  );

  const reconciliationFixedWidths = [90, 125, 125, 125, 125];
  const reconciliationColumns: PdfTableColumn[] = [
    { label: "DATE", width: reconciliationFixedWidths[0], align: "center" },
    { label: "VENTES", width: reconciliationFixedWidths[1], align: "center" },
    { label: "VERSEMENTS", width: reconciliationFixedWidths[2], align: "center" },
    { label: "RELIQUAT", width: reconciliationFixedWidths[3], align: "center" },
    { label: "DÉPENSES", width: reconciliationFixedWidths[4], align: "center" },
    { label: "ÉTAT", width: availableWidth - reconciliationFixedWidths.reduce((sum, item) => sum + item, 0), align: "center" }
  ];
  drawBeverageDepotTable(
    doc,
    report,
    `Rapprochement journalier (${formatPdfNumber(report.reconciliations.length)} journée(s))`,
    reconciliationColumns,
    report.reconciliations.map((row) => [
      { value: row.date ? formatPdfDate(row.date) : "—", align: "center" },
      { value: formatPdfMoney(row.dailySales), align: "center" },
      { value: formatPdfMoney(row.dailyDeposits), align: "center" },
      { value: formatPdfMoney(row.dailyBalance), align: "center" },
      { value: formatPdfMoney(row.dailyExpenses), align: "center" },
      { value: toDisplayTaskStatusLabel(row.status) }
    ]),
    "Aucun rapprochement enregistré sur la période sélectionnée."
  );
  if (report.currentStock) {
    drawBeverageDepotTable(doc, report, `Stock disponible au ${formatPdfDate(report.currentStock.asOf)} (situation actuelle)`,
      [{ label: "Produit / unité", width: 180, align: "left" }, { label: "Disponible", width: 85, align: "right" }, { label: "Coût moyen", width: 95, align: "right" }, { label: "Valeur XOF", width: 95, align: "right" }],
      report.currentStock.products.map((product) => [
        { value: `${product.name} / ${product.unit}` }, { value: product.quantity },
        { value: formatPdfMoney(product.averageUnitCost) }, { value: formatPdfMoney(product.stockValue) }
      ]), "Aucun produit initialisé pour le suivi de stock.");
  }
  if (report.stockAdjustments?.length) {
    drawBeverageDepotTable(doc, report, "Écarts de stock constatés sur la période (hors caisse)",
      [{ label: "Date / produit", width: 200, align: "left" }, { label: "Écart quantité", width: 90, align: "right" }, { label: "Écart valorisé", width: 90, align: "right" }, { label: "Motif", width: 115, align: "left" }],
      report.stockAdjustments.map((item) => [{ value: `${formatPdfDate(item.date)} / ${item.productName} (${item.unit})` }, { value: item.quantity }, { value: formatPdfMoney(item.value) }, { value: item.reason }]), "Aucun écart.");
  }
  if (report.netOperatingResultAmount !== undefined) {
    if (doc.y + 45 > doc.page.height - 64) { doc.addPage(); drawBeverageDepotContinuationHeader(doc, report); }
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#334e68").text(
      `Résultat d'exploitation de la période : ${formatPdfMoney(report.netOperatingResultAmount)} (marge brute + autres recettes - dépenses + écarts de stock valorisés).`,
      PDF_PAGE_MARGIN, doc.y, { width: doc.page.width - PDF_PAGE_MARGIN * 2 });
  }
  drawBeverageDepotReadingNotes(doc, report);
}

function renderGeneralExpensesReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.generalExpensesReport ?? buildEmptyGeneralExpensesReport(filters);

  drawGeneralExpensesReportHeader(doc, report);
  drawGeneralExpensesMetadataStrip(doc, report, overview.generatedAt);
  drawGeneralExpensesMetricCards(doc, report);
  drawGeneralExpensesTable(doc, report);
  drawGeneralExpensesBreakdown(doc, report);
}

function drawTransportReportHeader(
  doc: PDFKit.PDFDocument,
  report: TransportOperationsReport,
  generatedAt: string
): void {
  drawSectorReportHeader(doc, "TRANSPORT", `SUIVI DES TRANSACTIONS — ${report.periodLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
  doc.fillColor("#486581").font("Helvetica").fontSize(8).text(`G\u00e9n\u00e9r\u00e9 le ${formatPdfDate(generatedAt)} - op\u00e9rations soumises ou approuv\u00e9es`, PDF_PAGE_MARGIN, doc.y, { width: doc.page.width - PDF_PAGE_MARGIN * 2 });
  doc.y += 12;
}

function drawTransportContinuationHeader(doc: PDFKit.PDFDocument, report: TransportOperationsReport): void {
  drawSectorContinuationHeader(doc, "TRANSPORT", report.periodLabel);
}

function formatTransportPdfMoney(value: string, currency: string): string {
  const amount = formatPdfNumber(value);
  return currency === "XOF" ? `${amount} F CFA` : `${amount} ${currency}`;
}

function drawTransportSummaryTable(doc: PDFKit.PDFDocument, report: TransportOperationsReport): void {
  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const columns: PdfTableColumn[] = [
    { label: "DEVISE", width: availableWidth * 0.10, align: "center" },
    { label: "OPÉRATIONS", width: availableWidth * 0.13, align: "center" },
    { label: "ENTRÉES", width: availableWidth * 0.19, align: "right" },
    { label: "PART AMCCO", width: availableWidth * 0.19, align: "right" },
    { label: "SORTIES", width: availableWidth * 0.19, align: "right" },
    { label: "SOLDE NET", width: availableWidth * 0.19, align: "right" }
  ];
  const drawHeader = (headerY: number): number => {
    let x = PDF_PAGE_MARGIN;
    for (const column of columns) {
      drawPdfTableCell(doc, column.label, x, headerY, column.width, 24, {
        align: column.align, fill: "#d1fae5", font: "Helvetica-Bold", fontSize: 9
      });
      x += column.width;
    }
    return headerY + 24;
  };

  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(11.5)
    .text("Synthèse par devise", PDF_PAGE_MARGIN, doc.y, { width: availableWidth });
  doc.y += 19;
  if (report.currencySummaries.length === 0) {
    doc.fillColor("#64748b").font("Helvetica").fontSize(9)
      .text("Aucune transaction Transport reportable sur la période.", PDF_PAGE_MARGIN, doc.y);
    doc.y += 24;
    return;
  }

  let y = drawHeader(doc.y);
  for (const item of report.currencySummaries) {
    let x = PDF_PAGE_MARGIN;
    const values = [
      item.currency,
      formatPdfNumber(item.transactionsCount),
      formatTransportPdfMoney(item.cashInAmount, item.currency),
      formatTransportPdfMoney(item.amccoAmount, item.currency),
      formatTransportPdfMoney(item.cashOutAmount, item.currency),
      formatTransportPdfMoney(item.netAmount, item.currency)
    ];
    values.forEach((value, index) => {
      drawPdfTableCell(doc, value, x, y, columns[index].width, 24, {
        align: columns[index].align, fontSize: 8.5
      });
      x += columns[index].width;
    });
    y += 24;
  }
  doc.y = y + 16;
}

function drawTransportTransactionTable(doc: PDFKit.PDFDocument, report: TransportOperationsReport): void {
  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const columns: PdfTableColumn[] = [
    { label: "DATE", width: availableWidth * 0.075, align: "center" },
    { label: "OPÉRATION", width: availableWidth * 0.12, align: "center" },
    { label: "VÉHICULE", width: availableWidth * 0.09, align: "center" },
    { label: "DÉSIGNATION / TRAJET", width: availableWidth * 0.205, align: "left" },
    { label: "VOYAGES", width: availableWidth * 0.07, align: "center" },
    { label: "PRIX UNIT.", width: availableWidth * 0.095, align: "right" },
    { label: "ENTRÉE", width: availableWidth * 0.115, align: "right" },
    { label: "PART AMCCO", width: availableWidth * 0.105, align: "right" },
    { label: "SORTIE", width: availableWidth * 0.125, align: "right" }
  ];
  const drawHeader = (headerY: number): number => {
    let x = PDF_PAGE_MARGIN;
    columns.forEach((column) => {
      drawPdfTableCell(doc, column.label, x, headerY, column.width, 25, {
        align: column.align, fill: "#d1fae5", font: "Helvetica-Bold", fontSize: 7.5
      });
      x += column.width;
    });
    return headerY + 25;
  };

  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(11.5)
    .text("Transactions détaillées", PDF_PAGE_MARGIN, doc.y, { width: availableWidth });
  doc.y += 19;
  if (report.rows.length === 0) {
    doc.roundedRect(PDF_PAGE_MARGIN, doc.y, availableWidth, 42, 4).fill("#f0fdfa");
    doc.roundedRect(PDF_PAGE_MARGIN, doc.y, availableWidth, 42, 4).strokeColor("#99f6e4").lineWidth(0.8).stroke();
    doc.fillColor("#475569").font("Helvetica").fontSize(9)
      .text("Aucune transaction Transport enregistrée sur la période sélectionnée.", PDF_PAGE_MARGIN + 12, doc.y + 14, {
        width: availableWidth - 24
      });
    doc.y += 54;
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  let y = drawHeader(doc.y);
  for (const row of report.rows) {
    if (y + 25 > tableBottom) {
      doc.addPage();
      drawTransportContinuationHeader(doc, report);
      doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(10)
        .text("Transactions détaillées (suite)", PDF_PAGE_MARGIN, doc.y, { width: availableWidth });
      y = drawHeader(doc.y + 18);
    }
    const values = [
      formatPdfDate(row.date),
      truncatePdfText(row.operationLabel, 18),
      truncatePdfText(row.vehicleLabel, 14),
      truncatePdfText(row.designation, 38),
      row.quantity === null ? "-" : formatPdfNumber(row.quantity, 2),
      row.unitPrice ? formatTransportPdfMoney(row.unitPrice, row.currency) : "-",
      toNumberAmount(row.cashInAmount) > 0 ? formatTransportPdfMoney(row.cashInAmount, row.currency) : "-",
      toNumberAmount(row.amccoAmount) > 0 ? formatTransportPdfMoney(row.amccoAmount, row.currency) : "-",
      toNumberAmount(row.cashOutAmount) > 0 ? formatTransportPdfMoney(row.cashOutAmount, row.currency) : "-"
    ];
    let x = PDF_PAGE_MARGIN;
    values.forEach((value, index) => {
      drawPdfTableCell(doc, value, x, y, columns[index].width, 25, {
        align: columns[index].align, fontSize: 7.2
      });
      x += columns[index].width;
    });
    y += 25;
  }
  doc.y = y + 10;
}

function renderTransportOperationsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.transportOperationsReport ?? {
    periodLabel: toDisplayPeriodLabel(filters),
    rows: [],
    currencySummaries: []
  };
  drawTransportReportHeader(doc, report, overview.generatedAt);
  drawTransportSummaryTable(doc, report);
  drawTransportTransactionTable(doc, report);
}

function drawTransportPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Transport", periodLabel, pageNumber, totalPages);
}

const DAILY_ACTIVITIES_REPORT_BRANDING = {
  title: "ACTIVITÉS QUOTIDIENNES",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO",
  fiscal: "N Fiscal 084126139L",
  phone: "TEL: 79 07 24 40"
};

function drawDailyActivitiesReportHeader(doc: PDFKit.PDFDocument, report: DailyActivitiesReport): void {
  drawSectorReportHeader(doc, DAILY_ACTIVITIES_REPORT_BRANDING.title, `SUIVI DES ACTIVITÉS — ${report.periodLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawDailyActivitiesContinuationHeader(doc: PDFKit.PDFDocument, report: DailyActivitiesReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  drawAmccoPdfLogo(doc, margin, 20, 36);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11)
    .text("ACTIVITÉS QUOTIDIENNES — suite", margin + 46, 26, { width: pageWidth - margin * 2 - 92 });
  doc.fillColor("#486581").font("Helvetica-Bold").fontSize(9)
    .text(`Période : ${report.periodLabel}`, margin + 46, 42, { width: pageWidth - margin * 2 - 92 });
  doc.moveTo(margin, 62).lineTo(pageWidth - margin, 62).strokeColor("#cbd5e1").lineWidth(1).stroke();
  doc.y = 76;
}

function drawDailyActivitiesMetadata(doc: PDFKit.PDFDocument, report: DailyActivitiesReport, generatedAt: string): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;

  doc.roundedRect(margin, y, width, 48, 4).fill("#f0fdfa");
  doc.roundedRect(margin, y, width, 48, 4).strokeColor("#99f6e4").lineWidth(0.8).stroke();
  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(9).text("Période", margin + 10, y + 8, { width: 160 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(report.periodLabel, margin + 10, y + 25, { width: 210 });
  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(9).text("Activité", margin + 245, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text("Suivi de bureau et protocoles", margin + 245, y + 25, { width: 220 });
  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(9).text("Généré le", pageWidth - margin - 155, y + 8, {
    width: 145, align: "right"
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(formatPdfDate(generatedAt), pageWidth - margin - 155, y + 25, {
    width: 145, align: "right"
  });
  doc.y = y + 62;
}

function drawDailyActivitiesMetrics(doc: PDFKit.PDFDocument, report: DailyActivitiesReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 4) / 5;
  const y = doc.y;
  const metrics = [
    { label: "Activités", value: formatPdfNumber(report.totals.activitiesCount) },
    { label: "À suivre", value: formatPdfNumber(report.totals.openCount) },
    { label: "Bloquées", value: formatPdfNumber(report.totals.blockedCount) },
    { label: "Protocoles", value: formatPdfNumber(report.totals.agreementsCount) },
    { label: "Mouvements", value: formatPdfNumber(report.totals.transactionsCount) }
  ];
  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 49, 4).fill("#f0fdfa");
    doc.roundedRect(x, y, cardWidth, 49, 4).strokeColor("#99f6e4").lineWidth(0.8).stroke();
    doc.fillColor("#0f766e").font("Helvetica").fontSize(8.5).text(metric.label, x + 8, y + 8, { width: cardWidth - 16 });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text(metric.value, x + 8, y + 24, { width: cardWidth - 16 });
  });
  doc.y = y + 63;
}

type DailyActivitiesPdfCell = { value: string; align?: "left" | "center" | "right"; verticalAlign?: "center" | "top" };

function formatDailyActivityMoney(value: string, currency: string): string {
  const amount = formatPdfNumber(value);
  return currency === "XOF" ? `${amount} F CFA` : `${amount} ${currency}`;
}

function drawDailyActivitiesTable(
  doc: PDFKit.PDFDocument,
  report: DailyActivitiesReport,
  title: string,
  columns: PdfTableColumn[],
  rows: DailyActivitiesPdfCell[][],
  emptyMessage: string,
  rowHeight = 30
): void {
  const margin = PDF_PAGE_MARGIN;
  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const width = doc.page.width - margin * 2;
  const sectionHeight = 20;
  const headerHeight = 27;

  if (doc.y + sectionHeight + headerHeight + rowHeight > tableBottom) {
    doc.addPage();
    drawDailyActivitiesContinuationHeader(doc, report);
  }
  doc.fillColor("#115e59").font("Helvetica-Bold").fontSize(11.5).text(title, margin, doc.y, { width });
  doc.y += sectionHeight;

  if (rows.length === 0) {
    doc.roundedRect(margin, doc.y, width, 34, 3).fill("#f8fafc");
    doc.roundedRect(margin, doc.y, width, 34, 3).strokeColor("#cbd5e1").lineWidth(0.7).stroke();
    doc.fillColor("#64748b").font("Helvetica").fontSize(9).text(emptyMessage, margin + 10, doc.y + 11, { width: width - 20 });
    doc.y += 44;
    return;
  }

  const drawHeader = (y: number): number => {
    let x = margin;
    columns.forEach((column) => {
      drawPdfTableCell(doc, column.label, x, y, column.width, headerHeight, {
        align: "center", fill: "#ccfbf1", font: "Helvetica-Bold", fontSize: 8
      });
      x += column.width;
    });
    return y + headerHeight;
  };

  let y = drawHeader(doc.y);
  for (const row of rows) {
    if (y + rowHeight > tableBottom) {
      doc.addPage();
      drawDailyActivitiesContinuationHeader(doc, report);
      doc.fillColor("#115e59").font("Helvetica-Bold").fontSize(10).text(`${title} (suite)`, margin, doc.y, { width });
      y = drawHeader(doc.y + sectionHeight);
    }
    let x = margin;
    row.forEach((cell, index) => {
      drawPdfTableCell(doc, cell.value, x, y, columns[index].width, rowHeight, {
        align: cell.align ?? columns[index].align,
        fontSize: rowHeight > 32 ? 7.7 : 8,
        verticalAlign: cell.verticalAlign ?? (rowHeight > 32 ? "top" : "center")
      });
      x += columns[index].width;
    });
    y += rowHeight;
  }
  doc.y = y + 12;
}

function drawDailyActivitiesReadingNote(doc: PDFKit.PDFDocument, report: DailyActivitiesReport): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const height = 34;
  if (doc.y + height > doc.page.height - PDF_CONTENT_BOTTOM) {
    doc.addPage();
    drawDailyActivitiesContinuationHeader(doc, report);
  }
  const y = doc.y;
  doc.roundedRect(margin, y, width, height, 3).fill("#f8fafc");
  doc.roundedRect(margin, y, width, height, 3).strokeColor("#cbd5e1").lineWidth(0.7).stroke();
  doc.fillColor("#475569").font("Helvetica").fontSize(8)
    .text("¹ Les montants indicatifs ou prévisionnels sans devise déclarée sont exclus des totaux validés. Ceux-ci incluent uniquement les mouvements validés; les opérations en attente restent visibles dans le détail.",
      margin + 8, y + 7, { width: width - 16, height: height - 10 });
  doc.y = y + height + 8;
}

function renderDailyActivitiesReportsPdf(doc: PDFKit.PDFDocument, overview: ReportsOverview, filters: ReportPeriodFilter): void {
  const report = overview.dailyActivitiesReport ?? buildDailyActivitiesReport([], [], filters)!;
  doc.on("pageAdded", () => { doc.y = PDF_CONTENT_TOP; });
  drawDailyActivitiesReportHeader(doc, report);
  drawDailyActivitiesMetadata(doc, report, overview.generatedAt);
  drawDailyActivitiesMetrics(doc, report);

  const availableWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const currencyColumns: PdfTableColumn[] = [
    { label: "DEVISE", width: availableWidth * 0.13, align: "center" },
    { label: "VALIDÉS / ATTENTE", width: availableWidth * 0.16, align: "center" },
    { label: "ENTRÉES VALIDÉES", width: availableWidth * 0.24, align: "right" },
    { label: "SORTIES VALIDÉES", width: availableWidth * 0.24, align: "right" },
    { label: "SOLDE VALIDÉ", width: availableWidth * 0.23, align: "right" }
  ];
  drawDailyActivitiesTable(doc, report, "Flux validés par devise", currencyColumns,
    report.currencySummaries.map((row) => [
      { value: row.currency }, {
        value: `${formatPdfNumber(row.approvedTransactionsCount)} / ${formatPdfNumber(row.pendingTransactionsCount)}`
      },
      { value: formatDailyActivityMoney(row.cashInAmount, row.currency) },
      { value: formatDailyActivityMoney(row.cashOutAmount, row.currency) },
      { value: formatDailyActivityMoney(row.netAmount, row.currency) }
    ]), "Aucun mouvement financier validé sur la période.");
  drawDailyActivitiesReadingNote(doc, report);

  const categoryColumns: PdfTableColumn[] = [
    { label: "CATÉGORIE", width: availableWidth * 0.40, align: "left" },
    { label: "ACTIVITÉS", width: availableWidth * 0.15, align: "center" },
    { label: "À SUIVRE", width: availableWidth * 0.15, align: "center" },
    { label: "TERMINÉES", width: availableWidth * 0.15, align: "center" },
    { label: "BLOQUÉES", width: availableWidth * 0.15, align: "center" }
  ];
  drawDailyActivitiesTable(doc, report, "Activités par catégorie", categoryColumns,
    report.categories.map((row) => [
      { value: row.categoryLabel }, { value: formatPdfNumber(row.activitiesCount) },
      { value: formatPdfNumber(row.openCount) }, { value: formatPdfNumber(row.doneCount) },
      { value: formatPdfNumber(row.blockedCount) }
    ]), "Aucune activité enregistrée sur la période.");

  const taskColumns: PdfTableColumn[] = [
    { label: "ÉCHÉANCE", width: 65, align: "center" },
    { label: "CATÉGORIE", width: 110, align: "left" },
    { label: "ACTIVITÉ / DÉTAIL", width: 270, align: "left" },
    { label: "ACCORD / PARTENAIRE", width: 160, align: "left" },
    { label: "STATUT", width: 75, align: "center" },
    { label: "MONTANT INDICATIF¹", width: availableWidth - 680, align: "right" }
  ];
  drawDailyActivitiesTable(doc, report, `Suivi des activités (${formatPdfNumber(report.activities.length)} ligne(s))`, taskColumns,
    report.activities.map((row) => [
      { value: row.dueDate ? formatPdfDate(row.dueDate) : "—", align: "center" },
      { value: truncatePdfText(row.categoryLabel, 20) },
      { value: `${truncatePdfText(row.title, 44)}\n${truncatePdfText(row.description || "Aucun détail fourni", 48)}`, verticalAlign: "top" },
      { value: `${truncatePdfText(row.agreementRef || "—", 20)}\n${truncatePdfText(row.partnerName || "—", 20)}`, verticalAlign: "top" },
      { value: toDisplayTaskStatusLabel(row.status), align: "center" },
      { value: row.indicativeAmount ? formatPdfNumber(row.indicativeAmount) : "—", align: "right" }
    ]), "Aucune activité enregistrée sur la période.", 34);

  const agreementColumns: PdfTableColumn[] = [
    { label: "RÉFÉRENCE", width: 92, align: "left" },
    { label: "PARTENAIRE", width: 120, align: "left" },
    { label: "TYPE / STATUT", width: 75, align: "left" },
    { label: "DATE", width: 75, align: "center" },
    { label: "OBJET", width: 160, align: "left" },
    { label: "CAPITAL CONVENU¹", width: 80, align: "right" },
    { label: "BÉNÉFICE PRÉVU¹", width: 80, align: "right" },
    { label: "COMPTE PRÉVU", width: availableWidth - 682, align: "left" }
  ];
  drawDailyActivitiesTable(doc, report, `Protocoles d'accord (${formatPdfNumber(report.agreements.length)} ligne(s))`, agreementColumns,
    report.agreements.map((row) => [
      { value: truncatePdfText(row.agreementRef, 18) },
      { value: truncatePdfText(row.partnerName, 24) },
      { value: `${truncatePdfText(row.agreementType, 16)}\n${row.status ? toDisplayTaskStatusLabel(row.status) : "Fiche absente"}`, verticalAlign: "top" },
      { value: row.agreementDate ? formatPdfDate(row.agreementDate) : "—", align: "center" },
      { value: truncatePdfText(row.purpose, 34) },
      { value: row.capitalAmount ? formatPdfNumber(row.capitalAmount) : "—", align: "right" },
      { value: row.profitAmount ? formatPdfNumber(row.profitAmount) : "—", align: "right" },
      { value: truncatePdfText(row.paymentAccount || "—", 20) }
    ]), "Aucun protocole d'accord référencé sur la période.", 32);

  const transactionColumns: PdfTableColumn[] = [
    { label: "DATE", width: 64, align: "center" },
    { label: "MOUVEMENT", width: 133, align: "left" },
    { label: "ACCORD / PARTENAIRE", width: 165, align: "left" },
    { label: "RÉFÉRENCE / DÉTAIL", width: 205, align: "left" },
    { label: "MONTANT", width: 110, align: "right" },
    { label: "STATUT", width: availableWidth - 677, align: "center" }
  ];
  drawDailyActivitiesTable(doc, report, `Mouvements financiers (${formatPdfNumber(report.transactions.length)} ligne(s))`, transactionColumns,
    report.transactions.map((row) => [
      { value: formatPdfDate(row.date), align: "center" },
      { value: `${row.operationLabel}\n${row.direction === "CASH_IN" ? "Entrée" : "Sortie"}`, verticalAlign: "top" },
      { value: `${truncatePdfText(row.agreementRef || "—", 23)}\n${truncatePdfText(row.partnerName || "—", 23)}`, verticalAlign: "top" },
      { value: `${truncatePdfText(row.paymentReference || row.description || "—", 34)}\n${truncatePdfText(row.description || "", 34)}`, verticalAlign: "top" },
      { value: formatDailyActivityMoney(row.amount, row.currency), align: "right" },
      { value: toDisplayTransactionStatusLabel(row.status), align: "center" }
    ]), "Aucun mouvement financier enregistré sur la période.", 34);

}

function drawDailyActivitiesPdfFooter(doc: PDFKit.PDFDocument, pageNumber: number, totalPages: number, periodLabel: string): void {
  drawSectorReportFooter(doc, "Activit\u00e9s quotidiennes", periodLabel, pageNumber, totalPages);
}

const AGRICULTURE_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "CAMPAGNE", width: 66, align: "left" },
  { label: "PARCELLE", width: 66, align: "left" },
  { label: "CHAMP", width: 60, align: "left" },
  { label: "CULTURE", width: 58, align: "left" },
  { label: "SURF.", width: 45, align: "right" },
  { label: "RECETTES", width: 60, align: "right" },
  { label: "DÉPENSES", width: 60, align: "right" },
  { label: "NET", width: 60, align: "right" },
  { label: "EXEC. %", width: 40, align: "right" }
];

function buildEmptyAgricultureOperationsReport(filters: ReportPeriodFilter): AgricultureOperationsReport {
  return {
    periodLabel: toAgriculturePeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      parcelsCount: 0,
      surfaceArea: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      executionRate: 0,
      currency: "XOF"
    }
  };
}

function drawAgricultureFieldMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x, y + 30, 106, 36, 5).fill("#ecfccb");
  doc.rect(x, y + 30, 106, 36).strokeColor("#166534").lineWidth(0.8).stroke();

  doc.strokeColor("#65a30d").lineWidth(1);
  for (let index = 0; index < 7; index += 1) {
    const lineX = x + 8 + index * 14;
    doc.moveTo(lineX, y + 62).lineTo(lineX + 24, y + 34).stroke();
  }

  doc.fillColor("#14532d");
  for (let index = 0; index < 5; index += 1) {
    const plantX = x + 15 + index * 18;
    doc
      .moveTo(plantX, y + 29)
      .lineTo(plantX, y + 14)
      .strokeColor("#166534")
      .lineWidth(1.2)
      .stroke();
    doc.ellipse(plantX - 4, y + 20, 4, 8).fill("#22c55e");
    doc.ellipse(plantX + 4, y + 20, 4, 8).fill("#16a34a");
  }

  doc.circle(x + 84, y + 17, 10).fill("#facc15");
  doc.restore();
}

function drawAgricultureReportHeader(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport): void {
  drawSectorReportHeader(doc, AGRICULTURE_REPORT_BRANDING.title, "SUIVI DES OPERATIONS AGRICOLES PAR CAMPAGNE", (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawAgricultureMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: AgricultureOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#f8fafc");
  doc.rect(margin, y, width, 42).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Période", margin + 10, y + 8, { width: 155 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(period, margin + 10, y + 21, { width: 175 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Secteur", margin + 205, y + 8, { width: 120 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Activité agricole", margin + 205, y + 21, { width: 140 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Genere le", pageWidth - margin - 150, y + 8, {
      width: 140,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
      width: 140,
      align: "right"
    });
  doc.y = y + 56;
}

function drawAgricultureMetricCards(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "Parcelles / surface",
      value: `${formatPdfNumber(report.totals.parcelsCount)} | ${formatPdfNumber(report.totals.surfaceArea, 2)} ha`
    },
    { label: "Recettes", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.cashOutAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f0fdf4");
    doc.rect(x, y, cardWidth, 45).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica")
      .fontSize(8.3)
      .text(metric.label, x + 8, y + 8, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11.2)
      .text(metric.value, x + 8, y + 23, {
        width: cardWidth - 16
      });
  });
  doc.y = y + 60;

  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text(
      `Exécution terrain: ${formatPdfNumber(report.totals.executionRate, 1)}% | tâches ${formatPdfNumber(report.totals.doneTasksCount)} terminées, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquées.`,
      margin,
      doc.y - 8,
      {
        width: pageWidth - margin * 2,
        align: "center"
      }
    );
  doc.moveDown(0.8);
}

function drawAgricultureTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of fitPdfColumns(doc, AGRICULTURE_PDF_COLUMNS)) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#dcfce7",
      font: "Helvetica-Bold",
      fontSize: 7.4
    });
    x += column.width;
  }
  return y + 22;
}

function drawAgricultureDataRow(
  doc: PDFKit.PDFDocument,
  row: AgricultureOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.campaignRef, 16), align: "left" as const },
    { value: truncatePdfText(row.parcelRef, 16), align: "left" as const },
    { value: truncatePdfText(row.fieldType, 14), align: "left" as const },
    { value: truncatePdfText(row.cropType, 14), align: "left" as const },
    { value: formatPdfNumber(row.surfaceArea, 2), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 1)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = fitPdfColumns(doc, AGRICULTURE_PDF_COLUMNS)[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 7.2
    });
    x += column.width;
  });
  return y + 20;
}

function drawAgricultureTotalsRow(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport, y: number): number {
  const firstColumnsWidth = fitPdfColumns(doc, AGRICULTURE_PDF_COLUMNS).slice(0, 4).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 8
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.surfaceArea, 2),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 1)}%`
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = fitPdfColumns(doc, AGRICULTURE_PDF_COLUMNS)[index + 4];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f0fdf4",
      font: "Helvetica-Bold",
      fontSize: 7.3
    });
    x += column.width;
  }
  return y + 22;
}

function drawAgricultureEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#f0fdf4");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
  doc
    .fillColor("#14532d")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Aucune opération agricole reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#166534")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF comptabilisées et les tâches agricoles de la période. Renseignez campagne, parcelle et type de champ pour alimenter le suivi.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawAgricultureOperationsTable(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport): void {
  if (report.rows.length === 0) {
    drawAgricultureEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawAgricultureReportHeader(doc, report);
  }
  doc
    .fillColor("#14532d")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Synthèse par campagne, parcelle et culture", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawAgricultureTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawAgricultureReportHeader(doc, report);
      y = drawAgricultureTableHeader(doc, doc.y);
    }
    y = drawAgricultureDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawAgricultureReportHeader(doc, report);
    y = drawAgricultureTableHeader(doc, doc.y);
  }
  doc.y = drawAgricultureTotalsRow(doc, report, y) + 14;
}

function drawAgricultureBreakdown(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawAgricultureReportHeader(doc, report);
  }

  doc
    .fillColor("#14532d")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DÉPENSES", width: 80, align: "right" },
    { label: "NET", width: 85, align: "right" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: "center",
      fill: "#dcfce7",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawAgricultureReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#dcfce7",
          font: "Helvetica-Bold",
          fontSize: 7.5
        });
        x += column.width;
      }
      y += 20;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: truncatePdfText(row.operationLabel, 38), align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 19, {
        align: item.align,
        fontSize: 7.4
      });
      x += column.width;
    });
    y += 19;
  }
  doc.y = y + 10;
}

function drawAgriculturePdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Rapport agricole", periodLabel, pageNumber, totalPages);
}

function renderAgricultureReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.agricultureOperationsReport ?? buildEmptyAgricultureOperationsReport(filters);

  drawAgricultureReportHeader(doc, report);
  drawAgricultureMetadataStrip(doc, report, filters, overview.generatedAt);
  drawAgricultureMetricCards(doc, report);
  drawAgricultureOperationsTable(doc, report);
  drawAgricultureBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildEmptyGeneralStoreOperationsReport(): GeneralStoreOperationsReport {
  const asOfLabel = formatPdfDate(new Date().toISOString());
  return {
    periodLabel: `Cumul au ${asOfLabel}`,
    asOfLabel,
    rows: [],
    operationRows: [],
    breakdownRows: [],
    totals: {
      shopsCount: 0,
      purchaseAmount: "0.00",
      collectedAmount: "0.00",
      balanceAmount: "0.00",
      transactionsCount: 0,
      currency: "XOF"
    }
  };
}

const GENERAL_STORE_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "BOUTIQUE / INVENTAIRE", width: 140, align: "left" },
  { label: "OPÉRATIONS", width: 50, align: "center" },
  { label: "TOTAL ACHATS", width: 95, align: "right" },
  { label: "TOTAL RECOUVRÉ", width: 95, align: "right" },
  { label: "SOLDE DÛ", width: 85, align: "right" },
  { label: "STOCK RESTANT", width: 95, align: "right" },
  { label: "VENDU ESTIMÉ*", width: 100, align: "right" },
  { label: "ÉCART*", width: 100, align: "right" }
];

function drawGeneralStoreReportHeader(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  drawSectorReportHeader(doc, GENERAL_STORE_REPORT_BRANDING.title, `SITUATION CUMULÉE DES BOUTIQUES AU ${report.asOfLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawGeneralStoreContinuationHeader(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  drawSectorContinuationHeader(doc, "SITUATION CUMULÉE DES BOUTIQUES", report.asOfLabel);
}

function drawGeneralStoreMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: GeneralStoreOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#eef2ff");
  doc.rect(margin, y, width, 42).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Période", margin + 10, y + 8, { width: 155 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(period, margin + 10, y + 21, { width: 175 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Situation au", margin + 205, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(report.asOfLabel, margin + 205, y + 21, { width: 140 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Généré le", pageWidth - margin - 150, y + 8, {
    width: 140,
    align: "right"
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
    width: 140,
    align: "right"
  });
  doc.y = y + 56;
}

function drawGeneralStoreMetricCards(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Boutiques suivies", value: formatPdfNumber(report.totals.shopsCount) },
    { label: "Total achats", value: formatPdfMoney(report.totals.purchaseAmount) },
    { label: "Total recouvré", value: formatPdfMoney(report.totals.collectedAmount) },
    { label: "Solde total dû", value: formatPdfMoney(report.totals.balanceAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#eef2ff");
    doc.rect(x, y, cardWidth, 45).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 8, y + 8, { width: cardWidth - 16 });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11.2).text(metric.value, x + 8, y + 23, { width: cardWidth - 16 });
  });
  doc.y = y + 60;
  doc.moveDown(0.8);
}

function drawGeneralStoreTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of GENERAL_STORE_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: "center",
      fill: "#e0e7ff",
      font: "Helvetica-Bold",
      fontSize: 8.5
    });
    x += column.width;
  }
  return y + 27;
}

function drawGeneralStoreDataRow(
  doc: PDFKit.PDFDocument,
  row: GeneralStoreOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(`${row.shopRef} / ${row.lastInventoryDate ? formatPdfDate(row.lastInventoryDate) : "sans inventaire"}`, 28), align: "left" as const },
    { value: formatPdfNumber(row.transactionsCount), align: "center" as const },
    { value: formatPdfMoney(row.purchaseAmount), align: "right" as const },
    { value: formatPdfMoney(row.collectedAmount), align: "right" as const },
    { value: formatPdfMoney(row.balanceAmount), align: "right" as const },
    { value: row.remainingStockValue !== null ? formatPdfMoney(row.remainingStockValue) : "-", align: "right" as const },
    { value: row.estimatedSoldAmount !== null ? formatPdfMoney(row.estimatedSoldAmount) : "-", align: "right" as const },
    { value: row.varianceAmount !== null ? formatPdfMoney(row.varianceAmount) : "-", align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = GENERAL_STORE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 24, {
      align: item.align,
      fontSize: 10.5
    });
    x += column.width;
  });
  return y + 24;
}

function drawGeneralStoreTotalsRow(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport, y: number): number {
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, GENERAL_STORE_PDF_COLUMNS[0].width, 27, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  x += GENERAL_STORE_PDF_COLUMNS[0].width;
  drawPdfTableCell(doc, formatPdfNumber(report.totals.transactionsCount), x, y, GENERAL_STORE_PDF_COLUMNS[1].width, 27, {
    align: "center",
    fill: "#eef2ff",
    font: "Helvetica-Bold",
    fontSize: 10
  });
  x += GENERAL_STORE_PDF_COLUMNS[1].width;

  const values = [
    formatPdfMoney(report.totals.purchaseAmount),
    formatPdfMoney(report.totals.collectedAmount),
    formatPdfMoney(report.totals.balanceAmount)
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = GENERAL_STORE_PDF_COLUMNS[index + 2];
    drawPdfTableCell(doc, values[index], x, y, column.width, 27, {
      align: "right",
      fill: "#eef2ff",
      font: "Helvetica-Bold",
      fontSize: 11
    });
    x += column.width;
  }

  for (let index = 5; index < GENERAL_STORE_PDF_COLUMNS.length; index += 1) {
    const column = GENERAL_STORE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, "", x, y, column.width, 27, { fill: "#eef2ff" });
    x += column.width;
  }

  return y + 27;
}

function drawGeneralStoreEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#eef2ff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(11).text("Aucune boutique reportable", margin + 14, y + 16, {
    width: pageWidth - margin * 2 - 28
  });
  doc.fillColor("#3730a3").font("Helvetica").fontSize(9.2).text(
    "Le rapport reprend les achats livrés et les recouvrements comptabilisés par boutique. Ajoutez une boutique et saisissez un achat ou un recouvrement pour alimenter le suivi.",
    margin + 14,
    y + 34,
    { width: pageWidth - margin * 2 - 28 }
  );
  doc.y = y + 88;
}

function drawGeneralStoreOperationsTable(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  if (report.rows.length === 0) {
    drawGeneralStoreEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (doc.y + 27 + 24 + 27 > tableBottom) {
    doc.addPage();
    drawGeneralStoreContinuationHeader(doc, report);
  }
  let y = drawGeneralStoreTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 24 + 27 > tableBottom) {
      doc.addPage();
      drawGeneralStoreContinuationHeader(doc, report);
      y = drawGeneralStoreTableHeader(doc, doc.y);
    }
    y = drawGeneralStoreDataRow(doc, row, y);
  }

  if (y + 27 > tableBottom) {
    doc.addPage();
    drawGeneralStoreContinuationHeader(doc, report);
    y = drawGeneralStoreTableHeader(doc, doc.y);
  }
  doc.y = drawGeneralStoreTotalsRow(doc, report, y) + 12;
}

function drawGeneralStoreSupplementaryTables(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const drawSection = (title: string, columns: PdfTableColumn[], rows: string[][], emptyText: string): void => {
    const sectionHeight = 20 + 25 + Math.max(1, rows.length) * 24;
    if (doc.y + sectionHeight > tableBottom) {
      doc.addPage();
      drawGeneralStoreContinuationHeader(doc, report);
    }
    doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(12)
      .text(title, margin, doc.y, { width });
    let y = doc.y + 20;
    const drawHeader = (): void => {
      let x = margin;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 25, {
          align: "center", fill: "#e0e7ff", font: "Helvetica-Bold", fontSize: 8.5
        });
        x += column.width;
      }
      y += 25;
    };
    drawHeader();
    if (rows.length === 0) {
      drawPdfTableCell(doc, emptyText, margin, y, width, 30, {
        align: "left", fontSize: 8.5
      });
      doc.y = y + 42;
      return;
    }
    const shownRows = rows;
    for (const row of shownRows) {
      if (y + 24 > tableBottom) {
        doc.addPage();
        drawGeneralStoreContinuationHeader(doc, report);
        doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(10)
          .text(`${title} (suite)`, margin, doc.y, { width });
        y = doc.y + 18;
        drawHeader();
      }
      let x = margin;
      columns.forEach((column, index) => {
        drawPdfTableCell(doc, row[index] ?? "", x, y, column.width, 24, {
          align: column.align, fontSize: rows.length === 0 ? 8.5 : 8
        });
        x += column.width;
      });
      y += 24;
    }
    doc.y = y + 14;
  };

  const summaryColumns: PdfTableColumn[] = [
    { label: "NATURE DE L'OPÉRATION", width: width * 0.56, align: "left" },
    { label: "LIGNES", width: width * 0.16, align: "center" },
    { label: "MONTANT", width: width * 0.28, align: "right" }
  ];
  drawSection("Répartition des mouvements", summaryColumns, report.breakdownRows.map((row) => [
    row.operationLabel, formatPdfNumber(row.transactionsCount), formatPdfMoney(row.amount)
  ]), "Aucun mouvement comptabilisé à la date de situation.");

  const detailColumns: PdfTableColumn[] = [
    { label: "DATE", width: width * 0.10, align: "center" },
    { label: "BOUTIQUE", width: width * 0.18, align: "left" },
    { label: "NATURE", width: width * 0.15, align: "left" },
    { label: "DÉSIGNATION / MOTIF", width: width * 0.39, align: "left" },
    { label: "MONTANT", width: width * 0.18, align: "right" }
  ];
  drawSection(`Opérations détaillées (${formatPdfNumber(report.operationRows.length)} ligne(s))`, detailColumns,
    report.operationRows.map((row) => [
      formatPdfDate(row.date), truncatePdfText(row.shopRef, 22),
      `${row.operationKind === "ACHAT" ? "Achat" : "Recouvrement"} (${row.status === "APPROVED" ? "approuvée" : "soumise"})`,
      truncatePdfText(row.designation, 50), formatPdfMoney(row.amount)
    ]), "Aucune opération détaillée disponible.");
}

function drawGeneralStoreReadingNote(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const width = doc.page.width - margin * 2;
  const height = 48;
  if (needsPdfPageBreak(doc, height + 10)) {
    doc.addPage();
    drawGeneralStoreContinuationHeader(doc, report);
  }
  const y = doc.y;
  doc.roundedRect(margin, y, width, height, 4).fill("#f8fafc");
  doc.roundedRect(margin, y, width, height, 4).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
  doc.fillColor("#334155").font("Helvetica").fontSize(8.3).text(
    "Lecture : les totaux incluent les opérations soumises et approuvées. Le solde dû est calculé sur les achats livrés et recouvrements cumulés jusqu'à la date de situation. *Le vendu estimé et l'écart sont calculés à la date du dernier inventaire : achats enregistrés à cette date moins stock évalué, puis comparaison aux recouvrements de cette même date. L'estimation suppose que le stock initial est nul ou déjà intégré. Elle reste à rapprocher des ventes constatées et n'est pas affichée si les achats enregistrés ne couvrent pas le stock déclaré.",
    margin + 9,
    y + 7,
    { width: width - 18, height: height - 12 }
  );
  doc.y = y + height + 10;
}

function drawGeneralStorePdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Rapport boutiques", periodLabel, pageNumber, totalPages);
}

function renderGeneralStoreReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.generalStoreOperationsReport ?? buildEmptyGeneralStoreOperationsReport();

  drawGeneralStoreReportHeader(doc, report);
  drawGeneralStoreMetadataStrip(doc, report, filters, overview.generatedAt);
  drawGeneralStoreMetricCards(doc, report);
  drawGeneralStoreReadingNote(doc, report);
  drawGeneralStoreOperationsTable(doc, report);
  drawGeneralStoreSupplementaryTables(doc, report);
}

function buildEmptyFoodOperationsReport(filters: ReportPeriodFilter): FoodOperationsReport {
  return {
    periodLabel: toFoodPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      productFamiliesCount: 0,
      productsCount: 0,
      batchesCount: 0,
      purchaseQuantity: 0,
      soldQuantity: 0,
      lossQuantity: 0,
      purchaseAmount: "0.00",
      salesAmount: "0.00",
      lossAmount: "0.00",
      expenseAmount: "0.00",
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      grossMargin: "0.00",
      marginRate: 0,
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const FOOD_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "FAMILLE", width: 55, align: "left" },
  { label: "PRODUIT", width: 47, align: "left" },
  { label: "LOT", width: 48, align: "left" },
  { label: "ZONE", width: 40, align: "left" },
  { label: "ACHAT", width: 36, align: "right" },
  { label: "VENTE", width: 36, align: "right" },
  { label: "PERTE", width: 36, align: "right" },
  { label: "CA", width: 48, align: "right" },
  { label: "COÛT", width: 48, align: "right" },
  { label: "NET", width: 48, align: "right" },
  { label: "MARGE", width: 41, align: "right" },
  { label: "BLQ", width: 25, align: "right" }
];

function drawFoodReportHeader(doc: PDFKit.PDFDocument, report: FoodOperationsReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 92;
  const centerWidth = pageWidth - margin * 2 - 184;

  doc.save();
  doc.roundedRect(margin, 22, 86, 58, 6).fill("#fff7ed");
  doc.roundedRect(margin, 22, 86, 58, 6).strokeColor("#16a34a").lineWidth(1).stroke();
  doc.circle(margin + 30, 43, 12).fill("#f97316");
  doc.rect(margin + 48, 32, 18, 28).fill("#22c55e");
  doc.rect(margin + 52, 26, 10, 8).fill("#15803d");
  doc.moveTo(margin + 18, 64).lineTo(margin + 72, 64).strokeColor("#16a34a").lineWidth(2).stroke();
  doc.restore();

  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(16).text(FOOD_REPORT_BRANDING.title, centerX, 22, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#166534").font("Helvetica").fontSize(9.2).text(FOOD_REPORT_BRANDING.agency, centerX, 42, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#d21f1f").font("Helvetica-Bold").fontSize(11).text(`"${FOOD_REPORT_BRANDING.brand}"`, centerX, 55, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#14532d").font("Helvetica-Bold").fontSize(8.5).text(`${FOOD_REPORT_BRANDING.fiscal}     ${FOOD_REPORT_BRANDING.phone}`, centerX, 69, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#14532d").font("Helvetica-Bold").fontSize(8.5).text(FOOD_REPORT_BRANDING.subtitle, centerX, 82, {
    width: centerWidth,
    align: "center"
  });
  doc.moveTo(margin, 100).lineTo(pageWidth - margin, 100).strokeColor("#22c55e").lineWidth(2).stroke();
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("SUIVI DES OPERATIONS ALIMENTAIRES PAR PRODUIT", margin, 114, {
    width: pageWidth - margin * 2,
    align: "center"
  });
  doc.y = 140;
}

function drawFoodMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: FoodOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#f0fdf4");
  doc.rect(margin, y, width, 42).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Période", margin + 10, y + 8, { width: 155 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(period, margin + 10, y + 21, { width: 175 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Secteur", margin + 205, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Alimentation", margin + 205, y + 21, { width: 140 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Genere le", pageWidth - margin - 150, y + 8, {
    width: 140,
    align: "right"
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
    width: 140,
    align: "right"
  });
  doc.y = y + 56;
}

function drawFoodMetricCards(doc: PDFKit.PDFDocument, report: FoodOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Familles / lots", value: `${formatPdfNumber(report.totals.productFamiliesCount)} | ${formatPdfNumber(report.totals.batchesCount)}` },
    { label: "Ventes", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Achats", value: formatPdfMoney(report.totals.purchaseAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f0fdf4");
    doc.rect(x, y, cardWidth, 45).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 8, y + 8, {
      width: cardWidth - 16
    });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11.2).text(metric.value, x + 8, y + 23, {
      width: cardWidth - 16
    });
  });
  doc.y = y + 60;
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text(
    `Quantités: achats ${formatPdfNumber(report.totals.purchaseQuantity, 2)} | ventes ${formatPdfNumber(report.totals.soldQuantity, 2)} | pertes ${formatPdfNumber(report.totals.lossQuantity, 2)} | marge ${formatPdfMoney(report.totals.grossMargin)} (${formatPdfNumber(report.totals.marginRate, 1)}%) | tâches ${formatPdfNumber(report.totals.doneTasksCount)} terminées, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquées.`,
    margin,
    doc.y - 8,
    {
      width: pageWidth - margin * 2,
      align: "center"
    }
  );
  doc.moveDown(0.8);
}

function drawFoodTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of FOOD_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#dcfce7",
      font: "Helvetica-Bold",
      fontSize: 5.65
    });
    x += column.width;
  }
  return y + 22;
}

function drawFoodDataRow(
  doc: PDFKit.PDFDocument,
  row: FoodOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.productFamily, 12), align: "left" as const },
    { value: truncatePdfText(row.productName, 10), align: "left" as const },
    { value: truncatePdfText(row.batchRef, 10), align: "left" as const },
    { value: truncatePdfText(row.storageArea, 9), align: "left" as const },
    { value: formatPdfNumber(row.purchaseQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.soldQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.lossQuantity, 1), align: "right" as const },
    { value: formatPdfMoney(row.salesAmount), align: "right" as const },
    { value: formatPdfMoney(row.purchaseAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.marginRate, 0)}%`, align: "right" as const },
    { value: formatPdfNumber(row.blockedTasksCount), align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = FOOD_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.35
    });
    x += column.width;
  });
  return y + 20;
}

function drawFoodTotalsRow(doc: PDFKit.PDFDocument, report: FoodOperationsReport, y: number): number {
  const firstColumnsWidth = FOOD_PDF_COLUMNS.slice(0, 4).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.purchaseQuantity, 1),
    formatPdfNumber(report.totals.soldQuantity, 1),
    formatPdfNumber(report.totals.lossQuantity, 1),
    formatPdfMoney(report.totals.salesAmount),
    formatPdfMoney(report.totals.purchaseAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.marginRate, 0)}%`,
    formatPdfNumber(report.totals.blockedTasksCount)
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = FOOD_PDF_COLUMNS[index + 4];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f0fdf4",
      font: "Helvetica-Bold",
      fontSize: 5.4
    });
    x += column.width;
  }
  return y + 22;
}

function drawFoodEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#f0fdf4");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#bbf7d0").lineWidth(0.8).stroke();
  doc.fillColor("#14532d").font("Helvetica-Bold").fontSize(11).text("Aucune opération alimentaire reportable", margin + 14, y + 16, {
    width: pageWidth - margin * 2 - 28
  });
  doc.fillColor("#166534").font("Helvetica").fontSize(9.2).text(
    "Le rapport reprend les transactions XOF comptabilisées et les tâches Alimentation de la période. Renseignez famille, produit, lot, quantité et zone pour alimenter le suivi.",
    margin + 14,
    y + 34,
    {
      width: pageWidth - margin * 2 - 28
    }
  );
  doc.y = y + 88;
}

function drawFoodOperationsTable(doc: PDFKit.PDFDocument, report: FoodOperationsReport): void {
  if (report.rows.length === 0) {
    drawFoodEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawFoodReportHeader(doc, report);
  }
  doc.fillColor("#14532d").font("Helvetica-Bold").fontSize(10.5).text("Synthèse par famille, produit, lot et zone", PDF_PAGE_MARGIN, doc.y, {
    width: doc.page.width - PDF_PAGE_MARGIN * 2
  });
  doc.moveDown(0.4);
  let y = drawFoodTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawFoodReportHeader(doc, report);
      y = drawFoodTableHeader(doc, doc.y);
    }
    y = drawFoodDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawFoodReportHeader(doc, report);
    y = drawFoodTableHeader(doc, doc.y);
  }
  doc.y = drawFoodTotalsRow(doc, report, y) + 14;
}

function drawFoodBreakdown(doc: PDFKit.PDFDocument, report: FoodOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawFoodReportHeader(doc, report);
  }

  doc.fillColor("#14532d").font("Helvetica-Bold").fontSize(12).text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
    width: doc.page.width - PDF_PAGE_MARGIN * 2
  });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DÉPENSES", width: 80, align: "right" },
    { label: "NET", width: 85, align: "right" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: "center",
      fill: "#dcfce7",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawFoodReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#dcfce7",
          font: "Helvetica-Bold",
          fontSize: 7.5
        });
        x += column.width;
      }
      y += 20;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: truncatePdfText(row.operationLabel, 38), align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 19, {
        align: item.align,
        fontSize: 7.4
      });
      x += column.width;
    });
    y += 19;
  }
  doc.y = y + 10;
}

function drawFoodPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc.moveTo(margin, pageHeight - 44).lineTo(pageWidth - margin, pageHeight - 44).strokeColor("#bbf7d0").lineWidth(1).stroke();
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`AMCCO - Rapport alimentation | ${periodLabel}`, margin, pageHeight - 32, {
    width: 330,
    lineBreak: false
  });
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
    width: 80,
    align: "right",
    lineBreak: false
  });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

function renderFoodReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.foodOperationsReport ?? buildEmptyFoodOperationsReport(filters);

  drawFoodReportHeader(doc, report);
  drawFoodMetadataStrip(doc, report, filters, overview.generatedAt);
  drawFoodMetricCards(doc, report);
  drawFoodOperationsTable(doc, report);
  drawFoodBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildEmptyRentalOperationsReport(filters: ReportPeriodFilter): RentalOperationsReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    asOfLabel: formatPdfDate(resolveRentalAsOfDate(filters).toISOString()),
    rows: [],
    operationRows: [],
    depositRows: [],
    totals: {
      tenantsCount: 0,
      upToDateTenantsCount: 0,
      lateTenantsCount: 0,
      totalArrearsAmount: "0.00",
      collectedAmount: "0.00",
      depositAmount: "0.00",
      depositPaidTenantsCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const RENTAL_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "LOCATAIRE", width: 170, align: "center" },
  { label: "LOGEMENT OCCUPÉ", width: 170, align: "center" },
  { label: "LOYER MENSUEL", width: 100, align: "center" },
  { label: "STATUT", width: 90, align: "center" },
  { label: "SOLDE", width: 100, align: "center" },
  { label: "MOIS DE RÉFÉRENCE", width: 132, align: "center" }
];

function toRentalPdfPeriodLabel(filters: ReportPeriodFilter): string {
  const from = filters.dateFrom ? formatPdfDate(filters.dateFrom) : null;
  const to = filters.dateTo ? formatPdfDate(filters.dateTo) : null;
  if (from && to) {
    return `Du ${from} au ${to}`;
  }
  if (from) {
    return `Depuis le ${from}`;
  }
  if (to) {
    return `Jusqu'au ${to}`;
  }
  return "Toutes périodes";
}

function toRentalStatusLabel(status: RentalOperationsReport["rows"][number]["status"]): string {
  if (status === "EN_RETARD") {
    return "En retard";
  }
  if (status === "AVANCE") {
    return "En avance";
  }
  return "À jour";
}

function toRentalPivotMonthLabel(row: RentalOperationsReport["rows"][number]): string {
  if (row.status === "EN_RETARD") {
    return row.statusDetail.replace("En retard depuis ", "");
  }
  if (row.status === "AVANCE") {
    return row.statusDetail.replace("Payé d'avance jusqu'à ", "");
  }
  return "-";
}

function toRentalPdfTitle(report: RentalOperationsReport): string {
  return `SITUATION DES LOYERS - AU ${report.asOfLabel.toUpperCase()}`;
}

function drawRentalPropertyMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 4, y + 18, 108, 52, 6).fill("#ecfeff");
  doc.roundedRect(x + 4, y + 18, 108, 52, 6).strokeColor("#0f766e").lineWidth(0.9).stroke();
  doc.rect(x + 22, y + 32, 60, 30).fill("#14b8a6");
  doc
    .moveTo(x + 18, y + 32)
    .lineTo(x + 52, y + 14)
    .lineTo(x + 86, y + 32)
    .closePath()
    .fill("#0f766e");
  doc.rect(x + 44, y + 45, 16, 17).fill("#f8fafc");
  doc.rect(x + 28, y + 38, 9, 9).fill("#ccfbf1");
  doc.rect(x + 68, y + 38, 9, 9).fill("#ccfbf1");
  doc.circle(x + 102, y + 31, 6).strokeColor("#0f766e").lineWidth(2).stroke();
  doc.moveTo(x + 107, y + 35).lineTo(x + 113, y + 41).strokeColor("#0f766e").lineWidth(2).stroke();
  doc.moveTo(x + 112, y + 41).lineTo(x + 118, y + 41).strokeColor("#0f766e").lineWidth(2).stroke();
  doc.restore();
}

function drawRentalReportHeader(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  drawSectorReportHeader(doc, RENTAL_REPORT_BRANDING.title, toRentalPdfTitle(report), (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawRentalContinuationHeader(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  drawSectorContinuationHeader(doc, toRentalPdfTitle(report), report.periodLabel);
}

function drawRentalMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: RentalOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 50, 4).fill("#ecfeff");
  doc.rect(margin, y, width, 50).strokeColor("#99f6e4").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Période", margin + 10, y + 10, { width: 160 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(period, margin + 10, y + 26, { width: 190 });
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Situation au", margin + 220, y + 10, { width: 130 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(report.asOfLabel, margin + 220, y + 26, { width: 190 });
  doc
    .fillColor("#486581")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Généré le", pageWidth - margin - 160, y + 10, {
      width: 150,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 160, y + 26, {
      width: 150,
      align: "right"
    });
  doc.y = y + 54;
}

function drawRentalMetricCards(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "À jour / locataires",
      value: `${formatPdfNumber(report.totals.upToDateTenantsCount)} / ${formatPdfNumber(report.totals.tenantsCount)}`
    },
    { label: "En retard", value: formatPdfNumber(report.totals.lateTenantsCount) },
    { label: "Arriérés cumulés", value: formatPdfMoney(report.totals.totalArrearsAmount) },
    { label: "Loyers encaissés (période)", value: formatPdfMoney(report.totals.collectedAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 54, 4).fill("#ecfeff");
    doc.rect(x, y, cardWidth, 54).strokeColor("#99f6e4").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(metric.label, x + 8, y + 10, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(metric.value, x + 8, y + 27, {
        width: cardWidth - 16,
        align: "center"
      });
  });
  doc.y = y + 64;
}

function drawRentalTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of RENTAL_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: "center",
      fill: "#ccfbf1",
      font: "Helvetica-Bold",
      fontSize: 11
    });
    x += column.width;
  }
  return y + 27;
}

function drawRentalDataRow(
  doc: PDFKit.PDFDocument,
  row: RentalOperationsReport["rows"][number],
  y: number
): number {
  const balanceValue = toNumberAmount(row.balanceAmount);
  const values = [
    { value: truncatePdfText(row.tenantRef, 28), align: "center" as const },
    { value: truncatePdfText(row.unitRef, 28), align: "center" as const },
    { value: formatPdfMoney(row.monthlyRent), align: "center" as const },
    { value: toRentalStatusLabel(row.status), align: "center" as const },
    {
      value: row.status === "A_JOUR" ? "—" : formatPdfMoney(balanceValue),
      align: "center" as const
    },
    { value: truncatePdfText(toRentalPivotMonthLabel(row), 22), align: "center" as const }
  ];
  const fillColor = row.status === "EN_RETARD" ? "#fef2f2" : undefined;
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = RENTAL_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 26, {
      align: item.align,
      fontSize: 10.5,
      fill: fillColor
    });
    x += column.width;
  });
  return y + 26;
}

function drawRentalTotalsRow(doc: PDFKit.PDFDocument, report: RentalOperationsReport, y: number): number {
  const firstColumnsWidth =
    RENTAL_PDF_COLUMNS[0].width + RENTAL_PDF_COLUMNS[1].width + RENTAL_PDF_COLUMNS[2].width;
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL DES ARRIÉRÉS", x, y, firstColumnsWidth, 28, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  x += firstColumnsWidth;

  drawPdfTableCell(
    doc,
    `${formatPdfNumber(report.totals.lateTenantsCount)} en retard`,
    x,
    y,
    RENTAL_PDF_COLUMNS[3].width,
    28,
    {
      align: "center",
      fill: "#ecfeff",
      font: "Helvetica-Bold",
      fontSize: 10
    }
  );
  x += RENTAL_PDF_COLUMNS[3].width;

  drawPdfTableCell(doc, formatPdfMoney(report.totals.totalArrearsAmount), x, y, RENTAL_PDF_COLUMNS[4].width, 28, {
    align: "center",
    fill: "#ecfeff",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  x += RENTAL_PDF_COLUMNS[4].width;

  drawPdfTableCell(doc, "", x, y, RENTAL_PDF_COLUMNS[5].width, 28, { fill: "#ecfeff" });
  return y + 28;
}

function drawRentalEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#ecfeff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#99f6e4").lineWidth(0.8).stroke();
  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Aucun locataire actif à afficher", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#0f766e")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "La situation des loyers apparaîtra ici lorsque des locataires actifs seront enregistrés.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawRentalOperationsTable(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  if (report.rows.length === 0) {
    drawRentalEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 106)) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
  }
  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Situation des loyers par locataire", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawRentalTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 26 + 28 > tableBottom) {
      doc.addPage();
      drawRentalContinuationHeader(doc, report);
      y = drawRentalTableHeader(doc, doc.y);
    }
    y = drawRentalDataRow(doc, row, y);
  }

  if (y + 28 > tableBottom) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
    y = drawRentalTableHeader(doc, doc.y);
  }
  doc.y = drawRentalTotalsRow(doc, report, y) + 6;
}

function drawRentalBreakdown(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  const breakdownHeight = 34 + 24 + report.operationRows.length * 24 + 28;
  if (needsPdfPageBreak(doc, breakdownHeight)) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
  }

  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(`Récapitulatif des loyers encaissés — ${report.periodLabel}`, PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "MONTANT REÇU", width: 320, align: "center" },
    { label: "NOMBRE DE PAIEMENTS", width: 180, align: "center" },
    { label: "TOTAL ENCAISSÉ", width: 262, align: "center" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 24, {
      align: "center",
      fill: "#ccfbf1",
      font: "Helvetica-Bold",
      fontSize: 10.5
    });
    x += column.width;
  }
  y += 24;

  for (const row of report.operationRows) {
    if (y + 24 + 28 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawRentalContinuationHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 24, {
          align: "center",
          fill: "#ccfbf1",
          font: "Helvetica-Bold",
          fontSize: 10.5
        });
        x += column.width;
      }
      y += 24;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: formatPdfMoney(row.operationKind), align: "center" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "center" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "center" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 24, {
        align: item.align,
        fontSize: 10.5
      });
      x += column.width;
    });
    y += 24;
  }
  const breakdownTotal = report.operationRows.reduce(
    (total, row) => total + toNumberAmount(row.transactionsCount),
    0
  );
  if (y + 28 > doc.page.height - PDF_CONTENT_BOTTOM) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
    y = doc.y;
    x = PDF_PAGE_MARGIN;
    for (const column of columns) {
      drawPdfTableCell(doc, column.label, x, y, column.width, 24, {
        align: "center",
        fill: "#ccfbf1",
        font: "Helvetica-Bold",
        fontSize: 10.5
      });
      x += column.width;
    }
    y += 24;
  }
  x = PDF_PAGE_MARGIN;
  const totalValues = ["TOTAL ENCAISSÉ", formatPdfNumber(breakdownTotal), formatPdfMoney(report.totals.collectedAmount)];
  totalValues.forEach((value, index) => {
    const column = columns[index];
    drawPdfTableCell(doc, value, x, y, column.width, 28, {
      align: "center",
      fill: "#ecfeff",
      font: "Helvetica-Bold",
      fontSize: 10.5
    });
    x += column.width;
  });
  doc.y = y + 34;
}

const RENTAL_DEPOSIT_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "LOCATAIRE", width: 190, align: "center" },
  { label: "LOGEMENT OCCUPÉ", width: 190, align: "center" },
  { label: "VERSEMENT", width: 130, align: "center" },
  { label: "MONTANT VERSÉ", width: 100, align: "center" },
  { label: "DERNIER VERSEMENT", width: 152, align: "center" }
];

function toRentalDepositStatusLabel(status: RentalOperationsReport["depositRows"][number]["status"]): string {
  return status === "PAYEE" ? "Versement reçu" : "Aucun versement";
}

function drawRentalDepositTable(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  if (report.depositRows.length === 0) {
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 120)) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
  }

  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(`Suivi des cautions au ${report.asOfLabel} (hors arriérés de loyer)`, PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  let y = doc.y;
  let x = PDF_PAGE_MARGIN;
  for (const column of RENTAL_DEPOSIT_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: "center",
      fill: "#ccfbf1",
      font: "Helvetica-Bold",
      fontSize: 9.5
    });
    x += column.width;
  }
  y += 27;

  for (const row of report.depositRows) {
    if (y + 26 + 28 > tableBottom) {
      doc.addPage();
      drawRentalContinuationHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of RENTAL_DEPOSIT_PDF_COLUMNS) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
          align: "center",
          fill: "#ccfbf1",
          font: "Helvetica-Bold",
          fontSize: 9.5
        });
        x += column.width;
      }
      y += 27;
    }

    const values = [
      { value: truncatePdfText(row.tenantRef, 30), align: "center" as const },
      { value: truncatePdfText(row.unitRef, 30), align: "center" as const },
      { value: toRentalDepositStatusLabel(row.status), align: "center" as const },
      { value: formatPdfMoney(row.depositPaidAmount), align: "center" as const },
      { value: row.lastPaymentLabel ?? "-", align: "center" as const }
    ];
    const fillColor = row.status === "NON_PAYEE" ? "#fef2f2" : undefined;
    x = PDF_PAGE_MARGIN;
    values.forEach((item, index) => {
      const column = RENTAL_DEPOSIT_PDF_COLUMNS[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 26, {
        align: item.align,
        fontSize: 10.5,
        fill: fillColor
      });
      x += column.width;
    });
    y += 26;
  }

  const depositTotal = report.depositRows.reduce(
    (total, row) => total + toNumberAmount(row.depositPaidAmount),
    0
  );
  if (y + 28 > tableBottom) {
    doc.addPage();
    drawRentalContinuationHeader(doc, report);
    y = doc.y;
    x = PDF_PAGE_MARGIN;
    for (const column of RENTAL_DEPOSIT_PDF_COLUMNS) {
      drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
        align: "center",
        fill: "#ccfbf1",
        font: "Helvetica-Bold",
        fontSize: 9.5
      });
      x += column.width;
    }
    y += 27;
  }
  x = PDF_PAGE_MARGIN;
  const totalValues = [
    "TOTAL CAUTIONS REÇUES",
    "",
    `${formatPdfNumber(report.totals.depositPaidTenantsCount)} avec versement`,
    formatPdfMoney(depositTotal),
    ""
  ];
  totalValues.forEach((value, index) => {
    const column = RENTAL_DEPOSIT_PDF_COLUMNS[index];
    drawPdfTableCell(doc, value, x, y, column.width, 28, {
      align: "center",
      fill: "#ecfeff",
      font: "Helvetica-Bold",
      fontSize: index === 2 ? 9 : 10.5
    });
    x += column.width;
  });

  doc.y = y + 34;
}

function drawRentalPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Situation des loyers", periodLabel, pageNumber, totalPages);
}

function renderRentalReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = {
    ...(overview.rentalOperationsReport ?? buildEmptyRentalOperationsReport(filters)),
    periodLabel: toRentalPdfPeriodLabel(filters)
  };

  drawRentalReportHeader(doc, report);
  drawRentalMetadataStrip(doc, report, filters, overview.generatedAt);
  drawRentalMetricCards(doc, report);
  drawRentalOperationsTable(doc, report);
  drawRentalBreakdown(doc, report);
  drawRentalDepositTable(doc, report);
}

function buildEmptyHotelOperationsReport(filters: ReportPeriodFilter): HotelOperationsReport {
  return {
    periodLabel: toHotelPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      bookingsCount: 0,
      roomsCount: 0,
      guestsCount: 0,
      nightsCount: 0,
      guestCount: 0,
      roomRevenue: "0.00",
      depositAmount: "0.00",
      restaurantAmount: "0.00",
      serviceAmount: "0.00",
      maintenanceAmount: "0.00",
      commissionAmount: "0.00",
      taxAmount: "0.00",
      refundAmount: "0.00",
      expenseAmount: "0.00",
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      averageRoomRate: 0,
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const HOTEL_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "SERVICE", width: 50, align: "left" },
  { label: "CH.", width: 38, align: "left" },
  { label: "RESA", width: 48, align: "left" },
  { label: "CLIENT", width: 48, align: "left" },
  { label: "NUITS", width: 30, align: "right" },
  { label: "HEBERG.", width: 52, align: "right" },
  { label: "RESTO", width: 45, align: "right" },
  { label: "SERV.", width: 45, align: "right" },
  { label: "CHARGES", width: 48, align: "right" },
  { label: "NET", width: 48, align: "right" },
  { label: "EXEC", width: 31, align: "right" }
];

function drawHotelReportHeader(doc: PDFKit.PDFDocument, report: HotelOperationsReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 100;
  const centerWidth = pageWidth - margin * 2 - 194;

  doc.save();
  doc.roundedRect(margin, 20, 92, 60, 6).fill("#f0f9ff");
  doc.roundedRect(margin, 20, 92, 60, 6).strokeColor("#0369a1").lineWidth(1).stroke();
  doc.rect(margin + 18, 36, 56, 32).fill("#0ea5e9");
  doc.rect(margin + 26, 44, 10, 10).fill("#e0f2fe");
  doc.rect(margin + 42, 44, 10, 10).fill("#e0f2fe");
  doc.rect(margin + 58, 44, 10, 10).fill("#e0f2fe");
  doc.rect(margin + 42, 56, 12, 12).fill("#075985");
  doc.moveTo(margin + 14, 68).lineTo(margin + 78, 68).strokeColor("#0369a1").lineWidth(2).stroke();
  doc.restore();

  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(16).text(HOTEL_REPORT_BRANDING.title, centerX, 22, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#075985").font("Helvetica").fontSize(9.2).text(HOTEL_REPORT_BRANDING.agency, centerX, 42, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#d21f1f").font("Helvetica-Bold").fontSize(11).text(`"${HOTEL_REPORT_BRANDING.brand}"`, centerX, 55, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(8.5).text(`${HOTEL_REPORT_BRANDING.fiscal}     ${HOTEL_REPORT_BRANDING.phone}`, centerX, 69, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(8.2).text(HOTEL_REPORT_BRANDING.subtitle, centerX, 82, {
    width: centerWidth,
    align: "center"
  });
  doc.moveTo(margin, 100).lineTo(pageWidth - margin, 100).strokeColor("#0ea5e9").lineWidth(2).stroke();
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("SUIVI DES OPERATIONS HOTELIERES PAR CHAMBRE", margin, 114, {
    width: pageWidth - margin * 2,
    align: "center"
  });
  doc.y = 140;
}

function drawHotelMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: HotelOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#f0f9ff");
  doc.rect(margin, y, width, 42).strokeColor("#bae6fd").lineWidth(0.8).stroke();
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Période", margin + 10, y + 8, { width: 155 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(period, margin + 10, y + 21, { width: 175 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Secteur", margin + 205, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Hôtellerie / Auberge", margin + 205, y + 21, { width: 165 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Genere le", pageWidth - margin - 150, y + 8, {
    width: 140,
    align: "right"
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
    width: 140,
    align: "right"
  });
  doc.y = y + 56;
}

function drawHotelMetricCards(doc: PDFKit.PDFDocument, report: HotelOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Réservations / chambres", value: `${formatPdfNumber(report.totals.bookingsCount)} | ${formatPdfNumber(report.totals.roomsCount)}` },
    { label: "Nuitees", value: formatPdfNumber(report.totals.nightsCount, 1) },
    { label: "Recettes", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f0f9ff");
    doc.rect(x, y, cardWidth, 45).strokeColor("#bae6fd").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 8, y + 8, { width: cardWidth - 16 });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11.2).text(metric.value, x + 8, y + 23, { width: cardWidth - 16 });
  });
  doc.y = y + 60;
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text(
    `Hebergement ${formatPdfMoney(report.totals.roomRevenue)} | restauration ${formatPdfMoney(report.totals.restaurantAmount)} | services ${formatPdfMoney(report.totals.serviceAmount)} | charges ${formatPdfMoney(report.totals.cashOutAmount)} | tarif moyen ${formatPdfMoney(report.totals.averageRoomRate)}.`,
    margin,
    doc.y - 8,
    { width: pageWidth - margin * 2, align: "center" }
  );
  doc.moveDown(0.8);
}

function drawHotelTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of HOTEL_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#e0f2fe",
      font: "Helvetica-Bold",
      fontSize: 5.6
    });
    x += column.width;
  }
  return y + 22;
}

function drawHotelDataRow(
  doc: PDFKit.PDFDocument,
  row: HotelOperationsReport["rows"][number],
  y: number
): number {
  const charges = toNumberAmount(row.cashOutAmount);
  const values = [
    { value: truncatePdfText(row.serviceLine, 11), align: "left" as const },
    { value: truncatePdfText(row.roomRef, 8), align: "left" as const },
    { value: truncatePdfText(row.bookingRef, 10), align: "left" as const },
    { value: truncatePdfText(row.guestRef, 10), align: "left" as const },
    { value: formatPdfNumber(row.nightsCount, 1), align: "right" as const },
    { value: formatPdfMoney(row.roomRevenue), align: "right" as const },
    { value: formatPdfMoney(row.restaurantAmount), align: "right" as const },
    { value: formatPdfMoney(row.serviceAmount), align: "right" as const },
    { value: formatPdfMoney(charges), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = HOTEL_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.35
    });
    x += column.width;
  });
  return y + 20;
}

function drawHotelTotalsRow(doc: PDFKit.PDFDocument, report: HotelOperationsReport, y: number): number {
  const firstColumnsWidth = HOTEL_PDF_COLUMNS.slice(0, 4).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.nightsCount, 1),
    formatPdfMoney(report.totals.roomRevenue),
    formatPdfMoney(report.totals.restaurantAmount),
    formatPdfMoney(report.totals.serviceAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = HOTEL_PDF_COLUMNS[index + 4];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f0f9ff",
      font: "Helvetica-Bold",
      fontSize: 5.3
    });
    x += column.width;
  }
  return y + 22;
}

function drawHotelEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#f0f9ff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#bae6fd").lineWidth(0.8).stroke();
  doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(11).text("Aucune opération hôtelière reportable", margin + 14, y + 16, {
    width: pageWidth - margin * 2 - 28
  });
  doc.fillColor("#075985").font("Helvetica").fontSize(9.2).text(
    "Le rapport reprend les transactions XOF comptabilisées et les tâches Hôtellerie de la période. Renseignez réservation, chambre, service, nuitées et client pour alimenter le suivi.",
    margin + 14,
    y + 34,
    { width: pageWidth - margin * 2 - 28 }
  );
  doc.y = y + 88;
}

function drawHotelOperationsTable(doc: PDFKit.PDFDocument, report: HotelOperationsReport): void {
  if (report.rows.length === 0) {
    drawHotelEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawHotelReportHeader(doc, report);
  }
  doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(10.5).text("Synthèse par service, chambre et réservation", PDF_PAGE_MARGIN, doc.y, {
    width: doc.page.width - PDF_PAGE_MARGIN * 2
  });
  doc.moveDown(0.4);
  let y = drawHotelTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawHotelReportHeader(doc, report);
      y = drawHotelTableHeader(doc, doc.y);
    }
    y = drawHotelDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawHotelReportHeader(doc, report);
    y = drawHotelTableHeader(doc, doc.y);
  }
  doc.y = drawHotelTotalsRow(doc, report, y) + 14;
}

function drawHotelBreakdown(doc: PDFKit.PDFDocument, report: HotelOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawHotelReportHeader(doc, report);
  }

  doc.fillColor("#0c4a6e").font("Helvetica-Bold").fontSize(12).text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
    width: doc.page.width - PDF_PAGE_MARGIN * 2
  });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DÉPENSES", width: 80, align: "right" },
    { label: "NET", width: 85, align: "right" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: "center",
      fill: "#e0f2fe",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawHotelReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#e0f2fe",
          font: "Helvetica-Bold",
          fontSize: 7.5
        });
        x += column.width;
      }
      y += 20;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: truncatePdfText(row.operationLabel, 38), align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 19, {
        align: item.align,
        fontSize: 7.4
      });
      x += column.width;
    });
    y += 19;
  }
  doc.y = y + 10;
}

function drawHotelPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc.moveTo(margin, pageHeight - 44).lineTo(pageWidth - margin, pageHeight - 44).strokeColor("#bae6fd").lineWidth(1).stroke();
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`AMCCO - Rapport hôtellerie | ${periodLabel}`, margin, pageHeight - 32, {
    width: 330,
    lineBreak: false
  });
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
    width: 80,
    align: "right",
    lineBreak: false
  });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

function renderHotelReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.hotelOperationsReport ?? buildEmptyHotelOperationsReport(filters);

  drawHotelReportHeader(doc, report);
  drawHotelMetadataStrip(doc, report, filters, overview.generatedAt);
  drawHotelMetricCards(doc, report);
  drawHotelOperationsTable(doc, report);
  drawHotelBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildEmptyWaterOperationsReport(filters: ReportPeriodFilter): WaterOperationsReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    rows: [],
    breakdownRows: [],
    totals: {
      transactionsCount: 0,
      packagesSold: 0,
      averagePackagePrice: "0.00",
      salesAmount: "0.00",
      expensesAmount: "0.00",
      netAmount: "0.00",
      currency: "XOF"
    }
  };
}

function drawWaterIcon(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 6, y + 10, 104, 58, 8).fillAndStroke("#dbeafe", "#1e3a8a");
  doc.roundedRect(x + 6, y + 10, 104, 16, 8).fill("#3b82f6");
  doc.rect(x + 6, y + 18, 104, 8).fill("#3b82f6");
  doc.circle(x + 92, y + 52, 15).fillAndStroke("#bfdbfe", "#1e3a8a");
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("E", x + 85, y + 45, { width: 14, align: "center" });
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text("PRODUCTION", x + 14, y + 36, { width: 68, align: "center" });
  doc.restore();
}

const WATER_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "DATE", width: 65, align: "center" },
  { label: "CATÉGORIE", width: 205, align: "center" },
  { label: "DÉSIGNATION", width: 205, align: "center" },
  { label: "PAQUETS", width: 60, align: "center" },
  { label: "PRIX / PAQUET", width: 105, align: "center" },
  { label: "MONTANT", width: 121, align: "center" }
];

function drawWaterReportHeader(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  drawSectorReportHeader(doc, WATER_REPORT_BRANDING.title, `PRODUCTION D'EAU POTABLE - ${report.periodLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawWaterContinuationHeader(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  drawSectorContinuationHeader(doc, "PRODUCTION D'EAU POTABLE", report.periodLabel);
}

function drawWaterMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: WaterOperationsReport,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;

  doc.roundedRect(margin, y, width, 50, 4).fill("#eff6ff");
  doc.rect(margin, y, width, 50).strokeColor("#bfdbfe").lineWidth(0.8).stroke();
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Période", margin + 10, y + 10, { width: 160 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(report.periodLabel, margin + 10, y + 26, { width: 190 });
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Secteur", margin + 220, y + 10, { width: 130 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text("Production d'eau potable", margin + 220, y + 26, { width: 190 });
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Généré le", pageWidth - margin - 160, y + 10, {
      width: 150,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 160, y + 26, {
      width: 150,
      align: "right"
    });
  doc.y = y + 64;
}

function drawWaterMetricCards(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  const cards = [
    { label: "Paquets vendus", value: formatPdfNumber(report.totals.packagesSold) },
    { label: "Prix moyen / paquet", value: formatPdfMoney(report.totals.averagePackagePrice) },
    { label: "Recettes", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.expensesAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];
  const margin = PDF_PAGE_MARGIN;
  const gap = 8;
  const width = (doc.page.width - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;
  cards.forEach((card, index) => {
    const x = margin + index * (width + gap);
    doc.roundedRect(x, y, width, 54, 4).fill("#f8fafc");
    doc.rect(x, y, width, 54).strokeColor("#bfdbfe").lineWidth(0.6).stroke();
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(8.5).text(card.label, x + 8, y + 10, {
      width: width - 16,
      align: "center"
    });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(card.value, x + 8, y + 28, {
      width: width - 16,
      align: "center"
    });
  });
  doc.y = y + 70;
  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(8.2)
    .text(
      `${formatPdfNumber(report.totals.transactionsCount)} opération${report.totals.transactionsCount > 1 ? "s" : ""} enregistrée${report.totals.transactionsCount > 1 ? "s" : ""} sur la période.`,
      margin,
      doc.y,
      { width: doc.page.width - margin * 2 }
    );
  doc.moveDown(1);
}

function drawWaterTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of WATER_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: "center",
      fill: "#dbeafe",
      font: "Helvetica-Bold",
      fontSize: 10.5
    });
    x += column.width;
  }
  return y + 27;
}

function drawWaterDataRow(
  doc: PDFKit.PDFDocument,
  row: WaterOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: formatPdfDate(row.date), align: "center" as const },
    { value: truncatePdfText(row.categoryLabel, 40), align: "center" as const },
    { value: truncatePdfText(row.designation, 28), align: "center" as const },
    { value: row.quantity > 0 ? formatPdfNumber(row.quantity, 2) : "—", align: "center" as const },
    { value: row.quantity > 0 ? formatPdfMoney(row.unitPrice) : "—", align: "center" as const },
    { value: formatPdfMoney(row.amount), align: "center" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = WATER_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 24, {
      align: item.align,
      fontSize: 10
    });
    x += column.width;
  });
  return y + 24;
}

function drawWaterTotalsRow(doc: PDFKit.PDFDocument, y: number, label: string, amount: string): number {
  const amountColumn = WATER_PDF_COLUMNS[WATER_PDF_COLUMNS.length - 1];
  const firstColumnsWidth = WATER_PDF_COLUMNS
    .slice(0, -1)
    .reduce((sum, column) => sum + column.width, 0);
  drawPdfTableCell(doc, label, PDF_PAGE_MARGIN, y, firstColumnsWidth, 27, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 11
  });
  drawPdfTableCell(
    doc,
    formatPdfMoney(amount),
    PDF_PAGE_MARGIN + firstColumnsWidth,
    y,
    amountColumn.width,
    27,
    {
      align: "center",
      fill: "#dbeafe",
      font: "Helvetica-Bold",
      fontSize: 11
    }
  );
  return y + 27;
}

function drawWaterEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#eff6ff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#bfdbfe").lineWidth(0.8).stroke();
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Aucune recette ni dépense sur la période", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Les ventes de paquets, autres recettes et dépenses apparaîtront ici une fois enregistrées sur la période sélectionnée.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawWaterSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  const pageWidth = doc.page.width;
  const y = doc.y;
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(title, PDF_PAGE_MARGIN, y, { width: pageWidth - PDF_PAGE_MARGIN * 2 });
  doc.y = y + 18;
}

function drawWaterKindTable(
  doc: PDFKit.PDFDocument,
  report: WaterOperationsReport,
  rows: WaterOperationsReport["rows"],
  title: string,
  totalLabel: string,
  totalAmount: string
): void {
  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const initialBlockHeight = rows.length === 0 ? 38 : 18 + 27 + 24 + 27;
  if (needsPdfPageBreak(doc, initialBlockHeight)) {
    doc.addPage();
    drawWaterContinuationHeader(doc, report);
  }

  drawWaterSectionTitle(doc, title);

  if (rows.length === 0) {
    doc
      .fillColor("#334155")
      .font("Helvetica")
      .fontSize(9)
      .text("Aucune opération dans cette section sur la période.", PDF_PAGE_MARGIN, doc.y);
    doc.y += 20;
    return;
  }

  let y = drawWaterTableHeader(doc, doc.y);

  for (const row of rows) {
    if (y + 24 + 27 > tableBottom) {
      doc.addPage();
      drawWaterContinuationHeader(doc, report);
      drawWaterSectionTitle(doc, title);
      y = drawWaterTableHeader(doc, doc.y);
    }
    y = drawWaterDataRow(doc, row, y);
  }

  if (y + 27 > tableBottom) {
    doc.addPage();
    drawWaterContinuationHeader(doc, report);
    drawWaterSectionTitle(doc, title);
    y = drawWaterTableHeader(doc, doc.y);
  }
  doc.y = drawWaterTotalsRow(doc, y, totalLabel, totalAmount) + 18;
}

function drawWaterOperationsTable(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  if (report.rows.length === 0) {
    drawWaterEmptyState(doc);
    return;
  }

  const incomeRows = report.rows.filter((row) => row.kind === "IN");
  const expenseRows = report.rows.filter((row) => row.kind === "OUT");

  drawWaterKindTable(doc, report, incomeRows, "RECETTES", "TOTAL RECETTES", report.totals.salesAmount);
  drawWaterKindTable(doc, report, expenseRows, "DÉPENSES", "TOTAL DÉPENSES", report.totals.expensesAmount);
}

function drawWaterBreakdownTable(
  doc: PDFKit.PDFDocument,
  report: WaterOperationsReport,
  rows: WaterOperationsReport["breakdownRows"],
  title: string,
  totalLabel: string
): void {
  if (rows.length === 0) {
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 18 + 24 + 24 + 27)) {
    doc.addPage();
    drawWaterContinuationHeader(doc, report);
  }

  drawWaterSectionTitle(doc, title);

  const columns: PdfTableColumn[] = [
    { label: "CATÉGORIE", width: 400, align: "center" },
    { label: "OPÉRATIONS", width: 130, align: "center" },
    { label: "TOTAL", width: 232, align: "center" }
  ];
  const drawHeaderRow = (headerY: number): number => {
    let headerX = PDF_PAGE_MARGIN;
    for (const column of columns) {
      drawPdfTableCell(doc, column.label, headerX, headerY, column.width, 24, {
        align: "center",
        fill: "#dbeafe",
        font: "Helvetica-Bold",
        fontSize: 10.5
      });
      headerX += column.width;
    }
    return headerY + 24;
  };
  const drawContinuedTableHeader = (): number => {
    drawWaterSectionTitle(doc, title);
    return drawHeaderRow(doc.y);
  };

  let y = drawHeaderRow(doc.y);

  for (const row of rows) {
    if (y + 24 + 27 > tableBottom) {
      doc.addPage();
      drawWaterContinuationHeader(doc, report);
      y = drawContinuedTableHeader();
    }
    let x = PDF_PAGE_MARGIN;
    const values = [
      { value: row.categoryLabel, align: "center" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "center" as const },
      { value: formatPdfMoney(row.amount), align: "center" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 24, {
        align: item.align,
        fontSize: 10
      });
      x += column.width;
    });
    y += 24;
  }
  const totalAmount = rows.reduce((sum, row) => sum + toNumberAmount(row.amount), 0);
  if (y + 27 > tableBottom) {
    doc.addPage();
    drawWaterContinuationHeader(doc, report);
    y = drawContinuedTableHeader();
  }
  let x = PDF_PAGE_MARGIN;
  const transactionCount = rows.reduce((sum, row) => sum + row.transactionsCount, 0);
  const totalValues = [totalLabel, formatPdfNumber(transactionCount), formatPdfMoney(totalAmount)];
  totalValues.forEach((value, index) => {
    drawPdfTableCell(doc, value, x, y, columns[index].width, 27, {
      align: "center",
      fill: "#dbeafe",
      font: "Helvetica-Bold",
      fontSize: 10.5
    });
    x += columns[index].width;
  });
  doc.y = y + 27 + 14;
}

function drawWaterBreakdown(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  if (report.breakdownRows.length === 0) {
    return;
  }

  const salesBreakdown = report.breakdownRows.filter((row) => row.kind === "IN");
  const expenseBreakdown = report.breakdownRows.filter((row) => row.kind === "OUT");

  drawWaterBreakdownTable(doc, report, salesBreakdown, "Répartition des recettes", "TOTAL RECETTES");
  drawWaterBreakdownTable(doc, report, expenseBreakdown, "Répartition des dépenses", "TOTAL DÉPENSES");
}

function drawWaterPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Production d'eau potable", periodLabel, pageNumber, totalPages);
}

function renderWaterReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.waterOperationsReport ?? buildEmptyWaterOperationsReport(filters);

  drawWaterReportHeader(doc, report);
  drawWaterMetadataStrip(doc, report, overview.generatedAt);
  drawWaterMetricCards(doc, report);
  drawWaterOperationsTable(doc, report);
  drawWaterBreakdown(doc, report);
}

function buildEmptyAgencyOperationsReport(filters: ReportPeriodFilter): AgencyOperationsReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    rows: [],
    operationRows: [],
    totals: {
      mandatesCount: 0,
      propertiesCount: 0,
      clientsCount: 0,
      dealAmount: "0.00",
      saleCommissionAmount: "0.00",
      rentalCommissionAmount: "0.00",
      mandateFeeAmount: "0.00",
      visitFeeAmount: "0.00",
      fileFeeAmount: "0.00",
      advertisingExpenseAmount: "0.00",
      fieldVisitExpenseAmount: "0.00",
      brokerPayoutAmount: "0.00",
      documentExpenseAmount: "0.00",
      officeExpenseAmount: "0.00",
      refundAmount: "0.00",
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      commissionRate: 0,
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const AGENCY_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "MANDAT", width: 56, align: "left" },
  { label: "BIEN", width: 58, align: "left" },
  { label: "TYPE", width: 44, align: "left" },
  { label: "CLIENT", width: 55, align: "left" },
  { label: "ÉTAPE", width: 49, align: "left" },
  { label: "AFFAIRE", width: 62, align: "right" },
  { label: "RECETTES", width: 58, align: "right" },
  { label: "DÉPENSES", width: 58, align: "right" },
  { label: "NET", width: 48, align: "right" },
  { label: "EXEC.", width: 34, align: "right" }
];

function drawAgencyReportHeader(doc: PDFKit.PDFDocument, report: AgencyOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  doc.rect(0, 0, doc.page.width, 120).fill("#f8fafc");
  drawAmccoPdfLogo(doc, margin, 28, 38);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(16).text(AGENCY_REPORT_BRANDING.title, margin + 48, 29, {
    width: 290
  });
  doc.fillColor("#374151").font("Helvetica").fontSize(8.6).text(AGENCY_REPORT_BRANDING.subtitle, margin + 48, 50, {
    width: 320
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(8).text(AGENCY_REPORT_BRANDING.brand, doc.page.width - margin - 145, 28, {
    width: 145,
    align: "right"
  });
  doc.fillColor("#4b5563").font("Helvetica").fontSize(7.4).text(AGENCY_REPORT_BRANDING.agency, doc.page.width - margin - 210, 44, {
    width: 210,
    align: "right"
  }).text(`${AGENCY_REPORT_BRANDING.fiscal} | ${AGENCY_REPORT_BRANDING.phone}`, doc.page.width - margin - 210, 62, {
    width: 210,
    align: "right"
  });
  doc.roundedRect(margin, 84, doc.page.width - margin * 2, 24, 4).fill("#e5e7eb");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(8.6).text(`Période: ${report.periodLabel}`, margin + 12, 91, {
    width: doc.page.width - margin * 2 - 24
  });
  doc.y = 138;
}

function drawAgencyMetricCards(doc: PDFKit.PDFDocument, report: AgencyOperationsReport): void {
  const cards = [
    { label: "Mandats / biens", value: `${formatPdfNumber(report.totals.mandatesCount)} | ${formatPdfNumber(report.totals.propertiesCount)}` },
    { label: "Volume affaires", value: formatPdfMoney(report.totals.dealAmount) },
    { label: "Commissions", value: formatPdfMoney(toNumberAmount(report.totals.saleCommissionAmount) + toNumberAmount(report.totals.rentalCommissionAmount)) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];
  const margin = PDF_PAGE_MARGIN;
  const gap = 8;
  const width = (doc.page.width - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;
  cards.forEach((card, index) => {
    const x = margin + index * (width + gap);
    doc.roundedRect(x, y, width, 54, 4).fill("#ffffff");
    doc.rect(x, y, width, 54).strokeColor("#d1d5db").lineWidth(0.6).stroke();
    doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(7).text(card.label.toUpperCase(), x + 8, y + 10, {
      width: width - 16
    });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text(card.value, x + 8, y + 28, {
      width: width - 16
    });
  });
  doc.y = y + 70;
  doc.fillColor("#374151").font("Helvetica").fontSize(8.2).text(
    `Clients ${formatPdfNumber(report.totals.clientsCount)} | taux commission ${formatPdfNumber(report.totals.commissionRate, 1)}% | frais commerciaux ${formatPdfMoney(report.totals.cashOutAmount)} | exécution ${formatPdfNumber(report.totals.executionRate, 1)}% | blocages ${formatPdfNumber(report.totals.blockedTasksCount)}.`,
    margin,
    doc.y,
    { width: doc.page.width - margin * 2 }
  );
  doc.moveDown(1);
}

function drawAgencyTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of AGENCY_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: column.align,
      fill: "#374151",
      font: "Helvetica-Bold",
      fontSize: 5.7,
      textColor: "#ffffff",
      borderColor: "#374151"
    });
    x += column.width;
  }
  return y + 18;
}

function drawAgencyDataRow(
  doc: PDFKit.PDFDocument,
  row: AgencyOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: row.mandateRef, align: "left" as const },
    { value: row.propertyRef, align: "left" as const },
    { value: row.mandateType, align: "left" as const },
    { value: row.clientRef, align: "left" as const },
    { value: row.dealStage, align: "left" as const },
    { value: formatPdfMoney(row.dealAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  for (let index = 0; index < values.length; index += 1) {
    const column = AGENCY_PDF_COLUMNS[index];
    drawPdfTableCell(doc, values[index].value, x, y, column.width, 20, {
      align: values[index].align,
      fontSize: 5.7,
      borderColor: "#d1d5db"
    });
    x += column.width;
  }
  return y + 20;
}

function drawAgencyTotalsRow(doc: PDFKit.PDFDocument, report: AgencyOperationsReport, y: number): number {
  const values = [
    "TOTAL",
    "",
    "",
    "",
    "",
    formatPdfMoney(report.totals.dealAmount),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  let x = PDF_PAGE_MARGIN;
  for (let index = 0; index < values.length; index += 1) {
    const column = AGENCY_PDF_COLUMNS[index];
    drawPdfTableCell(doc, values[index], x, y, column.width, 20, {
      align: index < 5 ? "left" : "right",
      fill: "#f3f4f6",
      font: "Helvetica-Bold",
      fontSize: 5.7,
      borderColor: "#d1d5db"
    });
    x += column.width;
  }
  return y + 20;
}

function drawAgencyOperationsTable(doc: PDFKit.PDFDocument, report: AgencyOperationsReport): void {
  if (report.rows.length === 0) {
    doc.roundedRect(PDF_PAGE_MARGIN, doc.y, doc.page.width - PDF_PAGE_MARGIN * 2, 64, 4).fill("#f3f4f6");
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text("Aucune opération agence immobilière reportable", PDF_PAGE_MARGIN + 14, doc.y + 16);
    doc.y += 84;
    return;
  }

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10.5).text("Synthèse par mandat, bien, client et étape", PDF_PAGE_MARGIN, doc.y);
  doc.moveDown(0.4);
  let y = drawAgencyTableHeader(doc, doc.y);
  for (const row of report.rows) {
    if (y + 42 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawAgencyReportHeader(doc, report);
      y = drawAgencyTableHeader(doc, doc.y);
    }
    y = drawAgencyDataRow(doc, row, y);
  }
  y = drawAgencyTotalsRow(doc, report, y);
  doc.y = y + 18;
}

function drawAgencyBreakdown(doc: PDFKit.PDFDocument, report: AgencyOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }
  if (needsPdfPageBreak(doc, 88)) {
    doc.addPage();
    drawAgencyReportHeader(doc, report);
  }
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10.5).text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y);
  doc.moveDown(0.4);
  writePdfList(
    doc,
    limitPdfRows(
      report.operationRows.map((row) =>
        `${row.operationLabel}: ${row.transactionsCount} transaction(s), ${row.tasksCount} tâche(s), net ${row.netAmount} XOF`
      ),
      18
    ),
    "Aucune opération agence."
  );
}

function drawAgencyPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#d7e3f1")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`AMCCO - Agence immobilière | ${periodLabel}`, margin, pageHeight - 32, {
      width: 300,
      lineBreak: false
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right",
      lineBreak: false
    });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

function renderAgencyReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.agencyOperationsReport ?? buildEmptyAgencyOperationsReport(filters);
  drawAgencyReportHeader(doc, report);
  drawAgencyMetricCards(doc, report);
  drawAgencyOperationsTable(doc, report);
  drawAgencyBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildEmptyBtpOperationsReport(filters: ReportPeriodFilter): BtpOperationsReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    asOfLabel: formatPdfDate(resolveBtpAsOfDate(filters).toISOString()),
    rows: [],
    totals: {
      projectsCount: 0,
      cashInAmount: "0.00",
      materialAmount: "0.00",
      laborAmount: "0.00",
      equipmentAmount: "0.00",
      subcontractingAmount: "0.00",
      siteExpenseAmount: "0.00",
      totalCostAmount: "0.00",
      netAmount: "0.00",
      transactionsCount: 0,
      currency: "XOF"
    }
  };
}

const BTP_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "CHANTIER / DERNIÈRE OPÉRATION", width: 172, align: "left" },
  { label: "CLIENT / MARCHÉ / LIEU", width: 145, align: "left" },
  { label: "ENCAISSÉ", width: 93, align: "right" },
  { label: "DÉPENSÉ", width: 93, align: "right" },
  { label: "MARGE NETTE", width: 93, align: "right" },
  { label: "RETENUE", width: 76, align: "right" },
  { label: "AVANCEMENT", width: 90, align: "center" }
];

function drawBtpReportHeader(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  drawSectorReportHeader(doc, BTP_REPORT_BRANDING.title, `SITUATION CUMULÉE DES CHANTIERS AU ${report.asOfLabel.toUpperCase()}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawBtpContinuationHeader(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  drawSectorContinuationHeader(doc, "SITUATION CUMULÉE DES CHANTIERS", report.asOfLabel);
}

function drawBtpMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: BtpOperationsReport,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  doc.roundedRect(margin, y, width, 42, 4).fill("#fff7ed");
  doc.rect(margin, y, width, 42).strokeColor("#fed7aa").lineWidth(0.8).stroke();
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Périmètre", margin + 10, y + 8, { width: 190 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Cumul des opérations", margin + 10, y + 21, { width: 210 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Date d'arrêté", margin + 245, y + 8, { width: 130 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(report.asOfLabel, margin + 245, y + 21, { width: 140 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Genere le", pageWidth - margin - 150, y + 8, {
    width: 140,
    align: "right"
  });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
    width: 140,
    align: "right"
  });
  doc.y = y + 56;
}

function drawBtpMetricCards(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 7;
  const cardWidth = (pageWidth - margin * 2 - gap * 4) / 5;
  const y = doc.y;
  const metrics = [
    { label: "Chantiers", value: formatPdfNumber(report.totals.projectsCount) },
    { label: "Opérations", value: formatPdfNumber(report.totals.transactionsCount) },
    { label: "Encaissé", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Dépensé", value: formatPdfMoney(report.totals.totalCostAmount) },
    { label: "Marge nette", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#fff7ed");
    doc.rect(x, y, cardWidth, 45).strokeColor("#fed7aa").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 7, y + 8, { width: cardWidth - 14 });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10.5).text(metric.value, x + 7, y + 23, { width: cardWidth - 14, lineBreak: false });
  });
  doc.y = y + 60;
  const categories = [
    ["Matériaux", report.totals.materialAmount],
    ["Main-d'œuvre", report.totals.laborAmount],
    ["Engins", report.totals.equipmentAmount],
    ["Sous-traitance", report.totals.subcontractingAmount],
    ["Charges chantier", report.totals.siteExpenseAmount]
  ] as const;
  const categoryGap = 7;
  const categoryWidth = (pageWidth - margin * 2 - categoryGap * 4) / 5;
  const categoriesY = doc.y;
  categories.forEach(([label, amount], index) => {
    const x = margin + index * (categoryWidth + categoryGap);
    doc.fillColor("#486581").font("Helvetica").fontSize(7.7).text(label, x, categoriesY, {
      width: categoryWidth, align: "center", lineBreak: false
    });
    doc.fillColor("#1f2937").font("Helvetica-Bold").fontSize(8.5).text(formatPdfMoney(amount), x, categoriesY + 11, {
      width: categoryWidth, align: "center", lineBreak: false
    });
  });
  doc.y = categoriesY + 32;
}

function drawBtpTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of BTP_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 27, {
      align: "center",
      fill: "#ffedd5",
      font: "Helvetica-Bold",
      fontSize: 8.5
    });
    x += column.width;
  }
  return y + 27;
}

function drawBtpDataRow(
  doc: PDFKit.PDFDocument,
  row: BtpOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    {
      value: `${truncatePdfText(row.projectRef, 25)}\n${row.lastOperationDate ? `Dernière op. : ${formatPdfDate(row.lastOperationDate)}` : "Aucune opération"} · ${formatPdfNumber(row.transactionsCount)} op.`,
      align: "left" as const
    },
    {
      value: `${truncatePdfText(row.clientRef || "Client non renseigné", 22)}\n${truncatePdfText(row.contractRef || "Marché non renseigné", 22)}\n${truncatePdfText(row.location || "Localisation non renseignée", 22)}`,
      align: "left" as const
    },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.totalCostAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: formatPdfMoney(row.retentionAmount), align: "right" as const },
    { value: row.lastProgressPercent !== null ? `${formatPdfNumber(row.lastProgressPercent, 0)}%` : "-", align: "center" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = BTP_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 42, {
      align: item.align,
      fontSize: index < 2 ? 7.5 : 8.5,
      verticalAlign: index < 2 ? "top" : "center"
    });
    x += column.width;
  });
  return y + 42;
}

function drawBtpTotalsRow(doc: PDFKit.PDFDocument, report: BtpOperationsReport, y: number): number {
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, BTP_PDF_COLUMNS[0].width, 27, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 9
  });
  x += BTP_PDF_COLUMNS[0].width;
  drawPdfTableCell(doc, "", x, y, BTP_PDF_COLUMNS[1].width, 27, { fill: "#f8fafc" });
  x += BTP_PDF_COLUMNS[1].width;

  const values = [
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.totalCostAmount),
    formatPdfMoney(report.totals.netAmount),
    formatPdfMoney(report.rows.reduce((total, row) => total + toNumberAmount(row.retentionAmount), 0).toFixed(2))
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = BTP_PDF_COLUMNS[index + 2];
    drawPdfTableCell(doc, values[index], x, y, column.width, 27, {
      align: "right",
      fill: "#fff7ed",
      font: "Helvetica-Bold",
      fontSize: 9
    });
    x += column.width;
  }

  drawPdfTableCell(doc, "", x, y, BTP_PDF_COLUMNS[6].width, 27, { fill: "#fff7ed" });

  return y + 27;
}

function drawBtpEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#fff7ed");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#fed7aa").lineWidth(0.8).stroke();
  doc.fillColor("#78350f").font("Helvetica-Bold").fontSize(11).text("Aucun chantier reportable", margin + 14, y + 16, {
    width: pageWidth - margin * 2 - 28
  });
  doc.fillColor("#92400e").font("Helvetica").fontSize(9.2).text(
    "Le suivi par chantier apparaîtra ici dès qu'une opération sera comptabilisée sur la période sélectionnée.",
    margin + 14,
    y + 34,
    { width: pageWidth - margin * 2 - 28 }
  );
  doc.y = y + 88;
}

function drawBtpOperationsTable(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  if (report.rows.length === 0) {
    drawBtpEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (doc.y + 27 + 42 + 27 > tableBottom) {
    doc.addPage();
    drawBtpContinuationHeader(doc, report);
  }
  let y = drawBtpTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 42 + 27 > tableBottom) {
      doc.addPage();
      drawBtpContinuationHeader(doc, report);
      y = drawBtpTableHeader(doc, doc.y);
    }
    y = drawBtpDataRow(doc, row, y);
  }

  if (y + 27 > tableBottom) {
    doc.addPage();
    drawBtpContinuationHeader(doc, report);
    y = drawBtpTableHeader(doc, doc.y);
  }
  doc.y = drawBtpTotalsRow(doc, report, y) + 12;
}

const BTP_COST_BREAKDOWN_COLUMNS: PdfTableColumn[] = [
  { label: "CHANTIER", width: 175, align: "left" },
  { label: "MATÉRIAUX", width: 99, align: "right" },
  { label: "MAIN-D'ŒUVRE", width: 99, align: "right" },
  { label: "ENGINS", width: 89, align: "right" },
  { label: "SOUS-TRAITANCE", width: 99, align: "right" },
  { label: "CHARGES", width: 101, align: "right" },
  { label: "TOTAL", width: 100, align: "right" }
];

function drawBtpCostBreakdown(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  if (report.rows.length === 0) return;

  const margin = PDF_PAGE_MARGIN;
  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  const titleHeight = 22;
  const headerHeight = 27;
  const rowHeight = 25;
  const totalHeight = 27;

  if (doc.y + titleHeight + headerHeight + rowHeight + totalHeight > tableBottom) {
    doc.addPage();
    drawBtpContinuationHeader(doc, report);
  }

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(
    "DÉTAIL DES DÉPENSES PAR CHANTIER",
    margin,
    doc.y,
    { width: doc.page.width - margin * 2 }
  );
  doc.y += titleHeight;

  const drawHeader = (y: number): number => {
    let x = margin;
    for (const column of BTP_COST_BREAKDOWN_COLUMNS) {
      drawPdfTableCell(doc, column.label, x, y, column.width, headerHeight, {
        align: "center", fill: "#ffedd5", font: "Helvetica-Bold", fontSize: 8
      });
      x += column.width;
    }
    return y + headerHeight;
  };

  let y = drawHeader(doc.y);
  for (const row of report.rows) {
    if (y + rowHeight + totalHeight > tableBottom) {
      doc.addPage();
      drawBtpContinuationHeader(doc, report);
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(
        "DÉTAIL DES DÉPENSES PAR CHANTIER (SUITE)", margin, doc.y,
        { width: doc.page.width - margin * 2 }
      );
      y = drawHeader(doc.y + titleHeight);
    }

    const values = [
      truncatePdfText(row.projectRef, 30),
      formatPdfMoney(row.materialAmount),
      formatPdfMoney(row.laborAmount),
      formatPdfMoney(row.equipmentAmount),
      formatPdfMoney(row.subcontractingAmount),
      formatPdfMoney(row.siteExpenseAmount),
      formatPdfMoney(row.totalCostAmount)
    ];
    let x = margin;
    values.forEach((value, index) => {
      const column = BTP_COST_BREAKDOWN_COLUMNS[index];
      drawPdfTableCell(doc, value, x, y, column.width, rowHeight, {
        align: index === 0 ? "left" : "right", fontSize: 8
      });
      x += column.width;
    });
    y += rowHeight;
  }

  if (y + totalHeight > tableBottom) {
    doc.addPage();
    drawBtpContinuationHeader(doc, report);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(
      "DÉTAIL DES DÉPENSES PAR CHANTIER (SUITE)", margin, doc.y,
      { width: doc.page.width - margin * 2 }
    );
    y = drawHeader(doc.y + titleHeight);
  }

  const totalValues = [
    "TOTAL",
    report.totals.materialAmount,
    report.totals.laborAmount,
    report.totals.equipmentAmount,
    report.totals.subcontractingAmount,
    report.totals.siteExpenseAmount,
    report.totals.totalCostAmount
  ];
  let x = margin;
  totalValues.forEach((value, index) => {
    const column = BTP_COST_BREAKDOWN_COLUMNS[index];
    drawPdfTableCell(doc, index === 0 ? value : formatPdfMoney(value), x, y, column.width, totalHeight, {
      align: index === 0 ? "center" : "right",
      fill: "#fff7ed",
      font: "Helvetica-Bold",
      fontSize: 8.5
    });
    x += column.width;
  });
  doc.y = y + totalHeight + 12;
}

function drawBtpPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  asOfLabel: string
): void {
  drawSectorReportFooter(doc, "Rapport BTP", `Cumul au ${asOfLabel}`, pageNumber, totalPages);
}

function renderBtpReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.btpOperationsReport ?? buildEmptyBtpOperationsReport(filters);

  drawBtpReportHeader(doc, report);
  drawBtpMetadataStrip(doc, report, overview.generatedAt);
  drawBtpMetricCards(doc, report);
  drawBtpOperationsTable(doc, report);
  drawBtpCostBreakdown(doc, report);

  const note =
    `Montants cumulés jusqu'au ${report.asOfLabel}. La marge nette correspond aux encaissements moins les dépenses. La retenue est affichée séparément et n'est pas déduite de cette marge.`;
  const noteWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const noteHeight = doc.heightOfString(note, { width: noteWidth });
  if (doc.y + noteHeight > doc.page.height - PDF_CONTENT_BOTTOM) {
    doc.addPage();
    drawBtpContinuationHeader(doc, report);
  }
  doc.fillColor("#486581").font("Helvetica-Bold").fontSize(9).text(note, PDF_PAGE_MARGIN, doc.y, { width: noteWidth });
}

function buildEmptyFishFarmingOperationsReport(filters: ReportPeriodFilter): FishFarmingOperationsReport {
  return {
    periodLabel: toFishFarmingPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      pondsCount: 0,
      cyclesCount: 0,
      fingerlingsQuantity: 0,
      feedQuantity: 0,
      soldQuantity: 0,
      mortalityCount: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const FISH_FARMING_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "BASSIN", width: 50, align: "left" },
  { label: "CYCLE", width: 50, align: "left" },
  { label: "ESPECE", width: 46, align: "left" },
  { label: "ALEVINS", width: 42, align: "right" },
  { label: "ALIMENT", width: 42, align: "right" },
  { label: "VENTES", width: 42, align: "right" },
  { label: "MORT.", width: 36, align: "right" },
  { label: "RECETTES", width: 57, align: "right" },
  { label: "DÉPENSES", width: 57, align: "right" },
  { label: "NET", width: 51, align: "right" },
  { label: "EXEC. %", width: 42, align: "right" }
];

function drawFishFarmingPondMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 4, y + 24, 106, 40, 18).fill("#e0f2fe");
  doc.roundedRect(x + 4, y + 24, 106, 40, 18).strokeColor("#0284c7").lineWidth(0.9).stroke();

  doc.strokeColor("#38bdf8").lineWidth(1);
  for (let index = 0; index < 4; index += 1) {
    const waveY = y + 36 + index * 7;
    doc
      .moveTo(x + 14, waveY)
      .bezierCurveTo(x + 30, waveY - 5, x + 44, waveY + 5, x + 60, waveY)
      .bezierCurveTo(x + 76, waveY - 5, x + 90, waveY + 5, x + 104, waveY)
      .stroke();
  }

  doc.fillColor("#0f766e");
  [
    { cx: x + 35, cy: y + 43, scale: 1 },
    { cx: x + 72, cy: y + 51, scale: 0.82 },
    { cx: x + 88, cy: y + 36, scale: 0.7 }
  ].forEach((item) => {
    doc.ellipse(item.cx, item.cy, 9 * item.scale, 5 * item.scale).fill("#14b8a6");
    doc
      .moveTo(item.cx - 10 * item.scale, item.cy)
      .lineTo(item.cx - 18 * item.scale, item.cy - 5 * item.scale)
      .lineTo(item.cx - 18 * item.scale, item.cy + 5 * item.scale)
      .fill("#0d9488");
    doc.circle(item.cx + 4 * item.scale, item.cy - 1 * item.scale, 0.8 * item.scale).fill("#083344");
  });

  doc.restore();
}

function drawFishFarmingReportHeader(doc: PDFKit.PDFDocument, report: FishFarmingOperationsReport): void {
  drawSectorReportHeader(doc, FISH_FARMING_REPORT_BRANDING.title, "SUIVI DES OPERATIONS PISCICOLES PAR BASSIN", (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
}

function drawFishFarmingMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: FishFarmingOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#f0f9ff");
  doc.rect(margin, y, width, 42).strokeColor("#bae6fd").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Période", margin + 10, y + 8, { width: 155 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(period, margin + 10, y + 21, { width: 175 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Secteur", margin + 205, y + 8, { width: 120 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Pisciculture", margin + 205, y + 21, { width: 140 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Genere le", pageWidth - margin - 150, y + 8, {
      width: 140,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
      width: 140,
      align: "right"
    });
  doc.y = y + 56;
}

function drawFishFarmingMetricCards(doc: PDFKit.PDFDocument, report: FishFarmingOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "Bassins / cycles",
      value: `${formatPdfNumber(report.totals.pondsCount)} | ${formatPdfNumber(report.totals.cyclesCount)}`
    },
    { label: "Recettes", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.cashOutAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f0f9ff");
    doc.rect(x, y, cardWidth, 45).strokeColor("#bae6fd").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica")
      .fontSize(8.3)
      .text(metric.label, x + 8, y + 8, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11.2)
      .text(metric.value, x + 8, y + 23, {
        width: cardWidth - 16
      });
  });
  doc.y = y + 60;

  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text(
      `Production: alevins ${formatPdfNumber(report.totals.fingerlingsQuantity, 2)} | aliment ${formatPdfNumber(report.totals.feedQuantity, 2)} | ventes ${formatPdfNumber(report.totals.soldQuantity, 2)} | mortalité ${formatPdfNumber(report.totals.mortalityCount, 2)} | exécution ${formatPdfNumber(report.totals.executionRate, 1)}%.`,
      margin,
      doc.y - 8,
      {
        width: pageWidth - margin * 2,
        align: "center"
      }
    );
  doc.moveDown(0.8);
}

function drawFishFarmingTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of fitPdfColumns(doc, FISH_FARMING_PDF_COLUMNS)) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#e0f2fe",
      font: "Helvetica-Bold",
      fontSize: 8
    });
    x += column.width;
  }
  return y + 22;
}

function drawFishFarmingDataRow(
  doc: PDFKit.PDFDocument,
  row: FishFarmingOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.pondRef, 12), align: "left" as const },
    { value: truncatePdfText(row.cycleRef, 12), align: "left" as const },
    { value: truncatePdfText(row.species, 11), align: "left" as const },
    { value: formatPdfNumber(row.fingerlingsQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.feedQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.soldQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.mortalityCount, 1), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = fitPdfColumns(doc, FISH_FARMING_PDF_COLUMNS)[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 8
    });
    x += column.width;
  });
  return y + 20;
}

function drawFishFarmingTotalsRow(
  doc: PDFKit.PDFDocument,
  report: FishFarmingOperationsReport,
  y: number
): number {
  const firstColumnsWidth = fitPdfColumns(doc, FISH_FARMING_PDF_COLUMNS).slice(0, 3).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.fingerlingsQuantity, 1),
    formatPdfNumber(report.totals.feedQuantity, 1),
    formatPdfNumber(report.totals.soldQuantity, 1),
    formatPdfNumber(report.totals.mortalityCount, 1),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = fitPdfColumns(doc, FISH_FARMING_PDF_COLUMNS)[index + 3];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f0f9ff",
      font: "Helvetica-Bold",
      fontSize: 8
    });
    x += column.width;
  }
  return y + 22;
}

function drawFishFarmingEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#f0f9ff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#bae6fd").lineWidth(0.8).stroke();
  doc
    .fillColor("#075985")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Aucune opération piscicole reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#0369a1")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF comptabilisées et les tâches piscicoles de la période. Renseignez bassin, cycle et espèce pour alimenter le suivi.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawFishFarmingOperationsTable(doc: PDFKit.PDFDocument, report: FishFarmingOperationsReport): void {
  if (report.rows.length === 0) {
    drawFishFarmingEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawFishFarmingReportHeader(doc, report);
  }
  doc
    .fillColor("#075985")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Synthèse par bassin, cycle et espèce", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawFishFarmingTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawFishFarmingReportHeader(doc, report);
      y = drawFishFarmingTableHeader(doc, doc.y);
    }
    y = drawFishFarmingDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawFishFarmingReportHeader(doc, report);
    y = drawFishFarmingTableHeader(doc, doc.y);
  }
  doc.y = drawFishFarmingTotalsRow(doc, report, y) + 14;
}

function drawFishFarmingBreakdown(doc: PDFKit.PDFDocument, report: FishFarmingOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawFishFarmingReportHeader(doc, report);
  }

  doc
    .fillColor("#075985")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DÉPENSES", width: 80, align: "right" },
    { label: "NET", width: 85, align: "right" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: "center",
      fill: "#e0f2fe",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawFishFarmingReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#e0f2fe",
          font: "Helvetica-Bold",
          fontSize: 7.5
        });
        x += column.width;
      }
      y += 20;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: truncatePdfText(row.operationLabel, 38), align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 19, {
        align: item.align,
        fontSize: 7.4
      });
      x += column.width;
    });
    y += 19;
  }
  doc.y = y + 10;
}

function drawFishFarmingPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawSectorReportFooter(doc, "Rapport pisciculture", periodLabel, pageNumber, totalPages);
}

function renderFishFarmingReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.fishFarmingOperationsReport ?? buildEmptyFishFarmingOperationsReport(filters);

  drawFishFarmingReportHeader(doc, report);
  drawFishFarmingMetadataStrip(doc, report, filters, overview.generatedAt);
  drawFishFarmingMetricCards(doc, report);
  drawFishFarmingOperationsTable(doc, report);
  drawFishFarmingBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildEmptyLivestockOperationsReport(filters: ReportPeriodFilter): LivestockOperationsReport {
  return {
    periodLabel: toLivestockPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      herdsCount: 0,
      batchesCount: 0,
      animalPurchaseCount: 0,
      feedQuantity: 0,
      soldAnimalCount: 0,
      productQuantity: 0,
      mortalityCount: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const LIVESTOCK_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "TROUPEAU", width: 48, align: "left" },
  { label: "LOT", width: 45, align: "left" },
  { label: "ESPECE", width: 42, align: "left" },
  { label: "ACHATS", width: 38, align: "right" },
  { label: "ALIMENT", width: 39, align: "right" },
  { label: "VENTES", width: 38, align: "right" },
  { label: "PRODUIT", width: 39, align: "right" },
  { label: "MORT.", width: 34, align: "right" },
  { label: "RECETTES", width: 56, align: "right" },
  { label: "DÉPENSES", width: 56, align: "right" },
  { label: "NET", width: 44, align: "right" },
  { label: "EXEC. %", width: 36, align: "right" }
];

function drawLivestockHerdMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 4, y + 20, 108, 48, 8).fill("#ecfccb");
  doc.roundedRect(x + 4, y + 20, 108, 48, 8).strokeColor("#65a30d").lineWidth(0.9).stroke();
  doc.rect(x + 14, y + 48, 88, 12).fill("#84cc16");
  doc
    .moveTo(x + 32, y + 47)
    .lineTo(x + 56, y + 29)
    .lineTo(x + 80, y + 47)
    .closePath()
    .fill("#a16207");
  doc.rect(x + 39, y + 47, 34, 16).fill("#78350f");
  doc.rect(x + 52, y + 53, 8, 10).fill("#fef3c7");
  doc.circle(x + 26, y + 51, 5).fill("#f8fafc");
  doc.circle(x + 30, y + 51, 4).fill("#f8fafc");
  doc.rect(x + 24, y + 55, 3, 6).fill("#475569");
  doc.rect(x + 31, y + 55, 3, 6).fill("#475569");
  doc.circle(x + 88, y + 52, 4).fill("#fde68a");
  doc.rect(x + 84, y + 55, 3, 6).fill("#92400e");
  doc.rect(x + 91, y + 55, 3, 6).fill("#92400e");
  doc.restore();
}

function drawLivestockReportHeader(doc: PDFKit.PDFDocument, report: LivestockOperationsReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 122;
  const centerWidth = pageWidth - margin * 2 - 224;

  drawLivestockHerdMark(doc, margin, 16);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16.5)
    .text(LIVESTOCK_REPORT_BRANDING.title, centerX, 22, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#4d7c0f")
    .font("Helvetica")
    .fontSize(9.2)
    .text(LIVESTOCK_REPORT_BRANDING.agency, centerX, 42, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`"${LIVESTOCK_REPORT_BRANDING.brand}"`, centerX, 55, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#166534")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(LIVESTOCK_REPORT_BRANDING.subtitle, centerX, 69, {
      width: centerWidth,
      align: "center"
    });
  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#65a30d")
    .lineWidth(2)
    .stroke();
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SUIVI DES OPERATIONS D'ELEVAGE PAR TROUPEAU", margin, 114, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 140;
}

function drawLivestockMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: LivestockOperationsReport,
  filters: ReportPeriodFilter,
  generatedAt: string
): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const width = pageWidth - margin * 2;
  const y = doc.y;
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

  doc.roundedRect(margin, y, width, 42, 4).fill("#f7fee7");
  doc.rect(margin, y, width, 42).strokeColor("#d9f99d").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Période", margin + 10, y + 8, { width: 155 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(period, margin + 10, y + 21, { width: 175 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Secteur", margin + 205, y + 8, { width: 120 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Élevage", margin + 205, y + 21, { width: 140 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text("Genere le", pageWidth - margin - 150, y + 8, {
      width: 140,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
      width: 140,
      align: "right"
    });
  doc.y = y + 56;
}

function drawLivestockMetricCards(doc: PDFKit.PDFDocument, report: LivestockOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "Troupeaux / lots",
      value: `${formatPdfNumber(report.totals.herdsCount)} | ${formatPdfNumber(report.totals.batchesCount)}`
    },
    { label: "Recettes", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.cashOutAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f7fee7");
    doc.rect(x, y, cardWidth, 45).strokeColor("#d9f99d").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica")
      .fontSize(8.3)
      .text(metric.label, x + 8, y + 8, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11.2)
      .text(metric.value, x + 8, y + 23, {
        width: cardWidth - 16
      });
  });
  doc.y = y + 60;

  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text(
      `Cheptel: achats ${formatPdfNumber(report.totals.animalPurchaseCount, 2)} | aliment ${formatPdfNumber(report.totals.feedQuantity, 2)} | ventes ${formatPdfNumber(report.totals.soldAnimalCount, 2)} | produits ${formatPdfNumber(report.totals.productQuantity, 2)} | mortalité ${formatPdfNumber(report.totals.mortalityCount, 2)} | exécution ${formatPdfNumber(report.totals.executionRate, 1)}%.`,
      margin,
      doc.y - 8,
      {
        width: pageWidth - margin * 2,
        align: "center"
      }
    );
  doc.moveDown(0.8);
}

function drawLivestockTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of LIVESTOCK_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#ecfccb",
      font: "Helvetica-Bold",
      fontSize: 5.8
    });
    x += column.width;
  }
  return y + 22;
}

function drawLivestockDataRow(
  doc: PDFKit.PDFDocument,
  row: LivestockOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.herdRef, 11), align: "left" as const },
    { value: truncatePdfText(row.batchRef, 11), align: "left" as const },
    { value: truncatePdfText(row.species, 10), align: "left" as const },
    { value: formatPdfNumber(row.animalPurchaseCount, 1), align: "right" as const },
    { value: formatPdfNumber(row.feedQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.soldAnimalCount, 1), align: "right" as const },
    { value: formatPdfNumber(row.productQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.mortalityCount, 1), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = LIVESTOCK_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.7
    });
    x += column.width;
  });
  return y + 20;
}

function drawLivestockTotalsRow(
  doc: PDFKit.PDFDocument,
  report: LivestockOperationsReport,
  y: number
): number {
  const firstColumnsWidth = LIVESTOCK_PDF_COLUMNS.slice(0, 3).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.animalPurchaseCount, 1),
    formatPdfNumber(report.totals.feedQuantity, 1),
    formatPdfNumber(report.totals.soldAnimalCount, 1),
    formatPdfNumber(report.totals.productQuantity, 1),
    formatPdfNumber(report.totals.mortalityCount, 1),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = LIVESTOCK_PDF_COLUMNS[index + 3];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f7fee7",
      font: "Helvetica-Bold",
      fontSize: 5.7
    });
    x += column.width;
  }
  return y + 22;
}

function drawLivestockEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#f7fee7");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#d9f99d").lineWidth(0.8).stroke();
  doc
    .fillColor("#3f6212")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Aucune opération d'élevage reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#4d7c0f")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF comptabilisées et les tâches d'élevage de la période. Renseignez troupeau, lot et espèce pour alimenter le suivi.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawLivestockOperationsTable(doc: PDFKit.PDFDocument, report: LivestockOperationsReport): void {
  if (report.rows.length === 0) {
    drawLivestockEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawLivestockReportHeader(doc, report);
  }
  doc
    .fillColor("#3f6212")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Synthèse par troupeau, lot et espèce", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawLivestockTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawLivestockReportHeader(doc, report);
      y = drawLivestockTableHeader(doc, doc.y);
    }
    y = drawLivestockDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawLivestockReportHeader(doc, report);
    y = drawLivestockTableHeader(doc, doc.y);
  }
  doc.y = drawLivestockTotalsRow(doc, report, y) + 14;
}

function drawLivestockBreakdown(doc: PDFKit.PDFDocument, report: LivestockOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawLivestockReportHeader(doc, report);
  }

  doc
    .fillColor("#3f6212")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DÉPENSES", width: 80, align: "right" },
    { label: "NET", width: 85, align: "right" }
  ];
  let x = PDF_PAGE_MARGIN;
  let y = doc.y;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: "center",
      fill: "#ecfccb",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawLivestockReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#ecfccb",
          font: "Helvetica-Bold",
          fontSize: 7.5
        });
        x += column.width;
      }
      y += 20;
    }
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: truncatePdfText(row.operationLabel, 38), align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    values.forEach((item, index) => {
      const column = columns[index];
      drawPdfTableCell(doc, item.value, x, y, column.width, 19, {
        align: item.align,
        fontSize: 7.4
      });
      x += column.width;
    });
    y += 19;
  }
  doc.y = y + 10;
}

function drawLivestockPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;
  const bottomMargin = doc.page.margins.bottom;

  doc.save();
  doc.page.margins.bottom = 0;
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#d9f99d")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`AMCCO - Rapport élevage | ${periodLabel}`, margin, pageHeight - 32, {
      width: 320,
      lineBreak: false
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right",
      lineBreak: false
    });
  doc.page.margins.bottom = bottomMargin;
  doc.restore();
}

function renderLivestockReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.livestockOperationsReport ?? buildEmptyLivestockOperationsReport(filters);

  drawLivestockReportHeader(doc, report);
  drawLivestockMetadataStrip(doc, report, filters, overview.generatedAt);
  drawLivestockMetricCards(doc, report);
  drawLivestockOperationsTable(doc, report);
  drawLivestockBreakdown(doc, report);
  drawPdfReadingGuideBox(doc);
}

function buildOverviewSummaryRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [
    {
      category: "Meta",
      item: "generatedAt",
      label: "Generation",
      value: overview.generatedAt,
      extra: ""
    },
    {
      category: "Meta",
      item: "period",
      label: "Période",
      value: toDisplayPeriodLabel({
        dateFrom: overview.filters.dateFrom ?? undefined,
        dateTo: overview.filters.dateTo ?? undefined
      }),
      extra: ""
    },
    {
      category: "Meta",
      item: "activity",
      label: "Activité",
      value: toDisplayActivityLabel(overview.filters.activityCode ?? undefined),
      extra: ""
    },
    {
      category: "Meta",
      item: "sectorRulesVersion",
      label: "Version regles sectorielles",
      value: overview.sectorRulesVersion,
      extra: ""
    }
  ];

  if (overview.activityProfile) {
    rows.push({
      category: "SectorProfile",
      item: overview.activityProfile.activityCode,
      label: "Mode operatoire",
      value: overview.activityProfile.label,
      extra: overview.activityProfile.operationsModel
    });
    rows.push({
      category: "SectorProfile",
      item: `${overview.activityProfile.activityCode}-focus`,
      label: "Focus reporting",
      value: overview.activityProfile.reporting.focusArea,
      extra: overview.activityProfile.reporting.exportSections.join(" | ")
    });
  }

  for (const item of overview.activityHighlights) {
    rows.push({
      category: "SectorHighlight",
      item: item.code,
      label: item.label,
      value: item.value,
      extra: `${item.emphasis} | ${item.description}`
    });
  }

  for (const item of overview.financeByStatus) {
    rows.push({
      category: "FinanceByStatus",
      item: item.status,
      label: `${item.status} ${item.currency}`,
      value: item.count,
      extra: `${item.totalAmount} ${item.currency}`
    });
  }

  for (const item of overview.financeByType) {
    rows.push({
      category: "FinanceByType",
      item: item.type,
      label: `${item.type} ${item.currency}`,
      value: item.count,
      extra: `total ${item.totalAmount} ${item.currency} | comptabilisé ${item.approvedAmount} ${item.currency}`
    });
  }

  for (const item of overview.financeByActivity) {
    rows.push({
      category: "FinanceByActivity",
      item: item.activityCode,
      label: BUSINESS_ACTIVITY_LABELS[item.activityCode],
      value: item.count,
      extra: `total ${item.totalAmount} XOF/DEV | comptabilisé ${item.approvedAmount} XOF/DEV`
    });
  }

  rows.push({
    category: "FinanceAccounts",
    item: "totals",
    label: "Comptes financiers",
    value: overview.financeAccountsSummary.totalCount,
    extra: `compatibles ${overview.financeAccountsSummary.compatibleCount} | incompatibles ${overview.financeAccountsSummary.incompatibleCount}`
  });
  rows.push({
    category: "FinanceAccounts",
    item: "scope-distribution",
    label: "Portée des comptes",
    value: overview.financeAccountsSummary.globalCount,
    extra: `globaux ${overview.financeAccountsSummary.globalCount} | dédiés ${overview.financeAccountsSummary.dedicatedCount} | restreints ${overview.financeAccountsSummary.restrictedCount}`
  });

  for (const item of overview.financeAccounts) {
    rows.push({
      category: "FinanceAccountDetail",
      item: item.id,
      label: item.name,
      value: toDisplayAccountScopeLabel(item),
      extra: `${toDisplayAccountCompatibilityLabel(item.isCompatibleWithSelectedActivity)} | ref ${item.accountRef ?? "-"} | solde ${item.balance}`
    });
  }

  for (const item of overview.operationalPerformance) {
    rows.push({
      category: "OperationalPerformance",
      item: `${item.scope}-${item.activityCode}-${item.dimensionKey}-${item.itemKey}`,
      label: `${BUSINESS_ACTIVITY_LABELS[item.activityCode]} | ${item.dimensionLabel} | ${item.itemLabel}`,
      value: item.netProfit,
      extra: `entrées ${item.approvedCashIn} XOF | sorties ${item.approvedCashOut} XOF | marge ${item.marginRate}% | rentabilité coûts ${item.returnOnCostRate}% | exécution ${item.executionRate}% | ouvertes ${item.openTasksCount} | bloquées ${item.blockedTasksCount} | retards ${item.overdueTasksCount}`
    });
  }

  if (overview.hardwareMonthlyReport) {
    rows.push({
      category: "HardwareMonthlyReport",
      item: "totals",
      label: `Quincaillerie ${overview.hardwareMonthlyReport.periodLabel}`,
      value: overview.hardwareMonthlyReport.totals.purchaseAmount,
      extra: `quantité ${overview.hardwareMonthlyReport.totals.quantity} | achats ${overview.hardwareMonthlyReport.totals.purchaseAmount} XOF | bénéfice ${overview.hardwareMonthlyReport.totals.grossProfit} XOF | recouvré ${overview.hardwareMonthlyReport.totals.collectedAmount} XOF | écart achats ${overview.hardwareMonthlyReport.totals.purchaseVarianceAmount} XOF | reste attendu ${overview.hardwareMonthlyReport.totals.balanceAmount} XOF | lignes ${overview.hardwareMonthlyReport.totals.transactionsCount}`
    });
  }

  if (overview.generalExpensesReport) {
    rows.push({
      category: "GeneralExpensesReport",
      item: "totals",
      label: `Dépenses générales ${overview.generalExpensesReport.periodLabel}`,
      value: overview.generalExpensesReport.totals.totalAmount,
      extra: `PDG ${overview.generalExpensesReport.totals.pdgAmount} XOF | employés ${overview.generalExpensesReport.totals.employeeAmount} XOF | lignes ${overview.generalExpensesReport.totals.transactionsCount}`
    });
  }

  if (overview.agricultureOperationsReport) {
    rows.push({
      category: "AgricultureOperationsReport",
      item: "totals",
      label: `Agriculture ${overview.agricultureOperationsReport.periodLabel}`,
      value: overview.agricultureOperationsReport.totals.netAmount,
      extra: `parcelles ${overview.agricultureOperationsReport.totals.parcelsCount} | surface ${overview.agricultureOperationsReport.totals.surfaceArea} | recettes ${overview.agricultureOperationsReport.totals.cashInAmount} XOF | dépenses ${overview.agricultureOperationsReport.totals.cashOutAmount} XOF | exécution ${overview.agricultureOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.generalStoreOperationsReport) {
    rows.push({
      category: "GeneralStoreOperationsReport",
      item: "totals",
      label: `Magasins ${overview.generalStoreOperationsReport.periodLabel}`,
      value: overview.generalStoreOperationsReport.totals.balanceAmount,
      extra: `boutiques ${overview.generalStoreOperationsReport.totals.shopsCount} | achats ${overview.generalStoreOperationsReport.totals.purchaseAmount} XOF | recouvré ${overview.generalStoreOperationsReport.totals.collectedAmount} XOF | solde dû ${overview.generalStoreOperationsReport.totals.balanceAmount} XOF`
    });
  }

  if (overview.foodOperationsReport) {
    rows.push({
      category: "FoodOperationsReport",
      item: "totals",
      label: `Alimentation ${overview.foodOperationsReport.periodLabel}`,
      value: overview.foodOperationsReport.totals.netAmount,
      extra: `familles ${overview.foodOperationsReport.totals.productFamiliesCount} | produits ${overview.foodOperationsReport.totals.productsCount} | lots ${overview.foodOperationsReport.totals.batchesCount} | ventes ${overview.foodOperationsReport.totals.salesAmount} XOF | achats ${overview.foodOperationsReport.totals.purchaseAmount} XOF | pertes ${overview.foodOperationsReport.totals.lossAmount} XOF | marge ${overview.foodOperationsReport.totals.marginRate}% | exécution ${overview.foodOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.rentalOperationsReport) {
    rows.push({
      category: "RentalOperationsReport",
      item: "totals",
      label: `Location ${overview.rentalOperationsReport.periodLabel}`,
      value: overview.rentalOperationsReport.totals.netAmount,
      extra: `locataires ${overview.rentalOperationsReport.totals.tenantsCount} | a jour ${overview.rentalOperationsReport.totals.upToDateTenantsCount} | en retard ${overview.rentalOperationsReport.totals.lateTenantsCount} | arrieres ${overview.rentalOperationsReport.totals.totalArrearsAmount} XOF | encaisse ${overview.rentalOperationsReport.totals.collectedAmount} XOF | cautions ${overview.rentalOperationsReport.totals.depositAmount} XOF | exécution ${overview.rentalOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.hotelOperationsReport) {
    rows.push({
      category: "HotelOperationsReport",
      item: "totals",
      label: `Hôtellerie ${overview.hotelOperationsReport.periodLabel}`,
      value: overview.hotelOperationsReport.totals.netAmount,
      extra: `réservations ${overview.hotelOperationsReport.totals.bookingsCount} | chambres ${overview.hotelOperationsReport.totals.roomsCount} | nuitées ${overview.hotelOperationsReport.totals.nightsCount} | hebergement ${overview.hotelOperationsReport.totals.roomRevenue} XOF | restauration ${overview.hotelOperationsReport.totals.restaurantAmount} XOF | services ${overview.hotelOperationsReport.totals.serviceAmount} XOF | charges ${overview.hotelOperationsReport.totals.cashOutAmount} XOF | tarif moyen ${overview.hotelOperationsReport.totals.averageRoomRate} XOF | exécution ${overview.hotelOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.waterOperationsReport) {
    rows.push({
      category: "WaterOperationsReport",
      item: "totals",
      label: `Eau ${overview.waterOperationsReport.periodLabel}`,
      value: overview.waterOperationsReport.totals.netAmount,
      extra: `paquets vendus ${overview.waterOperationsReport.totals.packagesSold} | ventes ${overview.waterOperationsReport.totals.salesAmount} XOF | dépenses ${overview.waterOperationsReport.totals.expensesAmount} XOF | lignes ${overview.waterOperationsReport.totals.transactionsCount}`
    });
  }

  if (overview.agencyOperationsReport) {
    rows.push({
      category: "AgencyOperationsReport",
      item: "totals",
      label: `Agence immobilière ${overview.agencyOperationsReport.periodLabel}`,
      value: overview.agencyOperationsReport.totals.netAmount,
      extra: `mandats ${overview.agencyOperationsReport.totals.mandatesCount} | biens ${overview.agencyOperationsReport.totals.propertiesCount} | clients ${overview.agencyOperationsReport.totals.clientsCount} | affaires ${overview.agencyOperationsReport.totals.dealAmount} XOF | commissions vente ${overview.agencyOperationsReport.totals.saleCommissionAmount} XOF | commissions location ${overview.agencyOperationsReport.totals.rentalCommissionAmount} XOF | charges ${overview.agencyOperationsReport.totals.cashOutAmount} XOF | taux commission ${overview.agencyOperationsReport.totals.commissionRate}% | exécution ${overview.agencyOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.btpOperationsReport) {
    rows.push({
      category: "BtpOperationsReport",
      item: "totals",
      label: `BTP ${overview.btpOperationsReport.periodLabel}`,
      value: overview.btpOperationsReport.totals.netAmount,
      extra: `chantiers ${overview.btpOperationsReport.totals.projectsCount} | encaissé ${overview.btpOperationsReport.totals.cashInAmount} XOF | dépensé ${overview.btpOperationsReport.totals.totalCostAmount} XOF | marge ${overview.btpOperationsReport.totals.netAmount} XOF`
    });
  }

  if (overview.fishFarmingOperationsReport) {
    rows.push({
      category: "FishFarmingOperationsReport",
      item: "totals",
      label: `Pisciculture ${overview.fishFarmingOperationsReport.periodLabel}`,
      value: overview.fishFarmingOperationsReport.totals.netAmount,
      extra: `bassins ${overview.fishFarmingOperationsReport.totals.pondsCount} | cycles ${overview.fishFarmingOperationsReport.totals.cyclesCount} | alevins ${overview.fishFarmingOperationsReport.totals.fingerlingsQuantity} | aliment ${overview.fishFarmingOperationsReport.totals.feedQuantity} | ventes ${overview.fishFarmingOperationsReport.totals.soldQuantity} | mortalité ${overview.fishFarmingOperationsReport.totals.mortalityCount} | recettes ${overview.fishFarmingOperationsReport.totals.cashInAmount} XOF | dépenses ${overview.fishFarmingOperationsReport.totals.cashOutAmount} XOF | exécution ${overview.fishFarmingOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.livestockOperationsReport) {
    rows.push({
      category: "LivestockOperationsReport",
      item: "totals",
      label: `Élevage ${overview.livestockOperationsReport.periodLabel}`,
      value: overview.livestockOperationsReport.totals.netAmount,
      extra: `troupeaux ${overview.livestockOperationsReport.totals.herdsCount} | lots ${overview.livestockOperationsReport.totals.batchesCount} | achats ${overview.livestockOperationsReport.totals.animalPurchaseCount} | aliment ${overview.livestockOperationsReport.totals.feedQuantity} | ventes ${overview.livestockOperationsReport.totals.soldAnimalCount} | produits ${overview.livestockOperationsReport.totals.productQuantity} | mortalité ${overview.livestockOperationsReport.totals.mortalityCount} | recettes ${overview.livestockOperationsReport.totals.cashInAmount} XOF | dépenses ${overview.livestockOperationsReport.totals.cashOutAmount} XOF | exécution ${overview.livestockOperationsReport.totals.executionRate}%`
    });
  }

  for (const item of overview.taskByStatus) {
    rows.push({
      category: "TaskByStatus",
      item: item.status,
      label: item.status,
      value: item.count,
      extra: ""
    });
  }

  for (const item of overview.taskByActivity) {
    rows.push({
      category: "TaskByActivity",
      item: item.activityCode,
      label: BUSINESS_ACTIVITY_LABELS[item.activityCode],
      value: item.totalCount,
      extra: `ouvertes ${item.openCount} | bloquées ${item.blockedCount} | terminées ${item.doneCount}`
    });
  }

  return rows;
}

function buildOperationalPerformanceRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return overview.operationalPerformance.map((item) => ({
    scope: item.scope === "ACTIVITY" ? "Secteur" : "Sous-section",
    activity: BUSINESS_ACTIVITY_LABELS[item.activityCode],
    dimension: item.dimensionLabel,
    item: item.itemLabel,
    currency: item.currency,
    transactionsCount: item.transactionsCount,
    activeTransactionsCount: item.approvedTransactionsCount,
    cashIn: item.approvedCashIn,
    cashOut: item.approvedCashOut,
    netProfit: item.netProfit,
    marginRate: item.marginRate,
    returnOnCostRate: item.returnOnCostRate,
    totalTasksCount: item.totalTasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    overdueTasksCount: item.overdueTasksCount,
    executionRate: item.executionRate,
    blockageRate: item.blockageRate,
    followUpPressure: item.followUpPressure
  }));
}

function buildHardwareMonthlyReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.hardwareMonthlyReport?.rows ?? []).map((item) => ({
    date: item.date,
    designation: item.designation,
    recipientRef: item.recipientRef,
    quantity: item.quantity,
    purchaseUnitPrice: item.purchaseUnitPrice,
    purchaseAmount: item.purchaseAmount,
    grossProfit: item.grossProfit,
    transactionsCount: item.transactionsCount,
    currency: item.currency
  }));
}

function buildHardwareRecipientReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.hardwareMonthlyReport?.recipientRows ?? []).map((item) => ({
    recipientRef: item.recipientRef,
    purchaseAmount: item.purchaseAmount,
    grossProfit: item.grossProfit,
    expectedReturnAmount: item.expectedReturnAmount,
    collectedAmount: item.collectedAmount,
    purchaseVarianceAmount: item.purchaseVarianceAmount,
    balanceAmount: item.balanceAmount,
    transactionsCount: item.transactionsCount,
    currency: item.currency
  }));
}

function buildGeneralExpensesReportRows(
  overview: ReportsOverview,
  ownerType: "PDG" | "EMPLOYE"
): Array<Record<string, unknown>> {
  return (overview.generalExpensesReport?.rows ?? [])
    .filter((item) => item.ownerType === ownerType)
    .map((item) => ({
      date: item.date,
      categoryLabel: item.categoryLabel,
      designation: item.designation,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      currency: item.currency
    }));
}

function buildGeneralExpensesBreakdownRows(
  overview: ReportsOverview,
  ownerType: "PDG" | "EMPLOYE"
): Array<Record<string, unknown>> {
  return (overview.generalExpensesReport?.breakdownRows ?? [])
    .filter((item) => item.ownerType === ownerType)
    .map((item) => ({
      categoryLabel: item.categoryLabel,
      transactionsCount: item.transactionsCount,
      amount: item.amount,
      currency: item.currency
    }));
}

function buildAgricultureOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.agricultureOperationsReport?.rows ?? []).map((item) => ({
    campaignRef: item.campaignRef,
    parcelRef: item.parcelRef,
    fieldType: item.fieldType,
    cropType: item.cropType,
    surfaceArea: item.surfaceArea,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildAgricultureOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.agricultureOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildGeneralStoreOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.generalStoreOperationsReport?.rows ?? []).map((item) => ({
    shopRef: item.shopRef,
    location: item.location,
    transactionsCount: item.transactionsCount,
    lastOperationDate: item.lastOperationDate,
    purchaseAmount: item.purchaseAmount,
    collectedAmount: item.collectedAmount,
    balanceAmount: item.balanceAmount,
    lastInventoryDate: item.lastInventoryDate,
    remainingStockValue: item.remainingStockValue ?? "",
    estimatedSoldAmount: item.estimatedSoldAmount ?? "",
    varianceAmount: item.varianceAmount ?? "",
    currency: item.currency
  }));
}

function buildGeneralStoreOperationDetailRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.generalStoreOperationsReport?.operationRows ?? []).map((item) => ({
    date: item.date,
    shopRef: item.shopRef,
    operationKind: item.operationKind,
    status: item.status,
    designation: item.designation,
    amount: item.amount,
    currency: item.currency
  }));
}

function buildGeneralStoreOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.generalStoreOperationsReport?.breakdownRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    amount: item.amount,
    currency: item.currency
  }));
}

function buildGeneralStoreReadingRows(): Array<Record<string, unknown>> {
  return [
    {
      indicator: "Périmètre",
      definition: "Achats, recouvrements et nombres d'opérations soumises ou approuvées sont cumulés depuis l'historique jusqu'à la date de situation (date de fin sélectionnée, ou date du jour)."
    },
    {
      indicator: "Vendu estimé",
      definition: "Achats reportables enregistrés jusqu'au dernier inventaire moins la valeur du stock restant à cet inventaire. L'estimation suppose un stock initial nul ou déjà intégré et n'est calculée que si les achats couvrent le stock déclaré."
    },
    {
      indicator: "Écart",
      definition: "Vendu estimé moins les recouvrements enregistrés jusqu'à la date du même inventaire. À rapprocher des ventes constatées; un écart peut aussi représenter des créances ou pertes de stock."
    }
  ];
}

function buildFoodOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.foodOperationsReport?.rows ?? []).map((item) => ({
    productFamily: item.productFamily,
    productName: item.productName,
    batchRef: item.batchRef,
    storageArea: item.storageArea,
    purchaseQuantity: item.purchaseQuantity,
    soldQuantity: item.soldQuantity,
    lossQuantity: item.lossQuantity,
    purchaseAmount: item.purchaseAmount,
    salesAmount: item.salesAmount,
    lossAmount: item.lossAmount,
    expenseAmount: item.expenseAmount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    grossMargin: item.grossMargin,
    marginRate: item.marginRate,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildFoodOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.foodOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildRentalOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.rentalOperationsReport?.rows ?? []).map((item) => ({
    tenantRef: item.tenantRef,
    unitRef: item.unitRef,
    monthlyRent: item.monthlyRent,
    totalDue: item.totalDue,
    totalPaid: item.totalPaid,
    balanceAmount: item.balanceAmount,
    status: item.status,
    statusDetail: item.statusDetail,
    currency: item.currency
  }));
}

function buildRentalOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.rentalOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildRentalDepositReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.rentalOperationsReport?.depositRows ?? []).map((item) => ({
    tenantRef: item.tenantRef,
    unitRef: item.unitRef,
    status: item.status,
    depositPaidAmount: item.depositPaidAmount,
    paymentsCount: item.paymentsCount,
    lastPaymentLabel: item.lastPaymentLabel ?? "-",
    currency: item.currency
  }));
}

function buildHotelOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.hotelOperationsReport?.rows ?? []).map((item) => ({
    serviceLine: item.serviceLine,
    roomRef: item.roomRef,
    roomType: item.roomType,
    bookingRef: item.bookingRef,
    guestRef: item.guestRef,
    nightsCount: item.nightsCount,
    guestCount: item.guestCount,
    roomRevenue: item.roomRevenue,
    depositAmount: item.depositAmount,
    restaurantAmount: item.restaurantAmount,
    serviceAmount: item.serviceAmount,
    maintenanceAmount: item.maintenanceAmount,
    commissionAmount: item.commissionAmount,
    taxAmount: item.taxAmount,
    refundAmount: item.refundAmount,
    expenseAmount: item.expenseAmount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    averageRoomRate: item.averageRoomRate,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildHotelOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.hotelOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildWaterOperationsReportRows(
  overview: ReportsOverview,
  kind: "IN" | "OUT"
): Array<Record<string, unknown>> {
  return (overview.waterOperationsReport?.rows ?? [])
    .filter((item) => item.kind === kind)
    .map((item) => ({
      date: item.date,
      categoryLabel: item.categoryLabel,
      designation: item.designation,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      currency: item.currency
    }));
}

function buildWaterOperationsBreakdownRows(
  overview: ReportsOverview,
  kind: "IN" | "OUT"
): Array<Record<string, unknown>> {
  return (overview.waterOperationsReport?.breakdownRows ?? [])
    .filter((item) => item.kind === kind)
    .map((item) => ({
      categoryLabel: item.categoryLabel,
      transactionsCount: item.transactionsCount,
      amount: item.amount,
      currency: item.currency
    }));
}

function buildAgencyOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.agencyOperationsReport?.rows ?? []).map((item) => ({
    mandateRef: item.mandateRef,
    propertyRef: item.propertyRef,
    mandateType: item.mandateType,
    propertyType: item.propertyType,
    locationZone: item.locationZone,
    clientRef: item.clientRef,
    dealStage: item.dealStage,
    dealAmount: item.dealAmount,
    saleCommissionAmount: item.saleCommissionAmount,
    rentalCommissionAmount: item.rentalCommissionAmount,
    mandateFeeAmount: item.mandateFeeAmount,
    visitFeeAmount: item.visitFeeAmount,
    fileFeeAmount: item.fileFeeAmount,
    advertisingExpenseAmount: item.advertisingExpenseAmount,
    fieldVisitExpenseAmount: item.fieldVisitExpenseAmount,
    brokerPayoutAmount: item.brokerPayoutAmount,
    documentExpenseAmount: item.documentExpenseAmount,
    officeExpenseAmount: item.officeExpenseAmount,
    refundAmount: item.refundAmount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    commissionRate: item.commissionRate,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildAgencyOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.agencyOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildBtpOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.btpOperationsReport?.rows ?? []).map((item) => ({
    projectRef: item.projectRef,
    clientRef: item.clientRef,
    location: item.location,
    cashInAmount: item.cashInAmount,
    materialAmount: item.materialAmount,
    laborAmount: item.laborAmount,
    equipmentAmount: item.equipmentAmount,
    subcontractingAmount: item.subcontractingAmount,
    siteExpenseAmount: item.siteExpenseAmount,
    totalCostAmount: item.totalCostAmount,
    netAmount: item.netAmount,
    retentionAmount: item.retentionAmount,
    lastProgressPercent: item.lastProgressPercent ?? "",
    lastOperationDate: item.lastOperationDate,
    transactionsCount: item.transactionsCount,
    currency: item.currency
  }));
}

function buildFishFarmingOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.fishFarmingOperationsReport?.rows ?? []).map((item) => ({
    pondRef: item.pondRef,
    cycleRef: item.cycleRef,
    species: item.species,
    fingerlingsQuantity: item.fingerlingsQuantity,
    feedQuantity: item.feedQuantity,
    soldQuantity: item.soldQuantity,
    mortalityCount: item.mortalityCount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildFishFarmingOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.fishFarmingOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function buildLivestockOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.livestockOperationsReport?.rows ?? []).map((item) => ({
    herdRef: item.herdRef,
    batchRef: item.batchRef,
    species: item.species,
    animalPurchaseCount: item.animalPurchaseCount,
    feedQuantity: item.feedQuantity,
    soldAnimalCount: item.soldAnimalCount,
    productQuantity: item.productQuantity,
    mortalityCount: item.mortalityCount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildLivestockOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.livestockOperationsReport?.operationRows ?? []).map((item) => ({
    operationKind: item.operationKind,
    operationLabel: item.operationLabel,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    currency: item.currency
  }));
}

function normalizeReportFilters(input: ReportFiltersInput = {}): ReportPeriodFilter {
  const dateFrom = input.dateFrom ? new Date(input.dateFrom) : null;
  const dateTo = input.dateTo ? new Date(input.dateTo) : null;

  if (dateFrom && Number.isNaN(dateFrom.getTime())) {
    throw new HttpError(400, "dateFrom invalide.");
  }

  if (dateTo && Number.isNaN(dateTo.getTime())) {
    throw new HttpError(400, "dateTo invalide.");
  }

  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new HttpError(400, "dateFrom doit être inférieure ou égale à dateTo.");
  }

  if (input.activityCode && !isBusinessActivityCode(input.activityCode)) {
    throw new HttpError(400, "activityCode invalide.");
  }

  if (!input.dateFrom && !input.dateTo && !input.activityCode) {
    return {};
  }

  return {
    dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
    dateTo: dateTo ? dateTo.toISOString() : undefined,
    activityCode: input.activityCode as BusinessActivityCode | undefined
  };
}

function buildDashboardActivitySummary(
  financeRows: Array<{
    activityCode: BusinessActivityCode | null;
    transactionsCount: number;
    submittedTransactionsCount: number;
  }>,
  taskRows: Array<{
    activityCode: BusinessActivityCode | null;
    totalTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
  }>
) {
  const financeMap = new Map<BusinessActivityCode, (typeof financeRows)[number]>();
  for (const row of financeRows) {
    if (row.activityCode) {
      financeMap.set(row.activityCode, row);
    }
  }

  const taskMap = new Map<BusinessActivityCode, (typeof taskRows)[number]>();
  for (const row of taskRows) {
    if (row.activityCode) {
      taskMap.set(row.activityCode, row);
    }
  }

  return BUSINESS_ACTIVITIES.map((activity) => ({
    activityCode: activity.code,
    transactionsCount: financeMap.get(activity.code)?.transactionsCount ?? 0,
    submittedTransactionsCount: financeMap.get(activity.code)?.submittedTransactionsCount ?? 0,
    totalTasksCount: taskMap.get(activity.code)?.totalTasksCount ?? 0,
    openTasksCount: taskMap.get(activity.code)?.openTasksCount ?? 0,
    blockedTasksCount: taskMap.get(activity.code)?.blockedTasksCount ?? 0
  }));
}

function buildReportFinanceByActivitySummary(
  rows: Array<{
    activityCode: BusinessActivityCode | null;
    count: number;
    totalAmount: string;
    approvedAmount: string;
  }>
) {
  const rowMap = new Map<BusinessActivityCode, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.activityCode) {
      rowMap.set(row.activityCode, row);
    }
  }

  return BUSINESS_ACTIVITIES.map((activity) => ({
    activityCode: activity.code,
    count: rowMap.get(activity.code)?.count ?? 0,
    totalAmount: rowMap.get(activity.code)?.totalAmount ?? "0.00",
    approvedAmount: rowMap.get(activity.code)?.approvedAmount ?? "0.00"
  }));
}

function buildReportTaskByActivitySummary(
  rows: Array<{
    activityCode: BusinessActivityCode | null;
    totalCount: number;
    openCount: number;
    blockedCount: number;
    doneCount: number;
  }>
) {
  const rowMap = new Map<BusinessActivityCode, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.activityCode) {
      rowMap.set(row.activityCode, row);
    }
  }

  return BUSINESS_ACTIVITIES.map((activity) => ({
    activityCode: activity.code,
    totalCount: rowMap.get(activity.code)?.totalCount ?? 0,
    openCount: rowMap.get(activity.code)?.openCount ?? 0,
    blockedCount: rowMap.get(activity.code)?.blockedCount ?? 0,
    doneCount: rowMap.get(activity.code)?.doneCount ?? 0
  }));
}

type OperationalBucket = Omit<
  ReportOperationalMetric,
  | "approvedCashIn"
  | "approvedCashOut"
  | "netProfit"
  | "marginRate"
  | "returnOnCostRate"
  | "executionRate"
  | "blockageRate"
>;

function toNumberAmount(value: string | number | null | undefined): number {
  const normalized =
    typeof value === "number" ? String(value) : (value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMoneyString(value: number): string {
  return value.toFixed(2);
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function getMetadataNumber(metadata: Record<string, string>, key: string): number {
  return toNumberAmount(metadata[key]);
}

function buildHydrocarbonOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): HydrocarbonOperationsReport {
  const sectorTransactions = transactions
    .filter((item) => item.activityCode === "HYDROCARBON" && isReportableFinancialStatus(item.status))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const totalsByCurrency = new Map<string, { count: number; cashIn: number; cashOut: number }>();

  const rows: HydrocarbonOperationsReport["rows"] = sectorTransactions.map((item) => {
    const currency = item.currency.trim().toUpperCase() || "—";
    const amount = toNumberAmount(item.amount);
    const summary = totalsByCurrency.get(currency) ?? { count: 0, cashIn: 0, cashOut: 0 };
    summary.count += 1;
    if (item.type === "CASH_IN") summary.cashIn += amount;
    else summary.cashOut += amount;
    totalsByCurrency.set(currency, summary);

    return {
      date: toReportDate(item.occurredAt),
      categoryLabel: item.metadata.hydrocarbonCategory?.trim() || "Non classé",
      assetRef: item.metadata.hydrocarbonAssetRef?.trim() || "-",
      direction: item.type,
      description: item.description?.trim() || "—",
      status: item.status as "SUBMITTED" | "APPROVED",
      amount: toMoneyString(amount),
      currency
    };
  });

  const currencyOrder = ["XOF", "EUR", "USD"];
  const currencySummaries: HydrocarbonOperationsReport["currencySummaries"] = Array.from(totalsByCurrency)
    .sort(([left], [right]) => {
      const leftOrder = currencyOrder.indexOf(left);
      const rightOrder = currencyOrder.indexOf(right);
      if (leftOrder >= 0 || rightOrder >= 0) {
        return (leftOrder < 0 ? currencyOrder.length : leftOrder) -
          (rightOrder < 0 ? currencyOrder.length : rightOrder);
      }
      return left.localeCompare(right);
    })
    .map(([currency, summary]) => ({
      currency,
      transactionsCount: summary.count,
      cashInAmount: toMoneyString(summary.cashIn),
      cashOutAmount: toMoneyString(summary.cashOut),
      netAmount: toMoneyString(summary.cashIn - summary.cashOut)
    }));

  const sectorTasks = tasks.filter((item) => item.activityCode === "HYDROCARBON");
  const reportTasks: HydrocarbonOperationsReport["tasks"] = sectorTasks.map((task) => ({
    dueDate: task.dueDate ? toReportDate(task.dueDate) : null,
    title: task.title?.trim() || "Action sans titre",
    description: task.description?.trim() || "—",
    status: task.status
  }));
  const taskStatuses: HydrocarbonOperationsReport["taskStatusSummary"][number]["status"][] = [
    "TODO", "IN_PROGRESS", "DONE", "BLOCKED"
  ];
  const taskStatusSummary = taskStatuses.map((status) => ({
    status,
    count: sectorTasks.filter((item) => item.status === status).length
  }));
  const doneTasksCount = taskStatusSummary.find((item) => item.status === "DONE")?.count ?? 0;
  const blockedTasksCount = taskStatusSummary.find((item) => item.status === "BLOCKED")?.count ?? 0;
  const openTasksCount = taskStatusSummary
    .filter((item) => item.status === "TODO" || item.status === "IN_PROGRESS")
    .reduce((total, item) => total + item.count, 0);

  return {
    periodLabel: toDisplayPeriodLabel(filters),
    rows,
    currencySummaries,
    tasks: reportTasks,
    taskStatusSummary,
    totals: {
      transactionsCount: rows.length,
      tasksCount: sectorTasks.length,
      doneTasksCount,
      openTasksCount,
      blockedTasksCount
    }
  };
}

function buildBeverageDepotReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): BeverageDepotReport {
  const sectorTransactions = transactions.filter((item) =>
    item.activityCode === "BEVERAGE_DEPOT" && item.currency === "XOF" && isReportableFinancialStatus(item.status)
  );
  const getCategory = (item: ReportOperationalTransaction): BeverageDepotReport["transactions"][number]["category"] => {
    const configuredCategory = item.metadata.beverageOperationKind;
    if (item.type === "CASH_IN" && configuredCategory === "VENTE") return "VENTE";
    if (item.type === "CASH_OUT" && configuredCategory === "ACHAT_STOCK") return "ACHAT_STOCK";
    if (item.type === "CASH_OUT" && configuredCategory === "DEPENSE") return "DEPENSE";
    if (item.type === "CASH_IN" && configuredCategory === "AUTRE_RECETTE") return "AUTRE_RECETTE";
    return item.type === "CASH_IN" ? "AUTRE_RECETTE" : "DEPENSE";
  };
  const sectorTasks = tasks.filter((item) => item.activityCode === "BEVERAGE_DEPOT");
  const sales = sectorTransactions.filter((item) => getCategory(item) === "VENTE");
  const purchases = sectorTransactions.filter((item) => getCategory(item) === "ACHAT_STOCK");
  const expenses = sectorTransactions.filter((item) => getCategory(item) === "DEPENSE");
  const otherIncome = sectorTransactions.filter((item) => getCategory(item) === "AUTRE_RECETTE");
  const inventoryTasks = sectorTasks.filter((item) => item.metadata.beverageTaskKind === "INVENTAIRE");
  const reconciliationTasks = sectorTasks.filter((item) => item.metadata.beverageTaskKind === "RAPPROCHEMENT");
  const inventoryDate = (task: ReportOperationalTask) =>
    task.metadata.periodDate?.trim().slice(0, 10) || (task.dueDate ? toReportDate(task.dueDate) : "");
  const latestInventoryByProduct = new Map<string, ReportOperationalTask>();
  for (const task of inventoryTasks) {
    if (task.status !== "DONE") continue;
    const productName = task.metadata.productName?.trim();
    if (!productName) continue;
    const key = productName.toLocaleLowerCase("fr");
    const existing = latestInventoryByProduct.get(key);
    if (!existing || inventoryDate(task) >= inventoryDate(existing)) {
      latestInventoryByProduct.set(key, task);
    }
  }
  const sum = (items: ReportOperationalTransaction[]) => items.reduce((total, item) => total + toNumberAmount(item.amount), 0);
  const grossMargin = sales.reduce((total, item) => {
    if (item.metadata.beverageStockManaged === "1" && item.metadata.beverageStockCost) {
      return total + toNumberAmount(item.amount) - getMetadataNumber(item.metadata, "beverageStockCost");
    }
    const quantity = getMetadataNumber(item.metadata, "quantity");
    const salePrice = getMetadataNumber(item.metadata, "saleUnitPrice");
    const purchasePrice = getMetadataNumber(item.metadata, "purchaseUnitPrice");
    if (quantity <= 0 || salePrice <= 0 || purchasePrice <= 0) return total;
    return total + (salePrice - purchasePrice) * quantity;
  }, 0);
  const taskDate = inventoryDate;
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    netOperatingResultAmount: toMoneyString(grossMargin + sum(otherIncome) - sum(expenses)),
    transactions: [...sectorTransactions].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).map((item) => {
      return {
        date: toReportDate(item.occurredAt),
        category: getCategory(item),
        productName: item.metadata.productName?.trim() || "—",
        quantity: item.metadata.quantity ? getMetadataNumber(item.metadata, "quantity") : null,
        purchaseUnitPrice: item.metadata.purchaseUnitPrice ? toMoneyString(getMetadataNumber(item.metadata, "purchaseUnitPrice")) : null,
        saleUnitPrice: item.metadata.saleUnitPrice ? toMoneyString(getMetadataNumber(item.metadata, "saleUnitPrice")) : null,
        amount: toMoneyString(toNumberAmount(item.amount)),
        description: item.description?.trim() || item.metadata.supplierRef?.trim() || item.metadata.expenseCategory?.trim() || "—",
        currency: "XOF" as const
      };
    }),
    inventory: inventoryTasks
      .map((item) => ({
        date: taskDate(item), status: item.status,
        productName: item.metadata.productName?.trim() || "—",
        quantity: item.metadata.quantity ? getMetadataNumber(item.metadata, "quantity") : null,
        purchaseUnitPrice: item.metadata.purchaseUnitPrice ? toMoneyString(getMetadataNumber(item.metadata, "purchaseUnitPrice")) : null,
        stockValue: item.metadata.stockValue ? toMoneyString(getMetadataNumber(item.metadata, "stockValue")) : null
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    reconciliations: reconciliationTasks
      .map((item) => ({
        date: taskDate(item), status: item.status,
        dailySales: toMoneyString(getMetadataNumber(item.metadata, "dailySales")),
        dailyDeposits: toMoneyString(getMetadataNumber(item.metadata, "dailyDeposits")),
        dailyBalance: toMoneyString(getMetadataNumber(item.metadata, "dailyBalance")),
        dailyExpenses: toMoneyString(getMetadataNumber(item.metadata, "dailyExpenses"))
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    totals: {
      salesAmount: toMoneyString(sum(sales)),
      purchasesAmount: toMoneyString(sum(purchases)),
      expensesAmount: toMoneyString(sum(expenses)),
      otherIncomeAmount: toMoneyString(sum(otherIncome)),
      grossMarginAmount: toMoneyString(grossMargin),
      stockValue: toMoneyString(Array.from(latestInventoryByProduct.values()).reduce(
        (total, item) => total + getMetadataNumber(item.metadata, "stockValue"), 0
      )),
      currency: "XOF"
    }
  };
}

function getHardwareDesignation(transaction: ReportOperationalTransaction): string {
  const metadata = transaction.metadata;
  const designation =
    metadata.itemName?.trim() ||
    metadata.designation?.trim() ||
    metadata.productFamily?.trim() ||
    transaction.description?.trim();
  return designation || "Article quincaillerie";
}

function hasHardwareItemMetadata(metadata: Record<string, string>): boolean {
  return Boolean(
    metadata.itemName?.trim() ||
    metadata.designation?.trim() ||
    metadata.productFamily?.trim() ||
    metadata.quantity?.trim() ||
    metadata.purchaseUnitPrice?.trim() ||
    metadata.saleUnitPrice?.trim() ||
    metadata.dailyPayment?.trim() ||
    metadata.paymentAmount?.trim() ||
    metadata.supplierRef?.trim()
  );
}

function hasHardwarePurchaseContext(transaction: ReportOperationalTransaction): boolean {
  return hasHardwareItemMetadata(transaction.metadata) || Boolean(transaction.description?.trim());
}

function toReportDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toHardwarePeriodLabel(filters: ReportPeriodFilter): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const fromYear = fromDate.getUTCFullYear();
  const fromMonth = fromDate.getUTCMonth();
  const fromDay = fromDate.getUTCDate();
  const toYear = toDate.getUTCFullYear();
  const toMonth = toDate.getUTCMonth();
  const toDay = toDate.getUTCDate();
  const lastDayOfToMonth = new Date(Date.UTC(toYear, toMonth + 1, 0)).getUTCDate();

  const isFullMonth =
    fromYear === toYear &&
    fromMonth === toMonth &&
    fromDay === 1 &&
    toDay === lastDayOfToMonth;
  if (isFullMonth) {
    return normalizePdfSpacing(new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(fromDate));
  }

  const isFullYear =
    fromYear === toYear &&
    fromMonth === 0 &&
    fromDay === 1 &&
    toMonth === 11 &&
    toDay === 31;
  if (isFullYear) {
    return `annee ${fromYear}`;
  }

  const quarterStartMonths = [0, 3, 6, 9];
  const quarterIndex = quarterStartMonths.indexOf(fromMonth);
  const isFullQuarter =
    fromYear === toYear &&
    quarterIndex >= 0 &&
    fromDay === 1 &&
    toMonth === fromMonth + 2 &&
    toDay === lastDayOfToMonth;
  if (isFullQuarter) {
    const quarterNumber = quarterIndex + 1;
    return `${quarterNumber === 1 ? "1er" : `${quarterNumber}e`} trimestre ${fromYear}`;
  }

  return toDisplayPeriodLabel(filters);
}

function isHardwareReportablePurchase(transaction: ReportOperationalTransaction): boolean {
  const operationKind = transaction.metadata.hardwareOperationKind?.trim();
  if (
    !(
      isSectorReportableTransaction(transaction, "HARDWARE") &&
      transaction.type === "CASH_OUT"
    )
  ) {
    return false;
  }

  if (operationKind === "ITEM_EXIT") {
    return false;
  }

  if (operationKind === "ITEM_ENTRY") {
    return true;
  }

  return hasHardwarePurchaseContext(transaction);
}

function buildHardwareMonthlyReport(
  transactions: ReportOperationalTransaction[],
  allHardwareTransactions: ReportOperationalTransaction[],
  filters: ReportPeriodFilter
): HardwareMonthlyReport | null {
  if (filters.activityCode && filters.activityCode !== "HARDWARE") {
    return null;
  }

  const hardwareTransactions = transactions.filter(
    (transaction) => transaction.activityCode === "HARDWARE"
  );
  const reportableTransactions = hardwareTransactions.filter(isHardwareReportablePurchase);
  const asOfIso = filters.dateTo ?? new Date().toISOString();
  const recipientLedger = new Map<string, {
    recipientRef: string;
    purchaseAmount: number;
    grossProfit: number;
    collectedAmount: number;
    transactionsCount: number;
  }>();
  let unassignedPurchasesCount = 0;
  let unassignedCollectionsCount = 0;

  for (const transaction of allHardwareTransactions) {
    if (!isSectorReportableTransaction(transaction, "HARDWARE") || transaction.occurredAt > asOfIso) {
      continue;
    }
    const operationKind = transaction.metadata.hardwareOperationKind?.trim();
    const isPurchase = operationKind !== "GLOBAL" && isHardwareReportablePurchase(transaction);
    const isCollection = transaction.type === "CASH_IN" &&
      (operationKind === "RECOUVREMENT" || operationKind === "ITEM_EXIT");
    if (!isPurchase && !isCollection) {
      continue;
    }
    const recipientRef = transaction.metadata.recipientRef?.trim().replace(/\s+/g, " ");
    if (!recipientRef) {
      if (isPurchase) unassignedPurchasesCount += 1;
      if (isCollection) unassignedCollectionsCount += 1;
      continue;
    }
    const key = recipientRef.normalize("NFKC").toLocaleLowerCase("fr");
    const ledger = recipientLedger.get(key) ?? {
      recipientRef,
      purchaseAmount: 0,
      grossProfit: 0,
      collectedAmount: 0,
      transactionsCount: 0
    };
    if (isPurchase) {
      ledger.purchaseAmount += toNumberAmount(transaction.amount);
      ledger.grossProfit += getMetadataNumber(transaction.metadata, "marginAmount");
    } else {
      ledger.collectedAmount += toNumberAmount(transaction.amount);
    }
    ledger.transactionsCount += 1;
    recipientLedger.set(key, ledger);
  }

  const recipientRows = [...recipientLedger.values()]
    .map((ledger) => ({
      recipientRef: ledger.recipientRef,
      purchaseAmount: toMoneyString(ledger.purchaseAmount),
      grossProfit: toMoneyString(ledger.grossProfit),
      expectedReturnAmount: toMoneyString(ledger.purchaseAmount + ledger.grossProfit),
      collectedAmount: toMoneyString(ledger.collectedAmount),
      purchaseVarianceAmount: toMoneyString(ledger.purchaseAmount - ledger.collectedAmount),
      balanceAmount: toMoneyString(ledger.purchaseAmount + ledger.grossProfit - ledger.collectedAmount),
      transactionsCount: ledger.transactionsCount,
      currency: "XOF" as const
    }))
    .sort((left, right) => left.recipientRef.localeCompare(right.recipientRef, "fr"));
  if (!filters.activityCode && reportableTransactions.length === 0 && recipientRows.length === 0 &&
      unassignedPurchasesCount === 0 && unassignedCollectionsCount === 0) {
    return null;
  }

  const sortedTransactions = [...reportableTransactions].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt)
  );

  const rows = sortedTransactions.map((transaction) => {
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const metaUnitPrice = getMetadataNumber(transaction.metadata, "purchaseUnitPrice");
    const purchaseAmountValue = toNumberAmount(transaction.amount);
    const purchaseUnitPriceValue =
      metaUnitPrice > 0 ? metaUnitPrice : quantity > 0 ? purchaseAmountValue / quantity : 0;
    const grossProfitValue = getMetadataNumber(transaction.metadata, "marginAmount");

    return {
      date: toReportDate(transaction.occurredAt),
      designation: getHardwareDesignation(transaction),
      recipientRef: transaction.metadata.recipientRef?.trim() || "-",
      quantity,
      purchaseUnitPrice: toMoneyString(purchaseUnitPriceValue),
      purchaseAmount: toMoneyString(purchaseAmountValue),
      grossProfit: toMoneyString(grossProfitValue),
      transactionsCount: 1,
      currency: "XOF" as const
    };
  });

  const totals = rows.reduce(
    (sum, row) => ({
      quantity: sum.quantity + row.quantity,
      purchaseUnitPriceValue: sum.purchaseUnitPriceValue + toNumberAmount(row.purchaseUnitPrice),
      purchaseAmountValue: sum.purchaseAmountValue + toNumberAmount(row.purchaseAmount),
      grossProfitValue: sum.grossProfitValue + toNumberAmount(row.grossProfit),
      transactionsCount: sum.transactionsCount + row.transactionsCount
    }),
    {
      quantity: 0,
      purchaseUnitPriceValue: 0,
      purchaseAmountValue: 0,
      grossProfitValue: 0,
      transactionsCount: 0
    }
  );

  return {
    periodLabel: toHardwarePeriodLabel(filters),
    rows,
    recipientRows,
    totals: {
      quantity: totals.quantity,
      purchaseUnitPrice: toMoneyString(totals.purchaseUnitPriceValue),
      purchaseAmount: toMoneyString(totals.purchaseAmountValue),
      grossProfit: toMoneyString(totals.grossProfitValue),
      assignedPurchaseAmount: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.purchaseAmount), 0)),
      assignedGrossProfit: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.grossProfit), 0)),
      expectedReturnAmount: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.expectedReturnAmount), 0)),
      collectedAmount: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.collectedAmount), 0)),
      purchaseVarianceAmount: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.purchaseVarianceAmount), 0)),
      balanceAmount: toMoneyString(recipientRows.reduce((sum, row) => sum + toNumberAmount(row.balanceAmount), 0)),
      unassignedPurchasesCount,
      unassignedCollectionsCount,
      transactionsCount: totals.transactionsCount,
      currency: "XOF" as const
    }
  };
}

function isGeneralExpensesReportable(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "GENERAL_EXPENSES") && transaction.type === "CASH_OUT";
}

function getGeneralExpenseOwnerType(kind: string): "PDG" | "EMPLOYE" {
  return kind.startsWith("PDG_") ? "PDG" : "EMPLOYE";
}

function toGeneralExpenseCategoryLabel(kind: string): string {
  return GENERAL_EXPENSE_KIND_LABELS[kind] ?? kind;
}

function buildGeneralExpensesReport(
  transactions: ReportOperationalTransaction[],
  filters: ReportPeriodFilter
): GeneralExpensesReport | null {
  if (filters.activityCode && filters.activityCode !== "GENERAL_EXPENSES") {
    return null;
  }

  const generalExpenseTransactions = transactions.filter(
    (transaction) => transaction.activityCode === "GENERAL_EXPENSES"
  );
  const reportableTransactions = generalExpenseTransactions.filter(isGeneralExpensesReportable);
  if (!filters.activityCode && reportableTransactions.length === 0) {
    return null;
  }

  const sortedTransactions = [...reportableTransactions].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt)
  );

  const rows = sortedTransactions.map((transaction) => {
    const kind = transaction.metadata.generalExpenseKind?.trim() || "EMPLOYEE_OTHER";
    const ownerType = getGeneralExpenseOwnerType(kind);
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const metaUnitPrice = getMetadataNumber(transaction.metadata, "unitPrice");
    const amountValue = toNumberAmount(transaction.amount);
    const unitPriceValue = metaUnitPrice > 0 ? metaUnitPrice : quantity > 0 ? amountValue / quantity : 0;

    return {
      date: toReportDate(transaction.occurredAt),
      ownerType,
      categoryLabel: toGeneralExpenseCategoryLabel(kind),
      designation: transaction.description?.trim() || "-",
      quantity,
      unitPrice: toMoneyString(unitPriceValue),
      amount: toMoneyString(amountValue),
      currency: "XOF" as const
    };
  });

  type BreakdownBucket = { ownerType: "PDG" | "EMPLOYE"; categoryLabel: string; count: number; amount: number };
  const breakdownMap = new Map<string, BreakdownBucket>();
  for (const row of rows) {
    const key = `${row.ownerType}|${row.categoryLabel}`;
    const existing: BreakdownBucket = breakdownMap.get(key) ?? {
      ownerType: row.ownerType,
      categoryLabel: row.categoryLabel,
      count: 0,
      amount: 0
    };
    existing.count += 1;
    existing.amount += toNumberAmount(row.amount);
    breakdownMap.set(key, existing);
  }

  const breakdownRows: GeneralExpensesReport["breakdownRows"] = Array.from(breakdownMap.values())
    .sort((left, right) => {
      if (left.ownerType !== right.ownerType) {
        return left.ownerType === "PDG" ? -1 : 1;
      }
      return right.amount - left.amount;
    })
    .map((item) => ({
      ownerType: item.ownerType,
      categoryLabel: item.categoryLabel,
      transactionsCount: item.count,
      amount: toMoneyString(item.amount),
      currency: "XOF" as const
    }));

  const totals = rows.reduce(
    (sum, row) => {
      const amountValue = toNumberAmount(row.amount);
      return {
        transactionsCount: sum.transactionsCount + 1,
        pdgAmountValue: sum.pdgAmountValue + (row.ownerType === "PDG" ? amountValue : 0),
        employeeAmountValue: sum.employeeAmountValue + (row.ownerType === "EMPLOYE" ? amountValue : 0)
      };
    },
    { transactionsCount: 0, pdgAmountValue: 0, employeeAmountValue: 0 }
  );

  return {
    periodLabel: toGeneralExpensesPeriodLabel(filters),
    rows,
    breakdownRows,
    totals: {
      transactionsCount: totals.transactionsCount,
      pdgAmount: toMoneyString(totals.pdgAmountValue),
      employeeAmount: toMoneyString(totals.employeeAmountValue),
      totalAmount: toMoneyString(totals.pdgAmountValue + totals.employeeAmountValue),
      currency: "XOF" as const
    }
  };
}

function buildTransportOperationsReport(
  transactions: ReportOperationalTransaction[],
  filters: ReportPeriodFilter
): TransportOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "TRANSPORT") return null;

  const sectorTransactions = transactions
    .filter((transaction) =>
      transaction.activityCode === "TRANSPORT" && isReportableFinancialStatus(transaction.status)
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  if (!filters.activityCode && sectorTransactions.length === 0) return null;

  const totalsByCurrency = new Map<string, {
    transactionsCount: number;
    cashIn: number;
    amcco: number;
    cashOut: number;
  }>();

  const rows: TransportOperationsReport["rows"] = sectorTransactions.map((transaction) => {
    const metadata = transaction.metadata;
    const currency = transaction.currency.trim().toUpperCase() || "XOF";
    const amount = toNumberAmount(transaction.amount);
    const kind = metadata.dumpTruckOperationKind?.trim();
    const category = metadata.transportCategory?.trim();
    const service = metadata.transportService?.trim();
    const operationLabel = kind
      ? TRANSPORT_OPERATION_DISPLAY_LABELS[kind] ?? kind
      : category || service || (transaction.type === "CASH_IN" ? "Recette transport" : "Dépense transport");
    const designationParts = [
      metadata.routeRef?.trim(),
      metadata.counterpartyRef?.trim(),
      transaction.description?.trim()
    ].filter((value): value is string => Boolean(value));
    const designation = Array.from(new Set(designationParts)).join(" · ") || "-";
    const quantity = getMetadataNumber(metadata, "quantity");
    const unitPrice = getMetadataNumber(metadata, "purchaseUnitPrice");
    const amccoAmount = transaction.type === "CASH_IN" && category === "Camion benne"
      ? getMetadataNumber(metadata, "amccoAmount")
      : 0;
    const totals = totalsByCurrency.get(currency) ?? { transactionsCount: 0, cashIn: 0, amcco: 0, cashOut: 0 };
    totals.transactionsCount += 1;
    if (transaction.type === "CASH_IN") totals.cashIn += amount;
    else totals.cashOut += amount;
    totals.amcco += amccoAmount;
    totalsByCurrency.set(currency, totals);

    return {
      date: toReportDate(transaction.occurredAt),
      operationLabel,
      vehicleLabel: metadata.vehicleRef?.trim() || metadata.assetType?.trim() || "-",
      designation,
      quantity: quantity > 0 ? quantity : null,
      unitPrice: unitPrice > 0 ? toMoneyString(unitPrice) : null,
      cashInAmount: transaction.type === "CASH_IN" ? toMoneyString(amount) : "0.00",
      amccoAmount: toMoneyString(amccoAmount),
      cashOutAmount: transaction.type === "CASH_OUT" ? toMoneyString(amount) : "0.00",
      currency
    };
  });

  const currencySummaries: TransportOperationsReport["currencySummaries"] = Array.from(totalsByCurrency)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, totals]) => ({
      currency,
      transactionsCount: totals.transactionsCount,
      cashInAmount: toMoneyString(totals.cashIn),
      amccoAmount: toMoneyString(totals.amcco),
      cashOutAmount: toMoneyString(totals.cashOut),
      netAmount: toMoneyString(totals.cashIn - totals.cashOut)
    }));

  return {
    periodLabel: toDisplayPeriodLabel(filters),
    rows,
    currencySummaries
  };
}

function normalizeDailyActivityKind(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function isDailyAgreement(task: ReportOperationalTask): boolean {
  return normalizeDailyActivityKind(task.metadata.dailyActivityKind) === "protocole d'accord";
}

function toDailyAgreementAmount(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const amount = toNumberAmount(value);
  return amount > 0 ? toMoneyString(amount) : null;
}

function getDailyAgreementOperationLabel(metadata: Record<string, string>, direction: "CASH_IN" | "CASH_OUT"): string {
  switch (metadata.financialOperationKind?.trim()) {
    case "PARTNER_PAYMENT": return "Versement partenaire";
    case "AGREEMENT_PROFIT": return "Bénéfice reçu";
    case "CAPITAL_RETURN": return "Retour de capital";
    case "AGREEMENT_EXPENSE": return "Dépense d'accord";
    default: return direction === "CASH_IN" ? "Entrée" : "Sortie";
  }
}

function buildDailyActivitiesReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): DailyActivitiesReport | null {
  if (filters.activityCode && filters.activityCode !== "DAILY_ACTIVITIES") return null;

  const sectorTasks = tasks.filter((task) => task.activityCode === "DAILY_ACTIVITIES");
  const sectorTransactions = transactions
    .filter((transaction) =>
      transaction.activityCode === "DAILY_ACTIVITIES" && isReportableFinancialStatus(transaction.status)
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  if (!filters.activityCode && sectorTasks.length === 0 && sectorTransactions.length === 0) {
    return null;
  }

  const activities = sectorTasks
    .map((task) => ({
      dueDate: task.dueDate ? toReportDate(task.dueDate) : null,
      categoryLabel: task.metadata.dailyActivityKind?.trim() || "Catégorie non renseignée",
      title: task.title?.trim() || "Activité sans titre",
      description: task.description?.trim() || "",
      status: task.status,
      indicativeAmount: toDailyAgreementAmount(task.metadata.amount),
      agreementRef: task.metadata.agreementRef?.trim() || "",
      partnerName: task.metadata.partnerName?.trim() || ""
    }))
    .sort((left, right) =>
      (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31") ||
      left.categoryLabel.localeCompare(right.categoryLabel) || left.title.localeCompare(right.title)
    );

  const categoryMap = new Map<string, DailyActivitiesReport["categories"][number]>();
  for (const activity of activities) {
    const categoryKey = normalizeDailyActivityKind(activity.categoryLabel);
    const category = categoryMap.get(categoryKey) ?? {
      categoryLabel: activity.categoryLabel,
      activitiesCount: 0,
      openCount: 0,
      doneCount: 0,
      blockedCount: 0
    };
    category.activitiesCount += 1;
    if (activity.status === "DONE") category.doneCount += 1;
    else category.openCount += 1;
    if (activity.status === "BLOCKED") category.blockedCount += 1;
    categoryMap.set(categoryKey, category);
  }

  const agreementMap = new Map<string, DailyActivitiesReport["agreements"][number]>();
  for (const task of sectorTasks.filter(isDailyAgreement)) {
    const agreementRef = task.metadata.agreementRef?.trim();
    if (!agreementRef) continue;
    const agreement = {
      agreementRef,
      partnerName: task.metadata.partnerName?.trim() || "Partenaire non renseigné",
      agreementType: task.metadata.agreementType?.trim() || "Type non renseigné",
      agreementDate: task.metadata.agreementDate?.trim() || "",
      purpose: task.metadata.agreementPurpose?.trim() || task.title?.trim() || "Objet non renseigné",
      capitalAmount: toDailyAgreementAmount(task.metadata.agreementCapitalAmount),
      profitAmount: toDailyAgreementAmount(task.metadata.agreementProfitAmount),
      paymentAccount: task.metadata.agreementPaymentAccount?.trim() || "",
      status: task.status
    };
    const existing = agreementMap.get(agreementRef);
    if (!existing || (existing.purpose === "Objet non renseigné" && agreement.purpose !== existing.purpose)) {
      agreementMap.set(agreementRef, agreement);
    }
  }

  const currencyMap = new Map<string, {
    transactionsCount: number;
    approvedTransactionsCount: number;
    pendingTransactionsCount: number;
    cashIn: number;
    cashOut: number;
  }>();
  const reportTransactions: DailyActivitiesReport["transactions"] = sectorTransactions.map((transaction) => {
    const currency = transaction.currency.trim().toUpperCase() || "—";
    const amount = toNumberAmount(transaction.amount);
    const totals = currencyMap.get(currency) ?? {
      transactionsCount: 0,
      approvedTransactionsCount: 0,
      pendingTransactionsCount: 0,
      cashIn: 0,
      cashOut: 0
    };
    totals.transactionsCount += 1;
    if (transaction.status === "APPROVED") {
      totals.approvedTransactionsCount += 1;
      if (transaction.type === "CASH_IN") totals.cashIn += amount;
      else totals.cashOut += amount;
    } else {
      totals.pendingTransactionsCount += 1;
    }
    currencyMap.set(currency, totals);

    const metadata = transaction.metadata;
    const agreementRef = metadata.agreementRef?.trim() || "";
    const partnerName = metadata.partnerName?.trim() || "";
    if (agreementRef && !agreementMap.has(agreementRef)) {
      agreementMap.set(agreementRef, {
        agreementRef,
        partnerName: partnerName || "Partenaire non renseigné",
        agreementType: "Type inconnu",
        agreementDate: "",
        purpose: "",
        capitalAmount: null,
        profitAmount: null,
        paymentAccount: "",
        status: null
      });
    }

    return {
      date: toReportDate(transaction.occurredAt),
      categoryLabel: metadata.dailyActivityKind?.trim() || "Protocole d'accord",
      operationLabel: getDailyAgreementOperationLabel(metadata, transaction.type),
      agreementRef,
      partnerName,
      paymentReference: metadata.paymentReference?.trim() || "",
      description: transaction.description?.trim() || "",
      direction: transaction.type,
      status: transaction.status as "SUBMITTED" | "APPROVED",
      amount: toMoneyString(amount),
      currency
    };
  });

  const currencyOrder = ["XOF", "EUR", "USD"];
  const currencySummaries: DailyActivitiesReport["currencySummaries"] = Array.from(currencyMap)
    .sort(([left], [right]) => {
      const leftIndex = currencyOrder.indexOf(left);
      const rightIndex = currencyOrder.indexOf(right);
      return leftIndex >= 0 || rightIndex >= 0
        ? (leftIndex < 0 ? currencyOrder.length : leftIndex) - (rightIndex < 0 ? currencyOrder.length : rightIndex)
        : left.localeCompare(right);
    })
    .map(([currency, totals]) => ({
      currency,
      transactionsCount: totals.transactionsCount,
      approvedTransactionsCount: totals.approvedTransactionsCount,
      pendingTransactionsCount: totals.pendingTransactionsCount,
      cashInAmount: toMoneyString(totals.cashIn),
      cashOutAmount: toMoneyString(totals.cashOut),
      netAmount: toMoneyString(totals.cashIn - totals.cashOut)
    }));

  const statusTotals = activities.reduce((totals, activity) => {
    if (activity.status === "DONE") totals.doneCount += 1;
    else totals.openCount += 1;
    if (activity.status === "BLOCKED") totals.blockedCount += 1;
    return totals;
  }, { openCount: 0, doneCount: 0, blockedCount: 0 });

  return {
    periodLabel: toDisplayPeriodLabel(filters),
    activities,
    categories: Array.from(categoryMap.values()).sort((left, right) =>
      right.activitiesCount - left.activitiesCount || left.categoryLabel.localeCompare(right.categoryLabel)
    ),
    agreements: Array.from(agreementMap.values()).sort((left, right) =>
      left.agreementRef.localeCompare(right.agreementRef)
    ),
    transactions: reportTransactions,
    currencySummaries,
    totals: {
      activitiesCount: activities.length,
      ...statusTotals,
      agreementsCount: agreementMap.size,
      transactionsCount: reportTransactions.length
    }
  };
}

type AgricultureReportBucket = {
  campaignRef: string;
  parcelRef: string;
  fieldType: string;
  cropType: string;
  surfaceAreaValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type AgricultureOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getAgricultureMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getAgricultureBucketKey(input: {
  campaignRef: string;
  parcelRef: string;
  fieldType: string;
  cropType: string;
}): string {
  return [input.campaignRef, input.parcelRef, input.fieldType, input.cropType].join("|");
}

function getAgricultureReportBucket(
  buckets: Map<string, AgricultureReportBucket>,
  metadata: Record<string, string>
): AgricultureReportBucket {
  const input = {
    campaignRef: getAgricultureMetadataLabel(metadata, "campaignRef", "Campagne non renseignée"),
    parcelRef: getAgricultureMetadataLabel(metadata, "parcelRef", "Parcelle non renseignée"),
    fieldType: getAgricultureMetadataLabel(metadata, "fieldType", "Type non renseigné"),
    cropType: getAgricultureMetadataLabel(metadata, "cropType", "Culture non renseignée")
  };
  const key = getAgricultureBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: AgricultureReportBucket = {
    ...input,
    surfaceAreaValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getAgricultureOperationBucket(
  buckets: Map<string, AgricultureOperationBucket>,
  operationKind: string,
  operationLabel: string
): AgricultureOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: AgricultureOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getAgricultureTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.agricultureOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "HARVEST_SALE" : "FIELD_EXPENSE";
}

function getAgricultureTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.agricultureTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toAgricultureOperationLabel(operationKind: string): string {
  if (AGRICULTURE_OPERATION_LABELS[operationKind]) {
    return AGRICULTURE_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${AGRICULTURE_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toAgriculturePeriodLabel(
  filters: ReportPeriodFilter,
  _rows: AgricultureReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function isAgricultureReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "AGRICULTURE");
}

function buildAgricultureOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): AgricultureOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "AGRICULTURE") {
    return null;
  }

  const agricultureTransactions = transactions.filter(isAgricultureReportableTransaction);
  const agricultureTasks = tasks.filter((task) => task.activityCode === "AGRICULTURE");
  if (!filters.activityCode && agricultureTransactions.length === 0 && agricultureTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, AgricultureReportBucket>();
  const operationBuckets = new Map<string, AgricultureOperationBucket>();

  for (const transaction of agricultureTransactions) {
    const rowBucket = getAgricultureReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    rowBucket.transactionsCount += 1;
    rowBucket.surfaceAreaValue = Math.max(
      rowBucket.surfaceAreaValue,
      getMetadataNumber(transaction.metadata, "surfaceArea")
    );
    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationKind = getAgricultureTransactionOperationKind(transaction);
    const operationBucket = getAgricultureOperationBucket(
      operationBuckets,
      operationKind,
      toAgricultureOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of agricultureTasks) {
    const rowBucket = getAgricultureReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    rowBucket.surfaceAreaValue = Math.max(
      rowBucket.surfaceAreaValue,
      getMetadataNumber(task.metadata, "surfaceArea")
    );
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getAgricultureTaskOperationKind(task);
    const operationBucket = getAgricultureOperationBucket(
      operationBuckets,
      operationKind,
      toAgricultureOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.campaignRef.localeCompare(right.campaignRef) ||
      left.parcelRef.localeCompare(right.parcelRef) ||
      left.fieldType.localeCompare(right.fieldType) ||
      left.cropType.localeCompare(right.cropType)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      surfaceAreaValue: sum.surfaceAreaValue + row.surfaceAreaValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      surfaceAreaValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  return {
    periodLabel: toAgriculturePeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        campaignRef: row.campaignRef,
        parcelRef: row.parcelRef,
        fieldType: row.fieldType,
        cropType: row.cropType,
        surfaceArea: row.surfaceAreaValue,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      parcelsCount: bucketRows.length,
      surfaceArea: totals.surfaceAreaValue,
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

function isGeneralStoreReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "GENERAL_STORE");
}

function getGeneralStoreTransactionKind(
  transaction: ReportOperationalTransaction
): "ACHAT" | "RECOUVREMENT" {
  const configuredKind = transaction.metadata.storeOperationKind?.trim();
  if (configuredKind === "RECOUVREMENT") {
    return "RECOUVREMENT";
  }
  if (configuredKind === "ACHAT") {
    return "ACHAT";
  }
  return transaction.type === "CASH_IN" ? "RECOUVREMENT" : "ACHAT";
}

function resolveGeneralStoreAsOfDate(filters: ReportPeriodFilter): Date {
  if (filters.dateTo) {
    const parsed = new Date(filters.dateTo);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

type GeneralStoreShopLedger = {
  purchaseValue: number;
  collectedValue: number;
  lastOperationAt: string | null;
  transactionsCount: number;
};

type GeneralStoreInventoryCheckpoint = {
  remainingStockValue: number;
  recordedAt: string;
};

function buildGeneralStoreOperationsReport(
  transactions: ReportOperationalTransaction[],
  shops: GeneralStoreShop[],
  inventorySnapshots: GeneralStoreInventorySnapshot[],
  filters: ReportPeriodFilter
): GeneralStoreOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "GENERAL_STORE") {
    return null;
  }

  if (!filters.activityCode && shops.length === 0 && transactions.length === 0) {
    return null;
  }

  const reportableTransactions = transactions.filter(isGeneralStoreReportableTransaction);
  const asOfDate = resolveGeneralStoreAsOfDate(filters);
  const asOfIso = asOfDate.toISOString();

  const inventoryByShop = new Map<string, GeneralStoreInventoryCheckpoint>();
  for (const snapshot of inventorySnapshots) {
    if (snapshot.recordedAt > asOfIso) {
      continue;
    }
    const existing = inventoryByShop.get(snapshot.shopRef);
    if (existing && existing.recordedAt >= snapshot.recordedAt) {
      continue;
    }
    inventoryByShop.set(snapshot.shopRef, {
      remainingStockValue: toNumberAmount(snapshot.remainingStockValue),
      recordedAt: snapshot.recordedAt
    });
  }

  const ledgerByShop = new Map<string, GeneralStoreShopLedger>();
  const inventoryLedgerByShop = new Map<string, { purchaseValue: number; collectedValue: number }>();
  const operationRows: GeneralStoreOperationsReport["operationRows"] = [];
  const breakdownByKind = new Map<"ACHAT" | "RECOUVREMENT", { count: number; amount: number }>();
  const asOfTransactions = reportableTransactions
    .filter((transaction) => transaction.occurredAt <= asOfIso)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  for (const transaction of asOfTransactions) {
    const shopKey = transaction.metadata.shopRef?.trim();
    if (!shopKey) {
      continue;
    }
    const ledger = ledgerByShop.get(shopKey) ?? {
      purchaseValue: 0,
      collectedValue: 0,
      lastOperationAt: null,
      transactionsCount: 0
    };
    const amount = toNumberAmount(transaction.amount);
    const operationKind = getGeneralStoreTransactionKind(transaction);
    if (operationKind === "ACHAT") {
      ledger.purchaseValue += amount;
    } else {
      ledger.collectedValue += amount;
    }
    const inventoryCheckpoint = inventoryByShop.get(shopKey);
    if (inventoryCheckpoint && transaction.occurredAt <= inventoryCheckpoint.recordedAt) {
      const inventoryLedger = inventoryLedgerByShop.get(shopKey) ?? { purchaseValue: 0, collectedValue: 0 };
      if (operationKind === "ACHAT") {
        inventoryLedger.purchaseValue += amount;
      } else {
        inventoryLedger.collectedValue += amount;
      }
      inventoryLedgerByShop.set(shopKey, inventoryLedger);
    }
    operationRows.push({
      date: toReportDate(transaction.occurredAt),
      shopRef: shopKey,
      operationKind,
      status: transaction.status === "APPROVED" ? "APPROVED" : "SUBMITTED",
      designation: transaction.description?.trim() || (operationKind === "ACHAT" ? "Achat de marchandises" : "Recouvrement client"),
      amount: toMoneyString(amount),
      currency: "XOF"
    });
    const breakdown = breakdownByKind.get(operationKind) ?? { count: 0, amount: 0 };
    breakdown.count += 1;
    breakdown.amount += amount;
    breakdownByKind.set(operationKind, breakdown);
    ledger.transactionsCount += 1;
    if (!ledger.lastOperationAt || transaction.occurredAt > ledger.lastOperationAt) {
      ledger.lastOperationAt = transaction.occurredAt;
    }
    ledgerByShop.set(shopKey, ledger);
  }

  function buildRow(shopKey: string, location: string, ledger: GeneralStoreShopLedger | undefined) {
    const purchaseValue = ledger?.purchaseValue ?? 0;
    const collectedValue = ledger?.collectedValue ?? 0;
    const checkpoint = inventoryByShop.get(shopKey);
    const inventoryLedger = inventoryLedgerByShop.get(shopKey);
    const recordedPurchaseValue = inventoryLedger?.purchaseValue ?? 0;
    // This estimate assumes recorded purchases cover the counted stock. A lower
    // purchase total would turn opening stock into a misleading negative sale.
    const estimatedSoldValue = checkpoint && recordedPurchaseValue > 0 && recordedPurchaseValue >= checkpoint.remainingStockValue
      ? recordedPurchaseValue - checkpoint.remainingStockValue
      : null;
    const collectedAtInventoryValue = checkpoint ? inventoryLedger?.collectedValue ?? 0 : null;
    const varianceValue = estimatedSoldValue !== null
      ? estimatedSoldValue - (collectedAtInventoryValue ?? 0)
      : null;
    return {
      shopRef: shopKey,
      location,
      transactionsCount: ledger?.transactionsCount ?? 0,
      lastOperationDate: ledger?.lastOperationAt ?? "",
      purchaseAmount: toMoneyString(purchaseValue),
      collectedAmount: toMoneyString(collectedValue),
      balanceAmount: toMoneyString(purchaseValue - collectedValue),
      lastInventoryDate: checkpoint?.recordedAt ?? "",
      remainingStockValue: checkpoint ? toMoneyString(checkpoint.remainingStockValue) : null,
      estimatedSoldAmount: estimatedSoldValue !== null ? toMoneyString(estimatedSoldValue) : null,
      varianceAmount: varianceValue !== null ? toMoneyString(varianceValue) : null,
      currency: "XOF" as const
    };
  }

  const activeShops = [...shops].sort((left, right) => left.name.localeCompare(right.name));
  const knownShopNames = new Set(activeShops.map((shop) => shop.name));

  const rows: GeneralStoreOperationsReport["rows"] = activeShops.map((shop) =>
    buildRow(shop.name, shop.location ?? "", ledgerByShop.get(shop.name))
  );

  for (const [shopKey, ledger] of ledgerByShop.entries()) {
    if (knownShopNames.has(shopKey)) {
      continue;
    }
    rows.push(buildRow(shopKey, "", ledger));
  }

  rows.sort((left, right) => left.shopRef.localeCompare(right.shopRef));

  const totalsAcc = rows.reduce(
    (sum, row) => ({
      purchaseValue: sum.purchaseValue + toNumberAmount(row.purchaseAmount),
      collectedValue: sum.collectedValue + toNumberAmount(row.collectedAmount)
    }),
    { purchaseValue: 0, collectedValue: 0 }
  );
  const transactionsCount = Array.from(ledgerByShop.values()).reduce(
    (sum, ledger) => sum + ledger.transactionsCount,
    0
  );
  const breakdownRows: GeneralStoreOperationsReport["breakdownRows"] = (["ACHAT", "RECOUVREMENT"] as const)
    .map((operationKind) => {
      const item = breakdownByKind.get(operationKind) ?? { count: 0, amount: 0 };
      return {
        operationKind,
        operationLabel: operationKind === "ACHAT" ? "Achats de marchandises" : "Recouvrements clients",
        transactionsCount: item.count,
        amount: toMoneyString(item.amount),
        currency: "XOF" as const
      };
    });

  return {
    periodLabel: `Cumul au ${formatPdfDate(asOfIso)}`,
    asOfLabel: formatPdfDate(asOfIso),
    rows,
    operationRows,
    breakdownRows,
    totals: {
      shopsCount: rows.length,
      purchaseAmount: toMoneyString(totalsAcc.purchaseValue),
      collectedAmount: toMoneyString(totalsAcc.collectedValue),
      balanceAmount: toMoneyString(totalsAcc.purchaseValue - totalsAcc.collectedValue),
      transactionsCount,
      currency: "XOF" as const
    }
  };
}

export async function getCompanyGeneralStoreLedgerRows(
  actor: ActorContext
): Promise<{ shops: GeneralStoreShop[]; rows: GeneralStoreOperationsReportRow[] }> {
  ensureReportingAccess(actor.role);
  const [transactions, shops, inventorySnapshots] = await Promise.all([
    listGeneralStoreLedgerTransactions(actor.companyId),
    listGeneralStoreShops({ companyId: actor.companyId, activeOnly: true }),
    listReportGeneralStoreInventorySnapshots(actor.companyId)
  ]);
  const report = buildGeneralStoreOperationsReport(
    transactions,
    shops,
    inventorySnapshots,
    { activityCode: "GENERAL_STORE" }
  );

  return { shops, rows: report?.rows ?? [] };
}

type FoodReportBucket = {
  productFamily: string;
  productName: string;
  batchRef: string;
  storageArea: string;
  purchaseQuantityValue: number;
  soldQuantityValue: number;
  lossQuantityValue: number;
  purchaseValue: number;
  salesValue: number;
  lossValue: number;
  expenseValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type FoodOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getFoodMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getFoodBucketKey(input: {
  productFamily: string;
  productName: string;
  batchRef: string;
  storageArea: string;
}): string {
  return [input.productFamily, input.productName, input.batchRef, input.storageArea].join("|");
}

function getFoodReportBucket(
  buckets: Map<string, FoodReportBucket>,
  metadata: Record<string, string>
): FoodReportBucket {
  const input = {
    productFamily: getFoodMetadataLabel(metadata, "productFamily", "Famille non renseignée"),
    productName: getFoodMetadataLabel(metadata, "productName", "Produit non renseigné"),
    batchRef: getFoodMetadataLabel(metadata, "batchRef", "Lot non renseigné"),
    storageArea: getFoodMetadataLabel(metadata, "storageArea", "Zone non renseignée")
  };
  const key = getFoodBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: FoodReportBucket = {
    ...input,
    purchaseQuantityValue: 0,
    soldQuantityValue: 0,
    lossQuantityValue: 0,
    purchaseValue: 0,
    salesValue: 0,
    lossValue: 0,
    expenseValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getFoodOperationBucket(
  buckets: Map<string, FoodOperationBucket>,
  operationKind: string,
  operationLabel: string
): FoodOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: FoodOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getFoodTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.foodOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "PRODUCT_SALE" : "SUPPLIER_PAYMENT";
}

function getFoodTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.foodTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toFoodOperationLabel(operationKind: string): string {
  if (FOOD_OPERATION_LABELS[operationKind]) {
    return FOOD_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${FOOD_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toFoodPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: FoodReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function isFoodReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "FOOD");
}

function toMarginRate(grossMargin: number, salesAmount: number): number {
  if (salesAmount <= 0) {
    return 0;
  }
  return Number(((grossMargin / salesAmount) * 100).toFixed(2));
}

function buildFoodOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): FoodOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "FOOD") {
    return null;
  }

  const foodTransactions = transactions.filter(isFoodReportableTransaction);
  const foodTasks = tasks.filter((task) => task.activityCode === "FOOD");
  if (!filters.activityCode && foodTransactions.length === 0 && foodTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, FoodReportBucket>();
  const operationBuckets = new Map<string, FoodOperationBucket>();

  for (const transaction of foodTransactions) {
    const operationKind = getFoodTransactionOperationKind(transaction);
    const rowBucket = getFoodReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const lossQuantity = getMetadataNumber(transaction.metadata, "lossQuantity");
    rowBucket.transactionsCount += 1;

    if (operationKind === "PRODUCT_SALE") {
      rowBucket.soldQuantityValue += quantity;
      rowBucket.salesValue += amount;
    }
    if (operationKind === "PRODUCT_PURCHASE") {
      rowBucket.purchaseQuantityValue += quantity;
      rowBucket.purchaseValue += amount;
    }
    if (operationKind === "STOCK_LOSS") {
      rowBucket.lossQuantityValue += lossQuantity;
      rowBucket.lossValue += amount;
    }
    if (
      operationKind === "SUPPLIER_PAYMENT" ||
      operationKind === "COLD_CHAIN_EXPENSE" ||
      operationKind === "PACKAGING_EXPENSE" ||
      operationKind === "CUSTOMER_REFUND"
    ) {
      rowBucket.expenseValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getFoodOperationBucket(
      operationBuckets,
      operationKind,
      toFoodOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of foodTasks) {
    const rowBucket = getFoodReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getFoodTaskOperationKind(task);
    const operationBucket = getFoodOperationBucket(
      operationBuckets,
      operationKind,
      toFoodOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.productFamily.localeCompare(right.productFamily) ||
      left.productName.localeCompare(right.productName) ||
      left.batchRef.localeCompare(right.batchRef) ||
      left.storageArea.localeCompare(right.storageArea)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      purchaseQuantityValue: sum.purchaseQuantityValue + row.purchaseQuantityValue,
      soldQuantityValue: sum.soldQuantityValue + row.soldQuantityValue,
      lossQuantityValue: sum.lossQuantityValue + row.lossQuantityValue,
      purchaseValue: sum.purchaseValue + row.purchaseValue,
      salesValue: sum.salesValue + row.salesValue,
      lossValue: sum.lossValue + row.lossValue,
      expenseValue: sum.expenseValue + row.expenseValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      purchaseQuantityValue: 0,
      soldQuantityValue: 0,
      lossQuantityValue: 0,
      purchaseValue: 0,
      salesValue: 0,
      lossValue: 0,
      expenseValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const familyKeys = new Set(bucketRows.map((row) => row.productFamily));
  const productKeys = new Set(bucketRows.map((row) => `${row.productFamily}|${row.productName}`));
  const batchKeys = new Set(bucketRows.map((row) => `${row.productFamily}|${row.productName}|${row.batchRef}`));
  const totalGrossMargin = totals.salesValue - totals.purchaseValue - totals.lossValue;

  return {
    periodLabel: toFoodPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      const grossMargin = row.salesValue - row.purchaseValue - row.lossValue;
      return {
        productFamily: row.productFamily,
        productName: row.productName,
        batchRef: row.batchRef,
        storageArea: row.storageArea,
        purchaseQuantity: row.purchaseQuantityValue,
        soldQuantity: row.soldQuantityValue,
        lossQuantity: row.lossQuantityValue,
        purchaseAmount: toMoneyString(row.purchaseValue),
        salesAmount: toMoneyString(row.salesValue),
        lossAmount: toMoneyString(row.lossValue),
        expenseAmount: toMoneyString(row.expenseValue),
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        grossMargin: toMoneyString(grossMargin),
        marginRate: toMarginRate(grossMargin, row.salesValue),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      productFamiliesCount: familyKeys.size,
      productsCount: productKeys.size,
      batchesCount: batchKeys.size,
      purchaseQuantity: totals.purchaseQuantityValue,
      soldQuantity: totals.soldQuantityValue,
      lossQuantity: totals.lossQuantityValue,
      purchaseAmount: toMoneyString(totals.purchaseValue),
      salesAmount: toMoneyString(totals.salesValue),
      lossAmount: toMoneyString(totals.lossValue),
      expenseAmount: toMoneyString(totals.expenseValue),
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      grossMargin: toMoneyString(totalGrossMargin),
      marginRate: toMarginRate(totalGrossMargin, totals.salesValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

function isRentalReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "RENTAL");
}

function getRentalTransactionKind(transaction: ReportOperationalTransaction): "LOYER" | "CAUTION" | "AUTRE" {
  const kind = transaction.metadata.rentalOperationKind?.trim();
  if (kind === "CAUTION") {
    return "CAUTION";
  }
  if (kind === "AUTRE") {
    return "AUTRE";
  }
  return "LOYER";
}

function monthKeyToIndex(monthKey: string): number {
  const [year, month] = monthKey.split("-").map((part) => Number(part));
  return year * 12 + (month - 1);
}

function indexToMonthKey(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthKeyLabel(monthKey: string): string {
  const parsed = new Date(`${monthKey}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return monthKey;
  }
  return parsed.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function resolveRentalAsOfDate(filters: ReportPeriodFilter): Date {
  if (filters.dateTo) {
    const parsed = new Date(filters.dateTo);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function toRentalMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

type RentalTenantLedger = {
  status: "A_JOUR" | "EN_RETARD" | "AVANCE";
  statusDetail: string;
  totalDueValue: number;
  balanceValue: number;
};

function computeRentalTenantLedger(input: {
  tenancyStart: string;
  monthlyRentValue: number;
  totalPaidValue: number;
  lastDueMonthIndex: number;
}): RentalTenantLedger {
  const sinceIndex = monthKeyToIndex(input.tenancyStart);
  const dueMonthsCount = Math.max(0, input.lastDueMonthIndex - sinceIndex + 1);
  const totalDueValue = dueMonthsCount * input.monthlyRentValue;
  const balanceValue = totalDueValue - input.totalPaidValue;

  if (input.monthlyRentValue <= 0) {
    return { status: "A_JOUR", statusDetail: "-", totalDueValue, balanceValue: 0 };
  }

  const monthsCoveredByPayment = Math.floor(input.totalPaidValue / input.monthlyRentValue);
  const coveredThroughIndex = sinceIndex + monthsCoveredByPayment - 1;

  if (coveredThroughIndex >= input.lastDueMonthIndex) {
    if (coveredThroughIndex === input.lastDueMonthIndex) {
      return { status: "A_JOUR", statusDetail: "À jour", totalDueValue, balanceValue };
    }
    return {
      status: "AVANCE",
      statusDetail: `Payé d'avance jusqu'à ${monthKeyLabel(indexToMonthKey(coveredThroughIndex))}`,
      totalDueValue,
      balanceValue
    };
  }

  const firstUnpaidIndex = coveredThroughIndex + 1;
  return {
    status: "EN_RETARD",
    statusDetail: `En retard depuis ${monthKeyLabel(indexToMonthKey(firstUnpaidIndex))}`,
    totalDueValue,
    balanceValue
  };
}

function buildRentalOperationsReport(
  transactions: ReportOperationalTransaction[],
  tenants: RentalTenant[],
  filters: ReportPeriodFilter
): RentalOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "RENTAL") {
    return null;
  }

  if (!filters.activityCode && tenants.length === 0 && transactions.length === 0) {
    return null;
  }

  const reportableTransactions = transactions.filter(isRentalReportableTransaction);
  const asOfDate = resolveRentalAsOfDate(filters);
  const lastDueMonthIndex = monthKeyToIndex(toRentalMonthKey(asOfDate)) - 1;
  const asOfIso = asOfDate.toISOString();

  const totalPaidByTenant = new Map<string, number>();
  // Deposits (cautions) are tracked in a fully separate ledger: they must never
  // feed the rent arrears calculation below, and a tenant's caution stays "paid"
  // regardless of how late their rent is.
  const depositByTenant = new Map<string, { amount: number; count: number; lastPaidAt: string }>();
  for (const transaction of reportableTransactions) {
    if (transaction.occurredAt > asOfIso) {
      continue;
    }
    const tenantKey = transaction.metadata.tenantRef?.trim();
    if (!tenantKey) {
      continue;
    }
    const kind = getRentalTransactionKind(transaction);
    const amount = toNumberAmount(transaction.amount);

    if (kind === "LOYER") {
      totalPaidByTenant.set(tenantKey, (totalPaidByTenant.get(tenantKey) ?? 0) + amount);
      continue;
    }

    if (kind === "CAUTION") {
      const existing = depositByTenant.get(tenantKey) ?? { amount: 0, count: 0, lastPaidAt: transaction.occurredAt };
      existing.amount += amount;
      existing.count += 1;
      if (transaction.occurredAt > existing.lastPaidAt) {
        existing.lastPaidAt = transaction.occurredAt;
      }
      depositByTenant.set(tenantKey, existing);
    }
  }

  const activeTenants = [...tenants].sort((left, right) => left.name.localeCompare(right.name));

  const rows: RentalOperationsReport["rows"] = activeTenants.map((tenant) => {
    const monthlyRentValue = toNumberAmount(tenant.monthlyRent);
    const totalPaidValue = totalPaidByTenant.get(tenant.name) ?? 0;
    const ledger = computeRentalTenantLedger({
      tenancyStart: tenant.tenancyStart,
      monthlyRentValue,
      totalPaidValue,
      lastDueMonthIndex
    });

    return {
      tenantRef: tenant.name,
      unitRef: tenant.unitLabel,
      monthlyRent: toMoneyString(monthlyRentValue),
      totalDue: toMoneyString(ledger.totalDueValue),
      totalPaid: toMoneyString(totalPaidValue),
      balanceAmount: toMoneyString(ledger.balanceValue),
      status: ledger.status,
      statusDetail: ledger.statusDetail,
      currency: "XOF" as const
    };
  });

  // Caution status per tenant, kept fully independent from the rent ledger above:
  // a tenant who paid their deposit stays "Payée" here even while "En retard" on rent.
  const depositRows: RentalOperationsReport["depositRows"] = activeTenants.map((tenant) => {
    const deposit = depositByTenant.get(tenant.name);
    return {
      tenantRef: tenant.name,
      unitRef: tenant.unitLabel,
      depositPaidAmount: toMoneyString(deposit?.amount ?? 0),
      paymentsCount: deposit?.count ?? 0,
      lastPaymentLabel: deposit ? formatPdfDate(deposit.lastPaidAt) : null,
      status: deposit && deposit.amount > 0 ? ("PAYEE" as const) : ("NON_PAYEE" as const),
      currency: "XOF" as const
    };
  });

  // "Encaissements de la période": cash actually received within the selected date range,
  // independent of the cumulative arrears ledger above.
  const periodTransactions = reportableTransactions.filter((transaction) => {
    if (filters.dateFrom && transaction.occurredAt < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && transaction.occurredAt > filters.dateTo) {
      return false;
    }
    return true;
  });

  let collectedAmountValue = 0;
  let depositAmountValue = 0;
  let otherCashIn = 0;
  let otherCashOut = 0;
  const tranches = new Map<string, { amount: number; count: number }>();

  for (const transaction of periodTransactions) {
    const amount = toNumberAmount(transaction.amount);
    const kind = getRentalTransactionKind(transaction);

    if (kind === "LOYER") {
      collectedAmountValue += amount;
      const key = toMoneyString(amount);
      const existing = tranches.get(key) ?? { amount: 0, count: 0 };
      existing.amount += amount;
      existing.count += 1;
      tranches.set(key, existing);
      continue;
    }

    if (kind === "CAUTION") {
      depositAmountValue += amount;
      continue;
    }

    if (transaction.type === "CASH_IN") {
      otherCashIn += amount;
    } else {
      otherCashOut += amount;
    }
  }

  const operationRows: RentalOperationsReport["operationRows"] = Array.from(tranches.entries())
    .map(([amountKey, bucket]) => ({
      operationKind: amountKey,
      operationLabel: `${bucket.count} loyer${bucket.count > 1 ? "s" : ""} payé${
        bucket.count > 1 ? "s" : ""
      } à ${formatPdfMoney(amountKey)}`,
      transactionsCount: bucket.count,
      tasksCount: 0,
      cashInAmount: toMoneyString(bucket.amount),
      cashOutAmount: "0.00",
      netAmount: toMoneyString(bucket.amount),
      currency: "XOF" as const
    }))
    .sort((left, right) => toNumberAmount(right.operationKind) - toNumberAmount(left.operationKind));

  const tenantsCount = activeTenants.length;
  const upToDateTenantsCount = rows.filter((row) => row.status !== "EN_RETARD").length;
  const totalArrearsAmountValue = rows.reduce(
    (sum, row) => sum + Math.max(0, toNumberAmount(row.balanceAmount)),
    0
  );
  const cashInAmountValue = collectedAmountValue + depositAmountValue + otherCashIn;
  const cashOutAmountValue = otherCashOut;
  const depositPaidTenantsCount = depositRows.filter((row) => row.status === "PAYEE").length;

  return {
    periodLabel: toDisplayPeriodLabel(filters),
    asOfLabel: formatPdfDate(asOfIso),
    rows,
    operationRows,
    depositRows,
    totals: {
      tenantsCount,
      upToDateTenantsCount,
      lateTenantsCount: tenantsCount - upToDateTenantsCount,
      totalArrearsAmount: toMoneyString(totalArrearsAmountValue),
      collectedAmount: toMoneyString(collectedAmountValue),
      depositAmount: toMoneyString(depositAmountValue),
      depositPaidTenantsCount,
      cashInAmount: toMoneyString(cashInAmountValue),
      cashOutAmount: toMoneyString(cashOutAmountValue),
      netAmount: toMoneyString(cashInAmountValue - cashOutAmountValue),
      executionRate: toRate(upToDateTenantsCount, tenantsCount),
      currency: "XOF" as const
    }
  };
}

type HotelReportBucket = {
  serviceLine: string;
  roomRef: string;
  roomType: string;
  bookingRef: string;
  guestRef: string;
  nightsCountValue: number;
  guestCountValue: number;
  roomRevenueValue: number;
  depositValue: number;
  restaurantValue: number;
  serviceValue: number;
  maintenanceValue: number;
  commissionValue: number;
  taxValue: number;
  refundValue: number;
  expenseValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type HotelOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getHotelMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getHotelBucketKey(input: {
  serviceLine: string;
  roomRef: string;
  roomType: string;
  bookingRef: string;
  guestRef: string;
}): string {
  return [input.serviceLine, input.roomRef, input.roomType, input.bookingRef, input.guestRef].join("|");
}

function getHotelReportBucket(
  buckets: Map<string, HotelReportBucket>,
  metadata: Record<string, string>
): HotelReportBucket {
  const input = {
    serviceLine: getHotelMetadataLabel(metadata, "serviceLine", "Service non renseigné"),
    roomRef: getHotelMetadataLabel(metadata, "roomRef", "Chambre non renseignée"),
    roomType: getHotelMetadataLabel(metadata, "roomType", "Type non renseigné"),
    bookingRef: getHotelMetadataLabel(metadata, "bookingRef", "Reservation non renseignée"),
    guestRef: getHotelMetadataLabel(metadata, "guestRef", "Client non renseigné")
  };
  const key = getHotelBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: HotelReportBucket = {
    ...input,
    nightsCountValue: 0,
    guestCountValue: 0,
    roomRevenueValue: 0,
    depositValue: 0,
    restaurantValue: 0,
    serviceValue: 0,
    maintenanceValue: 0,
    commissionValue: 0,
    taxValue: 0,
    refundValue: 0,
    expenseValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getHotelOperationBucket(
  buckets: Map<string, HotelOperationBucket>,
  operationKind: string,
  operationLabel: string
): HotelOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: HotelOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getHotelTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.hotelOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "ROOM_PAYMENT" : "SUPPLIER_PAYMENT";
}

function getHotelTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.hotelTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toHotelOperationLabel(operationKind: string): string {
  if (HOTEL_OPERATION_LABELS[operationKind]) {
    return HOTEL_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${HOTEL_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toHotelPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: HotelReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function isHotelReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "HOTEL_LODGING");
}

function toAverageRoomRate(roomRevenue: number, nightsCount: number): number {
  if (nightsCount <= 0) {
    return 0;
  }
  return Number((roomRevenue / nightsCount).toFixed(2));
}

function buildHotelOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): HotelOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "HOTEL_LODGING") {
    return null;
  }

  const hotelTransactions = transactions.filter(isHotelReportableTransaction);
  const hotelTasks = tasks.filter((task) => task.activityCode === "HOTEL_LODGING");
  if (!filters.activityCode && hotelTransactions.length === 0 && hotelTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, HotelReportBucket>();
  const operationBuckets = new Map<string, HotelOperationBucket>();

  for (const transaction of hotelTransactions) {
    const operationKind = getHotelTransactionOperationKind(transaction);
    const rowBucket = getHotelReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    rowBucket.transactionsCount += 1;

    if (operationKind === "ROOM_PAYMENT") {
      rowBucket.nightsCountValue += getMetadataNumber(transaction.metadata, "nightsCount");
      rowBucket.guestCountValue += getMetadataNumber(transaction.metadata, "guestCount");
      rowBucket.roomRevenueValue += amount;
    }
    if (operationKind === "BOOKING_DEPOSIT") {
      rowBucket.depositValue += amount;
    }
    if (operationKind === "RESTAURANT_SALE") {
      rowBucket.restaurantValue += amount;
    }
    if (operationKind === "EVENT_SERVICE" || operationKind === "LAUNDRY_SERVICE") {
      rowBucket.serviceValue += amount;
    }
    if (operationKind === "ROOM_MAINTENANCE") {
      rowBucket.maintenanceValue += amount;
    }
    if (operationKind === "COMMISSION_FEE") {
      rowBucket.commissionValue += amount;
    }
    if (operationKind === "TAX_PAYMENT") {
      rowBucket.taxValue += amount;
    }
    if (operationKind === "GUEST_REFUND") {
      rowBucket.refundValue += amount;
    }
    if (operationKind === "SUPPLIER_PAYMENT") {
      rowBucket.expenseValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getHotelOperationBucket(
      operationBuckets,
      operationKind,
      toHotelOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of hotelTasks) {
    const rowBucket = getHotelReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getHotelTaskOperationKind(task);
    const operationBucket = getHotelOperationBucket(
      operationBuckets,
      operationKind,
      toHotelOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.serviceLine.localeCompare(right.serviceLine) ||
      left.roomRef.localeCompare(right.roomRef) ||
      left.bookingRef.localeCompare(right.bookingRef) ||
      left.guestRef.localeCompare(right.guestRef)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      nightsCountValue: sum.nightsCountValue + row.nightsCountValue,
      guestCountValue: sum.guestCountValue + row.guestCountValue,
      roomRevenueValue: sum.roomRevenueValue + row.roomRevenueValue,
      depositValue: sum.depositValue + row.depositValue,
      restaurantValue: sum.restaurantValue + row.restaurantValue,
      serviceValue: sum.serviceValue + row.serviceValue,
      maintenanceValue: sum.maintenanceValue + row.maintenanceValue,
      commissionValue: sum.commissionValue + row.commissionValue,
      taxValue: sum.taxValue + row.taxValue,
      refundValue: sum.refundValue + row.refundValue,
      expenseValue: sum.expenseValue + row.expenseValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      nightsCountValue: 0,
      guestCountValue: 0,
      roomRevenueValue: 0,
      depositValue: 0,
      restaurantValue: 0,
      serviceValue: 0,
      maintenanceValue: 0,
      commissionValue: 0,
      taxValue: 0,
      refundValue: 0,
      expenseValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const bookingKeys = new Set(bucketRows.map((row) => row.bookingRef));
  const roomKeys = new Set(bucketRows.map((row) => row.roomRef));
  const guestKeys = new Set(bucketRows.map((row) => row.guestRef));

  return {
    periodLabel: toHotelPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        serviceLine: row.serviceLine,
        roomRef: row.roomRef,
        roomType: row.roomType,
        bookingRef: row.bookingRef,
        guestRef: row.guestRef,
        nightsCount: row.nightsCountValue,
        guestCount: row.guestCountValue,
        roomRevenue: toMoneyString(row.roomRevenueValue),
        depositAmount: toMoneyString(row.depositValue),
        restaurantAmount: toMoneyString(row.restaurantValue),
        serviceAmount: toMoneyString(row.serviceValue),
        maintenanceAmount: toMoneyString(row.maintenanceValue),
        commissionAmount: toMoneyString(row.commissionValue),
        taxAmount: toMoneyString(row.taxValue),
        refundAmount: toMoneyString(row.refundValue),
        expenseAmount: toMoneyString(row.expenseValue),
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        averageRoomRate: toAverageRoomRate(row.roomRevenueValue, row.nightsCountValue),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      bookingsCount: bookingKeys.size,
      roomsCount: roomKeys.size,
      guestsCount: guestKeys.size,
      nightsCount: totals.nightsCountValue,
      guestCount: totals.guestCountValue,
      roomRevenue: toMoneyString(totals.roomRevenueValue),
      depositAmount: toMoneyString(totals.depositValue),
      restaurantAmount: toMoneyString(totals.restaurantValue),
      serviceAmount: toMoneyString(totals.serviceValue),
      maintenanceAmount: toMoneyString(totals.maintenanceValue),
      commissionAmount: toMoneyString(totals.commissionValue),
      taxAmount: toMoneyString(totals.taxValue),
      refundAmount: toMoneyString(totals.refundValue),
      expenseAmount: toMoneyString(totals.expenseValue),
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      averageRoomRate: toAverageRoomRate(totals.roomRevenueValue, totals.nightsCountValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

const WATER_LEGACY_KIND_MAP: Record<string, string> = {
  WATER_BILLING: "WATER_SALE",
  BULK_WATER_SALE: "WATER_SALE",
  CONNECTION_FEE: "WATER_OTHER_INCOME",
  SUBSIDY_INCOME: "WATER_OTHER_INCOME",
  CHEMICAL_PURCHASE: "WATER_EXPENSE_MAINTENANCE",
  ENERGY_PAYMENT: "WATER_EXPENSE_ENERGY",
  MAINTENANCE_EXPENSE: "WATER_EXPENSE_MAINTENANCE",
  QUALITY_TEST_EXPENSE: "WATER_EXPENSE_MAINTENANCE",
  NETWORK_REPAIR: "WATER_EXPENSE_MAINTENANCE",
  SUPPLIER_PAYMENT: "WATER_EXPENSE_SUPPLIER"
};

function normalizeWaterOperationKind(operationKind: string): string {
  return WATER_LEGACY_KIND_MAP[operationKind] ?? operationKind;
}

function toWaterCategoryLabel(operationKind: string): string {
  const normalized = normalizeWaterOperationKind(operationKind);
  return WATER_OPERATION_LABELS[normalized] ?? normalized;
}

function toWaterPeriodLabel(filters: ReportPeriodFilter): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function buildWaterOperationsReport(
  transactions: ReportOperationalTransaction[],
  filters: ReportPeriodFilter
): WaterOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "WATER") {
    return null;
  }

  const waterTransactions = transactions.filter((transaction) =>
    isSectorReportableTransaction(transaction, "WATER")
  );
  if (!filters.activityCode && waterTransactions.length === 0) {
    return null;
  }

  const sortedTransactions = [...waterTransactions].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt)
  );

  const rows: WaterOperationsReport["rows"] = sortedTransactions.map((transaction) => {
    const configuredKind = transaction.metadata.waterOperationKind?.trim();
    const operationKind =
      configuredKind || (transaction.type === "CASH_IN" ? "WATER_SALE" : "WATER_EXPENSE_OTHER");
    const kind: "IN" | "OUT" = transaction.type === "CASH_IN" ? "IN" : "OUT";
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const metaUnitPrice = getMetadataNumber(transaction.metadata, "unitPrice");
    const amountValue = toNumberAmount(transaction.amount);
    const unitPriceValue = metaUnitPrice > 0 ? metaUnitPrice : quantity > 0 ? amountValue / quantity : 0;

    return {
      date: toReportDate(transaction.occurredAt),
      kind,
      categoryLabel: toWaterCategoryLabel(operationKind),
      designation: transaction.description?.trim() || "-",
      quantity,
      unitPrice: toMoneyString(unitPriceValue),
      amount: toMoneyString(amountValue),
      currency: "XOF" as const
    };
  });

  type BreakdownBucket = { kind: "IN" | "OUT"; categoryLabel: string; count: number; amount: number };
  const breakdownMap = new Map<string, BreakdownBucket>();
  for (const row of rows) {
    const key = `${row.kind}|${row.categoryLabel}`;
    const existing: BreakdownBucket = breakdownMap.get(key) ?? {
      kind: row.kind,
      categoryLabel: row.categoryLabel,
      count: 0,
      amount: 0
    };
    existing.count += 1;
    existing.amount += toNumberAmount(row.amount);
    breakdownMap.set(key, existing);
  }

  const breakdownRows: WaterOperationsReport["breakdownRows"] = Array.from(breakdownMap.values())
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "IN" ? -1 : 1;
      }
      return right.amount - left.amount;
    })
    .map((item) => ({
      kind: item.kind,
      categoryLabel: item.categoryLabel,
      transactionsCount: item.count,
      amount: toMoneyString(item.amount),
      currency: "XOF" as const
    }));

  const packageSaleTransactions = sortedTransactions.filter((transaction) => {
    const configuredKind = transaction.metadata.waterOperationKind?.trim();
    const normalizedKind = normalizeWaterOperationKind(configuredKind || "WATER_SALE");
    return transaction.type === "CASH_IN" && normalizedKind === "WATER_SALE";
  });
  const packagesSold = packageSaleTransactions.reduce(
    (sum, transaction) => sum + getMetadataNumber(transaction.metadata, "quantity"),
    0
  );
  const packagesSalesAmountValue = packageSaleTransactions.reduce(
    (sum, transaction) => sum + toNumberAmount(transaction.amount),
    0
  );
  const averagePackagePrice = packagesSold > 0 ? packagesSalesAmountValue / packagesSold : 0;

  const salesAmountValue = rows
    .filter((row) => row.kind === "IN")
    .reduce((sum, row) => sum + toNumberAmount(row.amount), 0);
  const expensesAmountValue = rows
    .filter((row) => row.kind === "OUT")
    .reduce((sum, row) => sum + toNumberAmount(row.amount), 0);

  return {
    periodLabel: toWaterPeriodLabel(filters),
    rows,
    breakdownRows,
    totals: {
      transactionsCount: rows.length,
      packagesSold,
      averagePackagePrice: toMoneyString(averagePackagePrice),
      salesAmount: toMoneyString(salesAmountValue),
      expensesAmount: toMoneyString(expensesAmountValue),
      netAmount: toMoneyString(salesAmountValue - expensesAmountValue),
      currency: "XOF"
    }
  };
}

type AgencyReportBucket = {
  mandateRef: string;
  propertyRef: string;
  mandateType: string;
  propertyType: string;
  locationZone: string;
  clientRef: string;
  dealStage: string;
  dealAmountValue: number;
  saleCommissionValue: number;
  rentalCommissionValue: number;
  mandateFeeValue: number;
  visitFeeValue: number;
  fileFeeValue: number;
  advertisingExpenseValue: number;
  fieldVisitExpenseValue: number;
  brokerPayoutValue: number;
  documentExpenseValue: number;
  officeExpenseValue: number;
  refundValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type AgencyOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getAgencyMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value ? value : fallback;
}

function getAgencyBucketKey(metadata: Record<string, string>): string {
  return [
    getAgencyMetadataLabel(metadata, "mandateRef", "Mandat non renseigné"),
    getAgencyMetadataLabel(metadata, "propertyRef", "Bien non renseigné"),
    getAgencyMetadataLabel(metadata, "mandateType", "Mandat"),
    getAgencyMetadataLabel(metadata, "clientRef", "Client non renseigné"),
    getAgencyMetadataLabel(metadata, "dealStage", "Étape non renseignée")
  ].join("::");
}

function getAgencyReportBucket(
  buckets: Map<string, AgencyReportBucket>,
  metadata: Record<string, string>
): AgencyReportBucket {
  const key = getAgencyBucketKey(metadata);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: AgencyReportBucket = {
    mandateRef: getAgencyMetadataLabel(metadata, "mandateRef", "Mandat non renseigné"),
    propertyRef: getAgencyMetadataLabel(metadata, "propertyRef", "Bien non renseigné"),
    mandateType: getAgencyMetadataLabel(metadata, "mandateType", "Mandat"),
    propertyType: getAgencyMetadataLabel(metadata, "propertyType", "Type non renseigné"),
    locationZone: getAgencyMetadataLabel(metadata, "locationZone", "Zone non renseignée"),
    clientRef: getAgencyMetadataLabel(metadata, "clientRef", getAgencyMetadataLabel(metadata, "prospectRef", "Client non renseigné")),
    dealStage: getAgencyMetadataLabel(metadata, "dealStage", "Étape non renseignée"),
    dealAmountValue: 0,
    saleCommissionValue: 0,
    rentalCommissionValue: 0,
    mandateFeeValue: 0,
    visitFeeValue: 0,
    fileFeeValue: 0,
    advertisingExpenseValue: 0,
    fieldVisitExpenseValue: 0,
    brokerPayoutValue: 0,
    documentExpenseValue: 0,
    officeExpenseValue: 0,
    refundValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getAgencyOperationBucket(
  buckets: Map<string, AgencyOperationBucket>,
  operationKind: string,
  operationLabel: string
): AgencyOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: AgencyOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getAgencyTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.agencyOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "SALE_COMMISSION" : "OFFICE_EXPENSE";
}

function getAgencyTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.agencyTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toAgencyOperationLabel(operationKind: string): string {
  if (AGENCY_OPERATION_LABELS[operationKind]) {
    return AGENCY_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${AGENCY_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toAgencyPeriodLabel(filters: ReportPeriodFilter): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }
  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }
  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }
  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }
  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function isAgencyReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "REAL_ESTATE_AGENCY");
}

function toAgencyCommissionRate(commissionAmount: number, dealAmount: number): number {
  if (dealAmount <= 0) {
    return 0;
  }
  return Number(((commissionAmount / dealAmount) * 100).toFixed(2));
}

function buildAgencyOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): AgencyOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "REAL_ESTATE_AGENCY") {
    return null;
  }

  const agencyTransactions = transactions.filter(isAgencyReportableTransaction);
  const agencyTasks = tasks.filter((task) => task.activityCode === "REAL_ESTATE_AGENCY");
  if (!filters.activityCode && agencyTransactions.length === 0 && agencyTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, AgencyReportBucket>();
  const operationBuckets = new Map<string, AgencyOperationBucket>();

  for (const transaction of agencyTransactions) {
    const operationKind = getAgencyTransactionOperationKind(transaction);
    const rowBucket = getAgencyReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    rowBucket.transactionsCount += 1;

    if (operationKind === "SALE_COMMISSION" || operationKind === "RENTAL_COMMISSION") {
      rowBucket.dealAmountValue += getMetadataNumber(transaction.metadata, "dealAmount");
    }
    if (operationKind === "SALE_COMMISSION") {
      rowBucket.saleCommissionValue += amount;
    }
    if (operationKind === "RENTAL_COMMISSION") {
      rowBucket.rentalCommissionValue += amount;
    }
    if (operationKind === "MANDATE_FEE") {
      rowBucket.mandateFeeValue += amount;
    }
    if (operationKind === "VISIT_FEE") {
      rowBucket.visitFeeValue += amount;
    }
    if (operationKind === "FILE_FEE") {
      rowBucket.fileFeeValue += amount;
    }
    if (operationKind === "ADVERTISING_EXPENSE") {
      rowBucket.advertisingExpenseValue += amount;
    }
    if (operationKind === "FIELD_VISIT_EXPENSE") {
      rowBucket.fieldVisitExpenseValue += amount;
    }
    if (operationKind === "BROKER_PAYOUT") {
      rowBucket.brokerPayoutValue += amount;
    }
    if (operationKind === "DOCUMENT_EXPENSE") {
      rowBucket.documentExpenseValue += amount;
    }
    if (operationKind === "CUSTOMER_REFUND") {
      rowBucket.refundValue += amount;
    }
    if (operationKind === "OFFICE_EXPENSE") {
      rowBucket.officeExpenseValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getAgencyOperationBucket(
      operationBuckets,
      operationKind,
      toAgencyOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of agencyTasks) {
    const rowBucket = getAgencyReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getAgencyTaskOperationKind(task);
    const operationBucket = getAgencyOperationBucket(
      operationBuckets,
      operationKind,
      toAgencyOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.mandateRef.localeCompare(right.mandateRef) ||
      left.propertyRef.localeCompare(right.propertyRef) ||
      left.clientRef.localeCompare(right.clientRef) ||
      left.dealStage.localeCompare(right.dealStage)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      dealAmountValue: sum.dealAmountValue + row.dealAmountValue,
      saleCommissionValue: sum.saleCommissionValue + row.saleCommissionValue,
      rentalCommissionValue: sum.rentalCommissionValue + row.rentalCommissionValue,
      mandateFeeValue: sum.mandateFeeValue + row.mandateFeeValue,
      visitFeeValue: sum.visitFeeValue + row.visitFeeValue,
      fileFeeValue: sum.fileFeeValue + row.fileFeeValue,
      advertisingExpenseValue: sum.advertisingExpenseValue + row.advertisingExpenseValue,
      fieldVisitExpenseValue: sum.fieldVisitExpenseValue + row.fieldVisitExpenseValue,
      brokerPayoutValue: sum.brokerPayoutValue + row.brokerPayoutValue,
      documentExpenseValue: sum.documentExpenseValue + row.documentExpenseValue,
      officeExpenseValue: sum.officeExpenseValue + row.officeExpenseValue,
      refundValue: sum.refundValue + row.refundValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      dealAmountValue: 0,
      saleCommissionValue: 0,
      rentalCommissionValue: 0,
      mandateFeeValue: 0,
      visitFeeValue: 0,
      fileFeeValue: 0,
      advertisingExpenseValue: 0,
      fieldVisitExpenseValue: 0,
      brokerPayoutValue: 0,
      documentExpenseValue: 0,
      officeExpenseValue: 0,
      refundValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const mandateKeys = new Set(bucketRows.map((row) => row.mandateRef));
  const propertyKeys = new Set(bucketRows.map((row) => row.propertyRef));
  const clientKeys = new Set(bucketRows.map((row) => row.clientRef));

  return {
    periodLabel: toAgencyPeriodLabel(filters),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      const commissionAmount = row.saleCommissionValue + row.rentalCommissionValue;
      return {
        mandateRef: row.mandateRef,
        propertyRef: row.propertyRef,
        mandateType: row.mandateType,
        propertyType: row.propertyType,
        locationZone: row.locationZone,
        clientRef: row.clientRef,
        dealStage: row.dealStage,
        dealAmount: toMoneyString(row.dealAmountValue),
        saleCommissionAmount: toMoneyString(row.saleCommissionValue),
        rentalCommissionAmount: toMoneyString(row.rentalCommissionValue),
        mandateFeeAmount: toMoneyString(row.mandateFeeValue),
        visitFeeAmount: toMoneyString(row.visitFeeValue),
        fileFeeAmount: toMoneyString(row.fileFeeValue),
        advertisingExpenseAmount: toMoneyString(row.advertisingExpenseValue),
        fieldVisitExpenseAmount: toMoneyString(row.fieldVisitExpenseValue),
        brokerPayoutAmount: toMoneyString(row.brokerPayoutValue),
        documentExpenseAmount: toMoneyString(row.documentExpenseValue),
        officeExpenseAmount: toMoneyString(row.officeExpenseValue),
        refundAmount: toMoneyString(row.refundValue),
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        commissionRate: toAgencyCommissionRate(commissionAmount, row.dealAmountValue),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      mandatesCount: mandateKeys.size,
      propertiesCount: propertyKeys.size,
      clientsCount: clientKeys.size,
      dealAmount: toMoneyString(totals.dealAmountValue),
      saleCommissionAmount: toMoneyString(totals.saleCommissionValue),
      rentalCommissionAmount: toMoneyString(totals.rentalCommissionValue),
      mandateFeeAmount: toMoneyString(totals.mandateFeeValue),
      visitFeeAmount: toMoneyString(totals.visitFeeValue),
      fileFeeAmount: toMoneyString(totals.fileFeeValue),
      advertisingExpenseAmount: toMoneyString(totals.advertisingExpenseValue),
      fieldVisitExpenseAmount: toMoneyString(totals.fieldVisitExpenseValue),
      brokerPayoutAmount: toMoneyString(totals.brokerPayoutValue),
      documentExpenseAmount: toMoneyString(totals.documentExpenseValue),
      officeExpenseAmount: toMoneyString(totals.officeExpenseValue),
      refundAmount: toMoneyString(totals.refundValue),
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      commissionRate: toAgencyCommissionRate(
        totals.saleCommissionValue + totals.rentalCommissionValue,
        totals.dealAmountValue
      ),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

function isBtpReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "BTP");
}

type BtpTransactionKind =
  | "CLIENT_PAYMENT"
  | "MATERIAL_PURCHASE"
  | "LABOR_PAYMENT"
  | "EQUIPMENT_RENTAL"
  | "SUBCONTRACTING"
  | "SITE_EXPENSE";

function getBtpTransactionKind(transaction: ReportOperationalTransaction): BtpTransactionKind {
  const configuredKind = transaction.metadata.btpOperationKind?.trim();
  if (
    configuredKind === "CLIENT_PAYMENT" ||
    configuredKind === "MATERIAL_PURCHASE" ||
    configuredKind === "LABOR_PAYMENT" ||
    configuredKind === "EQUIPMENT_RENTAL" ||
    configuredKind === "SUBCONTRACTING" ||
    configuredKind === "SITE_EXPENSE"
  ) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "CLIENT_PAYMENT" : "SITE_EXPENSE";
}

function resolveBtpAsOfDate(filters: ReportPeriodFilter): Date {
  if (filters.dateTo) {
    const parsed = new Date(filters.dateTo);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

type BtpProjectLedger = {
  cashInValue: number;
  materialValue: number;
  laborValue: number;
  equipmentValue: number;
  subcontractingValue: number;
  siteExpenseValue: number;
  retentionValue: number;
  lastProgressPercent: number | null;
  lastProgressAt: string | null;
  lastOperationAt: string | null;
  transactionsCount: number;
};

function buildBtpOperationsReport(
  transactions: ReportOperationalTransaction[],
  projects: BtpProject[],
  filters: ReportPeriodFilter
): BtpOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "BTP") {
    return null;
  }

  if (!filters.activityCode && projects.length === 0 && transactions.length === 0) {
    return null;
  }

  const reportableTransactions = transactions.filter(isBtpReportableTransaction);
  const asOfDate = resolveBtpAsOfDate(filters);
  const asOfIso = asOfDate.toISOString();

  const ledgerByProject = new Map<string, BtpProjectLedger>();
  for (const transaction of reportableTransactions) {
    if (transaction.occurredAt > asOfIso) {
      continue;
    }
    const projectKey = transaction.metadata.projectRef?.trim();
    if (!projectKey) {
      continue;
    }
    const ledger = ledgerByProject.get(projectKey) ?? {
      cashInValue: 0,
      materialValue: 0,
      laborValue: 0,
      equipmentValue: 0,
      subcontractingValue: 0,
      siteExpenseValue: 0,
      retentionValue: 0,
      lastProgressPercent: null,
      lastProgressAt: null,
      lastOperationAt: null,
      transactionsCount: 0
    };
    const amount = toNumberAmount(transaction.amount);
    const kind = getBtpTransactionKind(transaction);
    if (kind === "CLIENT_PAYMENT") {
      ledger.cashInValue += amount;
    } else if (kind === "MATERIAL_PURCHASE") {
      ledger.materialValue += amount;
    } else if (kind === "LABOR_PAYMENT") {
      ledger.laborValue += amount;
    } else if (kind === "EQUIPMENT_RENTAL") {
      ledger.equipmentValue += amount;
    } else if (kind === "SUBCONTRACTING") {
      ledger.subcontractingValue += amount;
    } else {
      ledger.siteExpenseValue += amount;
    }
    ledger.retentionValue += getMetadataNumber(transaction.metadata, "retentionAmount");
    const progress = getMetadataNumber(transaction.metadata, "progressPercent");
    if (progress > 0 && (!ledger.lastProgressAt || transaction.occurredAt >= ledger.lastProgressAt)) {
      ledger.lastProgressPercent = progress;
      ledger.lastProgressAt = transaction.occurredAt;
    }
    ledger.transactionsCount += 1;
    if (!ledger.lastOperationAt || transaction.occurredAt > ledger.lastOperationAt) {
      ledger.lastOperationAt = transaction.occurredAt;
    }
    ledgerByProject.set(projectKey, ledger);
  }

  const activeProjects = [...projects].sort((left, right) => left.name.localeCompare(right.name));
  const knownProjectNames = new Set(activeProjects.map((project) => project.name));

  function buildRow(
    projectKey: string,
    clientRef: string,
    contractRef: string,
    location: string,
    ledger: BtpProjectLedger | undefined
  ): BtpOperationsReport["rows"][number] {
    const cashInValue = ledger?.cashInValue ?? 0;
    const materialValue = ledger?.materialValue ?? 0;
    const laborValue = ledger?.laborValue ?? 0;
    const equipmentValue = ledger?.equipmentValue ?? 0;
    const subcontractingValue = ledger?.subcontractingValue ?? 0;
    const siteExpenseValue = ledger?.siteExpenseValue ?? 0;
    const totalCostValue =
      materialValue + laborValue + equipmentValue + subcontractingValue + siteExpenseValue;
    return {
      projectRef: projectKey,
      clientRef,
      contractRef,
      location,
      cashInAmount: toMoneyString(cashInValue),
      materialAmount: toMoneyString(materialValue),
      laborAmount: toMoneyString(laborValue),
      equipmentAmount: toMoneyString(equipmentValue),
      subcontractingAmount: toMoneyString(subcontractingValue),
      siteExpenseAmount: toMoneyString(siteExpenseValue),
      totalCostAmount: toMoneyString(totalCostValue),
      netAmount: toMoneyString(cashInValue - totalCostValue),
      retentionAmount: toMoneyString(ledger?.retentionValue ?? 0),
      lastProgressPercent: ledger?.lastProgressPercent ?? null,
      lastOperationDate: ledger?.lastOperationAt ?? "",
      transactionsCount: ledger?.transactionsCount ?? 0,
      currency: "XOF" as const
    };
  }

  const rows: BtpOperationsReport["rows"] = activeProjects.map((project) =>
    buildRow(project.name, project.clientRef ?? "", project.contractRef ?? "", project.location ?? "", ledgerByProject.get(project.name))
  );

  for (const [projectKey, ledger] of ledgerByProject.entries()) {
    if (knownProjectNames.has(projectKey)) {
      continue;
    }
    rows.push(buildRow(projectKey, "", "", "", ledger));
  }

  rows.sort((left, right) => left.projectRef.localeCompare(right.projectRef));

  const totalsAcc = rows.reduce(
    (sum, row) => ({
      cashInValue: sum.cashInValue + toNumberAmount(row.cashInAmount),
      materialValue: sum.materialValue + toNumberAmount(row.materialAmount),
      laborValue: sum.laborValue + toNumberAmount(row.laborAmount),
      equipmentValue: sum.equipmentValue + toNumberAmount(row.equipmentAmount),
      subcontractingValue: sum.subcontractingValue + toNumberAmount(row.subcontractingAmount),
      siteExpenseValue: sum.siteExpenseValue + toNumberAmount(row.siteExpenseAmount)
    }),
    {
      cashInValue: 0,
      materialValue: 0,
      laborValue: 0,
      equipmentValue: 0,
      subcontractingValue: 0,
      siteExpenseValue: 0
    }
  );
  const totalCostValue =
    totalsAcc.materialValue +
    totalsAcc.laborValue +
    totalsAcc.equipmentValue +
    totalsAcc.subcontractingValue +
    totalsAcc.siteExpenseValue;
  const transactionsCount = Array.from(ledgerByProject.values()).reduce(
    (sum, ledger) => sum + ledger.transactionsCount,
    0
  );

  return {
    periodLabel: toDisplayPeriodLabel(filters),
    asOfLabel: formatPdfDate(asOfIso),
    rows,
    totals: {
      projectsCount: rows.length,
      cashInAmount: toMoneyString(totalsAcc.cashInValue),
      materialAmount: toMoneyString(totalsAcc.materialValue),
      laborAmount: toMoneyString(totalsAcc.laborValue),
      equipmentAmount: toMoneyString(totalsAcc.equipmentValue),
      subcontractingAmount: toMoneyString(totalsAcc.subcontractingValue),
      siteExpenseAmount: toMoneyString(totalsAcc.siteExpenseValue),
      totalCostAmount: toMoneyString(totalCostValue),
      netAmount: toMoneyString(totalsAcc.cashInValue - totalCostValue),
      transactionsCount,
      currency: "XOF" as const
    }
  };
}

type FishFarmingReportBucket = {
  pondRef: string;
  cycleRef: string;
  species: string;
  fingerlingsQuantityValue: number;
  feedQuantityValue: number;
  soldQuantityValue: number;
  mortalityCountValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type FishFarmingOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getFishFarmingMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getFishFarmingBucketKey(input: {
  pondRef: string;
  cycleRef: string;
  species: string;
}): string {
  return [input.pondRef, input.cycleRef, input.species].join("|");
}

function getFishFarmingReportBucket(
  buckets: Map<string, FishFarmingReportBucket>,
  metadata: Record<string, string>
): FishFarmingReportBucket {
  const input = {
    pondRef: getFishFarmingMetadataLabel(metadata, "pondRef", "Bassin non renseigné"),
    cycleRef: getFishFarmingMetadataLabel(metadata, "cycleRef", "Cycle non renseigné"),
    species: getFishFarmingMetadataLabel(metadata, "species", "Espèce non renseignée")
  };
  const key = getFishFarmingBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: FishFarmingReportBucket = {
    ...input,
    fingerlingsQuantityValue: 0,
    feedQuantityValue: 0,
    soldQuantityValue: 0,
    mortalityCountValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getFishFarmingOperationBucket(
  buckets: Map<string, FishFarmingOperationBucket>,
  operationKind: string,
  operationLabel: string
): FishFarmingOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: FishFarmingOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getFishFarmingTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.fishOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "FISH_SALE" : "POND_EXPENSE";
}

function getFishFarmingTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.fishTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toFishFarmingOperationLabel(operationKind: string): string {
  if (FISH_FARMING_OPERATION_LABELS[operationKind]) {
    return FISH_FARMING_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${FISH_FARMING_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toFishFarmingPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: FishFarmingReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function isFishFarmingReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "FISH_FARMING");
}

function buildFishFarmingOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): FishFarmingOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "FISH_FARMING") {
    return null;
  }

  const fishTransactions = transactions.filter(isFishFarmingReportableTransaction);
  const fishTasks = tasks.filter((task) => task.activityCode === "FISH_FARMING");
  if (!filters.activityCode && fishTransactions.length === 0 && fishTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, FishFarmingReportBucket>();
  const operationBuckets = new Map<string, FishFarmingOperationBucket>();

  for (const transaction of fishTransactions) {
    const rowBucket = getFishFarmingReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const operationKind = getFishFarmingTransactionOperationKind(transaction);

    rowBucket.transactionsCount += 1;
    rowBucket.mortalityCountValue += getMetadataNumber(transaction.metadata, "mortalityCount");
    if (operationKind === "FINGERLING_PURCHASE") {
      rowBucket.fingerlingsQuantityValue += quantity;
    }
    if (operationKind === "FEED_PURCHASE") {
      rowBucket.feedQuantityValue += quantity;
    }
    if (operationKind === "FISH_SALE") {
      rowBucket.soldQuantityValue += quantity;
    }
    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getFishFarmingOperationBucket(
      operationBuckets,
      operationKind,
      toFishFarmingOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of fishTasks) {
    const rowBucket = getFishFarmingReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    rowBucket.mortalityCountValue += getMetadataNumber(task.metadata, "mortalityCount");
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getFishFarmingTaskOperationKind(task);
    const operationBucket = getFishFarmingOperationBucket(
      operationBuckets,
      operationKind,
      toFishFarmingOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.pondRef.localeCompare(right.pondRef) ||
      left.cycleRef.localeCompare(right.cycleRef) ||
      left.species.localeCompare(right.species)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      fingerlingsQuantityValue: sum.fingerlingsQuantityValue + row.fingerlingsQuantityValue,
      feedQuantityValue: sum.feedQuantityValue + row.feedQuantityValue,
      soldQuantityValue: sum.soldQuantityValue + row.soldQuantityValue,
      mortalityCountValue: sum.mortalityCountValue + row.mortalityCountValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      fingerlingsQuantityValue: 0,
      feedQuantityValue: 0,
      soldQuantityValue: 0,
      mortalityCountValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );
  const pondsCount = new Set(bucketRows.map((row) => row.pondRef)).size;
  const cyclesCount = new Set(bucketRows.map((row) => `${row.pondRef}|${row.cycleRef}`)).size;

  return {
    periodLabel: toFishFarmingPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        pondRef: row.pondRef,
        cycleRef: row.cycleRef,
        species: row.species,
        fingerlingsQuantity: row.fingerlingsQuantityValue,
        feedQuantity: row.feedQuantityValue,
        soldQuantity: row.soldQuantityValue,
        mortalityCount: row.mortalityCountValue,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      pondsCount,
      cyclesCount,
      fingerlingsQuantity: totals.fingerlingsQuantityValue,
      feedQuantity: totals.feedQuantityValue,
      soldQuantity: totals.soldQuantityValue,
      mortalityCount: totals.mortalityCountValue,
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

type LivestockReportBucket = {
  herdRef: string;
  batchRef: string;
  species: string;
  animalPurchaseCountValue: number;
  feedQuantityValue: number;
  soldAnimalCountValue: number;
  productQuantityValue: number;
  mortalityCountValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type LivestockOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getLivestockMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getLivestockBucketKey(input: {
  herdRef: string;
  batchRef: string;
  species: string;
}): string {
  return [input.herdRef, input.batchRef, input.species].join("|");
}

function getLivestockReportBucket(
  buckets: Map<string, LivestockReportBucket>,
  metadata: Record<string, string>
): LivestockReportBucket {
  const input = {
    herdRef: getLivestockMetadataLabel(metadata, "herdRef", "Troupeau non renseigné"),
    batchRef: getLivestockMetadataLabel(metadata, "batchRef", "Lot non renseigné"),
    species: getLivestockMetadataLabel(metadata, "species", "Espèce non renseignée")
  };
  const key = getLivestockBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: LivestockReportBucket = {
    ...input,
    animalPurchaseCountValue: 0,
    feedQuantityValue: 0,
    soldAnimalCountValue: 0,
    productQuantityValue: 0,
    mortalityCountValue: 0,
    transactionsCount: 0,
    tasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(key, created);
  return created;
}

function getLivestockOperationBucket(
  buckets: Map<string, LivestockOperationBucket>,
  operationKind: string,
  operationLabel: string
): LivestockOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: LivestockOperationBucket = {
    operationKind,
    operationLabel,
    transactionsCount: 0,
    tasksCount: 0,
    cashInValue: 0,
    cashOutValue: 0
  };
  buckets.set(operationKind, created);
  return created;
}

function getLivestockTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.livestockOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "ANIMAL_SALE" : "FARM_EXPENSE";
}

function getLivestockTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.livestockTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toLivestockOperationLabel(operationKind: string): string {
  if (LIVESTOCK_OPERATION_LABELS[operationKind]) {
    return LIVESTOCK_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${LIVESTOCK_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toLivestockPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: LivestockReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes périodes";
  }

  if (!filters.dateFrom || !filters.dateTo) {
    return toDisplayPeriodLabel(filters);
  }

  const fromDate = new Date(filters.dateFrom);
  const toDate = new Date(filters.dateTo);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return toDisplayPeriodLabel(filters);
  }

  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth();
  if (!sameMonth) {
    return toDisplayPeriodLabel(filters);
  }

  return fromDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function isLivestockReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return isSectorReportableTransaction(transaction, "LIVESTOCK");
}

function buildLivestockOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): LivestockOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "LIVESTOCK") {
    return null;
  }

  const livestockTransactions = transactions.filter(isLivestockReportableTransaction);
  const livestockTasks = tasks.filter((task) => task.activityCode === "LIVESTOCK");
  if (!filters.activityCode && livestockTransactions.length === 0 && livestockTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, LivestockReportBucket>();
  const operationBuckets = new Map<string, LivestockOperationBucket>();

  for (const transaction of livestockTransactions) {
    const rowBucket = getLivestockReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    const operationKind = getLivestockTransactionOperationKind(transaction);
    const animalCount =
      getMetadataNumber(transaction.metadata, "animalCount") ||
      getMetadataNumber(transaction.metadata, "quantity");

    rowBucket.transactionsCount += 1;
    rowBucket.mortalityCountValue += getMetadataNumber(transaction.metadata, "mortalityCount");
    if (operationKind === "ANIMAL_PURCHASE") {
      rowBucket.animalPurchaseCountValue += animalCount;
    }
    if (operationKind === "FEED_PURCHASE") {
      rowBucket.feedQuantityValue += getMetadataNumber(transaction.metadata, "feedQuantity");
    }
    if (operationKind === "ANIMAL_SALE") {
      rowBucket.soldAnimalCountValue += animalCount;
    }
    if (operationKind === "PRODUCT_SALE") {
      rowBucket.productQuantityValue += getMetadataNumber(transaction.metadata, "productQuantity");
    }
    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getLivestockOperationBucket(
      operationBuckets,
      operationKind,
      toLivestockOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of livestockTasks) {
    const rowBucket = getLivestockReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    rowBucket.mortalityCountValue += getMetadataNumber(task.metadata, "mortalityCount");
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getLivestockTaskOperationKind(task);
    const operationBucket = getLivestockOperationBucket(
      operationBuckets,
      operationKind,
      toLivestockOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.herdRef.localeCompare(right.herdRef) ||
      left.batchRef.localeCompare(right.batchRef) ||
      left.species.localeCompare(right.species)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      animalPurchaseCountValue: sum.animalPurchaseCountValue + row.animalPurchaseCountValue,
      feedQuantityValue: sum.feedQuantityValue + row.feedQuantityValue,
      soldAnimalCountValue: sum.soldAnimalCountValue + row.soldAnimalCountValue,
      productQuantityValue: sum.productQuantityValue + row.productQuantityValue,
      mortalityCountValue: sum.mortalityCountValue + row.mortalityCountValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      animalPurchaseCountValue: 0,
      feedQuantityValue: 0,
      soldAnimalCountValue: 0,
      productQuantityValue: 0,
      mortalityCountValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );
  const herdsCount = new Set(bucketRows.map((row) => row.herdRef)).size;
  const batchesCount = new Set(bucketRows.map((row) => `${row.herdRef}|${row.batchRef}`)).size;

  return {
    periodLabel: toLivestockPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        herdRef: row.herdRef,
        batchRef: row.batchRef,
        species: row.species,
        animalPurchaseCount: row.animalPurchaseCountValue,
        feedQuantity: row.feedQuantityValue,
        soldAnimalCount: row.soldAnimalCountValue,
        productQuantity: row.productQuantityValue,
        mortalityCount: row.mortalityCountValue,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        executionRate: toRate(row.doneTasksCount, row.tasksCount),
        currency: "XOF" as const
      };
    }),
    operationRows: Array.from(operationBuckets.values())
      .map((row) => ({
        operationKind: row.operationKind,
        operationLabel: row.operationLabel,
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(row.cashInValue - row.cashOutValue),
        currency: "XOF" as const
      }))
      .sort((left, right) => left.operationLabel.localeCompare(right.operationLabel)),
    totals: {
      herdsCount,
      batchesCount,
      animalPurchaseCount: totals.animalPurchaseCountValue,
      feedQuantity: totals.feedQuantityValue,
      soldAnimalCount: totals.soldAnimalCountValue,
      productQuantity: totals.productQuantityValue,
      mortalityCount: totals.mortalityCountValue,
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
    }
  };
}

function normalizeOperationalItem(value: string | undefined): { itemKey: string; itemLabel: string } {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {
      itemKey: "UNCLASSIFIED",
      itemLabel: "Non renseigné"
    };
  }
  return {
    itemKey: trimmed,
    itemLabel: trimmed
  };
}

function getOperationalBucket(
  buckets: Map<string, OperationalBucket & { approvedCashInValue: number; approvedCashOutValue: number }>,
  input: {
    scope: "ACTIVITY" | "SUBSECTION";
    activityCode: BusinessActivityCode;
    dimensionKey: string;
    dimensionLabel: string;
    itemKey: string;
    itemLabel: string;
  }
) {
  const key = `${input.scope}|${input.activityCode}|${input.dimensionKey}|${input.itemKey}`;
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created = {
    scope: input.scope,
    activityCode: input.activityCode,
    dimensionKey: input.dimensionKey,
    dimensionLabel: input.dimensionLabel,
    itemKey: input.itemKey,
    itemLabel: input.itemLabel,
    currency: "XOF" as const,
    transactionsCount: 0,
    approvedTransactionsCount: 0,
    approvedCashInValue: 0,
    approvedCashOutValue: 0,
    totalTasksCount: 0,
    doneTasksCount: 0,
    openTasksCount: 0,
    blockedTasksCount: 0,
    overdueTasksCount: 0,
    followUpPressure: 0
  };
  buckets.set(key, created);
  return created;
}

const TRANSPORT_OPERATION_DISPLAY_LABELS: Record<string, string> = {
  TRAVAUX: "Travaux",
  LOCATION: "Location",
  VERSEMENT_AMCCO: "Versement AMCCO",
  DEPENSE: "Dépense",
  ENTRETIEN: "Entretien",
  CARBURANT: "Carburant",
  AUTRE: "Autre"
};

function buildOperationalPerformance(
  transactions: DashboardOperationalTransaction[],
  tasks: DashboardOperationalTask[],
  now = new Date()
): ReportOperationalMetric[] {
  const buckets = new Map<
    string,
    OperationalBucket & { approvedCashInValue: number; approvedCashOutValue: number }
  >();

  function getActivityBucket(activityCode: BusinessActivityCode) {
    return getOperationalBucket(buckets, {
      scope: "ACTIVITY",
      activityCode,
      dimensionKey: "activity",
      dimensionLabel: "Secteur",
      itemKey: activityCode,
      itemLabel: BUSINESS_ACTIVITY_LABELS[activityCode]
    });
  }

  function getBucketAtIndex(
    activityCode: BusinessActivityCode,
    metadata: Record<string, string>,
    index: number
  ) {
    if (index === -1) {
      return getActivityBucket(activityCode);
    }

    const dimension = DASHBOARD_OPERATIONAL_DIMENSIONS_BY_ACTIVITY[activityCode][index];
    const value = normalizeOperationalItem(metadata[dimension.key]);
    return getOperationalBucket(buckets, {
      scope: "SUBSECTION",
      activityCode,
      dimensionKey: dimension.key,
      dimensionLabel: dimension.label,
      itemKey: value.itemKey,
      itemLabel: activityCode === "TRANSPORT" && dimension.key === "dumpTruckOperationKind"
        ? TRANSPORT_OPERATION_DISPLAY_LABELS[value.itemKey] ?? value.itemLabel
        : value.itemLabel
    });
  }

  for (const transaction of transactions) {
    if (!isReportableFinancialStatus(transaction.status)) {
      continue;
    }

    const activityCode = transaction.activityCode;
    const dimensions = DASHBOARD_OPERATIONAL_DIMENSIONS_BY_ACTIVITY[activityCode];
    const amount = transaction.currency === "XOF" ? toNumberAmount(transaction.amount) : 0;
    for (let index = -1; index < dimensions.length; index += 1) {
      const bucket = getBucketAtIndex(activityCode, transaction.metadata, index);
      bucket.transactionsCount += 1;
      bucket.approvedTransactionsCount += 1;
      if (transaction.currency === "XOF") {
        if (transaction.type === "CASH_IN") {
          bucket.approvedCashInValue += amount;
        } else {
          bucket.approvedCashOutValue += amount;
        }
      }
    }
  }

  for (const task of tasks) {
    const activityCode = task.activityCode;
    const dimensions = DASHBOARD_OPERATIONAL_DIMENSIONS_BY_ACTIVITY[activityCode];
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const isOpen = task.status !== "DONE";
    const isOverdue = Boolean(isOpen && dueDate && dueDate.getTime() < now.getTime());
    for (let index = -1; index < dimensions.length; index += 1) {
      const bucket = getBucketAtIndex(activityCode, task.metadata, index);
      bucket.totalTasksCount += 1;
      if (task.status === "DONE") {
        bucket.doneTasksCount += 1;
      }
      if (isOpen) {
        bucket.openTasksCount += 1;
      }
      if (task.status === "BLOCKED") {
        bucket.blockedTasksCount += 1;
      }
      if (isOverdue) {
        bucket.overdueTasksCount += 1;
      }
      bucket.followUpPressure =
        bucket.openTasksCount + bucket.blockedTasksCount * 2 + bucket.overdueTasksCount * 2;
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const netProfit = bucket.approvedCashInValue - bucket.approvedCashOutValue;
      return {
        scope: bucket.scope,
        activityCode: bucket.activityCode,
        dimensionKey: bucket.dimensionKey,
        dimensionLabel: bucket.dimensionLabel,
        itemKey: bucket.itemKey,
        itemLabel: bucket.itemLabel,
        currency: bucket.currency,
        transactionsCount: bucket.transactionsCount,
        approvedTransactionsCount: bucket.approvedTransactionsCount,
        approvedCashIn: toMoneyString(bucket.approvedCashInValue),
        approvedCashOut: toMoneyString(bucket.approvedCashOutValue),
        netProfit: toMoneyString(netProfit),
        marginRate: toRate(netProfit, bucket.approvedCashInValue),
        returnOnCostRate: toRate(netProfit, bucket.approvedCashOutValue),
        totalTasksCount: bucket.totalTasksCount,
        doneTasksCount: bucket.doneTasksCount,
        openTasksCount: bucket.openTasksCount,
        blockedTasksCount: bucket.blockedTasksCount,
        overdueTasksCount: bucket.overdueTasksCount,
        executionRate: toRate(bucket.doneTasksCount, bucket.totalTasksCount),
        blockageRate: toRate(bucket.blockedTasksCount, bucket.totalTasksCount),
        followUpPressure: bucket.followUpPressure
      };
    })
    .sort((left, right) => {
      if (left.scope !== right.scope) {
        return left.scope === "ACTIVITY" ? -1 : 1;
      }
      if (left.activityCode !== right.activityCode) {
        return left.activityCode.localeCompare(right.activityCode);
      }
      if (left.dimensionLabel !== right.dimensionLabel) {
        return left.dimensionLabel.localeCompare(right.dimensionLabel);
      }
      return right.followUpPressure - left.followUpPressure || left.itemLabel.localeCompare(right.itemLabel);
    });
}

function isFinancialAccountCompatibleWithActivity(
  account: Pick<FinancialAccount, "scopeType" | "primaryActivityCode" | "allowedActivityCodes">,
  activityCode?: BusinessActivityCode
): boolean {
  if (!activityCode) {
    return true;
  }

  return (
    account.scopeType === "GLOBAL" ||
    account.primaryActivityCode === activityCode ||
    account.allowedActivityCodes.includes(activityCode)
  );
}

function buildFinancialAccountsSummary(
  accounts: FinancialAccount[],
  activityCode?: BusinessActivityCode
) {
  const globalCount = accounts.filter((account) => account.scopeType === "GLOBAL").length;
  const dedicatedCount = accounts.filter((account) => account.scopeType === "DEDICATED").length;
  const restrictedCount = accounts.filter((account) => account.scopeType === "RESTRICTED").length;
  const compatibleCount = accounts.filter((account) =>
    isFinancialAccountCompatibleWithActivity(account, activityCode)
  ).length;

  return {
    totalCount: accounts.length,
    globalCount,
    dedicatedCount,
    restrictedCount,
    compatibleCount,
    incompatibleCount: Math.max(accounts.length - compatibleCount, 0),
    dedicatedToSelectedActivityCount: activityCode
      ? accounts.filter(
          (account) =>
            account.scopeType === "DEDICATED" && account.primaryActivityCode === activityCode
        ).length
      : 0,
    restrictedToSelectedActivityCount: activityCode
      ? accounts.filter(
          (account) =>
            account.scopeType === "RESTRICTED" &&
            account.allowedActivityCodes.includes(activityCode)
        ).length
      : 0
  };
}

function buildFinancialAccountGovernanceItems(
  accounts: FinancialAccount[],
  activityCode?: BusinessActivityCode
) {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    accountRef: account.accountRef,
    balance: account.balance,
    scopeType: account.scopeType,
    primaryActivityCode: account.primaryActivityCode,
    allowedActivityCodes: account.allowedActivityCodes,
    isCompatibleWithSelectedActivity: isFinancialAccountCompatibleWithActivity(account, activityCode)
  }));
}

export async function getCompanyDashboardSummary(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<DashboardSummary> {
  ensureDashboardAccess(actor.role);
  const filters = normalizeReportFilters(input);

  const [
    companySummary,
    finance,
    operations,
    accountsSummary,
    recentTransactions,
    recentTasks,
    workload,
    financeActivitySummary,
    taskActivitySummary,
    operationalTransactions,
    operationalTasks
  ] = await Promise.all([
    getDashboardCompanySummary(actor.companyId, actor.actorId),
    getDashboardFinanceSummary(actor.companyId, filters),
    getDashboardOperationsSummary(actor.companyId, actor.actorId, filters),
    getFinancialAccountsSummary({
      companyId: actor.companyId,
      activityCode: filters.activityCode
    }),
    listDashboardRecentTransactions(actor.companyId, 6, filters),
    listDashboardRecentTasks(actor.companyId, 6, actor.role, actor.actorId, filters),
    actor.role === "EMPLOYEE" ? Promise.resolve([]) : listDashboardWorkload(actor.companyId, 5, filters),
    listDashboardFinanceActivitySummary(actor.companyId),
    listDashboardTaskActivitySummary(actor.companyId),
    listDashboardOperationalTransactions(
      actor.companyId,
      filters,
      DASHBOARD_OPERATIONAL_METADATA_KEYS
    ),
    listDashboardOperationalTasks(actor.companyId, filters, DASHBOARD_OPERATIONAL_METADATA_KEYS)
  ]);

  if (!companySummary) {
    throw new HttpError(404, "Entreprise introuvable.");
  }

  const company = {
    ...companySummary,
    financialAccountsCount: accountsSummary.totalCount
  };
  const activitySummary = buildDashboardActivitySummary(financeActivitySummary, taskActivitySummary);

  return {
    generatedAt: new Date().toISOString(),
    sectorRulesVersion: SECTOR_RULES_VERSION,
    company,
    finance: {
      ...finance,
      accountsSummary
    },
    operations,
    activitySummary,
    operationalPerformance: buildOperationalPerformance(operationalTransactions, operationalTasks),
    recentTransactions,
    recentTasks,
    workload
  };
}

export async function getCompanyReportsOverview(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<ReportsOverview> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);

  const shouldLoadRentalData = !filters.activityCode || filters.activityCode === "RENTAL";
  const shouldLoadGeneralStoreData = !filters.activityCode || filters.activityCode === "GENERAL_STORE";
  const shouldLoadHardwareData = !filters.activityCode || filters.activityCode === "HARDWARE";
  const shouldLoadBtpData = !filters.activityCode || filters.activityCode === "BTP";
  const isTransportReport = filters.activityCode === "TRANSPORT";
  const asOfDate = filters.dateTo;

  const [
    financeByStatus,
    financeByType,
    financeByActivity,
    financialAccounts,
    taskByStatus,
    taskByActivity,
    operationalTransactions,
    operationalTasks,
    rentalTransactions,
    rentalTenants,
    generalStoreTransactions,
    generalStoreShops,
    generalStoreInventorySnapshots,
    hardwareTransactions,
    btpTransactions,
    btpProjects,
    beverageProducts,
    beverageAdjustments
  ] =
    await Promise.all([
      listReportFinanceByStatus(actor.companyId, filters),
      listReportFinanceByType(actor.companyId, filters),
      listReportFinanceByActivity(actor.companyId, filters),
      isTransportReport ? Promise.resolve([]) : listFinancialAccounts({ companyId: actor.companyId }),
      isTransportReport ? Promise.resolve([]) : listReportTaskByStatus(actor.companyId, filters),
      isTransportReport ? Promise.resolve([]) : listReportTaskByActivity(actor.companyId, filters),
      listReportOperationalTransactions(actor.companyId, filters),
      isTransportReport ? Promise.resolve([]) : listReportOperationalTasks(actor.companyId, filters),
      shouldLoadRentalData
        ? listReportRentalTransactions(actor.companyId, asOfDate)
        : Promise.resolve([] as ReportOperationalTransaction[]),
      shouldLoadRentalData
        ? listRentalTenants({ companyId: actor.companyId, activeOnly: true })
        : Promise.resolve([] as RentalTenant[]),
      shouldLoadGeneralStoreData
        ? listReportGeneralStoreTransactions(actor.companyId, asOfDate)
        : Promise.resolve([] as ReportOperationalTransaction[]),
      shouldLoadGeneralStoreData
        ? listGeneralStoreShops({ companyId: actor.companyId, activeOnly: true })
        : Promise.resolve([] as GeneralStoreShop[]),
      shouldLoadGeneralStoreData
        ? listReportGeneralStoreInventorySnapshots(actor.companyId, asOfDate)
        : Promise.resolve([] as GeneralStoreInventorySnapshot[]),
      shouldLoadHardwareData
        ? listReportHardwareTransactions(actor.companyId, asOfDate)
        : Promise.resolve([] as ReportOperationalTransaction[]),
      shouldLoadBtpData
        ? listReportBtpTransactions(actor.companyId, asOfDate)
        : Promise.resolve([] as ReportOperationalTransaction[]),
      shouldLoadBtpData
        ? listBtpProjects({ companyId: actor.companyId, activeOnly: true })
        : Promise.resolve([] as BtpProject[]),
      filters.activityCode === "BEVERAGE_DEPOT" ? listBeverageProducts(actor.companyId) : Promise.resolve([]),
      filters.activityCode === "BEVERAGE_DEPOT" ? listBeverageStockAdjustments(actor.companyId, filters) : Promise.resolve([])
    ]);

  const financeByActivitySummary = buildReportFinanceByActivitySummary(financeByActivity)
    .filter((item) => item.activityCode === filters.activityCode);
  const taskByActivitySummary = buildReportTaskByActivitySummary(taskByActivity)
    .filter((item) => item.activityCode === filters.activityCode);
  const selectedFinanceActivity = filters.activityCode
    ? financeByActivitySummary.find((item) => item.activityCode === filters.activityCode)
    : null;
  const selectedTaskActivity = filters.activityCode
    ? taskByActivitySummary.find((item) => item.activityCode === filters.activityCode)
    : null;
  const visibleFinancialAccounts = financialAccounts.filter((account) =>
    isFinancialAccountCompatibleWithActivity(account, filters.activityCode)
  );
  const financeAccountsSummary = buildFinancialAccountsSummary(
    visibleFinancialAccounts,
    filters.activityCode
  );

  return {
    generatedAt: new Date().toISOString(),
    sectorRulesVersion: SECTOR_RULES_VERSION,
    filters: {
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      activityCode: filters.activityCode ?? null
    },
    activityProfile: getBusinessActivityProfile(filters.activityCode),
    availableActivityProfiles: [getBusinessActivityProfile(filters.activityCode)],
    activityHighlights: filters.activityCode
      ? buildActivityReportHighlights(filters.activityCode, {
          transactionsCount: selectedFinanceActivity?.count ?? 0,
          submittedTransactionsCount:
            financeByStatus
              .filter((item) => isReportableFinancialStatus(item.status))
              .reduce((sum, item) => sum + item.count, 0),
          totalTasksCount: selectedTaskActivity?.totalCount ?? 0,
          openTasksCount: selectedTaskActivity?.openCount ?? 0,
          blockedTasksCount: selectedTaskActivity?.blockedCount ?? 0
        })
      : [],
    financeByStatus,
    financeByType,
    financeByActivity: financeByActivitySummary,
    financeAccountsSummary,
    financeAccounts: buildFinancialAccountGovernanceItems(visibleFinancialAccounts, filters.activityCode),
    taskByStatus,
    taskByActivity: taskByActivitySummary,
    operationalPerformance: isTransportReport
      ? []
      : buildOperationalPerformance(operationalTransactions, operationalTasks),
    fieldOperationsReport: filters.activityCode === "SERVICES" || filters.activityCode === "MINING" ? {
      transactions: operationalTransactions.filter((row) => row.activityCode === filters.activityCode),
      tasks: operationalTasks.filter((row) => row.activityCode === filters.activityCode)
    } : null,
    hardwareMonthlyReport: buildHardwareMonthlyReport(operationalTransactions, hardwareTransactions, filters),
    agricultureOperationsReport: buildAgricultureOperationsReport(operationalTransactions, operationalTasks, filters),
    generalStoreOperationsReport: buildGeneralStoreOperationsReport(
      generalStoreTransactions,
      generalStoreShops,
      generalStoreInventorySnapshots,
      filters
    ),
    foodOperationsReport: buildFoodOperationsReport(operationalTransactions, operationalTasks, filters),
    rentalOperationsReport: buildRentalOperationsReport(rentalTransactions, rentalTenants, filters),
    btpOperationsReport: buildBtpOperationsReport(btpTransactions, btpProjects, filters),
    fishFarmingOperationsReport: buildFishFarmingOperationsReport(operationalTransactions, operationalTasks, filters),
    livestockOperationsReport: buildLivestockOperationsReport(operationalTransactions, operationalTasks, filters),
    hotelOperationsReport: buildHotelOperationsReport(operationalTransactions, operationalTasks, filters),
    waterOperationsReport: buildWaterOperationsReport(operationalTransactions, filters),
    beverageDepotReport: filters.activityCode === "BEVERAGE_DEPOT"
      ? (() => {
          const report = buildBeverageDepotReport(operationalTransactions, operationalTasks, filters);
          const adjustmentAmount = beverageAdjustments.reduce((sum, item) => sum + toNumberAmount(item.value), 0);
          return { ...report, currentStock: { asOf: new Date().toISOString(), products: beverageProducts },
            stockAdjustments: beverageAdjustments, stockAdjustmentAmount: toMoneyString(adjustmentAmount),
            netOperatingResultAmount: toMoneyString(toNumberAmount(report.netOperatingResultAmount ?? "0") + adjustmentAmount) };
        })()
      : null,
    hydrocarbonOperationsReport: filters.activityCode === "HYDROCARBON"
      ? buildHydrocarbonOperationsReport(operationalTransactions, operationalTasks, filters)
      : null,
    agencyOperationsReport: buildAgencyOperationsReport(operationalTransactions, operationalTasks, filters),
    generalExpensesReport: buildGeneralExpensesReport(operationalTransactions, filters),
    transportOperationsReport: buildTransportOperationsReport(operationalTransactions, filters),
    dailyActivitiesReport: buildDailyActivitiesReport(operationalTransactions, operationalTasks, filters),
    roleDistribution: [],
    topAssignees: []
  };
}

export async function exportCompanyTransactionsCsv(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<string> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const rows = await listTransactionsForExport(actor.companyId, filters);
  const records = rows.map(toTransactionExportRecord);

  return buildCsv(
    [
      "transaction_id",
      "occurred_at",
      "status",
      "type",
      "amount",
      "currency",
      "activity_code",
      "account_name",
      "account_ref",
      "account_scope_type",
      "account_primary_activity_code",
      "account_allowed_activity_codes",
      "account_supports_transaction_activity",
      "created_by_email",
      "proofs_count",
      "description",
      "created_at",
      "updated_at"
    ],
    records.map((item) => [
      item.id,
      item.occurredAt,
      item.status,
      item.type,
      item.amount,
      item.currency,
      item.activityCode,
      item.accountName,
      item.accountRef,
      item.accountScopeType,
      item.accountPrimaryActivityCode,
      item.accountAllowedActivityCodes.join("|"),
      item.accountSupportsTransactionActivity ? "YES" : "NO",
      item.createdByEmail,
      item.proofsCount,
      item.description,
      item.createdAt,
      item.updatedAt
    ])
  );
}

export async function exportCompanyTasksCsv(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<string> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const rows = await listTasksForExport(actor.companyId, filters);
  const records = rows.map(toTaskExportRecord);

  return buildCsv(
    [
      "task_id",
      "title",
      "description",
      "activity_code",
      "status",
      "created_by_full_name",
      "created_by_email",
      "assigned_to_full_name",
      "assigned_to_email",
      "due_date",
      "created_at",
      "updated_at"
    ],
    records.map((item) => [
      item.id,
      item.title,
      item.description,
      item.activityCode,
      item.status,
      item.createdByFullName,
      item.createdByEmail,
      item.assignedToFullName,
      item.assignedToEmail,
      item.dueDate,
      item.createdAt,
      item.updatedAt
    ])
  );
}

export async function exportCompanyTransactionsExcel(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<Buffer> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const [overview, rows] = await Promise.all([
    getCompanyReportsOverview(actor, input),
    listTransactionsForExport(actor.companyId, filters)
  ]);
  const records = rows.map(toTransactionExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters),
      columns: ["generatedAt", "period", "activity", "dateFrom", "dateTo"]
    },
    {
      name: "Guide",
      rows: buildReportReadingGuideRows(),
      columns: ["term", "definition", "formula", "useCase"]
    },
    {
      name: "Synthèse",
      rows: buildOverviewSummaryRows(overview),
      columns: ["category", "item", "label", "value", "extra"]
    },
    {
      name: "Pilotage",
      rows: buildOperationalPerformanceRows(overview),
      columns: [
        "scope",
        "activity",
        "dimension",
        "item",
        "currency",
        "transactionsCount",
        "activeTransactionsCount",
        "cashIn",
        "cashOut",
        "netProfit",
        "marginRate",
        "returnOnCostRate",
        "totalTasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "overdueTasksCount",
        "executionRate",
        "blockageRate",
        "followUpPressure"
      ]
    },
    {
      name: "Quincaillerie",
      rows: buildHardwareMonthlyReportRows(overview),
      columns: [
        "date",
        "designation",
        "recipientRef",
        "quantity",
        "purchaseUnitPrice",
        "purchaseAmount",
        "grossProfit",
        "transactionsCount",
        "currency"
      ]
    },
    {
      name: "RecouvrementQuincaillerie",
      rows: buildHardwareRecipientReportRows(overview),
      columns: ["recipientRef", "purchaseAmount", "grossProfit", "expectedReturnAmount", "collectedAmount", "purchaseVarianceAmount", "balanceAmount", "transactionsCount", "currency"]
    },
    {
      name: "DepensesGeneralesPDG",
      rows: buildGeneralExpensesReportRows(overview, "PDG"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "DepensesGeneralesEmployes",
      rows: buildGeneralExpensesReportRows(overview, "EMPLOYE"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "DepGeneralesRepartitionPDG",
      rows: buildGeneralExpensesBreakdownRows(overview, "PDG"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "DepGeneralesRepartitionEmployes",
      rows: buildGeneralExpensesBreakdownRows(overview, "EMPLOYE"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "Agriculture",
      rows: buildAgricultureOperationsReportRows(overview),
      columns: [
        "campaignRef",
        "parcelRef",
        "fieldType",
        "cropType",
        "surfaceArea",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AgriOperations",
      rows: buildAgricultureOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Magasins",
      rows: buildGeneralStoreOperationsReportRows(overview),
      columns: [
        "shopRef",
        "location",
        "transactionsCount",
        "lastOperationDate",
        "purchaseAmount",
        "collectedAmount",
        "balanceAmount",
        "lastInventoryDate",
        "remainingStockValue",
        "estimatedSoldAmount",
        "varianceAmount",
        "currency"
      ]
    },
    {
      name: "MagasinsMouvements",
      rows: buildGeneralStoreOperationDetailRows(overview),
      columns: ["date", "shopRef", "operationKind", "status", "designation", "amount", "currency"]
    },
    {
      name: "MagasinsSynthese",
      rows: buildGeneralStoreOperationsBreakdownRows(overview),
      columns: ["operationKind", "operationLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "MagasinsLecture",
      rows: buildGeneralStoreReadingRows(),
      columns: ["indicator", "definition"]
    },
    {
      name: "Alimentation",
      rows: buildFoodOperationsReportRows(overview),
      columns: [
        "productFamily",
        "productName",
        "batchRef",
        "storageArea",
        "purchaseQuantity",
        "soldQuantity",
        "lossQuantity",
        "purchaseAmount",
        "salesAmount",
        "lossAmount",
        "expenseAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "grossMargin",
        "marginRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AlimOperations",
      rows: buildFoodOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Location",
      rows: buildRentalOperationsReportRows(overview),
      columns: [
        "tenantRef",
        "unitRef",
        "monthlyRent",
        "totalDue",
        "totalPaid",
        "balanceAmount",
        "status",
        "statusDetail",
        "currency"
      ]
    },
    {
      name: "LocationOps",
      rows: buildRentalOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "LocationCautions",
      rows: buildRentalDepositReportRows(overview),
      columns: [
        "tenantRef",
        "unitRef",
        "status",
        "depositPaidAmount",
        "paymentsCount",
        "lastPaymentLabel",
        "currency"
      ]
    },
    {
      name: "Hôtellerie",
      rows: buildHotelOperationsReportRows(overview),
      columns: [
        "serviceLine",
        "roomRef",
        "roomType",
        "bookingRef",
        "guestRef",
        "nightsCount",
        "guestCount",
        "roomRevenue",
        "depositAmount",
        "restaurantAmount",
        "serviceAmount",
        "maintenanceAmount",
        "commissionAmount",
        "taxAmount",
        "refundAmount",
        "expenseAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "averageRoomRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "HotelOps",
      rows: buildHotelOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "EauVentes",
      rows: buildWaterOperationsReportRows(overview, "IN"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "EauDepenses",
      rows: buildWaterOperationsReportRows(overview, "OUT"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "EauRepartitionVentes",
      rows: buildWaterOperationsBreakdownRows(overview, "IN"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "EauRepartitionDepenses",
      rows: buildWaterOperationsBreakdownRows(overview, "OUT"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "AgenceImmo",
      rows: buildAgencyOperationsReportRows(overview),
      columns: [
        "mandateRef",
        "propertyRef",
        "mandateType",
        "propertyType",
        "locationZone",
        "clientRef",
        "dealStage",
        "dealAmount",
        "saleCommissionAmount",
        "rentalCommissionAmount",
        "mandateFeeAmount",
        "visitFeeAmount",
        "fileFeeAmount",
        "advertisingExpenseAmount",
        "fieldVisitExpenseAmount",
        "brokerPayoutAmount",
        "documentExpenseAmount",
        "officeExpenseAmount",
        "refundAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "commissionRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AgenceOps",
      rows: buildAgencyOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "BTP",
      rows: buildBtpOperationsReportRows(overview),
      columns: [
        "projectRef",
        "clientRef",
        "location",
        "cashInAmount",
        "materialAmount",
        "laborAmount",
        "equipmentAmount",
        "subcontractingAmount",
        "siteExpenseAmount",
        "totalCostAmount",
        "netAmount",
        "retentionAmount",
        "lastProgressPercent",
        "lastOperationDate",
        "transactionsCount",
        "currency"
      ]
    },
    {
      name: "Pisciculture",
      rows: buildFishFarmingOperationsReportRows(overview),
      columns: [
        "pondRef",
        "cycleRef",
        "species",
        "fingerlingsQuantity",
        "feedQuantity",
        "soldQuantity",
        "mortalityCount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "PiscOperations",
      rows: buildFishFarmingOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Élevage",
      rows: buildLivestockOperationsReportRows(overview),
      columns: [
        "herdRef",
        "batchRef",
        "species",
        "animalPurchaseCount",
        "feedQuantity",
        "soldAnimalCount",
        "productQuantity",
        "mortalityCount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "ÉlevageOps",
      rows: buildLivestockOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Transactions",
      columns: [
        "transactionId",
        "occurredAt",
        "status",
        "type",
        "amount",
        "currency",
        "activityCode",
        "accountName",
        "accountRef",
        "accountScopeType",
        "accountPrimaryActivityCode",
        "accountAllowedActivityCodes",
        "accountSupportsTransactionActivity",
        "createdByEmail",
        "proofsCount",
        "description",
        "createdAt",
        "updatedAt"
      ],
      rows: records.map((item) => ({
        transactionId: item.id,
        occurredAt: item.occurredAt,
        status: item.status,
        type: item.type,
        amount: item.amount,
        currency: item.currency,
        activityCode: item.activityCode ?? "",
        accountName: item.accountName,
        accountRef: item.accountRef ?? "",
        accountScopeType: item.accountScopeType,
        accountPrimaryActivityCode: item.accountPrimaryActivityCode ?? "",
        accountAllowedActivityCodes: item.accountAllowedActivityCodes.join(" | "),
        accountSupportsTransactionActivity: item.accountSupportsTransactionActivity ? "YES" : "NO",
        createdByEmail: item.createdByEmail,
        proofsCount: item.proofsCount,
        description: item.description ?? "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    }
  ]);
}

export async function exportCompanyTasksExcel(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<Buffer> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const [overview, rows] = await Promise.all([
    getCompanyReportsOverview(actor, input),
    listTasksForExport(actor.companyId, filters)
  ]);
  const records = rows.map(toTaskExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters),
      columns: ["generatedAt", "period", "activity", "dateFrom", "dateTo"]
    },
    {
      name: "Guide",
      rows: buildReportReadingGuideRows(),
      columns: ["term", "definition", "formula", "useCase"]
    },
    {
      name: "Synthèse",
      rows: buildOverviewSummaryRows(overview),
      columns: ["category", "item", "label", "value", "extra"]
    },
    {
      name: "Pilotage",
      rows: buildOperationalPerformanceRows(overview),
      columns: [
        "scope",
        "activity",
        "dimension",
        "item",
        "currency",
        "transactionsCount",
        "activeTransactionsCount",
        "cashIn",
        "cashOut",
        "netProfit",
        "marginRate",
        "returnOnCostRate",
        "totalTasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "overdueTasksCount",
        "executionRate",
        "blockageRate",
        "followUpPressure"
      ]
    },
    {
      name: "Quincaillerie",
      rows: buildHardwareMonthlyReportRows(overview),
      columns: [
        "date",
        "designation",
        "recipientRef",
        "quantity",
        "purchaseUnitPrice",
        "purchaseAmount",
        "grossProfit",
        "transactionsCount",
        "currency"
      ]
    },
    {
      name: "RecouvrementQuincaillerie",
      rows: buildHardwareRecipientReportRows(overview),
      columns: ["recipientRef", "purchaseAmount", "grossProfit", "expectedReturnAmount", "collectedAmount", "purchaseVarianceAmount", "balanceAmount", "transactionsCount", "currency"]
    },
    {
      name: "DepensesGeneralesPDG",
      rows: buildGeneralExpensesReportRows(overview, "PDG"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "DepensesGeneralesEmployes",
      rows: buildGeneralExpensesReportRows(overview, "EMPLOYE"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "DepGeneralesRepartitionPDG",
      rows: buildGeneralExpensesBreakdownRows(overview, "PDG"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "DepGeneralesRepartitionEmployes",
      rows: buildGeneralExpensesBreakdownRows(overview, "EMPLOYE"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "Agriculture",
      rows: buildAgricultureOperationsReportRows(overview),
      columns: [
        "campaignRef",
        "parcelRef",
        "fieldType",
        "cropType",
        "surfaceArea",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AgriOperations",
      rows: buildAgricultureOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Magasins",
      rows: buildGeneralStoreOperationsReportRows(overview),
      columns: [
        "shopRef",
        "location",
        "transactionsCount",
        "lastOperationDate",
        "purchaseAmount",
        "collectedAmount",
        "balanceAmount",
        "lastInventoryDate",
        "remainingStockValue",
        "estimatedSoldAmount",
        "varianceAmount",
        "currency"
      ]
    },
    {
      name: "MagasinsMouvements",
      rows: buildGeneralStoreOperationDetailRows(overview),
      columns: ["date", "shopRef", "operationKind", "status", "designation", "amount", "currency"]
    },
    {
      name: "MagasinsSynthese",
      rows: buildGeneralStoreOperationsBreakdownRows(overview),
      columns: ["operationKind", "operationLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "MagasinsLecture",
      rows: buildGeneralStoreReadingRows(),
      columns: ["indicator", "definition"]
    },
    {
      name: "Alimentation",
      rows: buildFoodOperationsReportRows(overview),
      columns: [
        "productFamily",
        "productName",
        "batchRef",
        "storageArea",
        "purchaseQuantity",
        "soldQuantity",
        "lossQuantity",
        "purchaseAmount",
        "salesAmount",
        "lossAmount",
        "expenseAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "grossMargin",
        "marginRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AlimOperations",
      rows: buildFoodOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Location",
      rows: buildRentalOperationsReportRows(overview),
      columns: [
        "tenantRef",
        "unitRef",
        "monthlyRent",
        "totalDue",
        "totalPaid",
        "balanceAmount",
        "status",
        "statusDetail",
        "currency"
      ]
    },
    {
      name: "LocationOps",
      rows: buildRentalOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "LocationCautions",
      rows: buildRentalDepositReportRows(overview),
      columns: [
        "tenantRef",
        "unitRef",
        "status",
        "depositPaidAmount",
        "paymentsCount",
        "lastPaymentLabel",
        "currency"
      ]
    },
    {
      name: "Hôtellerie",
      rows: buildHotelOperationsReportRows(overview),
      columns: [
        "serviceLine",
        "roomRef",
        "roomType",
        "bookingRef",
        "guestRef",
        "nightsCount",
        "guestCount",
        "roomRevenue",
        "depositAmount",
        "restaurantAmount",
        "serviceAmount",
        "maintenanceAmount",
        "commissionAmount",
        "taxAmount",
        "refundAmount",
        "expenseAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "averageRoomRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "HotelOps",
      rows: buildHotelOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "BTP",
      rows: buildBtpOperationsReportRows(overview),
      columns: [
        "projectRef",
        "clientRef",
        "location",
        "cashInAmount",
        "materialAmount",
        "laborAmount",
        "equipmentAmount",
        "subcontractingAmount",
        "siteExpenseAmount",
        "totalCostAmount",
        "netAmount",
        "retentionAmount",
        "lastProgressPercent",
        "lastOperationDate",
        "transactionsCount",
        "currency"
      ]
    },
    {
      name: "Pisciculture",
      rows: buildFishFarmingOperationsReportRows(overview),
      columns: [
        "pondRef",
        "cycleRef",
        "species",
        "fingerlingsQuantity",
        "feedQuantity",
        "soldQuantity",
        "mortalityCount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "PiscOperations",
      rows: buildFishFarmingOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Élevage",
      rows: buildLivestockOperationsReportRows(overview),
      columns: [
        "herdRef",
        "batchRef",
        "species",
        "animalPurchaseCount",
        "feedQuantity",
        "soldAnimalCount",
        "productQuantity",
        "mortalityCount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "ÉlevageOps",
      rows: buildLivestockOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "EauVentes",
      rows: buildWaterOperationsReportRows(overview, "IN"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "EauDepenses",
      rows: buildWaterOperationsReportRows(overview, "OUT"),
      columns: ["date", "categoryLabel", "designation", "quantity", "unitPrice", "amount", "currency"]
    },
    {
      name: "EauRepartitionVentes",
      rows: buildWaterOperationsBreakdownRows(overview, "IN"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "EauRepartitionDepenses",
      rows: buildWaterOperationsBreakdownRows(overview, "OUT"),
      columns: ["categoryLabel", "transactionsCount", "amount", "currency"]
    },
    {
      name: "AgenceImmo",
      rows: buildAgencyOperationsReportRows(overview),
      columns: [
        "mandateRef",
        "propertyRef",
        "mandateType",
        "propertyType",
        "locationZone",
        "clientRef",
        "dealStage",
        "dealAmount",
        "saleCommissionAmount",
        "rentalCommissionAmount",
        "mandateFeeAmount",
        "visitFeeAmount",
        "fileFeeAmount",
        "advertisingExpenseAmount",
        "fieldVisitExpenseAmount",
        "brokerPayoutAmount",
        "documentExpenseAmount",
        "officeExpenseAmount",
        "refundAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "commissionRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "AgenceOps",
      rows: buildAgencyOperationsBreakdownRows(overview),
      columns: [
        "operationKind",
        "operationLabel",
        "transactionsCount",
        "tasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "currency"
      ]
    },
    {
      name: "Tâches",
      columns: [
        "taskId",
        "title",
        "description",
        "activityCode",
        "status",
        "createdByFullName",
        "createdByEmail",
        "assignedToFullName",
        "assignedToEmail",
        "dueDate",
        "createdAt",
        "updatedAt"
      ],
      rows: records.map((item) => ({
        taskId: item.id,
        title: item.title,
        description: item.description ?? "",
        activityCode: item.activityCode ?? "",
        status: item.status,
        createdByFullName: item.createdByFullName,
        createdByEmail: item.createdByEmail,
        assignedToFullName: item.assignedToFullName ?? "",
        assignedToEmail: item.assignedToEmail ?? "",
        dueDate: item.dueDate ?? "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    }
  ]);
}

function reportCurrencySummary(overview: ReportsOverview) {
  const currencies = new Map<string, { currency: string; cashIn: number; cashOut: number }>();
  for (const row of overview.financeByType) {
    const total = currencies.get(row.currency) ?? { currency: row.currency, cashIn: 0, cashOut: 0 };
    if (row.type === "CASH_IN") total.cashIn += toNumberAmount(row.approvedAmount);
    else total.cashOut += toNumberAmount(row.approvedAmount);
    currencies.set(row.currency, total);
  }
  return [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

function renderReportCurrencySummary(doc: PDFKit.PDFDocument, overview: ReportsOverview, nextPage: () => void): void {
  drawReportTable(doc, "Flux comptabilisés par devise", [
    { label: "DEVISE", share: 1 }, { label: "ENTRÉES", share: 2, align: "right" },
    { label: "SORTIES", share: 2, align: "right" }, { label: "SOLDE NET", share: 2, align: "right" }
  ], reportCurrencySummary(overview).map((row) => [row.currency, formatPdfNumber(row.cashIn, 2), formatPdfNumber(row.cashOut, 2), formatPdfNumber(row.cashIn - row.cashOut, 2)]), nextPage);
}

function fieldReportContext(activityCode: BusinessActivityCode, metadata: Record<string, string>): string {
  const fields = activityCode === "MINING"
    ? [["siteRef", "Site"], ["equipmentRef", "Équipement"]]
    : [["clientRef", "Client"], ["serviceType", "Prestation"], ["serviceCategory", "Catégorie"]];
  return fields.filter(([key]) => metadata[key]?.trim()).map(([key, label]) => `${label} : ${metadata[key]}`).join("\n") || "Non renseigné";
}

function renderFieldSectorReportsPdf(doc: PDFKit.PDFDocument, overview: ReportsOverview, filters: ReportPeriodFilter): void {
  const title = toDisplayActivityLabel(filters.activityCode);
  const period = toDisplayPeriodLabel(filters);
  const nextPage = () => { doc.addPage(); drawSectorContinuationHeader(doc, title, period); };
  drawSectorReportHeader(doc, title.toUpperCase(), `RAPPORT D'ACTIVITÉ - ${period}`, (x, y, size) => drawAmccoPdfLogo(doc, x, y, size));
  doc.fillColor("#486581").font("Helvetica").fontSize(9).text(`Période : ${period}\nÉtabli le ${formatPdfDate(overview.generatedAt)}. Les totaux comprennent les opérations enregistrées ou finalisées ; les brouillons et rejets en sont exclus. Aucune conversion entre devises.`, PDF_PAGE_MARGIN, doc.y, { width: doc.page.width - PDF_PAGE_MARGIN * 2 });
  doc.y += 18;
  renderReportCurrencySummary(doc, overview, nextPage);
  const data = overview.fieldOperationsReport;
  const transactions = (data?.transactions ?? []).filter((row) => isReportableFinancialStatus(row.status));
  const currencies = [...new Set(transactions.map((row) => row.currency))].sort();
  if (!currencies.length) {
    drawReportTable(doc, "Opérations comptabilisées", [{ label: "DÉTAIL", share: 1 }], [], nextPage, "Aucune opération comptabilisée sur la période sélectionnée.");
  }
  for (const currency of currencies) {
    for (const type of ["CASH_IN", "CASH_OUT"] as const) {
      const rows = transactions.filter((row) => row.currency === currency && row.type === type).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      if (!rows.length) continue;
      drawReportTable(doc, `${type === "CASH_IN" ? "Recettes" : "Dépenses"} - ${currency}`, [
        { label: "DATE", share: 1 }, { label: "RÉFÉRENCES", share: 2.4 },
        { label: "DÉSIGNATION", share: 3.4 }, { label: `MONTANT ${currency}`, share: 1.5, align: "right" }
      ], rows.map((row) => [formatPdfDate(row.occurredAt), fieldReportContext(row.activityCode, row.metadata), row.description?.trim() || "Non renseignée", formatPdfNumber(row.amount, 2)]), nextPage);
    }
  }
  drawReportTable(doc, filters.activityCode === "MINING" ? "Suivi par site et équipement - XOF" : "Suivi par client et prestation - XOF", [
    { label: "DIMENSION", share: 1.5 }, { label: "RÉFÉRENCE", share: 2.2 },
    { label: "ENTRÉES XOF", share: 1.3, align: "right" }, { label: "SORTIES XOF", share: 1.3, align: "right" },
    { label: "NET XOF", share: 1.3, align: "right" }, { label: "TÂCHES", share: 0.8, align: "right" },
    { label: "BLOQUÉES", share: 0.9, align: "right" }, { label: "EXÉC. %", share: 0.8, align: "right" }
  ], overview.operationalPerformance.filter((row) => row.scope === "SUBSECTION" && row.activityCode === filters.activityCode).map((row) => [row.dimensionLabel, row.itemLabel, formatPdfNumber(row.approvedCashIn, 2), formatPdfNumber(row.approvedCashOut, 2), formatPdfNumber(row.netProfit, 2), String(row.totalTasksCount), String(row.blockedTasksCount), formatPdfNumber(row.executionRate, 1)]), nextPage, "Aucune référence métier suivie sur la période sélectionnée.");
  drawReportTable(doc, "Suivi des tâches", [
    { label: "STATUT", share: 2 }, { label: "TÂCHES", share: 1, align: "right" }
  ], overview.taskByStatus.map((row) => [toDisplayTaskStatusLabel(row.status), String(row.count)]), nextPage, "Aucune tâche sur la période sélectionnée.");
  drawReportTable(doc, "Interventions et échéances", [
    { label: "INTERVENTION", share: 3 }, { label: "RÉFÉRENCES", share: 2.5 },
    { label: "STATUT", share: 1.2 }, { label: "ÉCHÉANCE", share: 1.3 }
  ], (data?.tasks ?? []).map((row) => [row.title || row.description || "Non renseignée", fieldReportContext(row.activityCode, row.metadata), toDisplayTaskStatusLabel(row.status), row.dueDate ? formatPdfDate(row.dueDate) : "Sans échéance"]), nextPage);
}

export async function exportCompanyReportsPdf(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<Buffer> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const overview = await getCompanyReportsOverview(actor, input);
  const periodLabel = toDisplayPeriodLabel(filters);
  const buildSectorPdf = (
    render: (doc: PDFKit.PDFDocument) => void,
    decorate: (doc: PDFKit.PDFDocument, pageNumber: number, totalPages: number) => void,
    options?: { layout?: "portrait" | "landscape" }
  ) => buildPdfBuffer((doc) => {
    doc.info.Title = `${toDisplayActivityLabel(filters.activityCode)} - ${periodLabel}`;
    doc.info.Author = "AMCCO";
    doc.info.Subject = `Rapport sectoriel | ${periodLabel}`;
    doc.info.CreationDate = new Date(overview.generatedAt);
    render(doc);
    const xofFocused = ["HARDWARE", "GENERAL_STORE", "RENTAL", "AGRICULTURE", "BTP", "FISH_FARMING"];
    if (filters.activityCode && xofFocused.includes(filters.activityCode) && overview.financeByType.some((row) => row.currency !== "XOF")) {
      const nextPage = () => { doc.addPage(); drawSectorContinuationHeader(doc, toDisplayActivityLabel(filters.activityCode), periodLabel); };
      nextPage();
      doc.fillColor("#486581").font("Helvetica").fontSize(9).text("Complément financier : les tableaux métier précédents portent sur le XOF. Les autres devises sont présentées séparément ci-dessous, sans conversion.", PDF_PAGE_MARGIN, doc.y, { width: doc.page.width - PDF_PAGE_MARGIN * 2 });
      doc.y += 18;
      renderReportCurrencySummary(doc, overview, nextPage);
    }
  }, decorate, options);

  if (filters.activityCode === "SERVICES" || filters.activityCode === "MINING") {
    return buildSectorPdf((doc) => renderFieldSectorReportsPdf(doc, overview, filters),
      (doc, page, total) => drawSectorReportFooter(doc, toDisplayActivityLabel(filters.activityCode), periodLabel, page, total),
      { layout: "landscape" });
  }

  if (filters.activityCode === "HARDWARE") {
    return buildSectorPdf((doc) => {
      renderHardwareReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawHardwarePdfFooter(doc, pageNumber, totalPages, overview.hardwareMonthlyReport?.periodLabel ?? periodLabel);
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "TRANSPORT") {
    const report = overview.transportOperationsReport ?? {
      periodLabel,
      rows: [],
      currencySummaries: []
    };
    return buildSectorPdf((doc) => {
      renderTransportOperationsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawTransportPdfFooter(doc, pageNumber, totalPages, report.periodLabel);
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "GENERAL_EXPENSES") {
    return buildSectorPdf((doc) => {
      renderGeneralExpensesReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawGeneralExpensesPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.generalExpensesReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "DAILY_ACTIVITIES") {
    return buildSectorPdf((doc) => {
      renderDailyActivitiesReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawDailyActivitiesPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.dailyActivitiesReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "AGRICULTURE") {
    return buildSectorPdf((doc) => {
      renderAgricultureReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawAgriculturePdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.agricultureOperationsReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "GENERAL_STORE") {
    return buildSectorPdf((doc) => {
      renderGeneralStoreReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawGeneralStorePdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.generalStoreOperationsReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "FOOD") {
    return buildSectorPdf((doc) => {
      renderFoodReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawFoodPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.foodOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "RENTAL") {
    return buildSectorPdf((doc) => {
      renderRentalReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawRentalPdfFooter(
        doc,
        pageNumber,
        totalPages,
        toRentalPdfPeriodLabel(filters)
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "HOTEL_LODGING") {
    return buildSectorPdf((doc) => {
      renderHotelReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawHotelPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.hotelOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "WATER") {
    return buildSectorPdf((doc) => {
      renderWaterReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawWaterPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.waterOperationsReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "BEVERAGE_DEPOT") {
    const report = overview.beverageDepotReport ?? buildEmptyBeverageDepotReport(filters);
    return buildSectorPdf((doc) => {
      renderBeverageDepotReportsPdf(doc, report, overview.generatedAt);
    }, (doc, pageNumber, totalPages) => {
      drawBeverageDepotPdfFooter(doc, pageNumber, totalPages, report.periodLabel);
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "HYDROCARBON") {
    const report = overview.hydrocarbonOperationsReport ?? buildHydrocarbonOperationsReport([], [], filters);
    return buildSectorPdf((doc) => {
      renderHydrocarbonReportsPdf(doc, report, overview.generatedAt);
    }, (doc, pageNumber, totalPages) => {
      drawHydrocarbonPdfFooter(doc, pageNumber, totalPages, report.periodLabel);
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "REAL_ESTATE_AGENCY") {
    return buildSectorPdf((doc) => {
      renderAgencyReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawAgencyPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.agencyOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "BTP") {
    return buildSectorPdf((doc) => {
      renderBtpReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawBtpPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.btpOperationsReport?.asOfLabel ?? formatPdfDate(resolveBtpAsOfDate(filters).toISOString())
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "FISH_FARMING") {
    return buildSectorPdf((doc) => {
      renderFishFarmingReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawFishFarmingPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.fishFarmingOperationsReport?.periodLabel ?? periodLabel
      );
    }, { layout: "landscape" });
  }

  if (filters.activityCode === "LIVESTOCK") {
    return buildSectorPdf((doc) => {
      renderLivestockReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawLivestockPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.livestockOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  return buildSectorPdf((doc) => {
    doc.on("pageAdded", () => {
      doc.y = PDF_CONTENT_TOP;
    });
    doc.y = PDF_CONTENT_TOP;
    doc
      .fillColor("#0f2544")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("AMCCO - Rapport consolide");
    doc.moveDown(0.5);
    doc.fillColor("#334e68").font("Helvetica").fontSize(10).text(`Entreprise: ${actor.companyId}`);
    doc.fontSize(10).text(`Genere le: ${new Date().toLocaleString("fr-FR")}`);
    doc.fontSize(10).text(`Période appliquée: ${periodLabel}`);
    doc.fontSize(10).text(`Activité: ${toDisplayActivityLabel(filters.activityCode)}`);
    if (overview.activityProfile) {
      doc.fontSize(10).text(`Mode operatoire: ${overview.activityProfile.operationsModel}`);
    }

    drawPdfReadingGuideBox(doc);

    writePdfSectionTitle(doc, "Synthèse consolidée");
    writePdfList(
      doc,
      [
        `Transactions consolidées: ${overview.financeByStatus.reduce((sum, item) => sum + item.count, 0)}`,
        `Tâches consolidées: ${overview.taskByStatus.reduce((sum, item) => sum + item.count, 0)}`
      ],
      "Aucune synthese disponible."
    );

    writePdfSectionTitle(doc, "Rentabilité et exécution XOF");
    writePdfList(
      doc,
      limitPdfRows(
        overview.operationalPerformance
          .filter((item) => item.transactionsCount > 0 || item.totalTasksCount > 0)
          .map(
            (item) =>
              `${item.scope === "ACTIVITY" ? "Secteur" : "Sous-section"} | ${BUSINESS_ACTIVITY_LABELS[item.activityCode]} | ${item.dimensionLabel}: ${item.itemLabel} | net ${item.netProfit} XOF | marge ${item.marginRate}% | exécution ${item.executionRate}% | bloquées ${item.blockedTasksCount} | retards ${item.overdueTasksCount}`
          )
      ),
      "Aucune donnee de pilotage opérationnel sur cette période."
    );

    if (overview.hardwareMonthlyReport) {
      const hardwareReport = overview.hardwareMonthlyReport;
      writePdfSectionTitle(doc, `Rapport quincaillerie - ${hardwareReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...hardwareReport.rows.map(
            (item) =>
              `${item.date} | ${item.designation} | quantité ${item.quantity} | prix d'achat ${item.purchaseUnitPrice} XOF | montant ${item.purchaseAmount} XOF | bénéfice ${item.grossProfit} XOF`
          ),
          `TOTAL | quantité ${hardwareReport.totals.quantity} | montant ${hardwareReport.totals.purchaseAmount} XOF | bénéfice ${hardwareReport.totals.grossProfit} XOF`
        ]),
        "Aucun achat quincaillerie comptabilisé sur cette période."
      );
      writePdfSectionTitle(doc, "Quincaillerie - écarts par destinataire");
      writePdfList(
        doc,
        limitPdfRows([
          ...hardwareReport.recipientRows.map((item) =>
            `${item.recipientRef} | achats ${formatPdfMoney(item.purchaseAmount)} | recouvré ${formatPdfMoney(item.collectedAmount)} | écart achats ${formatPdfMoney(item.purchaseVarianceAmount)} | reste attendu ${formatPdfMoney(item.balanceAmount)}`
          ),
          `TOTAL | écart achats ${formatPdfMoney(hardwareReport.totals.purchaseVarianceAmount)} | reste attendu ${formatPdfMoney(hardwareReport.totals.balanceAmount)}`
        ]),
        "Aucun destinataire suivi."
      );
    }

    if (overview.btpOperationsReport) {
      const btpReport = overview.btpOperationsReport;
      writePdfSectionTitle(doc, `Rapport BTP - ${btpReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...btpReport.rows.map(
            (item) =>
              `${item.projectRef} | client ${item.clientRef} | encaissé ${item.cashInAmount} XOF | dépensé ${item.totalCostAmount} XOF (matériaux ${item.materialAmount}, main-d'oeuvre ${item.laborAmount}, engins ${item.equipmentAmount}, sous-traitance ${item.subcontractingAmount}, charges ${item.siteExpenseAmount}) | marge ${item.netAmount} XOF | avancement ${item.lastProgressPercent ?? "-"}%`
          ),
          `TOTAL | chantiers ${btpReport.totals.projectsCount} | encaissé ${btpReport.totals.cashInAmount} XOF | dépensé ${btpReport.totals.totalCostAmount} XOF | marge ${btpReport.totals.netAmount} XOF`
        ]),
        "Aucune opération BTP sur cette période."
      );
    }

    if (overview.fishFarmingOperationsReport) {
      const fishReport = overview.fishFarmingOperationsReport;
      writePdfSectionTitle(doc, `Rapport pisciculture - ${fishReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...fishReport.rows.map(
            (item) =>
              `${item.pondRef} | ${item.cycleRef} | ${item.species} | alevins ${item.fingerlingsQuantity} | aliment ${item.feedQuantity} | ventes ${item.soldQuantity} | mortalité ${item.mortalityCount} | net ${item.netAmount} XOF | exécution ${item.executionRate}%`
          ),
          `TOTAL | bassins ${fishReport.totals.pondsCount} | cycles ${fishReport.totals.cyclesCount} | alevins ${fishReport.totals.fingerlingsQuantity} | aliment ${fishReport.totals.feedQuantity} | ventes ${fishReport.totals.soldQuantity} | mortalité ${fishReport.totals.mortalityCount} | net ${fishReport.totals.netAmount} XOF`
        ]),
        "Aucune opération piscicole sur cette période."
      );
    }

    if (overview.livestockOperationsReport) {
      const livestockReport = overview.livestockOperationsReport;
      writePdfSectionTitle(doc, `Rapport élevage - ${livestockReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...livestockReport.rows.map(
            (item) =>
              `${item.herdRef} | ${item.batchRef} | ${item.species} | achats ${item.animalPurchaseCount} | aliment ${item.feedQuantity} | ventes ${item.soldAnimalCount} | produits ${item.productQuantity} | mortalité ${item.mortalityCount} | net ${item.netAmount} XOF | exécution ${item.executionRate}%`
          ),
          `TOTAL | troupeaux ${livestockReport.totals.herdsCount} | lots ${livestockReport.totals.batchesCount} | achats ${livestockReport.totals.animalPurchaseCount} | aliment ${livestockReport.totals.feedQuantity} | ventes ${livestockReport.totals.soldAnimalCount} | produits ${livestockReport.totals.productQuantity} | mortalité ${livestockReport.totals.mortalityCount} | net ${livestockReport.totals.netAmount} XOF`
        ]),
        "Aucune opération d'élevage sur cette période."
      );
    }

    writePdfSectionTitle(doc, "Transactions par type et devise");
    writePdfList(
      doc,
      overview.financeByType.map(
        (item) =>
          `${toDisplayTransactionTypeLabel(item.type)} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency} | comptabilisé ${item.approvedAmount} ${item.currency}`
      ),
      "Aucune transaction consolidée sur cette période."
    );

    writePdfSectionTitle(doc, "Transactions par statut");
    writePdfList(
      doc,
      overview.financeByStatus.map(
        (item) =>
          `${toDisplayTransactionStatusLabel(item.status)} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency}`
      ),
      "Aucune transaction par statut sur cette période."
    );

    writePdfSectionTitle(doc, "Gouvernance des comptes");
    writePdfList(
      doc,
      limitPdfRows(
        overview.financeAccounts.map(
          (item) =>
            `${item.name} | ${toDisplayAccountScopeLabel(item)} | ${toDisplayAccountCompatibilityLabel(item.isCompatibleWithSelectedActivity)} | solde ${item.balance}`
        )
      ),
      "Aucun compte financier disponible."
    );

    writePdfSectionTitle(doc, "Tâches par statut");
    writePdfList(
      doc,
      overview.taskByStatus.map(
        (item) => `${toDisplayTaskStatusLabel(item.status)} | ${item.count} tâche(s)`
      ),
      "Aucune tâche consolidée sur cette période."
    );

  }, (doc, pageNumber, totalPages) => {
    drawPdfBrandingFrame(doc, pageNumber, totalPages, periodLabel);
  });
}
