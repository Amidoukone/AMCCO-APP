import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import {
  buildActivityReportHighlights,
  getBusinessActivityProfile,
  listBusinessActivityProfiles
} from "../config/business-activity-profiles.js";
import { HttpError } from "../errors/http-error.js";
import {
  getDashboardCompanySummary,
  listDashboardFinanceActivitySummary,
  getDashboardFinanceSummary,
  getDashboardOperationsSummary,
  listDashboardRecentTasks,
  listDashboardRecentTransactions,
  listDashboardTaskActivitySummary,
  listDashboardWorkload,
  listReportFinanceByActivity,
  listReportFinanceByStatus,
  listReportFinanceByType,
  listReportOperationalTasks,
  listReportOperationalTransactions,
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
  type DashboardSummary,
  type FishFarmingOperationsReport,
  type FoodOperationsReport,
  type GeneralStoreOperationsReport,
  type HardwareMonthlyReport,
  type HotelOperationsReport,
  type LivestockOperationsReport,
  type RentalOperationsReport,
  type WaterOperationsReport,
  type ReportOperationalMetric,
  type ReportOperationalTask,
  type ReportOperationalTransaction,
  type ReportsOverview
} from "../repositories/reporting.repository.js";
import { listFinancialAccounts, type FinancialAccount } from "../repositories/finance.repository.js";
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
  STORE_SALE: "Vente caisse",
  STOCK_PURCHASE: "Achat stock",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  CUSTOMER_RETURN: "Retour client",
  DISCOUNT_ADJUSTMENT: "Remise / écart",
  INVENTORY_ADJUSTMENT: "Ajustement inventaire",
  INTERNAL_TRANSFER: "Transfert interne",
  STORE_EXPENSE: "Charge magasin"
};
const GENERAL_STORE_TASK_LABELS: Record<string, string> = {
  OPENING_CASH: "Ouverture caisse",
  CLOSING_CASH: "Clôture caisse",
  STOCK_CONTROL: "Contrôle stock",
  INVENTORY: "Inventaire",
  REPLENISHMENT: "Réassort rayon",
  MERCHANDISING: "Implantation rayon",
  PRICE_UPDATE: "Mise à jour prix",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  CUSTOMER_RETURN: "Retour client",
  CLEANING: "Nettoyage rayon",
  SECURITY_CHECK: "Contrôle sécurité",
  FOLLOW_UP: "Suivi magasin"
};
const GENERAL_STORE_REPORT_BRANDING = {
  title: "MAGASINS - COMMERCE GENERAL",
  subtitle: "Suivi des rayons, articles, ventes caisse, achats, retours, remises, inventaire et charges",
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
const RENTAL_OPERATION_LABELS: Record<string, string> = {
  RENT_PAYMENT: "Paiement loyer",
  SECURITY_DEPOSIT: "Caution",
  ADVANCE_PAYMENT: "Avance loyer",
  SERVICE_CHARGE_INCOME: "Charges recuperees",
  MAINTENANCE_EXPENSE: "Maintenance",
  PROPERTY_EXPENSE: "Charge bien",
  OWNER_PAYOUT: "Reversement propriétaire"
};
const RENTAL_TASK_LABELS: Record<string, string> = {
  RENT_COLLECTION: "Recouvrement loyer",
  TENANT_FOLLOW_UP: "Suivi locataire",
  VISIT: "Visite",
  LEASE_RENEWAL: "Renouvellement bail",
  MOVE_IN: "Entree locataire",
  MOVE_OUT: "Sortie locataire",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
  DOCUMENTS: "Documents",
  OWNER_REPORT: "Reporting propriétaire",
  LITIGATION: "Litige",
  FOLLOW_UP: "Suivi locatif"
};
const RENTAL_REPORT_BRANDING = {
  title: "LOCATION IMMOBILIERE",
  subtitle: "Suivi des biens, lots, locataires, loyers, charges, maintenances et relances",
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
  WATER_BILLING: "Facture eau",
  BULK_WATER_SALE: "Vente eau en gros",
  CONNECTION_FEE: "Frais branchement",
  SUBSIDY_INCOME: "Subvention / appui",
  CHEMICAL_PURCHASE: "Produit traitement",
  ENERGY_PAYMENT: "Énergie",
  MAINTENANCE_EXPENSE: "Maintenance",
  QUALITY_TEST_EXPENSE: "Analyse qualité",
  NETWORK_REPAIR: "Réparation réseau",
  SUPPLIER_PAYMENT: "Paiement fournisseur"
};
const WATER_TASK_LABELS: Record<string, string> = {
  PRODUCTION_READING: "Relevé production",
  QUALITY_CONTROL: "Contrôle qualité",
  PUMP_MAINTENANCE: "Maintenance pompe",
  NETWORK_INSPECTION: "Inspection réseau",
  LEAK_REPAIR: "Réparation fuite",
  METER_READING: "Releve compteur",
  CONNECTION_WORK: "Branchement",
  CHEMICAL_DOSING: "Dosage traitement",
  BILLING_FOLLOW_UP: "Suivi facturation",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  SERVICE_RESTORE: "Remise en service",
  FOLLOW_UP: "Suivi eau"
};
const WATER_REPORT_BRANDING = {
  title: "PRODUCTION D'EAU POTABLE",
  subtitle: "Suivi des stations, volumes, facturation, qualité, maintenance et continuité de service",
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
const BTP_TASK_LABELS: Record<string, string> = {
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
const BTP_REPORT_BRANDING = {
  title: "BTP",
  subtitle: "Suivi de chantiers, lots, coûts, avancement et réserves",
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
  decorate?: (doc: PDFKit.PDFDocument, pageNumber: number, totalPages: number) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
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
    return "Soumise";
  }
  if (status === "APPROVED") {
    return "Approuvee";
  }
  return "Rejetee";
}

function toDisplayTransactionTypeLabel(type: "CASH_IN" | "CASH_OUT"): string {
  return type === "CASH_IN" ? "Entree" : "Sortie";
}

function toDisplayTaskStatusLabel(status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"): string {
  if (status === "TODO") {
    return "A faire";
  }
  if (status === "IN_PROGRESS") {
    return "En cours";
  }
  if (status === "DONE") {
    return "Terminée";
  }
  return "Bloquee";
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
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40;

  doc.save();
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
    .text("Rapport consolide", margin + 40, 44, {
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
      width: 180
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
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
  { label: "DATE", width: 58, align: "center" },
  { label: "DESIGNATION", width: 115, align: "left" },
  { label: "QUANTITE", width: 52, align: "right" },
  { label: "VENTE/JOUR", width: 75, align: "right" },
  { label: "VERSEMENT", width: 75, align: "right" },
  { label: "COÛT ACHAT", width: 70, align: "right" },
  { label: "BENEFICE", width: 70, align: "right" }
];

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
    .text(text, x + 4, y + Math.max(3, (height - fontSize) / 2 - 1), {
      width: width - 8,
      height: height - 4,
      align
    });
  doc.restore();
}

function drawHardwareReportHeader(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 110;
  const centerWidth = pageWidth - margin * 2 - 210;

  drawHardwareInventoryMark(doc, margin, 23);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 15, 72);

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(HARDWARE_REPORT_BRANDING.title, centerX, 24, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#2f7d32")
    .fontSize(8.5)
    .text(HARDWARE_REPORT_BRANDING.agency, centerX, 43, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .fontSize(10)
    .text(`"${HARDWARE_REPORT_BRANDING.brand}"`, centerX, 56, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#173fcb")
    .fontSize(8.5)
    .text(`${HARDWARE_REPORT_BRANDING.fiscal}     ${HARDWARE_REPORT_BRANDING.phone}`, centerX, 70, {
      width: centerWidth,
      align: "center"
    });

  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#173fcb")
    .lineWidth(2)
    .stroke();

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(toHardwarePdfTitle(report), margin, 116, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 144;
}

function drawHardwareContinuationHeader(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;

  drawAmccoPdfLogo(doc, margin, 22, 34);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`${toHardwarePdfTitle(report)} - suite`, margin + 44, 28, {
      width: pageWidth - margin * 2 - 88
    });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8)
    .text(`Période: ${report.periodLabel}`, margin + 44, 43, {
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

  doc.roundedRect(margin, y, width, 42, 4).fill("#f8fafc");
  doc.rect(margin, y, width, 42).strokeColor("#d7e3f1").lineWidth(0.8).stroke();
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8)
    .text("Période", margin + 10, y + 8, { width: 140 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(period, margin + 10, y + 21, { width: 170 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8)
    .text("Secteur", margin + 200, y + 8, { width: 100 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Quincaillerie", margin + 200, y + 21, { width: 110 });
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8)
    .text("Genere le", pageWidth - margin - 150, y + 8, {
      width: 140,
      align: "right"
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(formatPdfDate(generatedAt), pageWidth - margin - 150, y + 21, {
      width: 140,
      align: "right"
    });
  doc.y = y + 56;
}

function drawHardwareMetricCards(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Quantité totale", value: formatPdfNumber(report.totals.quantity, 2) },
    { label: "Vente totale", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Versement", value: formatPdfMoney(report.totals.paymentAmount) },
    { label: "Bénéfice brut", value: formatPdfMoney(report.totals.grossProfit) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#f7fbf4");
    doc.rect(x, y, cardWidth, 45).strokeColor("#c9d8bf").lineWidth(0.8).stroke();
    doc
      .fillColor("#486581")
      .font("Helvetica")
      .fontSize(7.5)
      .text(metric.label, x + 8, y + 8, {
        width: cardWidth - 16
      });
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(metric.value, x + 8, y + 23, {
        width: cardWidth - 16,
        align: "left"
      });
  });
  doc.y = y + 60;
}

function toHardwarePdfTitle(report: HardwareMonthlyReport): string {
  const designations = Array.from(new Set(report.rows.map((item) => item.designation.trim()).filter(Boolean)));
  if (designations.length === 1) {
    return `VENTE DE ${truncatePdfText(designations[0].toUpperCase(), 38)} - QUINCAILLERIE`;
  }
  return "RAPPORT DES VENTES QUINCAILLERIE";
}

function drawHardwareTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of HARDWARE_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 20, {
      align: "center",
      fill: "#e7f1dc",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  return y + 20;
}

function drawHardwareDataRow(
  doc: PDFKit.PDFDocument,
  row: HardwareMonthlyReport["rows"][number],
  y: number
): number {
  const values = [
    { value: formatPdfDate(row.date), align: "center" as const },
    { value: truncatePdfText(row.designation, 24), align: "left" as const },
    { value: formatPdfNumber(row.quantity, 2), align: "right" as const },
    { value: formatPdfMoney(row.salesAmount), align: "right" as const },
    { value: formatPdfMoney(row.paymentAmount), align: "right" as const },
    { value: formatPdfMoney(row.purchaseAmount), align: "right" as const },
    { value: formatPdfMoney(row.grossProfit), align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = HARDWARE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 18, {
      align: item.align,
      fontSize: 7.3
    });
    x += column.width;
  });
  return y + 18;
}

function drawHardwareTotalsRow(doc: PDFKit.PDFDocument, report: HardwareMonthlyReport, y: number): number {
  const firstColumnsWidth = HARDWARE_PDF_COLUMNS[0].width + HARDWARE_PDF_COLUMNS[1].width;
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 21, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 8
  });
  x += firstColumnsWidth;

  const totalValues = [
    formatPdfNumber(report.totals.quantity, 2),
    formatPdfMoney(report.totals.salesAmount),
    formatPdfMoney(report.totals.paymentAmount),
    formatPdfMoney(report.totals.purchaseAmount),
    formatPdfMoney(report.totals.grossProfit)
  ];
  for (let index = 0; index < totalValues.length; index += 1) {
    const column = HARDWARE_PDF_COLUMNS[index + 2];
    drawPdfTableCell(doc, totalValues[index], x, y, column.width, 21, {
      align: "right",
      fill: index === 0 ? "#e7f1dc" : "#f7fbf4",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }

  return y + 21;
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
    .text("Aucune vente quincaillerie reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#7c2d12")
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Le rapport reprend les ventes XOF soumises ou approuvées avec désignation article. Vérifiez la période, le statut des transactions et les champs quantité/prix si le tableau doit être alimenté.",
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
  if (doc.y + 20 + 18 + 21 > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
  }
  let y = drawHardwareTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 18 + 21 > tableBottom) {
      doc.addPage();
      drawHardwareContinuationHeader(doc, report);
      y = drawHardwareTableHeader(doc, doc.y);
    }
    y = drawHardwareDataRow(doc, row, y);
  }

  if (y + 21 > tableBottom) {
    doc.addPage();
    drawHardwareContinuationHeader(doc, report);
    y = drawHardwareTableHeader(doc, doc.y);
  }
  doc.y = drawHardwareTotalsRow(doc, report, y) + 12;
}

function buildEmptyHardwareMonthlyReport(filters: ReportPeriodFilter): HardwareMonthlyReport {
  return {
    periodLabel: toHardwarePeriodLabel(filters, []),
    rows: [],
    totals: {
      quantity: 0,
      salesAmount: "0.00",
      paymentAmount: "0.00",
      purchaseAmount: "0.00",
      grossProfit: "0.00",
      marginRate: 0,
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
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
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
    .text(`AMCCO MBAG - Rapport quincaillerie | ${periodLabel}`, margin, pageHeight - 32, {
      width: 300
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
  doc.restore();
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

  const note =
    "Lecture: les montants sont consolidés en F CFA. Le bénéfice brut correspond à la vente moins le coût d'achat renseigné sur les transactions article.";
  const noteWidth = doc.page.width - PDF_PAGE_MARGIN * 2;
  const noteHeight = doc.heightOfString(note, {
    width: noteWidth
  });
  if (doc.y + noteHeight <= doc.page.height - PDF_CONTENT_BOTTOM) {
    doc
      .fillColor("#486581")
      .font("Helvetica")
      .fontSize(8)
      .text(note, PDF_PAGE_MARGIN, doc.y, {
        width: noteWidth
      });
  }
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
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 118;
  const centerWidth = pageWidth - margin * 2 - 220;

  drawAgricultureFieldMark(doc, margin, 16);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16.5)
    .text(AGRICULTURE_REPORT_BRANDING.title, centerX, 22, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#2f7d32")
    .font("Helvetica")
    .fontSize(9.2)
    .text(AGRICULTURE_REPORT_BRANDING.agency, centerX, 42, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`"${AGRICULTURE_REPORT_BRANDING.brand}"`, centerX, 55, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#14532d")
    .font("Helvetica-Bold")
    .fontSize(9.2)
    .text(AGRICULTURE_REPORT_BRANDING.subtitle, centerX, 69, {
      width: centerWidth,
      align: "center"
    });
  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#2f7d32")
    .lineWidth(2)
    .stroke();
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SUIVI DES OPERATIONS AGRICOLES PAR CAMPAGNE", margin, 114, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 140;
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
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? formatPdfDate(filters.dateFrom) : "..."} - ${filters.dateTo ? formatPdfDate(filters.dateTo) : "..."}`
    : report.periodLabel;

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
  for (const column of AGRICULTURE_PDF_COLUMNS) {
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
    const column = AGRICULTURE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 7.2
    });
    x += column.width;
  });
  return y + 20;
}

function drawAgricultureTotalsRow(doc: PDFKit.PDFDocument, report: AgricultureOperationsReport, y: number): number {
  const firstColumnsWidth = AGRICULTURE_PDF_COLUMNS.slice(0, 4).reduce((sum, item) => sum + item.width, 0);
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
    const column = AGRICULTURE_PDF_COLUMNS[index + 4];
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
      "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches agricoles de la période. Renseignez campagne, parcelle et type de champ pour alimenter le suivi.",
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
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#bbf7d0")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`AMCCO - Rapport agricole | ${periodLabel}`, margin, pageHeight - 32, {
      width: 300
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
  doc.restore();
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
}

function buildEmptyGeneralStoreOperationsReport(filters: ReportPeriodFilter): GeneralStoreOperationsReport {
  return {
    periodLabel: toGeneralStorePeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      departmentsCount: 0,
      productFamiliesCount: 0,
      itemsCount: 0,
      soldQuantity: 0,
      purchaseQuantity: 0,
      returnQuantity: 0,
      adjustmentQuantity: 0,
      transferQuantity: 0,
      salesAmount: "0.00",
      purchaseAmount: "0.00",
      returnAmount: "0.00",
      discountAmount: "0.00",
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

const GENERAL_STORE_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "RAYON", width: 54, align: "left" },
  { label: "FAMILLE", width: 50, align: "left" },
  { label: "ARTICLE", width: 52, align: "left" },
  { label: "REF", width: 38, align: "left" },
  { label: "VTE", width: 32, align: "right" },
  { label: "ACH", width: 32, align: "right" },
  { label: "RET", width: 30, align: "right" },
  { label: "CA", width: 49, align: "right" },
  { label: "COÛT", width: 49, align: "right" },
  { label: "NET", width: 49, align: "right" },
  { label: "MARGE", width: 39, align: "right" },
  { label: "BLQ", width: 22, align: "right" }
];

function drawGeneralStoreReportHeader(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 92;
  const centerWidth = pageWidth - margin * 2 - 184;

  doc.save();
  doc.roundedRect(margin, 22, 86, 58, 6).fill("#eef2ff");
  doc.roundedRect(margin, 22, 86, 58, 6).strokeColor("#4338ca").lineWidth(1).stroke();
  doc.rect(margin + 16, 45, 54, 18).fill("#4f46e5");
  doc.rect(margin + 20, 34, 14, 11).fill("#818cf8");
  doc.rect(margin + 38, 29, 14, 16).fill("#818cf8");
  doc.rect(margin + 56, 37, 10, 8).fill("#818cf8");
  doc.moveTo(margin + 14, 64).lineTo(margin + 72, 64).strokeColor("#4338ca").lineWidth(2).stroke();
  doc.restore();

  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(15).text(GENERAL_STORE_REPORT_BRANDING.title, centerX, 22, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#3730a3").font("Helvetica").fontSize(9.2).text(GENERAL_STORE_REPORT_BRANDING.agency, centerX, 42, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#d21f1f").font("Helvetica-Bold").fontSize(11).text(`"${GENERAL_STORE_REPORT_BRANDING.brand}"`, centerX, 55, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(8.5).text(`${GENERAL_STORE_REPORT_BRANDING.fiscal}     ${GENERAL_STORE_REPORT_BRANDING.phone}`, centerX, 69, {
    width: centerWidth,
    align: "center"
  });
  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(8.2).text(GENERAL_STORE_REPORT_BRANDING.subtitle, centerX, 82, {
    width: centerWidth,
    align: "center"
  });
  doc.moveTo(margin, 100).lineTo(pageWidth - margin, 100).strokeColor("#4f46e5").lineWidth(2).stroke();
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("SUIVI DES OPERATIONS MAGASIN PAR RAYON", margin, 114, {
    width: pageWidth - margin * 2,
    align: "center"
  });
  doc.y = 140;
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
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Secteur", margin + 205, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Magasins", margin + 205, y + 21, { width: 140 });
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

function drawGeneralStoreMetricCards(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    { label: "Rayons / articles", value: `${formatPdfNumber(report.totals.departmentsCount)} | ${formatPdfNumber(report.totals.itemsCount)}` },
    { label: "Ventes", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Achats", value: formatPdfMoney(report.totals.purchaseAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#eef2ff");
    doc.rect(x, y, cardWidth, 45).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 8, y + 8, { width: cardWidth - 16 });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11.2).text(metric.value, x + 8, y + 23, { width: cardWidth - 16 });
  });
  doc.y = y + 60;
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text(
    `Quantités: ventes ${formatPdfNumber(report.totals.soldQuantity, 2)} | achats ${formatPdfNumber(report.totals.purchaseQuantity, 2)} | retours ${formatPdfNumber(report.totals.returnQuantity, 2)} | remises ${formatPdfMoney(report.totals.discountAmount)} | marge ${formatPdfMoney(report.totals.grossMargin)} (${formatPdfNumber(report.totals.marginRate, 1)}%).`,
    margin,
    doc.y - 8,
    { width: pageWidth - margin * 2, align: "center" }
  );
  doc.moveDown(0.8);
}

function drawGeneralStoreTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of GENERAL_STORE_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#e0e7ff",
      font: "Helvetica-Bold",
      fontSize: 5.55
    });
    x += column.width;
  }
  return y + 22;
}

function drawGeneralStoreDataRow(
  doc: PDFKit.PDFDocument,
  row: GeneralStoreOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.department, 12), align: "left" as const },
    { value: truncatePdfText(row.productFamily, 11), align: "left" as const },
    { value: truncatePdfText(row.itemName, 11), align: "left" as const },
    { value: truncatePdfText(row.skuRef, 8), align: "left" as const },
    { value: formatPdfNumber(row.soldQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.purchaseQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.returnQuantity, 1), align: "right" as const },
    { value: formatPdfMoney(row.salesAmount), align: "right" as const },
    { value: formatPdfMoney(row.purchaseAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.marginRate, 0)}%`, align: "right" as const },
    { value: formatPdfNumber(row.blockedTasksCount), align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = GENERAL_STORE_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.25
    });
    x += column.width;
  });
  return y + 20;
}

function drawGeneralStoreTotalsRow(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport, y: number): number {
  const firstColumnsWidth = GENERAL_STORE_PDF_COLUMNS.slice(0, 4).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfNumber(report.totals.soldQuantity, 1),
    formatPdfNumber(report.totals.purchaseQuantity, 1),
    formatPdfNumber(report.totals.returnQuantity, 1),
    formatPdfMoney(report.totals.salesAmount),
    formatPdfMoney(report.totals.purchaseAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.marginRate, 0)}%`,
    formatPdfNumber(report.totals.blockedTasksCount)
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = GENERAL_STORE_PDF_COLUMNS[index + 4];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#eef2ff",
      font: "Helvetica-Bold",
      fontSize: 5.3
    });
    x += column.width;
  }
  return y + 22;
}

function drawGeneralStoreEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#eef2ff");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#c7d2fe").lineWidth(0.8).stroke();
  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(11).text("Aucune opération magasin reportable", margin + 14, y + 16, {
    width: pageWidth - margin * 2 - 28
  });
  doc.fillColor("#3730a3").font("Helvetica").fontSize(9.2).text(
    "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches Magasins de la période. Renseignez rayon, famille, article, référence, quantité et caisse pour alimenter le suivi.",
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
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawGeneralStoreReportHeader(doc, report);
  }
  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(10.5).text("Synthèse par rayon, famille et article", PDF_PAGE_MARGIN, doc.y, {
    width: doc.page.width - PDF_PAGE_MARGIN * 2
  });
  doc.moveDown(0.4);
  let y = drawGeneralStoreTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawGeneralStoreReportHeader(doc, report);
      y = drawGeneralStoreTableHeader(doc, doc.y);
    }
    y = drawGeneralStoreDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawGeneralStoreReportHeader(doc, report);
    y = drawGeneralStoreTableHeader(doc, doc.y);
  }
  doc.y = drawGeneralStoreTotalsRow(doc, report, y) + 14;
}

function drawGeneralStoreBreakdown(doc: PDFKit.PDFDocument, report: GeneralStoreOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawGeneralStoreReportHeader(doc, report);
  }

  doc.fillColor("#312e81").font("Helvetica-Bold").fontSize(12).text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y, {
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
      fill: "#e0e7ff",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawGeneralStoreReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#e0e7ff",
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

function drawGeneralStorePdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
  doc.moveTo(margin, pageHeight - 44).lineTo(pageWidth - margin, pageHeight - 44).strokeColor("#c7d2fe").lineWidth(1).stroke();
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`AMCCO - Rapport magasins | ${periodLabel}`, margin, pageHeight - 32, {
    width: 330
  });
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
    width: 80,
    align: "right"
  });
  doc.restore();
}

function renderGeneralStoreReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.generalStoreOperationsReport ?? buildEmptyGeneralStoreOperationsReport(filters);

  drawGeneralStoreReportHeader(doc, report);
  drawGeneralStoreMetadataStrip(doc, report, filters, overview.generatedAt);
  drawGeneralStoreMetricCards(doc, report);
  drawGeneralStoreOperationsTable(doc, report);
  drawGeneralStoreBreakdown(doc, report);
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
    "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches Alimentation de la période. Renseignez famille, produit, lot, quantité et zone pour alimenter le suivi.",
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

  doc.save();
  doc.moveTo(margin, pageHeight - 44).lineTo(pageWidth - margin, pageHeight - 44).strokeColor("#bbf7d0").lineWidth(1).stroke();
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`AMCCO - Rapport alimentation | ${periodLabel}`, margin, pageHeight - 32, {
    width: 330
  });
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
    width: 80,
    align: "right"
  });
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
}

function buildEmptyRentalOperationsReport(filters: ReportPeriodFilter): RentalOperationsReport {
  return {
    periodLabel: toRentalPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      propertiesCount: 0,
      unitsCount: 0,
      tenantsCount: 0,
      rentPaymentsCount: 0,
      rentAmount: "0.00",
      depositAmount: "0.00",
      serviceChargeAmount: "0.00",
      maintenanceAmount: "0.00",
      propertyExpenseAmount: "0.00",
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

const RENTAL_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "BIEN", width: 56, align: "left" },
  { label: "LOT", width: 42, align: "left" },
  { label: "LOCATAIRE", width: 56, align: "left" },
  { label: "LOYERS", width: 50, align: "right" },
  { label: "CAUTION", width: 46, align: "right" },
  { label: "CHARGES", width: 46, align: "right" },
  { label: "MAINT.", width: 46, align: "right" },
  { label: "DEP.", width: 48, align: "right" },
  { label: "NET", width: 52, align: "right" },
  { label: "EXEC.%", width: 33, align: "right" },
  { label: "BLQ", width: 20, align: "right" }
];

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
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 118;
  const centerWidth = pageWidth - margin * 2 - 220;

  drawRentalPropertyMark(doc, margin, 16);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(RENTAL_REPORT_BRANDING.title, centerX, 22, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#0f766e")
    .font("Helvetica")
    .fontSize(9.2)
    .text(RENTAL_REPORT_BRANDING.agency, centerX, 42, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`"${RENTAL_REPORT_BRANDING.brand}"`, centerX, 55, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(`${RENTAL_REPORT_BRANDING.fiscal}     ${RENTAL_REPORT_BRANDING.phone}`, centerX, 69, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(RENTAL_REPORT_BRANDING.subtitle, centerX, 82, {
      width: centerWidth,
      align: "center"
    });
  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#14b8a6")
    .lineWidth(2)
    .stroke();
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SUIVI DES OPERATIONS LOCATIVES PAR BIEN", margin, 114, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 140;
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

  doc.roundedRect(margin, y, width, 42, 4).fill("#ecfeff");
  doc.rect(margin, y, width, 42).strokeColor("#99f6e4").lineWidth(0.8).stroke();
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Période", margin + 10, y + 8, { width: 155 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text(period, margin + 10, y + 21, { width: 175 });
  doc.fillColor("#486581").font("Helvetica").fontSize(8.8).text("Secteur", margin + 205, y + 8, { width: 120 });
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10).text("Location immobilière", margin + 205, y + 21, { width: 170 });
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

function drawRentalMetricCards(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "Biens / lots",
      value: `${formatPdfNumber(report.totals.propertiesCount)} | ${formatPdfNumber(report.totals.unitsCount)}`
    },
    { label: "Loyers", value: formatPdfMoney(report.totals.rentAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.cashOutAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#ecfeff");
    doc.rect(x, y, cardWidth, 45).strokeColor("#99f6e4").lineWidth(0.8).stroke();
    doc.fillColor("#486581").font("Helvetica").fontSize(8.3).text(metric.label, x + 8, y + 8, {
      width: cardWidth - 16
    });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11.2).text(metric.value, x + 8, y + 23, {
      width: cardWidth - 16
    });
  });
  doc.y = y + 60;
  doc
    .fillColor("#486581")
    .font("Helvetica")
    .fontSize(8.8)
    .text(
      `Locataires: ${formatPdfNumber(report.totals.tenantsCount)} | cautions ${formatPdfMoney(report.totals.depositAmount)} | charges ${formatPdfMoney(report.totals.serviceChargeAmount)} | maintenance ${formatPdfMoney(report.totals.maintenanceAmount)} | tâches ${formatPdfNumber(report.totals.doneTasksCount)} terminées, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquées.`,
      margin,
      doc.y - 8,
      {
        width: pageWidth - margin * 2,
        align: "center"
      }
    );
  doc.moveDown(0.8);
}

function drawRentalTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of RENTAL_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#ccfbf1",
      font: "Helvetica-Bold",
      fontSize: 5.8
    });
    x += column.width;
  }
  return y + 22;
}

function drawRentalDataRow(
  doc: PDFKit.PDFDocument,
  row: RentalOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: truncatePdfText(row.propertyRef, 12), align: "left" as const },
    { value: truncatePdfText(row.unitRef, 9), align: "left" as const },
    { value: truncatePdfText(row.tenantRef, 12), align: "left" as const },
    { value: formatPdfMoney(row.rentAmount), align: "right" as const },
    { value: formatPdfMoney(row.depositAmount), align: "right" as const },
    { value: formatPdfMoney(row.serviceChargeAmount), align: "right" as const },
    { value: formatPdfMoney(row.maintenanceAmount), align: "right" as const },
    { value: formatPdfMoney(row.propertyExpenseAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const },
    { value: formatPdfNumber(row.blockedTasksCount), align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = RENTAL_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.55
    });
    x += column.width;
  });
  return y + 20;
}

function drawRentalTotalsRow(doc: PDFKit.PDFDocument, report: RentalOperationsReport, y: number): number {
  const firstColumnsWidth = RENTAL_PDF_COLUMNS.slice(0, 3).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    formatPdfMoney(report.totals.rentAmount),
    formatPdfMoney(report.totals.depositAmount),
    formatPdfMoney(report.totals.serviceChargeAmount),
    formatPdfMoney(report.totals.maintenanceAmount),
    formatPdfMoney(report.totals.propertyExpenseAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`,
    formatPdfNumber(report.totals.blockedTasksCount)
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = RENTAL_PDF_COLUMNS[index + 3];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#ecfeff",
      font: "Helvetica-Bold",
      fontSize: 5.55
    });
    x += column.width;
  }
  return y + 22;
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
    .text("Aucune opération locative reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#0f766e")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches Location de la période. Renseignez bien, lot, locataire et bail pour alimenter le suivi.",
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
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawRentalReportHeader(doc, report);
  }
  doc
    .fillColor("#115e59")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Synthèse par bien, lot et locataire", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawRentalTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawRentalReportHeader(doc, report);
      y = drawRentalTableHeader(doc, doc.y);
    }
    y = drawRentalDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawRentalReportHeader(doc, report);
    y = drawRentalTableHeader(doc, doc.y);
  }
  doc.y = drawRentalTotalsRow(doc, report, y) + 14;
}

function drawRentalBreakdown(doc: PDFKit.PDFDocument, report: RentalOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawRentalReportHeader(doc, report);
  }

  doc
    .fillColor("#115e59")
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
      fill: "#ccfbf1",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawRentalReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#ccfbf1",
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

function drawRentalPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#99f6e4")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`AMCCO - Rapport location immobilière | ${periodLabel}`, margin, pageHeight - 32, {
      width: 330
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
  doc.restore();
}

function renderRentalReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.rentalOperationsReport ?? buildEmptyRentalOperationsReport(filters);

  drawRentalReportHeader(doc, report);
  drawRentalMetadataStrip(doc, report, filters, overview.generatedAt);
  drawRentalMetricCards(doc, report);
  drawRentalOperationsTable(doc, report);
  drawRentalBreakdown(doc, report);
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
    "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches Hôtellerie de la période. Renseignez réservation, chambre, service, nuitées et client pour alimenter le suivi.",
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

  doc.save();
  doc.moveTo(margin, pageHeight - 44).lineTo(pageWidth - margin, pageHeight - 44).strokeColor("#bae6fd").lineWidth(1).stroke();
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`AMCCO - Rapport hôtellerie | ${periodLabel}`, margin, pageHeight - 32, {
    width: 330
  });
  doc.fillColor("#627d98").font("Helvetica").fontSize(8.5).text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
    width: 80,
    align: "right"
  });
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
}

function buildEmptyWaterOperationsReport(filters: ReportPeriodFilter): WaterOperationsReport {
  return {
    periodLabel: toDisplayPeriodLabel(filters),
    rows: [],
    operationRows: [],
    totals: {
      facilitiesCount: 0,
      zonesCount: 0,
      producedVolumeM3: 0,
      billedVolumeM3: 0,
      waterRevenue: "0.00",
      bulkSaleAmount: "0.00",
      connectionAmount: "0.00",
      subsidyAmount: "0.00",
      treatmentCost: "0.00",
      energyCost: "0.00",
      maintenanceCost: "0.00",
      qualityCost: "0.00",
      repairCost: "0.00",
      supplierPaymentAmount: "0.00",
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInAmount: "0.00",
      cashOutAmount: "0.00",
      netAmount: "0.00",
      lossRate: 0,
      executionRate: 0,
      currency: "XOF"
    }
  };
}

const WATER_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "SITE", width: 54, align: "left" },
  { label: "ZONE", width: 48, align: "left" },
  { label: "LIGNE", width: 50, align: "left" },
  { label: "PROD. M3", width: 45, align: "right" },
  { label: "FACT. M3", width: 45, align: "right" },
  { label: "RECETTES", width: 61, align: "right" },
  { label: "DÉPENSES", width: 61, align: "right" },
  { label: "NET", width: 61, align: "right" },
  { label: "PERTES", width: 38, align: "right" },
  { label: "EXEC.", width: 38, align: "right" }
];

function drawWaterReportHeader(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  doc.rect(0, 0, doc.page.width, 120).fill("#eff6ff");
  drawAmccoPdfLogo(doc, margin, 28, 38);
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(WATER_REPORT_BRANDING.title, margin + 48, 29, { width: 290 });
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica")
    .fontSize(8.6)
    .text(WATER_REPORT_BRANDING.subtitle, margin + 48, 50, { width: 310 });
  doc
    .fillColor("#1e40af")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(WATER_REPORT_BRANDING.brand, doc.page.width - margin - 145, 28, {
      width: 145,
      align: "right"
    });
  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(7.4)
    .text(WATER_REPORT_BRANDING.agency, doc.page.width - margin - 210, 44, {
      width: 210,
      align: "right"
    })
    .text(`${WATER_REPORT_BRANDING.fiscal} | ${WATER_REPORT_BRANDING.phone}`, doc.page.width - margin - 210, 62, {
      width: 210,
      align: "right"
    });
  doc
    .roundedRect(margin, 84, doc.page.width - margin * 2, 24, 4)
    .fill("#dbeafe");
  doc
    .fillColor("#1e3a8a")
    .font("Helvetica-Bold")
    .fontSize(8.6)
    .text(`Période: ${report.periodLabel}`, margin + 12, 91, {
      width: doc.page.width - margin * 2 - 24
    });
  doc.y = 138;
}

function drawWaterMetricCards(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  const cards = [
    {
      label: "Sites / zones",
      value: `${formatPdfNumber(report.totals.facilitiesCount)} | ${formatPdfNumber(report.totals.zonesCount)}`
    },
    { label: "Volume facture", value: `${formatPdfNumber(report.totals.billedVolumeM3, 1)} m3` },
    { label: "Recettes eau", value: formatPdfMoney(report.totals.cashInAmount) },
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
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text(card.label.toUpperCase(), x + 8, y + 10, {
      width: width - 16
    });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(card.value, x + 8, y + 28, {
      width: width - 16
    });
  });
  doc.y = y + 70;
  doc
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(8.2)
    .text(
      `Production ${formatPdfNumber(report.totals.producedVolumeM3, 1)} m3 | pertes apparentes ${formatPdfNumber(report.totals.lossRate, 1)}% | qualité ${formatPdfMoney(report.totals.qualityCost)} | maintenance ${formatPdfMoney(report.totals.maintenanceCost)} | réparations ${formatPdfMoney(report.totals.repairCost)} | tâches ${formatPdfNumber(report.totals.doneTasksCount)} terminées, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquées.`,
      margin,
      doc.y,
      { width: doc.page.width - margin * 2 }
    );
  doc.moveDown(1);
}

function drawWaterTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of WATER_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: column.align,
      fill: "#1e3a8a",
      font: "Helvetica-Bold",
      fontSize: 5.8,
      textColor: "#ffffff",
      borderColor: "#1e3a8a"
    });
    x += column.width;
  }
  return y + 18;
}

function drawWaterDataRow(
  doc: PDFKit.PDFDocument,
  row: WaterOperationsReport["rows"][number],
  y: number
): number {
  const values = [
    { value: row.facilityRef, align: "left" as const },
    { value: row.networkZone, align: "left" as const },
    { value: row.productionLine, align: "left" as const },
    { value: formatPdfNumber(row.producedVolumeM3, 1), align: "right" as const },
    { value: formatPdfNumber(row.billedVolumeM3, 1), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.lossRate, 0)}%`, align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  for (let index = 0; index < values.length; index += 1) {
    const column = WATER_PDF_COLUMNS[index];
    drawPdfTableCell(doc, values[index].value, x, y, column.width, 20, {
      align: values[index].align,
      fontSize: 5.8,
      borderColor: "#bfdbfe"
    });
    x += column.width;
  }
  return y + 20;
}

function drawWaterTotalsRow(doc: PDFKit.PDFDocument, report: WaterOperationsReport, y: number): number {
  const values = [
    "TOTAL",
    "",
    "",
    formatPdfNumber(report.totals.producedVolumeM3, 1),
    formatPdfNumber(report.totals.billedVolumeM3, 1),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.lossRate, 0)}%`,
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  let x = PDF_PAGE_MARGIN;
  for (let index = 0; index < values.length; index += 1) {
    const column = WATER_PDF_COLUMNS[index];
    drawPdfTableCell(doc, values[index], x, y, column.width, 20, {
      align: index < 3 ? "left" : "right",
      fill: "#dbeafe",
      font: "Helvetica-Bold",
      fontSize: 5.8,
      borderColor: "#93c5fd"
    });
    x += column.width;
  }
  return y + 20;
}

function drawWaterOperationsTable(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  if (report.rows.length === 0) {
    doc.roundedRect(PDF_PAGE_MARGIN, doc.y, doc.page.width - PDF_PAGE_MARGIN * 2, 64, 4).fill("#eff6ff");
    doc
      .fillColor("#1e3a8a")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Aucune opération eau potable reportable", PDF_PAGE_MARGIN + 14, doc.y + 16);
    doc.y += 84;
    return;
  }

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10.5).text("Synthèse par site, zone et ligne exploitation", PDF_PAGE_MARGIN, doc.y);
  doc.moveDown(0.4);
  let y = drawWaterTableHeader(doc, doc.y);
  for (const row of report.rows) {
    if (y + 42 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawWaterReportHeader(doc, report);
      y = drawWaterTableHeader(doc, doc.y);
    }
    y = drawWaterDataRow(doc, row, y);
  }
  y = drawWaterTotalsRow(doc, report, y);
  doc.y = y + 18;
}

function drawWaterBreakdown(doc: PDFKit.PDFDocument, report: WaterOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }
  if (needsPdfPageBreak(doc, 88)) {
    doc.addPage();
    drawWaterReportHeader(doc, report);
  }
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10.5).text("Ventilation par type d'opération", PDF_PAGE_MARGIN, doc.y);
  doc.moveDown(0.4);
  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 168, align: "left" },
    { label: "TRANS.", width: 52, align: "right" },
    { label: "TACHES", width: 52, align: "right" },
    { label: "RECETTES", width: 76, align: "right" },
    { label: "DÉPENSES", width: 76, align: "right" },
    { label: "NET", width: 76, align: "right" }
  ];
  let y = doc.y;
  let x = PDF_PAGE_MARGIN;
  for (const column of columns) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
      align: column.align,
      fill: "#1e40af",
      font: "Helvetica-Bold",
      fontSize: 6,
      textColor: "#ffffff",
      borderColor: "#1e40af"
    });
    x += column.width;
  }
  y += 18;
  for (const row of report.operationRows.slice(0, 16)) {
    x = PDF_PAGE_MARGIN;
    const values = [
      { value: row.operationLabel, align: "left" as const },
      { value: formatPdfNumber(row.transactionsCount), align: "right" as const },
      { value: formatPdfNumber(row.tasksCount), align: "right" as const },
      { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
      { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
      { value: formatPdfMoney(row.netAmount), align: "right" as const }
    ];
    for (let index = 0; index < values.length; index += 1) {
      drawPdfTableCell(doc, values[index].value, x, y, columns[index].width, 18, {
        align: values[index].align,
        fontSize: 6,
        borderColor: "#bfdbfe"
      });
      x += columns[index].width;
    }
    y += 18;
  }
  doc.y = y + 12;
}

function drawWaterPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  drawPdfBrandingFrame(doc, pageNumber, totalPages, periodLabel);
}

function renderWaterReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.waterOperationsReport ?? buildEmptyWaterOperationsReport(filters);
  drawWaterReportHeader(doc, report);
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
  drawPdfBrandingFrame(doc, pageNumber, totalPages, periodLabel);
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
}

function buildEmptyBtpOperationsReport(filters: ReportPeriodFilter): BtpOperationsReport {
  return {
    periodLabel: toBtpPeriodLabel(filters, []),
    rows: [],
    operationRows: [],
    totals: {
      projectsCount: 0,
      workPackagesCount: 0,
      progressPercent: 0,
      materialQuantity: 0,
      laborDays: 0,
      equipmentHours: 0,
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

const BTP_PDF_COLUMNS: PdfTableColumn[] = [
  { label: "CHANTIER", width: 55, align: "left" },
  { label: "LOT", width: 50, align: "left" },
  { label: "CLIENT/SITE", width: 62, align: "left" },
  { label: "AV.%", width: 34, align: "right" },
  { label: "MAT.", width: 34, align: "right" },
  { label: "MO J/H", width: 36, align: "right" },
  { label: "ENG.H", width: 34, align: "right" },
  { label: "RECETTES", width: 56, align: "right" },
  { label: "DÉPENSES", width: 56, align: "right" },
  { label: "NET", width: 54, align: "right" },
  { label: "EXEC.%", width: 34, align: "right" }
];

function drawBtpSiteMark(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x + 3, y + 18, 110, 52, 6).fill("#fef3c7");
  doc.roundedRect(x + 3, y + 18, 110, 52, 6).strokeColor("#b45309").lineWidth(0.9).stroke();

  doc.rect(x + 14, y + 51, 86, 11).fill("#d97706");
  doc.rect(x + 20, y + 42, 20, 9).fill("#f59e0b");
  doc.rect(x + 44, y + 35, 20, 16).fill("#f59e0b");
  doc.rect(x + 68, y + 28, 20, 23).fill("#f59e0b");
  doc.rect(x + 92, y + 21, 6, 41).fill("#374151");

  doc.strokeColor("#111827").lineWidth(1.1);
  for (let index = 0; index < 5; index += 1) {
    const barX = x + 18 + index * 18;
    doc.moveTo(barX, y + 25).lineTo(barX + 18, y + 62).stroke();
  }

  doc
    .moveTo(x + 72, y + 14)
    .lineTo(x + 102, y + 14)
    .lineTo(x + 102, y + 22)
    .strokeColor("#374151")
    .lineWidth(2)
    .stroke();
  doc.rect(x + 98, y + 21, 8, 8).fill("#64748b");
  doc.restore();
}

function drawBtpReportHeader(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 118;
  const centerWidth = pageWidth - margin * 2 - 220;

  drawBtpSiteMark(doc, margin, 16);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(BTP_REPORT_BRANDING.title, centerX, 22, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#92400e")
    .font("Helvetica")
    .fontSize(9.2)
    .text(BTP_REPORT_BRANDING.agency, centerX, 42, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`"${BTP_REPORT_BRANDING.brand}"`, centerX, 55, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(`${BTP_REPORT_BRANDING.fiscal}     ${BTP_REPORT_BRANDING.phone}`, centerX, 69, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(8.8)
    .text(BTP_REPORT_BRANDING.subtitle, centerX, 82, {
      width: centerWidth,
      align: "center"
    });
  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#d97706")
    .lineWidth(2)
    .stroke();
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SUIVI DES OPERATIONS BTP PAR CHANTIER", margin, 114, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 140;
}

function drawBtpMetadataStrip(
  doc: PDFKit.PDFDocument,
  report: BtpOperationsReport,
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

  doc.roundedRect(margin, y, width, 42, 4).fill("#fff7ed");
  doc.rect(margin, y, width, 42).strokeColor("#fed7aa").lineWidth(0.8).stroke();
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
    .text("BTP", margin + 205, y + 21, { width: 140 });
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

function drawBtpMetricCards(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const gap = 8;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const y = doc.y;
  const metrics = [
    {
      label: "Chantiers / lots",
      value: `${formatPdfNumber(report.totals.projectsCount)} | ${formatPdfNumber(report.totals.workPackagesCount)}`
    },
    { label: "Recettes", value: formatPdfMoney(report.totals.cashInAmount) },
    { label: "Dépenses", value: formatPdfMoney(report.totals.cashOutAmount) },
    { label: "Solde net", value: formatPdfMoney(report.totals.netAmount) }
  ];

  metrics.forEach((metric, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 45, 4).fill("#fff7ed");
    doc.rect(x, y, cardWidth, 45).strokeColor("#fed7aa").lineWidth(0.8).stroke();
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
      `Avancement moyen: ${formatPdfNumber(report.totals.progressPercent, 1)}% | matériaux ${formatPdfNumber(report.totals.materialQuantity, 2)} | main-d'oeuvre ${formatPdfNumber(report.totals.laborDays, 2)} j/h | engins ${formatPdfNumber(report.totals.equipmentHours, 2)} h | tâches ${formatPdfNumber(report.totals.doneTasksCount)} terminées, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquées.`,
      margin,
      doc.y - 8,
      {
        width: pageWidth - margin * 2,
        align: "center"
      }
    );
  doc.moveDown(0.8);
}

function drawBtpTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = PDF_PAGE_MARGIN;
  for (const column of BTP_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#ffedd5",
      font: "Helvetica-Bold",
      fontSize: 5.9
    });
    x += column.width;
  }
  return y + 22;
}

function drawBtpDataRow(
  doc: PDFKit.PDFDocument,
  row: BtpOperationsReport["rows"][number],
  y: number
): number {
  const clientSite = `${row.clientRef} / ${row.siteLocation}`;
  const values = [
    { value: truncatePdfText(row.projectRef, 12), align: "left" as const },
    { value: truncatePdfText(row.workPackage, 11), align: "left" as const },
    { value: truncatePdfText(clientSite, 15), align: "left" as const },
    { value: `${formatPdfNumber(row.progressPercent, 0)}%`, align: "right" as const },
    { value: formatPdfNumber(row.materialQuantity, 1), align: "right" as const },
    { value: formatPdfNumber(row.laborDays, 1), align: "right" as const },
    { value: formatPdfNumber(row.equipmentHours, 1), align: "right" as const },
    { value: formatPdfMoney(row.cashInAmount), align: "right" as const },
    { value: formatPdfMoney(row.cashOutAmount), align: "right" as const },
    { value: formatPdfMoney(row.netAmount), align: "right" as const },
    { value: `${formatPdfNumber(row.executionRate, 0)}%`, align: "right" as const }
  ];
  let x = PDF_PAGE_MARGIN;
  values.forEach((item, index) => {
    const column = BTP_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 5.65
    });
    x += column.width;
  });
  return y + 20;
}

function drawBtpTotalsRow(doc: PDFKit.PDFDocument, report: BtpOperationsReport, y: number): number {
  const firstColumnsWidth = BTP_PDF_COLUMNS.slice(0, 3).reduce((sum, item) => sum + item.width, 0);
  let x = PDF_PAGE_MARGIN;
  drawPdfTableCell(doc, "TOTAL", x, y, firstColumnsWidth, 22, {
    align: "center",
    fill: "#f8fafc",
    font: "Helvetica-Bold",
    fontSize: 7
  });
  x += firstColumnsWidth;

  const values = [
    `${formatPdfNumber(report.totals.progressPercent, 0)}%`,
    formatPdfNumber(report.totals.materialQuantity, 1),
    formatPdfNumber(report.totals.laborDays, 1),
    formatPdfNumber(report.totals.equipmentHours, 1),
    formatPdfMoney(report.totals.cashInAmount),
    formatPdfMoney(report.totals.cashOutAmount),
    formatPdfMoney(report.totals.netAmount),
    `${formatPdfNumber(report.totals.executionRate, 0)}%`
  ];
  for (let index = 0; index < values.length; index += 1) {
    const column = BTP_PDF_COLUMNS[index + 3];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#fff7ed",
      font: "Helvetica-Bold",
      fontSize: 5.7
    });
    x += column.width;
  }
  return y + 22;
}

function drawBtpEmptyState(doc: PDFKit.PDFDocument): void {
  const margin = PDF_PAGE_MARGIN;
  const pageWidth = doc.page.width;
  const y = doc.y;

  doc.roundedRect(margin, y, pageWidth - margin * 2, 72, 4).fill("#fff7ed");
  doc.rect(margin, y, pageWidth - margin * 2, 72).strokeColor("#fed7aa").lineWidth(0.8).stroke();
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Aucune opération BTP reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#92400e")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches BTP de la période. Renseignez chantier, lot, client et avancement pour alimenter le suivi.",
      margin + 14,
      y + 34,
      {
        width: pageWidth - margin * 2 - 28
      }
    );
  doc.y = y + 88;
}

function drawBtpOperationsTable(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  if (report.rows.length === 0) {
    drawBtpEmptyState(doc);
    return;
  }

  const tableBottom = doc.page.height - PDF_CONTENT_BOTTOM;
  if (needsPdfPageBreak(doc, 78)) {
    doc.addPage();
    drawBtpReportHeader(doc, report);
  }
  doc
    .fillColor("#78350f")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text("Synthèse par chantier, lot et client", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);
  let y = drawBtpTableHeader(doc, doc.y);

  for (const row of report.rows) {
    if (y + 20 + 22 > tableBottom) {
      doc.addPage();
      drawBtpReportHeader(doc, report);
      y = drawBtpTableHeader(doc, doc.y);
    }
    y = drawBtpDataRow(doc, row, y);
  }

  if (y + 22 > tableBottom) {
    doc.addPage();
    drawBtpReportHeader(doc, report);
    y = drawBtpTableHeader(doc, doc.y);
  }
  doc.y = drawBtpTotalsRow(doc, report, y) + 14;
}

function drawBtpBreakdown(doc: PDFKit.PDFDocument, report: BtpOperationsReport): void {
  if (report.operationRows.length === 0) {
    return;
  }

  if (needsPdfPageBreak(doc, 62)) {
    doc.addPage();
    drawBtpReportHeader(doc, report);
  }

  doc
    .fillColor("#78350f")
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
      fill: "#ffedd5",
      font: "Helvetica-Bold",
      fontSize: 7.5
    });
    x += column.width;
  }
  y += 20;

  for (const row of report.operationRows) {
    if (y + 19 > doc.page.height - PDF_CONTENT_BOTTOM) {
      doc.addPage();
      drawBtpReportHeader(doc, report);
      y = doc.y;
      x = PDF_PAGE_MARGIN;
      for (const column of columns) {
        drawPdfTableCell(doc, column.label, x, y, column.width, 18, {
          align: "center",
          fill: "#ffedd5",
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

function drawBtpPdfFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  periodLabel: string
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#fed7aa")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`AMCCO - Rapport BTP | ${periodLabel}`, margin, pageHeight - 32, {
      width: 300
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
  doc.restore();
}

function renderBtpReportsPdf(
  doc: PDFKit.PDFDocument,
  overview: ReportsOverview,
  filters: ReportPeriodFilter
): void {
  const report = overview.btpOperationsReport ?? buildEmptyBtpOperationsReport(filters);

  drawBtpReportHeader(doc, report);
  drawBtpMetadataStrip(doc, report, filters, overview.generatedAt);
  drawBtpMetricCards(doc, report);
  drawBtpOperationsTable(doc, report);
  drawBtpBreakdown(doc, report);
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
  const pageWidth = doc.page.width;
  const margin = PDF_PAGE_MARGIN;
  const centerX = margin + 122;
  const centerWidth = pageWidth - margin * 2 - 224;

  drawFishFarmingPondMark(doc, margin, 16);
  drawAmccoPdfLogo(doc, pageWidth - margin - 72, 14, 72);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16.5)
    .text(FISH_FARMING_REPORT_BRANDING.title, centerX, 22, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#0369a1")
    .font("Helvetica")
    .fontSize(9.2)
    .text(FISH_FARMING_REPORT_BRANDING.agency, centerX, 42, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#d21f1f")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`"${FISH_FARMING_REPORT_BRANDING.brand}"`, centerX, 55, {
      width: centerWidth,
      align: "center"
    });
  doc
    .fillColor("#0f766e")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(FISH_FARMING_REPORT_BRANDING.subtitle, centerX, 69, {
      width: centerWidth,
      align: "center"
    });
  doc
    .moveTo(margin, 100)
    .lineTo(pageWidth - margin, 100)
    .strokeColor("#0284c7")
    .lineWidth(2)
    .stroke();
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SUIVI DES OPERATIONS PISCICOLES PAR BASSIN", margin, 114, {
      width: pageWidth - margin * 2,
      align: "center"
    });
  doc.y = 140;
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
  for (const column of FISH_FARMING_PDF_COLUMNS) {
    drawPdfTableCell(doc, column.label, x, y, column.width, 22, {
      align: "center",
      fill: "#e0f2fe",
      font: "Helvetica-Bold",
      fontSize: 6.2
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
    const column = FISH_FARMING_PDF_COLUMNS[index];
    drawPdfTableCell(doc, item.value, x, y, column.width, 20, {
      align: item.align,
      fontSize: 6.1
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
  const firstColumnsWidth = FISH_FARMING_PDF_COLUMNS.slice(0, 3).reduce((sum, item) => sum + item.width, 0);
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
    const column = FISH_FARMING_PDF_COLUMNS[index + 3];
    drawPdfTableCell(doc, values[index], x, y, column.width, 22, {
      align: "right",
      fill: "#f0f9ff",
      font: "Helvetica-Bold",
      fontSize: 6.1
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
      "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches piscicoles de la période. Renseignez bassin, cycle et espèce pour alimenter le suivi.",
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
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = PDF_PAGE_MARGIN;

  doc.save();
  doc
    .moveTo(margin, pageHeight - 44)
    .lineTo(pageWidth - margin, pageHeight - 44)
    .strokeColor("#bae6fd")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`AMCCO - Rapport pisciculture | ${periodLabel}`, margin, pageHeight - 32, {
      width: 320
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
  doc.restore();
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
      "Le rapport reprend les transactions XOF soumises ou approuvées et les tâches d'élevage de la période. Renseignez troupeau, lot et espèce pour alimenter le suivi.",
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

  doc.save();
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
      width: 320
    });
  doc
    .fillColor("#627d98")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`Page ${pageNumber} / ${totalPages}`, pageWidth - margin - 80, pageHeight - 32, {
      width: 80,
      align: "right"
    });
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
      extra: `total ${item.totalAmount} ${item.currency} | approuvé ${item.approvedAmount} ${item.currency}`
    });
  }

  for (const item of overview.financeByActivity) {
    rows.push({
      category: "FinanceByActivity",
      item: item.activityCode,
      label: BUSINESS_ACTIVITY_LABELS[item.activityCode],
      value: item.count,
      extra: `total ${item.totalAmount} XOF/DEV | approuvé ${item.approvedAmount} XOF/DEV`
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
      value: overview.hardwareMonthlyReport.totals.salesAmount,
      extra: `quantité ${overview.hardwareMonthlyReport.totals.quantity} | versement ${overview.hardwareMonthlyReport.totals.paymentAmount} XOF | coût ${overview.hardwareMonthlyReport.totals.purchaseAmount} XOF | bénéfice ${overview.hardwareMonthlyReport.totals.grossProfit} XOF | marge ${overview.hardwareMonthlyReport.totals.marginRate}%`
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
      value: overview.generalStoreOperationsReport.totals.netAmount,
      extra: `rayons ${overview.generalStoreOperationsReport.totals.departmentsCount} | familles ${overview.generalStoreOperationsReport.totals.productFamiliesCount} | articles ${overview.generalStoreOperationsReport.totals.itemsCount} | ventes ${overview.generalStoreOperationsReport.totals.salesAmount} XOF | achats ${overview.generalStoreOperationsReport.totals.purchaseAmount} XOF | retours ${overview.generalStoreOperationsReport.totals.returnAmount} XOF | remises ${overview.generalStoreOperationsReport.totals.discountAmount} XOF | marge ${overview.generalStoreOperationsReport.totals.marginRate}% | exécution ${overview.generalStoreOperationsReport.totals.executionRate}%`
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
      extra: `biens ${overview.rentalOperationsReport.totals.propertiesCount} | lots ${overview.rentalOperationsReport.totals.unitsCount} | locataires ${overview.rentalOperationsReport.totals.tenantsCount} | loyers ${overview.rentalOperationsReport.totals.rentAmount} XOF | cautions ${overview.rentalOperationsReport.totals.depositAmount} XOF | charges ${overview.rentalOperationsReport.totals.serviceChargeAmount} XOF | maintenance ${overview.rentalOperationsReport.totals.maintenanceAmount} XOF | recettes ${overview.rentalOperationsReport.totals.cashInAmount} XOF | dépenses ${overview.rentalOperationsReport.totals.cashOutAmount} XOF | exécution ${overview.rentalOperationsReport.totals.executionRate}%`
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
      label: `Eau potable ${overview.waterOperationsReport.periodLabel}`,
      value: overview.waterOperationsReport.totals.netAmount,
      extra: `sites ${overview.waterOperationsReport.totals.facilitiesCount} | zones ${overview.waterOperationsReport.totals.zonesCount} | produit ${overview.waterOperationsReport.totals.producedVolumeM3} m3 | facture ${overview.waterOperationsReport.totals.billedVolumeM3} m3 | recettes ${overview.waterOperationsReport.totals.cashInAmount} XOF | charges ${overview.waterOperationsReport.totals.cashOutAmount} XOF | pertes ${overview.waterOperationsReport.totals.lossRate}% | exécution ${overview.waterOperationsReport.totals.executionRate}%`
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
      extra: `chantiers ${overview.btpOperationsReport.totals.projectsCount} | lots ${overview.btpOperationsReport.totals.workPackagesCount} | avancement ${overview.btpOperationsReport.totals.progressPercent}% | main-d'oeuvre ${overview.btpOperationsReport.totals.laborDays} j/h | engins ${overview.btpOperationsReport.totals.equipmentHours} h | recettes ${overview.btpOperationsReport.totals.cashInAmount} XOF | dépenses ${overview.btpOperationsReport.totals.cashOutAmount} XOF | exécution ${overview.btpOperationsReport.totals.executionRate}%`
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
    approvedTransactionsCount: item.approvedTransactionsCount,
    approvedCashIn: item.approvedCashIn,
    approvedCashOut: item.approvedCashOut,
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
    quantity: item.quantity,
    salesAmount: item.salesAmount,
    paymentAmount: item.paymentAmount,
    purchaseAmount: item.purchaseAmount,
    grossProfit: item.grossProfit,
    marginRate: item.marginRate,
    transactionsCount: item.transactionsCount,
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
    department: item.department,
    productFamily: item.productFamily,
    itemName: item.itemName,
    skuRef: item.skuRef,
    soldQuantity: item.soldQuantity,
    purchaseQuantity: item.purchaseQuantity,
    returnQuantity: item.returnQuantity,
    adjustmentQuantity: item.adjustmentQuantity,
    transferQuantity: item.transferQuantity,
    salesAmount: item.salesAmount,
    purchaseAmount: item.purchaseAmount,
    returnAmount: item.returnAmount,
    discountAmount: item.discountAmount,
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

function buildGeneralStoreOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.generalStoreOperationsReport?.operationRows ?? []).map((item) => ({
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
    propertyRef: item.propertyRef,
    unitRef: item.unitRef,
    tenantRef: item.tenantRef,
    leaseRef: item.leaseRef,
    propertyType: item.propertyType,
    rentPaymentsCount: item.rentPaymentsCount,
    rentAmount: item.rentAmount,
    depositAmount: item.depositAmount,
    serviceChargeAmount: item.serviceChargeAmount,
    maintenanceAmount: item.maintenanceAmount,
    propertyExpenseAmount: item.propertyExpenseAmount,
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

function buildWaterOperationsReportRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.waterOperationsReport?.rows ?? []).map((item) => ({
    facilityRef: item.facilityRef,
    networkZone: item.networkZone,
    productionLine: item.productionLine,
    producedVolumeM3: item.producedVolumeM3,
    billedVolumeM3: item.billedVolumeM3,
    waterRevenue: item.waterRevenue,
    bulkSaleAmount: item.bulkSaleAmount,
    connectionAmount: item.connectionAmount,
    subsidyAmount: item.subsidyAmount,
    treatmentCost: item.treatmentCost,
    energyCost: item.energyCost,
    maintenanceCost: item.maintenanceCost,
    qualityCost: item.qualityCost,
    repairCost: item.repairCost,
    supplierPaymentAmount: item.supplierPaymentAmount,
    transactionsCount: item.transactionsCount,
    tasksCount: item.tasksCount,
    doneTasksCount: item.doneTasksCount,
    openTasksCount: item.openTasksCount,
    blockedTasksCount: item.blockedTasksCount,
    cashInAmount: item.cashInAmount,
    cashOutAmount: item.cashOutAmount,
    netAmount: item.netAmount,
    lossRate: item.lossRate,
    executionRate: item.executionRate,
    currency: item.currency
  }));
}

function buildWaterOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.waterOperationsReport?.operationRows ?? []).map((item) => ({
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
    workPackage: item.workPackage,
    siteLocation: item.siteLocation,
    clientRef: item.clientRef,
    progressPercent: item.progressPercent,
    materialQuantity: item.materialQuantity,
    laborDays: item.laborDays,
    equipmentHours: item.equipmentHours,
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

function buildBtpOperationsBreakdownRows(overview: ReportsOverview): Array<Record<string, unknown>> {
  return (overview.btpOperationsReport?.operationRows ?? []).map((item) => ({
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

function buildActivityHighlightsByCode(
  rows: Array<{
    activityCode: BusinessActivityCode;
    transactionsCount: number;
    submittedTransactionsCount: number;
    totalTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
  }>
) {
  const items = rows.map((row) => [
    row.activityCode,
    buildActivityReportHighlights(row.activityCode, {
      transactionsCount: row.transactionsCount,
      submittedTransactionsCount: row.submittedTransactionsCount,
      totalTasksCount: row.totalTasksCount,
      openTasksCount: row.openTasksCount,
      blockedTasksCount: row.blockedTasksCount
    })
  ]);

  return Object.fromEntries(items) as Partial<Record<BusinessActivityCode, ReturnType<typeof buildActivityReportHighlights>>>;
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

type HardwareMonthlyBucket = {
  date: string;
  designation: string;
  quantity: number;
  salesAmountValue: number;
  paymentAmountValue: number;
  purchaseAmountValue: number;
  grossProfitValue: number;
  transactionsCount: number;
};

function getMetadataNumber(metadata: Record<string, string>, key: string): number {
  return toNumberAmount(metadata[key]);
}

function getHardwareDesignation(metadata: Record<string, string>): string {
  const designation =
    metadata.itemName?.trim() ||
    metadata.designation?.trim() ||
    metadata.productFamily?.trim();
  return designation || "Article quincaillerie";
}

function hasHardwareItemMetadata(metadata: Record<string, string>): boolean {
  return Boolean(
    metadata.itemName?.trim() ||
    metadata.quantity?.trim() ||
    metadata.purchaseUnitPrice?.trim() ||
    metadata.saleUnitPrice?.trim() ||
    metadata.dailyPayment?.trim() ||
    metadata.supplierRef?.trim()
  );
}

function toReportDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toHardwarePeriodLabel(
  filters: ReportPeriodFilter,
  _rows: HardwareMonthlyBucket[]
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

function isHardwareReportableSale(transaction: ReportOperationalTransaction): boolean {
  const operationKind = transaction.metadata.hardwareOperationKind?.trim();
  return (
    transaction.activityCode === "HARDWARE" &&
    transaction.currency === "XOF" &&
    transaction.type === "CASH_IN" &&
    operationKind !== "GLOBAL" &&
    (operationKind === "ITEM_EXIT" || (!operationKind && hasHardwareItemMetadata(transaction.metadata))) &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
}

function buildHardwareMonthlyReport(
  transactions: ReportOperationalTransaction[],
  filters: ReportPeriodFilter
): HardwareMonthlyReport | null {
  if (filters.activityCode && filters.activityCode !== "HARDWARE") {
    return null;
  }

  const hardwareTransactions = transactions.filter(
    (transaction) => transaction.activityCode === "HARDWARE"
  );
  const reportableTransactions = hardwareTransactions.filter(isHardwareReportableSale);
  if (!filters.activityCode && reportableTransactions.length === 0) {
    return null;
  }

  const buckets = new Map<string, HardwareMonthlyBucket>();
  for (const transaction of reportableTransactions) {
    const date = toReportDate(transaction.occurredAt);
    const designation = getHardwareDesignation(transaction.metadata);
    const key = `${date}|${designation}`;
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    const saleUnitPrice = getMetadataNumber(transaction.metadata, "saleUnitPrice");
    const purchaseUnitPrice = getMetadataNumber(transaction.metadata, "purchaseUnitPrice");
    const computedSaleAmount = quantity > 0 && saleUnitPrice > 0
      ? quantity * saleUnitPrice
      : toNumberAmount(transaction.amount);
    const purchaseAmount = quantity > 0 && purchaseUnitPrice > 0
      ? quantity * purchaseUnitPrice
      : 0;
    const paymentAmount =
      getMetadataNumber(transaction.metadata, "dailyPayment") ||
      getMetadataNumber(transaction.metadata, "paymentAmount");
    const grossProfit = computedSaleAmount - purchaseAmount;
    const bucket = buckets.get(key) ?? {
      date,
      designation,
      quantity: 0,
      salesAmountValue: 0,
      paymentAmountValue: 0,
      purchaseAmountValue: 0,
      grossProfitValue: 0,
      transactionsCount: 0
    };

    bucket.quantity += quantity;
    bucket.salesAmountValue += computedSaleAmount;
    bucket.paymentAmountValue += paymentAmount;
    bucket.purchaseAmountValue += purchaseAmount;
    bucket.grossProfitValue += grossProfit;
    bucket.transactionsCount += 1;
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values()).sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    return dateCompare !== 0 ? dateCompare : left.designation.localeCompare(right.designation);
  });
  const totals = rows.reduce(
    (sum, row) => ({
      quantity: sum.quantity + row.quantity,
      salesAmountValue: sum.salesAmountValue + row.salesAmountValue,
      paymentAmountValue: sum.paymentAmountValue + row.paymentAmountValue,
      purchaseAmountValue: sum.purchaseAmountValue + row.purchaseAmountValue,
      grossProfitValue: sum.grossProfitValue + row.grossProfitValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount
    }),
    {
      quantity: 0,
      salesAmountValue: 0,
      paymentAmountValue: 0,
      purchaseAmountValue: 0,
      grossProfitValue: 0,
      transactionsCount: 0
    }
  );

  return {
    periodLabel: toHardwarePeriodLabel(filters, rows),
    rows: rows.map((row) => ({
      date: row.date,
      designation: row.designation,
      quantity: row.quantity,
      salesAmount: toMoneyString(row.salesAmountValue),
      paymentAmount: toMoneyString(row.paymentAmountValue),
      purchaseAmount: toMoneyString(row.purchaseAmountValue),
      grossProfit: toMoneyString(row.grossProfitValue),
      marginRate: toRate(row.grossProfitValue, row.salesAmountValue),
      transactionsCount: row.transactionsCount,
      currency: "XOF" as const
    })),
    totals: {
      quantity: totals.quantity,
      salesAmount: toMoneyString(totals.salesAmountValue),
      paymentAmount: toMoneyString(totals.paymentAmountValue),
      purchaseAmount: toMoneyString(totals.purchaseAmountValue),
      grossProfit: toMoneyString(totals.grossProfitValue),
      marginRate: toRate(totals.grossProfitValue, totals.salesAmountValue),
      transactionsCount: totals.transactionsCount,
      currency: "XOF" as const
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

function isAgricultureReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return (
    transaction.activityCode === "AGRICULTURE" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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

type GeneralStoreReportBucket = {
  department: string;
  productFamily: string;
  itemName: string;
  skuRef: string;
  soldQuantityValue: number;
  purchaseQuantityValue: number;
  returnQuantityValue: number;
  adjustmentQuantityValue: number;
  transferQuantityValue: number;
  salesValue: number;
  purchaseValue: number;
  returnValue: number;
  discountValue: number;
  expenseValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type GeneralStoreOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getGeneralStoreMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getGeneralStoreBucketKey(input: {
  department: string;
  productFamily: string;
  itemName: string;
  skuRef: string;
}): string {
  return [input.department, input.productFamily, input.itemName, input.skuRef].join("|");
}

function getGeneralStoreReportBucket(
  buckets: Map<string, GeneralStoreReportBucket>,
  metadata: Record<string, string>
): GeneralStoreReportBucket {
  const input = {
    department: getGeneralStoreMetadataLabel(metadata, "department", "Rayon non renseigné"),
    productFamily: getGeneralStoreMetadataLabel(metadata, "productFamily", "Famille non renseignée"),
    itemName: getGeneralStoreMetadataLabel(metadata, "itemName", "Article non renseigné"),
    skuRef: getGeneralStoreMetadataLabel(metadata, "skuRef", "Référence non renseignée")
  };
  const key = getGeneralStoreBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: GeneralStoreReportBucket = {
    ...input,
    soldQuantityValue: 0,
    purchaseQuantityValue: 0,
    returnQuantityValue: 0,
    adjustmentQuantityValue: 0,
    transferQuantityValue: 0,
    salesValue: 0,
    purchaseValue: 0,
    returnValue: 0,
    discountValue: 0,
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

function getGeneralStoreOperationBucket(
  buckets: Map<string, GeneralStoreOperationBucket>,
  operationKind: string,
  operationLabel: string
): GeneralStoreOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: GeneralStoreOperationBucket = {
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

function getGeneralStoreTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.storeOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "STORE_SALE" : "STORE_EXPENSE";
}

function getGeneralStoreTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.storeTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toGeneralStoreOperationLabel(operationKind: string): string {
  if (GENERAL_STORE_OPERATION_LABELS[operationKind]) {
    return GENERAL_STORE_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${GENERAL_STORE_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toGeneralStorePeriodLabel(
  filters: ReportPeriodFilter,
  _rows: GeneralStoreReportBucket[]
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

function isGeneralStoreReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return (
    transaction.activityCode === "GENERAL_STORE" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
}

function buildGeneralStoreOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): GeneralStoreOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "GENERAL_STORE") {
    return null;
  }

  const storeTransactions = transactions.filter(isGeneralStoreReportableTransaction);
  const storeTasks = tasks.filter((task) => task.activityCode === "GENERAL_STORE");
  if (!filters.activityCode && storeTransactions.length === 0 && storeTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, GeneralStoreReportBucket>();
  const operationBuckets = new Map<string, GeneralStoreOperationBucket>();

  for (const transaction of storeTransactions) {
    const operationKind = getGeneralStoreTransactionOperationKind(transaction);
    const rowBucket = getGeneralStoreReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    const quantity = getMetadataNumber(transaction.metadata, "quantity");
    rowBucket.transactionsCount += 1;

    if (operationKind === "STORE_SALE") {
      rowBucket.soldQuantityValue += quantity;
      rowBucket.salesValue += amount;
      rowBucket.discountValue += getMetadataNumber(transaction.metadata, "discountAmount");
    }
    if (operationKind === "STOCK_PURCHASE") {
      rowBucket.purchaseQuantityValue += quantity;
      rowBucket.purchaseValue += amount;
    }
    if (operationKind === "CUSTOMER_RETURN") {
      rowBucket.returnQuantityValue += getMetadataNumber(transaction.metadata, "returnQuantity");
      rowBucket.returnValue += amount;
    }
    if (operationKind === "DISCOUNT_ADJUSTMENT") {
      rowBucket.discountValue += amount;
    }
    if (operationKind === "INVENTORY_ADJUSTMENT") {
      rowBucket.adjustmentQuantityValue += getMetadataNumber(transaction.metadata, "adjustmentQuantity");
      rowBucket.expenseValue += amount;
    }
    if (operationKind === "INTERNAL_TRANSFER") {
      rowBucket.transferQuantityValue += quantity;
    }
    if (operationKind === "SUPPLIER_PAYMENT" || operationKind === "STORE_EXPENSE") {
      rowBucket.expenseValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getGeneralStoreOperationBucket(
      operationBuckets,
      operationKind,
      toGeneralStoreOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of storeTasks) {
    const rowBucket = getGeneralStoreReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getGeneralStoreTaskOperationKind(task);
    const operationBucket = getGeneralStoreOperationBucket(
      operationBuckets,
      operationKind,
      toGeneralStoreOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.department.localeCompare(right.department) ||
      left.productFamily.localeCompare(right.productFamily) ||
      left.itemName.localeCompare(right.itemName) ||
      left.skuRef.localeCompare(right.skuRef)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      soldQuantityValue: sum.soldQuantityValue + row.soldQuantityValue,
      purchaseQuantityValue: sum.purchaseQuantityValue + row.purchaseQuantityValue,
      returnQuantityValue: sum.returnQuantityValue + row.returnQuantityValue,
      adjustmentQuantityValue: sum.adjustmentQuantityValue + row.adjustmentQuantityValue,
      transferQuantityValue: sum.transferQuantityValue + row.transferQuantityValue,
      salesValue: sum.salesValue + row.salesValue,
      purchaseValue: sum.purchaseValue + row.purchaseValue,
      returnValue: sum.returnValue + row.returnValue,
      discountValue: sum.discountValue + row.discountValue,
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
      soldQuantityValue: 0,
      purchaseQuantityValue: 0,
      returnQuantityValue: 0,
      adjustmentQuantityValue: 0,
      transferQuantityValue: 0,
      salesValue: 0,
      purchaseValue: 0,
      returnValue: 0,
      discountValue: 0,
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

  const departmentKeys = new Set(bucketRows.map((row) => row.department));
  const familyKeys = new Set(bucketRows.map((row) => `${row.department}|${row.productFamily}`));
  const itemKeys = new Set(bucketRows.map((row) => `${row.department}|${row.productFamily}|${row.itemName}|${row.skuRef}`));
  const totalGrossMargin = totals.salesValue - totals.purchaseValue - totals.returnValue - totals.discountValue;

  return {
    periodLabel: toGeneralStorePeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      const grossMargin = row.salesValue - row.purchaseValue - row.returnValue - row.discountValue;
      return {
        department: row.department,
        productFamily: row.productFamily,
        itemName: row.itemName,
        skuRef: row.skuRef,
        soldQuantity: row.soldQuantityValue,
        purchaseQuantity: row.purchaseQuantityValue,
        returnQuantity: row.returnQuantityValue,
        adjustmentQuantity: row.adjustmentQuantityValue,
        transferQuantity: row.transferQuantityValue,
        salesAmount: toMoneyString(row.salesValue),
        purchaseAmount: toMoneyString(row.purchaseValue),
        returnAmount: toMoneyString(row.returnValue),
        discountAmount: toMoneyString(row.discountValue),
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
      departmentsCount: departmentKeys.size,
      productFamiliesCount: familyKeys.size,
      itemsCount: itemKeys.size,
      soldQuantity: totals.soldQuantityValue,
      purchaseQuantity: totals.purchaseQuantityValue,
      returnQuantity: totals.returnQuantityValue,
      adjustmentQuantity: totals.adjustmentQuantityValue,
      transferQuantity: totals.transferQuantityValue,
      salesAmount: toMoneyString(totals.salesValue),
      purchaseAmount: toMoneyString(totals.purchaseValue),
      returnAmount: toMoneyString(totals.returnValue),
      discountAmount: toMoneyString(totals.discountValue),
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
  return (
    transaction.activityCode === "FOOD" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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

type RentalReportBucket = {
  propertyRef: string;
  unitRef: string;
  tenantRef: string;
  leaseRef: string;
  propertyType: string;
  rentPaymentsCount: number;
  rentValue: number;
  depositValue: number;
  serviceChargeValue: number;
  maintenanceValue: number;
  propertyExpenseValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type RentalOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getRentalMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getRentalBucketKey(input: {
  propertyRef: string;
  unitRef: string;
  tenantRef: string;
  leaseRef: string;
  propertyType: string;
}): string {
  return [
    input.propertyRef,
    input.unitRef,
    input.tenantRef,
    input.leaseRef,
    input.propertyType
  ].join("|");
}

function getRentalReportBucket(
  buckets: Map<string, RentalReportBucket>,
  metadata: Record<string, string>
): RentalReportBucket {
  const input = {
    propertyRef: getRentalMetadataLabel(metadata, "propertyRef", "Bien non renseigné"),
    unitRef: getRentalMetadataLabel(metadata, "unitRef", "Lot non renseigné"),
    tenantRef: getRentalMetadataLabel(metadata, "tenantRef", "Locataire non renseigné"),
    leaseRef: getRentalMetadataLabel(metadata, "leaseRef", "Bail non renseigné"),
    propertyType: getRentalMetadataLabel(metadata, "propertyType", "Type non renseigné")
  };
  const key = getRentalBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: RentalReportBucket = {
    ...input,
    rentPaymentsCount: 0,
    rentValue: 0,
    depositValue: 0,
    serviceChargeValue: 0,
    maintenanceValue: 0,
    propertyExpenseValue: 0,
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

function getRentalOperationBucket(
  buckets: Map<string, RentalOperationBucket>,
  operationKind: string,
  operationLabel: string
): RentalOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: RentalOperationBucket = {
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

function getRentalTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.rentalOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "RENT_PAYMENT" : "PROPERTY_EXPENSE";
}

function getRentalTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.rentalTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toRentalOperationLabel(operationKind: string): string {
  if (RENTAL_OPERATION_LABELS[operationKind]) {
    return RENTAL_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${RENTAL_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toRentalPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: RentalReportBucket[]
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

function isRentalReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return (
    transaction.activityCode === "RENTAL" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
}

function buildRentalOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): RentalOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "RENTAL") {
    return null;
  }

  const rentalTransactions = transactions.filter(isRentalReportableTransaction);
  const rentalTasks = tasks.filter((task) => task.activityCode === "RENTAL");
  if (!filters.activityCode && rentalTransactions.length === 0 && rentalTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, RentalReportBucket>();
  const operationBuckets = new Map<string, RentalOperationBucket>();

  for (const transaction of rentalTransactions) {
    const operationKind = getRentalTransactionOperationKind(transaction);
    const rowBucket = getRentalReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    rowBucket.transactionsCount += 1;

    if (operationKind === "RENT_PAYMENT" || operationKind === "ADVANCE_PAYMENT") {
      const serviceCharge = getMetadataNumber(transaction.metadata, "serviceCharge");
      const rentAmount = serviceCharge > 0 && amount > serviceCharge ? amount - serviceCharge : amount;
      rowBucket.rentPaymentsCount += 1;
      rowBucket.rentValue += rentAmount;
      rowBucket.serviceChargeValue += operationKind === "RENT_PAYMENT" ? serviceCharge : 0;
    }
    if (operationKind === "SECURITY_DEPOSIT") {
      rowBucket.depositValue += amount;
    }
    if (operationKind === "SERVICE_CHARGE_INCOME") {
      rowBucket.serviceChargeValue += amount;
    }
    if (operationKind === "MAINTENANCE_EXPENSE") {
      rowBucket.maintenanceValue += amount;
    }
    if (operationKind === "PROPERTY_EXPENSE" || operationKind === "OWNER_PAYOUT") {
      rowBucket.propertyExpenseValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getRentalOperationBucket(
      operationBuckets,
      operationKind,
      toRentalOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of rentalTasks) {
    const rowBucket = getRentalReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getRentalTaskOperationKind(task);
    const operationBucket = getRentalOperationBucket(
      operationBuckets,
      operationKind,
      toRentalOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.propertyRef.localeCompare(right.propertyRef) ||
      left.unitRef.localeCompare(right.unitRef) ||
      left.tenantRef.localeCompare(right.tenantRef) ||
      left.leaseRef.localeCompare(right.leaseRef) ||
      left.propertyType.localeCompare(right.propertyType)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      rentPaymentsCount: sum.rentPaymentsCount + row.rentPaymentsCount,
      rentValue: sum.rentValue + row.rentValue,
      depositValue: sum.depositValue + row.depositValue,
      serviceChargeValue: sum.serviceChargeValue + row.serviceChargeValue,
      maintenanceValue: sum.maintenanceValue + row.maintenanceValue,
      propertyExpenseValue: sum.propertyExpenseValue + row.propertyExpenseValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      rentPaymentsCount: 0,
      rentValue: 0,
      depositValue: 0,
      serviceChargeValue: 0,
      maintenanceValue: 0,
      propertyExpenseValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const propertyKeys = new Set(bucketRows.map((row) => row.propertyRef));
  const unitKeys = new Set(bucketRows.map((row) => `${row.propertyRef}|${row.unitRef}`));
  const tenantKeys = new Set(bucketRows.map((row) => row.tenantRef));

  return {
    periodLabel: toRentalPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        propertyRef: row.propertyRef,
        unitRef: row.unitRef,
        tenantRef: row.tenantRef,
        leaseRef: row.leaseRef,
        propertyType: row.propertyType,
        rentPaymentsCount: row.rentPaymentsCount,
        rentAmount: toMoneyString(row.rentValue),
        depositAmount: toMoneyString(row.depositValue),
        serviceChargeAmount: toMoneyString(row.serviceChargeValue),
        maintenanceAmount: toMoneyString(row.maintenanceValue),
        propertyExpenseAmount: toMoneyString(row.propertyExpenseValue),
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
      propertiesCount: propertyKeys.size,
      unitsCount: unitKeys.size,
      tenantsCount: tenantKeys.size,
      rentPaymentsCount: totals.rentPaymentsCount,
      rentAmount: toMoneyString(totals.rentValue),
      depositAmount: toMoneyString(totals.depositValue),
      serviceChargeAmount: toMoneyString(totals.serviceChargeValue),
      maintenanceAmount: toMoneyString(totals.maintenanceValue),
      propertyExpenseAmount: toMoneyString(totals.propertyExpenseValue),
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
  return (
    transaction.activityCode === "HOTEL_LODGING" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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

type WaterReportBucket = {
  facilityRef: string;
  networkZone: string;
  productionLine: string;
  producedVolumeValue: number;
  billedVolumeValue: number;
  waterRevenueValue: number;
  bulkSaleValue: number;
  connectionValue: number;
  subsidyValue: number;
  treatmentCostValue: number;
  energyCostValue: number;
  maintenanceCostValue: number;
  qualityCostValue: number;
  repairCostValue: number;
  supplierPaymentValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type WaterOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getWaterMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value ? value : fallback;
}

function getWaterBucketKey(metadata: Record<string, string>): string {
  return [
    getWaterMetadataLabel(metadata, "facilityRef", "Site non renseigné"),
    getWaterMetadataLabel(metadata, "networkZone", "Zone non renseignée"),
    getWaterMetadataLabel(metadata, "productionLine", "Exploitation")
  ].join("::");
}

function getWaterReportBucket(
  buckets: Map<string, WaterReportBucket>,
  metadata: Record<string, string>
): WaterReportBucket {
  const key = getWaterBucketKey(metadata);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: WaterReportBucket = {
    facilityRef: getWaterMetadataLabel(metadata, "facilityRef", "Site non renseigné"),
    networkZone: getWaterMetadataLabel(metadata, "networkZone", "Zone non renseignée"),
    productionLine: getWaterMetadataLabel(metadata, "productionLine", "Exploitation"),
    producedVolumeValue: 0,
    billedVolumeValue: 0,
    waterRevenueValue: 0,
    bulkSaleValue: 0,
    connectionValue: 0,
    subsidyValue: 0,
    treatmentCostValue: 0,
    energyCostValue: 0,
    maintenanceCostValue: 0,
    qualityCostValue: 0,
    repairCostValue: 0,
    supplierPaymentValue: 0,
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

function getWaterOperationBucket(
  buckets: Map<string, WaterOperationBucket>,
  operationKind: string,
  operationLabel: string
): WaterOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: WaterOperationBucket = {
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

function getWaterTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.waterOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "WATER_BILLING" : "SUPPLIER_PAYMENT";
}

function getWaterTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.waterTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toWaterOperationLabel(operationKind: string): string {
  if (WATER_OPERATION_LABELS[operationKind]) {
    return WATER_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${WATER_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
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

function isWaterReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return (
    transaction.activityCode === "WATER" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
}

function toWaterLossRate(producedVolume: number, billedVolume: number): number {
  if (producedVolume <= 0) {
    return 0;
  }
  return Number(((Math.max(producedVolume - billedVolume, 0) / producedVolume) * 100).toFixed(2));
}

function buildWaterOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): WaterOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "WATER") {
    return null;
  }

  const waterTransactions = transactions.filter(isWaterReportableTransaction);
  const waterTasks = tasks.filter((task) => task.activityCode === "WATER");
  if (!filters.activityCode && waterTransactions.length === 0 && waterTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, WaterReportBucket>();
  const operationBuckets = new Map<string, WaterOperationBucket>();

  for (const transaction of waterTransactions) {
    const operationKind = getWaterTransactionOperationKind(transaction);
    const rowBucket = getWaterReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    const producedVolume = getMetadataNumber(transaction.metadata, "producedVolumeM3");
    const volumeM3 = getMetadataNumber(transaction.metadata, "volumeM3");
    rowBucket.transactionsCount += 1;
    rowBucket.producedVolumeValue += producedVolume;

    if (operationKind === "WATER_BILLING") {
      rowBucket.billedVolumeValue += volumeM3;
      rowBucket.waterRevenueValue += amount;
    }
    if (operationKind === "BULK_WATER_SALE") {
      rowBucket.billedVolumeValue += volumeM3;
      rowBucket.bulkSaleValue += amount;
    }
    if (operationKind === "CONNECTION_FEE") {
      rowBucket.connectionValue += amount;
    }
    if (operationKind === "SUBSIDY_INCOME") {
      rowBucket.subsidyValue += amount;
    }
    if (operationKind === "CHEMICAL_PURCHASE") {
      rowBucket.treatmentCostValue += amount;
    }
    if (operationKind === "ENERGY_PAYMENT") {
      rowBucket.energyCostValue += amount;
    }
    if (operationKind === "MAINTENANCE_EXPENSE") {
      rowBucket.maintenanceCostValue += amount;
    }
    if (operationKind === "QUALITY_TEST_EXPENSE") {
      rowBucket.qualityCostValue += amount;
    }
    if (operationKind === "NETWORK_REPAIR") {
      rowBucket.repairCostValue += amount;
    }
    if (operationKind === "SUPPLIER_PAYMENT") {
      rowBucket.supplierPaymentValue += amount;
    }

    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getWaterOperationBucket(
      operationBuckets,
      operationKind,
      toWaterOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of waterTasks) {
    const rowBucket = getWaterReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getWaterTaskOperationKind(task);
    const operationBucket = getWaterOperationBucket(
      operationBuckets,
      operationKind,
      toWaterOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.facilityRef.localeCompare(right.facilityRef) ||
      left.networkZone.localeCompare(right.networkZone) ||
      left.productionLine.localeCompare(right.productionLine)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      producedVolumeValue: sum.producedVolumeValue + row.producedVolumeValue,
      billedVolumeValue: sum.billedVolumeValue + row.billedVolumeValue,
      waterRevenueValue: sum.waterRevenueValue + row.waterRevenueValue,
      bulkSaleValue: sum.bulkSaleValue + row.bulkSaleValue,
      connectionValue: sum.connectionValue + row.connectionValue,
      subsidyValue: sum.subsidyValue + row.subsidyValue,
      treatmentCostValue: sum.treatmentCostValue + row.treatmentCostValue,
      energyCostValue: sum.energyCostValue + row.energyCostValue,
      maintenanceCostValue: sum.maintenanceCostValue + row.maintenanceCostValue,
      qualityCostValue: sum.qualityCostValue + row.qualityCostValue,
      repairCostValue: sum.repairCostValue + row.repairCostValue,
      supplierPaymentValue: sum.supplierPaymentValue + row.supplierPaymentValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      producedVolumeValue: 0,
      billedVolumeValue: 0,
      waterRevenueValue: 0,
      bulkSaleValue: 0,
      connectionValue: 0,
      subsidyValue: 0,
      treatmentCostValue: 0,
      energyCostValue: 0,
      maintenanceCostValue: 0,
      qualityCostValue: 0,
      repairCostValue: 0,
      supplierPaymentValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const facilityKeys = new Set(bucketRows.map((row) => row.facilityRef));
  const zoneKeys = new Set(bucketRows.map((row) => `${row.facilityRef}::${row.networkZone}`));

  return {
    periodLabel: toWaterPeriodLabel(filters),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        facilityRef: row.facilityRef,
        networkZone: row.networkZone,
        productionLine: row.productionLine,
        producedVolumeM3: row.producedVolumeValue,
        billedVolumeM3: row.billedVolumeValue,
        waterRevenue: toMoneyString(row.waterRevenueValue),
        bulkSaleAmount: toMoneyString(row.bulkSaleValue),
        connectionAmount: toMoneyString(row.connectionValue),
        subsidyAmount: toMoneyString(row.subsidyValue),
        treatmentCost: toMoneyString(row.treatmentCostValue),
        energyCost: toMoneyString(row.energyCostValue),
        maintenanceCost: toMoneyString(row.maintenanceCostValue),
        qualityCost: toMoneyString(row.qualityCostValue),
        repairCost: toMoneyString(row.repairCostValue),
        supplierPaymentAmount: toMoneyString(row.supplierPaymentValue),
        transactionsCount: row.transactionsCount,
        tasksCount: row.tasksCount,
        doneTasksCount: row.doneTasksCount,
        openTasksCount: row.openTasksCount,
        blockedTasksCount: row.blockedTasksCount,
        cashInAmount: toMoneyString(row.cashInValue),
        cashOutAmount: toMoneyString(row.cashOutValue),
        netAmount: toMoneyString(netAmount),
        lossRate: toWaterLossRate(row.producedVolumeValue, row.billedVolumeValue),
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
      facilitiesCount: facilityKeys.size,
      zonesCount: zoneKeys.size,
      producedVolumeM3: totals.producedVolumeValue,
      billedVolumeM3: totals.billedVolumeValue,
      waterRevenue: toMoneyString(totals.waterRevenueValue),
      bulkSaleAmount: toMoneyString(totals.bulkSaleValue),
      connectionAmount: toMoneyString(totals.connectionValue),
      subsidyAmount: toMoneyString(totals.subsidyValue),
      treatmentCost: toMoneyString(totals.treatmentCostValue),
      energyCost: toMoneyString(totals.energyCostValue),
      maintenanceCost: toMoneyString(totals.maintenanceCostValue),
      qualityCost: toMoneyString(totals.qualityCostValue),
      repairCost: toMoneyString(totals.repairCostValue),
      supplierPaymentAmount: toMoneyString(totals.supplierPaymentValue),
      transactionsCount: totals.transactionsCount,
      tasksCount: totals.tasksCount,
      doneTasksCount: totals.doneTasksCount,
      openTasksCount: totals.openTasksCount,
      blockedTasksCount: totals.blockedTasksCount,
      cashInAmount: toMoneyString(totals.cashInValue),
      cashOutAmount: toMoneyString(totals.cashOutValue),
      netAmount: toMoneyString(totals.cashInValue - totals.cashOutValue),
      lossRate: toWaterLossRate(totals.producedVolumeValue, totals.billedVolumeValue),
      executionRate: toRate(totals.doneTasksCount, totals.tasksCount),
      currency: "XOF" as const
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
  return (
    transaction.activityCode === "REAL_ESTATE_AGENCY" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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

type BtpReportBucket = {
  projectRef: string;
  workPackage: string;
  siteLocation: string;
  clientRef: string;
  progressPercentValue: number;
  materialQuantityValue: number;
  laborDaysValue: number;
  equipmentHoursValue: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

type BtpOperationBucket = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInValue: number;
  cashOutValue: number;
};

function getBtpMetadataLabel(
  metadata: Record<string, string>,
  key: string,
  fallback: string
): string {
  const value = metadata[key]?.trim();
  return value || fallback;
}

function getBtpBucketKey(input: {
  projectRef: string;
  workPackage: string;
  siteLocation: string;
  clientRef: string;
}): string {
  return [input.projectRef, input.workPackage, input.siteLocation, input.clientRef].join("|");
}

function getBtpReportBucket(
  buckets: Map<string, BtpReportBucket>,
  metadata: Record<string, string>
): BtpReportBucket {
  const input = {
    projectRef: getBtpMetadataLabel(metadata, "projectRef", "Chantier non renseigné"),
    workPackage: getBtpMetadataLabel(metadata, "workPackage", "Lot non renseigné"),
    siteLocation: getBtpMetadataLabel(metadata, "siteLocation", "Localisation non renseignée"),
    clientRef: getBtpMetadataLabel(metadata, "clientRef", "Client non renseigné")
  };
  const key = getBtpBucketKey(input);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: BtpReportBucket = {
    ...input,
    progressPercentValue: 0,
    materialQuantityValue: 0,
    laborDaysValue: 0,
    equipmentHoursValue: 0,
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

function getBtpOperationBucket(
  buckets: Map<string, BtpOperationBucket>,
  operationKind: string,
  operationLabel: string
): BtpOperationBucket {
  const existing = buckets.get(operationKind);
  if (existing) {
    return existing;
  }

  const created: BtpOperationBucket = {
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

function getBtpTransactionOperationKind(transaction: ReportOperationalTransaction): string {
  const configuredKind = transaction.metadata.btpOperationKind?.trim();
  if (configuredKind) {
    return configuredKind;
  }
  return transaction.type === "CASH_IN" ? "CLIENT_PAYMENT" : "SITE_EXPENSE";
}

function getBtpTaskOperationKind(task: ReportOperationalTask): string {
  const configuredKind = task.metadata.btpTaskKind?.trim();
  return configuredKind ? `TASK_${configuredKind}` : "TASK_FOLLOW_UP";
}

function toBtpOperationLabel(operationKind: string): string {
  if (BTP_OPERATION_LABELS[operationKind]) {
    return BTP_OPERATION_LABELS[operationKind];
  }
  if (operationKind.startsWith("TASK_")) {
    const taskKind = operationKind.slice("TASK_".length);
    return `Tâche: ${BTP_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toBtpPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: BtpReportBucket[]
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

function isBtpReportableTransaction(transaction: ReportOperationalTransaction): boolean {
  return (
    transaction.activityCode === "BTP" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
}

function buildBtpOperationsReport(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
  filters: ReportPeriodFilter
): BtpOperationsReport | null {
  if (filters.activityCode && filters.activityCode !== "BTP") {
    return null;
  }

  const btpTransactions = transactions.filter(isBtpReportableTransaction);
  const btpTasks = tasks.filter((task) => task.activityCode === "BTP");
  if (!filters.activityCode && btpTransactions.length === 0 && btpTasks.length === 0) {
    return null;
  }

  const rowBuckets = new Map<string, BtpReportBucket>();
  const operationBuckets = new Map<string, BtpOperationBucket>();

  for (const transaction of btpTransactions) {
    const operationKind = getBtpTransactionOperationKind(transaction);
    const rowBucket = getBtpReportBucket(rowBuckets, transaction.metadata);
    const amount = toNumberAmount(transaction.amount);
    rowBucket.transactionsCount += 1;
    rowBucket.progressPercentValue = Math.max(
      rowBucket.progressPercentValue,
      getMetadataNumber(transaction.metadata, "progressPercent")
    );
    if (operationKind === "MATERIAL_PURCHASE") {
      rowBucket.materialQuantityValue += getMetadataNumber(transaction.metadata, "quantity");
    }
    if (operationKind === "LABOR_PAYMENT") {
      const workerCount = getMetadataNumber(transaction.metadata, "workerCount");
      const workDays = getMetadataNumber(transaction.metadata, "workDays");
      rowBucket.laborDaysValue += workerCount > 0 && workDays > 0 ? workerCount * workDays : workDays;
    }
    if (operationKind === "EQUIPMENT_RENTAL") {
      rowBucket.equipmentHoursValue += getMetadataNumber(transaction.metadata, "equipmentHours");
    }
    if (transaction.type === "CASH_IN") {
      rowBucket.cashInValue += amount;
    } else {
      rowBucket.cashOutValue += amount;
    }

    const operationBucket = getBtpOperationBucket(
      operationBuckets,
      operationKind,
      toBtpOperationLabel(operationKind)
    );
    operationBucket.transactionsCount += 1;
    if (transaction.type === "CASH_IN") {
      operationBucket.cashInValue += amount;
    } else {
      operationBucket.cashOutValue += amount;
    }
  }

  for (const task of btpTasks) {
    const rowBucket = getBtpReportBucket(rowBuckets, task.metadata);
    rowBucket.tasksCount += 1;
    rowBucket.progressPercentValue = Math.max(
      rowBucket.progressPercentValue,
      getMetadataNumber(task.metadata, "progressPercent")
    );
    if (task.status === "DONE") {
      rowBucket.doneTasksCount += 1;
    } else {
      rowBucket.openTasksCount += 1;
    }
    if (task.status === "BLOCKED") {
      rowBucket.blockedTasksCount += 1;
    }

    const operationKind = getBtpTaskOperationKind(task);
    const operationBucket = getBtpOperationBucket(
      operationBuckets,
      operationKind,
      toBtpOperationLabel(operationKind)
    );
    operationBucket.tasksCount += 1;
  }

  const bucketRows = Array.from(rowBuckets.values()).sort((left, right) => {
    return (
      left.projectRef.localeCompare(right.projectRef) ||
      left.workPackage.localeCompare(right.workPackage) ||
      left.siteLocation.localeCompare(right.siteLocation) ||
      left.clientRef.localeCompare(right.clientRef)
    );
  });

  const totals = bucketRows.reduce(
    (sum, row) => ({
      progressPercentValue: sum.progressPercentValue + row.progressPercentValue,
      materialQuantityValue: sum.materialQuantityValue + row.materialQuantityValue,
      laborDaysValue: sum.laborDaysValue + row.laborDaysValue,
      equipmentHoursValue: sum.equipmentHoursValue + row.equipmentHoursValue,
      transactionsCount: sum.transactionsCount + row.transactionsCount,
      tasksCount: sum.tasksCount + row.tasksCount,
      doneTasksCount: sum.doneTasksCount + row.doneTasksCount,
      openTasksCount: sum.openTasksCount + row.openTasksCount,
      blockedTasksCount: sum.blockedTasksCount + row.blockedTasksCount,
      cashInValue: sum.cashInValue + row.cashInValue,
      cashOutValue: sum.cashOutValue + row.cashOutValue
    }),
    {
      progressPercentValue: 0,
      materialQuantityValue: 0,
      laborDaysValue: 0,
      equipmentHoursValue: 0,
      transactionsCount: 0,
      tasksCount: 0,
      doneTasksCount: 0,
      openTasksCount: 0,
      blockedTasksCount: 0,
      cashInValue: 0,
      cashOutValue: 0
    }
  );

  const projectKeys = new Set(bucketRows.map((row) => row.projectRef));
  const workPackageKeys = new Set(bucketRows.map((row) => `${row.projectRef}|${row.workPackage}`));
  const averageProgress = bucketRows.length > 0
    ? Number((totals.progressPercentValue / bucketRows.length).toFixed(2))
    : 0;

  return {
    periodLabel: toBtpPeriodLabel(filters, bucketRows),
    rows: bucketRows.map((row) => {
      const netAmount = row.cashInValue - row.cashOutValue;
      return {
        projectRef: row.projectRef,
        workPackage: row.workPackage,
        siteLocation: row.siteLocation,
        clientRef: row.clientRef,
        progressPercent: row.progressPercentValue,
        materialQuantity: row.materialQuantityValue,
        laborDays: row.laborDaysValue,
        equipmentHours: row.equipmentHoursValue,
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
      projectsCount: projectKeys.size,
      workPackagesCount: workPackageKeys.size,
      progressPercent: averageProgress,
      materialQuantity: totals.materialQuantityValue,
      laborDays: totals.laborDaysValue,
      equipmentHours: totals.equipmentHoursValue,
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
  return (
    transaction.activityCode === "FISH_FARMING" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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
  return (
    transaction.activityCode === "LIVESTOCK" &&
    transaction.currency === "XOF" &&
    (transaction.status === "SUBMITTED" || transaction.status === "APPROVED")
  );
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
  const key = [
    input.scope,
    input.activityCode,
    input.dimensionKey,
    input.itemKey
  ].join("|");
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

function buildOperationalPerformance(
  transactions: ReportOperationalTransaction[],
  tasks: ReportOperationalTask[],
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

  function getSubsectionBuckets(
    activityCode: BusinessActivityCode,
    metadata: Record<string, string>
  ) {
    const profile = getBusinessActivityProfile(activityCode);
    return (profile.reporting.operationalDimensions ?? []).map((item) => {
      const value = normalizeOperationalItem(metadata[item.key]);
      return getOperationalBucket(buckets, {
        scope: "SUBSECTION",
        activityCode,
        dimensionKey: item.key,
        dimensionLabel: item.label,
        itemKey: value.itemKey,
        itemLabel: value.itemLabel
      });
    });
  }

  for (const transaction of transactions) {
    const targetBuckets = [
      getActivityBucket(transaction.activityCode),
      ...getSubsectionBuckets(transaction.activityCode, transaction.metadata)
    ];
    for (const bucket of targetBuckets) {
      bucket.transactionsCount += 1;
      if (transaction.status === "APPROVED") {
        bucket.approvedTransactionsCount += 1;
      }
      if (transaction.status === "APPROVED" && transaction.currency === "XOF") {
        const amount = toNumberAmount(transaction.amount);
        if (transaction.type === "CASH_IN") {
          bucket.approvedCashInValue += amount;
        } else {
          bucket.approvedCashOutValue += amount;
        }
      }
    }
  }

  for (const task of tasks) {
    const targetBuckets = [
      getActivityBucket(task.activityCode),
      ...getSubsectionBuckets(task.activityCode, task.metadata)
    ];
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const isOpen = task.status !== "DONE";
    const isOverdue = Boolean(isOpen && dueDate && dueDate.getTime() < now.getTime());
    for (const bucket of targetBuckets) {
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
    company,
    finance,
    operations,
    financialAccounts,
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
    listFinancialAccounts({ companyId: actor.companyId }),
    listDashboardRecentTransactions(actor.companyId, 6, filters),
    listDashboardRecentTasks(actor.companyId, 6, actor.role, actor.actorId, filters),
    actor.role === "EMPLOYEE" ? Promise.resolve([]) : listDashboardWorkload(actor.companyId, 5, filters),
    listDashboardFinanceActivitySummary(actor.companyId),
    listDashboardTaskActivitySummary(actor.companyId),
    listReportOperationalTransactions(actor.companyId, filters),
    listReportOperationalTasks(actor.companyId, filters)
  ]);

  if (!company) {
    throw new HttpError(404, "Entreprise introuvable.");
  }

  const activitySummary = buildDashboardActivitySummary(financeActivitySummary, taskActivitySummary);
  const accountsSummary = buildFinancialAccountsSummary(financialAccounts, filters.activityCode);

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
    activityProfiles: listBusinessActivityProfiles(),
    activityHighlightsByCode: buildActivityHighlightsByCode(activitySummary),
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

  const [
    financeByStatus,
    financeByType,
    financeByActivity,
    financialAccounts,
    taskByStatus,
    taskByActivity,
    operationalTransactions,
    operationalTasks
  ] =
    await Promise.all([
      listReportFinanceByStatus(actor.companyId, filters),
      listReportFinanceByType(actor.companyId, filters),
      listReportFinanceByActivity(actor.companyId, filters),
      listFinancialAccounts({ companyId: actor.companyId }),
      listReportTaskByStatus(actor.companyId, filters),
      listReportTaskByActivity(actor.companyId, filters),
      listReportOperationalTransactions(actor.companyId, filters),
      listReportOperationalTasks(actor.companyId, filters)
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
              .filter((item) => item.status === "SUBMITTED")
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
    operationalPerformance: buildOperationalPerformance(operationalTransactions, operationalTasks),
    hardwareMonthlyReport: buildHardwareMonthlyReport(operationalTransactions, filters),
    agricultureOperationsReport: buildAgricultureOperationsReport(operationalTransactions, operationalTasks, filters),
    generalStoreOperationsReport: buildGeneralStoreOperationsReport(operationalTransactions, operationalTasks, filters),
    foodOperationsReport: buildFoodOperationsReport(operationalTransactions, operationalTasks, filters),
    rentalOperationsReport: buildRentalOperationsReport(operationalTransactions, operationalTasks, filters),
    btpOperationsReport: buildBtpOperationsReport(operationalTransactions, operationalTasks, filters),
    fishFarmingOperationsReport: buildFishFarmingOperationsReport(operationalTransactions, operationalTasks, filters),
    livestockOperationsReport: buildLivestockOperationsReport(operationalTransactions, operationalTasks, filters),
    hotelOperationsReport: buildHotelOperationsReport(operationalTransactions, operationalTasks, filters),
    waterOperationsReport: buildWaterOperationsReport(operationalTransactions, operationalTasks, filters),
    agencyOperationsReport: buildAgencyOperationsReport(operationalTransactions, operationalTasks, filters),
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
      "validated_by_email",
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
      item.validatedByEmail,
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
  const overview = await getCompanyReportsOverview(actor, input);
  const rows = await listTransactionsForExport(actor.companyId, filters);
  const records = rows.map(toTransactionExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters),
      columns: ["generatedAt", "period", "activity", "dateFrom", "dateTo"]
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
        "approvedTransactionsCount",
        "approvedCashIn",
        "approvedCashOut",
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
        "quantity",
        "salesAmount",
        "paymentAmount",
        "purchaseAmount",
        "grossProfit",
        "marginRate",
        "transactionsCount",
        "currency"
      ]
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
        "department",
        "productFamily",
        "itemName",
        "skuRef",
        "soldQuantity",
        "purchaseQuantity",
        "returnQuantity",
        "adjustmentQuantity",
        "transferQuantity",
        "salesAmount",
        "purchaseAmount",
        "returnAmount",
        "discountAmount",
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
      name: "MagasinOps",
      rows: buildGeneralStoreOperationsBreakdownRows(overview),
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
        "propertyRef",
        "unitRef",
        "tenantRef",
        "leaseRef",
        "propertyType",
        "rentPaymentsCount",
        "rentAmount",
        "depositAmount",
        "serviceChargeAmount",
        "maintenanceAmount",
        "propertyExpenseAmount",
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
      name: "EauPotable",
      rows: buildWaterOperationsReportRows(overview),
      columns: [
        "facilityRef",
        "networkZone",
        "productionLine",
        "producedVolumeM3",
        "billedVolumeM3",
        "waterRevenue",
        "bulkSaleAmount",
        "connectionAmount",
        "subsidyAmount",
        "treatmentCost",
        "energyCost",
        "maintenanceCost",
        "qualityCost",
        "repairCost",
        "supplierPaymentAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "lossRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "EauOperations",
      rows: buildWaterOperationsBreakdownRows(overview),
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
        "workPackage",
        "siteLocation",
        "clientRef",
        "progressPercent",
        "materialQuantity",
        "laborDays",
        "equipmentHours",
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
      name: "BTPOperations",
      rows: buildBtpOperationsBreakdownRows(overview),
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
        "validatedByEmail",
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
        validatedByEmail: item.validatedByEmail ?? "",
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
  const overview = await getCompanyReportsOverview(actor, input);
  const rows = await listTasksForExport(actor.companyId, filters);
  const records = rows.map(toTaskExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters),
      columns: ["generatedAt", "period", "activity", "dateFrom", "dateTo"]
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
        "approvedTransactionsCount",
        "approvedCashIn",
        "approvedCashOut",
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
        "quantity",
        "salesAmount",
        "paymentAmount",
        "purchaseAmount",
        "grossProfit",
        "marginRate",
        "transactionsCount",
        "currency"
      ]
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
        "department",
        "productFamily",
        "itemName",
        "skuRef",
        "soldQuantity",
        "purchaseQuantity",
        "returnQuantity",
        "adjustmentQuantity",
        "transferQuantity",
        "salesAmount",
        "purchaseAmount",
        "returnAmount",
        "discountAmount",
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
      name: "MagasinOps",
      rows: buildGeneralStoreOperationsBreakdownRows(overview),
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
        "propertyRef",
        "unitRef",
        "tenantRef",
        "leaseRef",
        "propertyType",
        "rentPaymentsCount",
        "rentAmount",
        "depositAmount",
        "serviceChargeAmount",
        "maintenanceAmount",
        "propertyExpenseAmount",
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
        "workPackage",
        "siteLocation",
        "clientRef",
        "progressPercent",
        "materialQuantity",
        "laborDays",
        "equipmentHours",
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
      name: "BTPOperations",
      rows: buildBtpOperationsBreakdownRows(overview),
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
      name: "EauPotable",
      rows: buildWaterOperationsReportRows(overview),
      columns: [
        "facilityRef",
        "networkZone",
        "productionLine",
        "producedVolumeM3",
        "billedVolumeM3",
        "waterRevenue",
        "bulkSaleAmount",
        "connectionAmount",
        "subsidyAmount",
        "treatmentCost",
        "energyCost",
        "maintenanceCost",
        "qualityCost",
        "repairCost",
        "supplierPaymentAmount",
        "transactionsCount",
        "tasksCount",
        "doneTasksCount",
        "openTasksCount",
        "blockedTasksCount",
        "cashInAmount",
        "cashOutAmount",
        "netAmount",
        "lossRate",
        "executionRate",
        "currency"
      ]
    },
    {
      name: "EauOperations",
      rows: buildWaterOperationsBreakdownRows(overview),
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

export async function exportCompanyReportsPdf(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<Buffer> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
  ensureSectorReportFilter(filters);
  const overview = await getCompanyReportsOverview(actor, input);
  const periodLabel = toDisplayPeriodLabel(filters);

  if (filters.activityCode === "HARDWARE") {
    return buildPdfBuffer((doc) => {
      renderHardwareReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawHardwarePdfFooter(doc, pageNumber, totalPages, overview.hardwareMonthlyReport?.periodLabel ?? periodLabel);
    });
  }

  if (filters.activityCode === "AGRICULTURE") {
    return buildPdfBuffer((doc) => {
      renderAgricultureReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawAgriculturePdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.agricultureOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "GENERAL_STORE") {
    return buildPdfBuffer((doc) => {
      renderGeneralStoreReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawGeneralStorePdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.generalStoreOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "FOOD") {
    return buildPdfBuffer((doc) => {
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
    return buildPdfBuffer((doc) => {
      renderRentalReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawRentalPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.rentalOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "HOTEL_LODGING") {
    return buildPdfBuffer((doc) => {
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
    return buildPdfBuffer((doc) => {
      renderWaterReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawWaterPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.waterOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "REAL_ESTATE_AGENCY") {
    return buildPdfBuffer((doc) => {
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
    return buildPdfBuffer((doc) => {
      renderBtpReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawBtpPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.btpOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "FISH_FARMING") {
    return buildPdfBuffer((doc) => {
      renderFishFarmingReportsPdf(doc, overview, filters);
    }, (doc, pageNumber, totalPages) => {
      drawFishFarmingPdfFooter(
        doc,
        pageNumber,
        totalPages,
        overview.fishFarmingOperationsReport?.periodLabel ?? periodLabel
      );
    });
  }

  if (filters.activityCode === "LIVESTOCK") {
    return buildPdfBuffer((doc) => {
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

  return buildPdfBuffer((doc) => {
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
              `${item.date} | ${item.designation} | quantité ${item.quantity} | vente ${item.salesAmount} XOF | versement ${item.paymentAmount} XOF | coût ${item.purchaseAmount} XOF | bénéfice ${item.grossProfit} XOF`
          ),
          `TOTAL | quantité ${hardwareReport.totals.quantity} | vente ${hardwareReport.totals.salesAmount} XOF | versement ${hardwareReport.totals.paymentAmount} XOF | coût ${hardwareReport.totals.purchaseAmount} XOF | bénéfice ${hardwareReport.totals.grossProfit} XOF`
        ]),
        "Aucune vente quincaillerie soumise ou approuvée sur cette période."
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
              `${item.projectRef} | ${item.workPackage} | ${item.siteLocation} | client ${item.clientRef} | avancement ${item.progressPercent}% | main-d'oeuvre ${item.laborDays} j/h | engins ${item.equipmentHours} h | recettes ${item.cashInAmount} XOF | dépenses ${item.cashOutAmount} XOF | net ${item.netAmount} XOF | exécution ${item.executionRate}% | blocages ${item.blockedTasksCount}`
          ),
          `TOTAL | chantiers ${btpReport.totals.projectsCount} | lots ${btpReport.totals.workPackagesCount} | avancement ${btpReport.totals.progressPercent}% | main-d'oeuvre ${btpReport.totals.laborDays} j/h | engins ${btpReport.totals.equipmentHours} h | recettes ${btpReport.totals.cashInAmount} XOF | dépenses ${btpReport.totals.cashOutAmount} XOF | net ${btpReport.totals.netAmount} XOF`
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
          `${toDisplayTransactionTypeLabel(item.type)} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency} | approuvé ${item.approvedAmount} ${item.currency}`
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
