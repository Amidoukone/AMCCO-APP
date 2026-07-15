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
  type DashboardSummary,
  type FishFarmingOperationsReport,
  type HardwareMonthlyReport,
  type LivestockOperationsReport,
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
  HARVEST_SALE: "Vente recolte",
  SUPPORT_INCOME: "Appui / subvention"
};
const AGRICULTURE_TASK_LABELS: Record<string, string> = {
  PREPARATION: "Preparation",
  SOWING: "Semis",
  MAINTENANCE: "Entretien",
  TREATMENT: "Traitement",
  HARVEST: "Recolte",
  STORAGE: "Stockage",
  FOLLOW_UP: "Suivi terrain"
};
const AGRICULTURE_REPORT_BRANDING = {
  title: "ACTIVITE AGRICOLE",
  subtitle: "Suivi de campagne, parcelles, cultures et operations terrain",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO"
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
  WATER_CONTROL: "Controle eau",
  TREATMENT: "Traitement sanitaire",
  SORTING: "Tri / calibrage",
  HARVEST: "Recolte",
  STOCKING: "Mise en charge",
  FOLLOW_UP: "Suivi bassin"
};
const FISH_FARMING_REPORT_BRANDING = {
  title: "PISCICULTURE",
  subtitle: "Suivi des bassins, cycles d'elevage, aliments, ventes et alertes sanitaires",
  agency: "Agence Mandingue de Courtage de Conseil et d'Orientation",
  brand: "AMCCO"
};
const LIVESTOCK_OPERATION_LABELS: Record<string, string> = {
  ANIMAL_PURCHASE: "Achat animaux",
  FEED_PURCHASE: "Achat aliment",
  VET_CARE: "Soins veterinaires",
  FARM_EXPENSE: "Charge elevage",
  ANIMAL_SALE: "Vente animaux",
  PRODUCT_SALE: "Vente produits",
  SUPPORT_INCOME: "Appui / subvention"
};
const LIVESTOCK_TASK_LABELS: Record<string, string> = {
  FEEDING: "Nourrissage",
  HEALTH_CHECK: "Controle sanitaire",
  VACCINATION: "Vaccination",
  TREATMENT: "Traitement",
  CLEANING: "Nettoyage enclos",
  BREEDING: "Reproduction",
  SALE_PREP: "Preparation vente",
  FOLLOW_UP: "Suivi elevage"
};
const LIVESTOCK_REPORT_BRANDING = {
  title: "ELEVAGE",
  subtitle: "Suivi des troupeaux, lots, especes, alimentation, soins, ventes et mortalite",
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
    throw new HttpError(400, "Selectionnez un secteur pour consulter le rapport.");
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
    return "Toutes periodes";
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
    return "Toutes activites";
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
    return "Terminee";
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
    .text(`Periode: ${periodLabel}`, pageWidth - margin - 190, 28, {
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
  { label: "COUT ACHAT", width: 70, align: "right" },
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
    .text(`Periode: ${report.periodLabel}`, margin + 44, 43, {
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
    .text("Periode", margin + 10, y + 8, { width: 140 });
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
    { label: "Quantite totale", value: formatPdfNumber(report.totals.quantity, 2) },
    { label: "Vente totale", value: formatPdfMoney(report.totals.salesAmount) },
    { label: "Versement", value: formatPdfMoney(report.totals.paymentAmount) },
    { label: "Benefice brut", value: formatPdfMoney(report.totals.grossProfit) }
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
      "Le rapport reprend les ventes XOF soumises ou approuvees avec designation article. Verifiez la periode, le statut des transactions et les champs quantite/prix si le tableau doit etre alimente.",
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
    "Lecture: les montants sont consolides en F CFA. Le benefice brut correspond a la vente moins le cout d'achat renseigne sur les transactions article.";
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
  { label: "DEPENSES", width: 60, align: "right" },
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
    .text("Periode", margin + 10, y + 8, { width: 155 });
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
    .text("Activite agricole", margin + 205, y + 21, { width: 140 });
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
    { label: "Depenses", value: formatPdfMoney(report.totals.cashOutAmount) },
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
      `Execution terrain: ${formatPdfNumber(report.totals.executionRate, 1)}% | taches ${formatPdfNumber(report.totals.doneTasksCount)} terminees, ${formatPdfNumber(report.totals.openTasksCount)} ouvertes, ${formatPdfNumber(report.totals.blockedTasksCount)} bloquees.`,
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
    .text("Aucune operation agricole reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#166534")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF soumises ou approuvees et les taches agricoles de la periode. Renseignez campagne, parcelle et type de champ pour alimenter le suivi.",
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
    .text("Synthese par campagne, parcelle et culture", PDF_PAGE_MARGIN, doc.y, {
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
    .text("Ventilation par type d'operation", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DEPENSES", width: 80, align: "right" },
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
  { label: "DEPENSES", width: 57, align: "right" },
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
    .text("Periode", margin + 10, y + 8, { width: 155 });
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
    { label: "Depenses", value: formatPdfMoney(report.totals.cashOutAmount) },
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
      `Production: alevins ${formatPdfNumber(report.totals.fingerlingsQuantity, 2)} | aliment ${formatPdfNumber(report.totals.feedQuantity, 2)} | ventes ${formatPdfNumber(report.totals.soldQuantity, 2)} | mortalite ${formatPdfNumber(report.totals.mortalityCount, 2)} | execution ${formatPdfNumber(report.totals.executionRate, 1)}%.`,
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
    .text("Aucune operation piscicole reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#0369a1")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF soumises ou approuvees et les taches piscicoles de la periode. Renseignez bassin, cycle et espece pour alimenter le suivi.",
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
    .text("Synthese par bassin, cycle et espece", PDF_PAGE_MARGIN, doc.y, {
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
    .text("Ventilation par type d'operation", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DEPENSES", width: 80, align: "right" },
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
  { label: "DEPENSES", width: 56, align: "right" },
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
    .text("Periode", margin + 10, y + 8, { width: 155 });
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
    .text("Elevage", margin + 205, y + 21, { width: 140 });
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
    { label: "Depenses", value: formatPdfMoney(report.totals.cashOutAmount) },
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
      `Cheptel: achats ${formatPdfNumber(report.totals.animalPurchaseCount, 2)} | aliment ${formatPdfNumber(report.totals.feedQuantity, 2)} | ventes ${formatPdfNumber(report.totals.soldAnimalCount, 2)} | produits ${formatPdfNumber(report.totals.productQuantity, 2)} | mortalite ${formatPdfNumber(report.totals.mortalityCount, 2)} | execution ${formatPdfNumber(report.totals.executionRate, 1)}%.`,
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
    .text("Aucune operation d'elevage reportable", margin + 14, y + 16, {
      width: pageWidth - margin * 2 - 28
    });
  doc
    .fillColor("#4d7c0f")
    .font("Helvetica")
    .fontSize(9.2)
    .text(
      "Le rapport reprend les transactions XOF soumises ou approuvees et les taches d'elevage de la periode. Renseignez troupeau, lot et espece pour alimenter le suivi.",
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
    .text("Synthese par troupeau, lot et espece", PDF_PAGE_MARGIN, doc.y, {
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
    .text("Ventilation par type d'operation", PDF_PAGE_MARGIN, doc.y, {
      width: doc.page.width - PDF_PAGE_MARGIN * 2
    });
  doc.moveDown(0.4);

  const columns: PdfTableColumn[] = [
    { label: "OPERATION", width: 170, align: "left" },
    { label: "TRANS.", width: 50, align: "right" },
    { label: "TACHES", width: 50, align: "right" },
    { label: "RECETTES", width: 80, align: "right" },
    { label: "DEPENSES", width: 80, align: "right" },
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
    .text(`AMCCO - Rapport elevage | ${periodLabel}`, margin, pageHeight - 32, {
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
      label: "Periode",
      value: toDisplayPeriodLabel({
        dateFrom: overview.filters.dateFrom ?? undefined,
        dateTo: overview.filters.dateTo ?? undefined
      }),
      extra: ""
    },
    {
      category: "Meta",
      item: "activity",
      label: "Activite",
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
      extra: `total ${item.totalAmount} ${item.currency} | approuve ${item.approvedAmount} ${item.currency}`
    });
  }

  for (const item of overview.financeByActivity) {
    rows.push({
      category: "FinanceByActivity",
      item: item.activityCode,
      label: BUSINESS_ACTIVITY_LABELS[item.activityCode],
      value: item.count,
      extra: `total ${item.totalAmount} XOF/DEV | approuve ${item.approvedAmount} XOF/DEV`
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
    label: "Portee des comptes",
    value: overview.financeAccountsSummary.globalCount,
    extra: `globaux ${overview.financeAccountsSummary.globalCount} | dedies ${overview.financeAccountsSummary.dedicatedCount} | restreints ${overview.financeAccountsSummary.restrictedCount}`
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
      extra: `entrees ${item.approvedCashIn} XOF | sorties ${item.approvedCashOut} XOF | marge ${item.marginRate}% | rentabilite couts ${item.returnOnCostRate}% | execution ${item.executionRate}% | ouvertes ${item.openTasksCount} | bloquees ${item.blockedTasksCount} | retards ${item.overdueTasksCount}`
    });
  }

  if (overview.hardwareMonthlyReport) {
    rows.push({
      category: "HardwareMonthlyReport",
      item: "totals",
      label: `Quincaillerie ${overview.hardwareMonthlyReport.periodLabel}`,
      value: overview.hardwareMonthlyReport.totals.salesAmount,
      extra: `quantite ${overview.hardwareMonthlyReport.totals.quantity} | versement ${overview.hardwareMonthlyReport.totals.paymentAmount} XOF | cout ${overview.hardwareMonthlyReport.totals.purchaseAmount} XOF | benefice ${overview.hardwareMonthlyReport.totals.grossProfit} XOF | marge ${overview.hardwareMonthlyReport.totals.marginRate}%`
    });
  }

  if (overview.agricultureOperationsReport) {
    rows.push({
      category: "AgricultureOperationsReport",
      item: "totals",
      label: `Agriculture ${overview.agricultureOperationsReport.periodLabel}`,
      value: overview.agricultureOperationsReport.totals.netAmount,
      extra: `parcelles ${overview.agricultureOperationsReport.totals.parcelsCount} | surface ${overview.agricultureOperationsReport.totals.surfaceArea} | recettes ${overview.agricultureOperationsReport.totals.cashInAmount} XOF | depenses ${overview.agricultureOperationsReport.totals.cashOutAmount} XOF | execution ${overview.agricultureOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.fishFarmingOperationsReport) {
    rows.push({
      category: "FishFarmingOperationsReport",
      item: "totals",
      label: `Pisciculture ${overview.fishFarmingOperationsReport.periodLabel}`,
      value: overview.fishFarmingOperationsReport.totals.netAmount,
      extra: `bassins ${overview.fishFarmingOperationsReport.totals.pondsCount} | cycles ${overview.fishFarmingOperationsReport.totals.cyclesCount} | alevins ${overview.fishFarmingOperationsReport.totals.fingerlingsQuantity} | aliment ${overview.fishFarmingOperationsReport.totals.feedQuantity} | ventes ${overview.fishFarmingOperationsReport.totals.soldQuantity} | mortalite ${overview.fishFarmingOperationsReport.totals.mortalityCount} | recettes ${overview.fishFarmingOperationsReport.totals.cashInAmount} XOF | depenses ${overview.fishFarmingOperationsReport.totals.cashOutAmount} XOF | execution ${overview.fishFarmingOperationsReport.totals.executionRate}%`
    });
  }

  if (overview.livestockOperationsReport) {
    rows.push({
      category: "LivestockOperationsReport",
      item: "totals",
      label: `Elevage ${overview.livestockOperationsReport.periodLabel}`,
      value: overview.livestockOperationsReport.totals.netAmount,
      extra: `troupeaux ${overview.livestockOperationsReport.totals.herdsCount} | lots ${overview.livestockOperationsReport.totals.batchesCount} | achats ${overview.livestockOperationsReport.totals.animalPurchaseCount} | aliment ${overview.livestockOperationsReport.totals.feedQuantity} | ventes ${overview.livestockOperationsReport.totals.soldAnimalCount} | produits ${overview.livestockOperationsReport.totals.productQuantity} | mortalite ${overview.livestockOperationsReport.totals.mortalityCount} | recettes ${overview.livestockOperationsReport.totals.cashInAmount} XOF | depenses ${overview.livestockOperationsReport.totals.cashOutAmount} XOF | execution ${overview.livestockOperationsReport.totals.executionRate}%`
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
      extra: `ouvertes ${item.openCount} | bloquees ${item.blockedCount} | terminees ${item.doneCount}`
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
    throw new HttpError(400, "dateFrom doit etre inferieure ou egale a dateTo.");
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
    return "Toutes periodes";
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
    campaignRef: getAgricultureMetadataLabel(metadata, "campaignRef", "Campagne non renseignee"),
    parcelRef: getAgricultureMetadataLabel(metadata, "parcelRef", "Parcelle non renseignee"),
    fieldType: getAgricultureMetadataLabel(metadata, "fieldType", "Type non renseigne"),
    cropType: getAgricultureMetadataLabel(metadata, "cropType", "Culture non renseignee")
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
    return `Tache: ${AGRICULTURE_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toAgriculturePeriodLabel(
  filters: ReportPeriodFilter,
  _rows: AgricultureReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes periodes";
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
    pondRef: getFishFarmingMetadataLabel(metadata, "pondRef", "Bassin non renseigne"),
    cycleRef: getFishFarmingMetadataLabel(metadata, "cycleRef", "Cycle non renseigne"),
    species: getFishFarmingMetadataLabel(metadata, "species", "Espece non renseignee")
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
    return `Tache: ${FISH_FARMING_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toFishFarmingPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: FishFarmingReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes periodes";
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
    herdRef: getLivestockMetadataLabel(metadata, "herdRef", "Troupeau non renseigne"),
    batchRef: getLivestockMetadataLabel(metadata, "batchRef", "Lot non renseigne"),
    species: getLivestockMetadataLabel(metadata, "species", "Espece non renseignee")
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
    return `Tache: ${LIVESTOCK_TASK_LABELS[taskKind] ?? taskKind}`;
  }
  return operationKind;
}

function toLivestockPeriodLabel(
  filters: ReportPeriodFilter,
  _rows: LivestockReportBucket[]
): string {
  if (!filters.dateFrom && !filters.dateTo) {
    return "Toutes periodes";
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
      itemLabel: "Non renseigne"
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
    fishFarmingOperationsReport: buildFishFarmingOperationsReport(operationalTransactions, operationalTasks, filters),
    livestockOperationsReport: buildLivestockOperationsReport(operationalTransactions, operationalTasks, filters),
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
      name: "Synthese",
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
      name: "Elevage",
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
      name: "ElevageOps",
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
      name: "Synthese",
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
      name: "Elevage",
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
      name: "ElevageOps",
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
      name: "Taches",
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
    doc.fontSize(10).text(`Periode appliquee: ${periodLabel}`);
    doc.fontSize(10).text(`Activite: ${toDisplayActivityLabel(filters.activityCode)}`);
    if (overview.activityProfile) {
      doc.fontSize(10).text(`Mode operatoire: ${overview.activityProfile.operationsModel}`);
    }

    writePdfSectionTitle(doc, "Synthese consolidee");
    writePdfList(
      doc,
      [
        `Transactions consolidees: ${overview.financeByStatus.reduce((sum, item) => sum + item.count, 0)}`,
        `Taches consolidees: ${overview.taskByStatus.reduce((sum, item) => sum + item.count, 0)}`
      ],
      "Aucune synthese disponible."
    );

    writePdfSectionTitle(doc, "Rentabilite et execution XOF");
    writePdfList(
      doc,
      limitPdfRows(
        overview.operationalPerformance
          .filter((item) => item.transactionsCount > 0 || item.totalTasksCount > 0)
          .map(
            (item) =>
              `${item.scope === "ACTIVITY" ? "Secteur" : "Sous-section"} | ${BUSINESS_ACTIVITY_LABELS[item.activityCode]} | ${item.dimensionLabel}: ${item.itemLabel} | net ${item.netProfit} XOF | marge ${item.marginRate}% | execution ${item.executionRate}% | bloquees ${item.blockedTasksCount} | retards ${item.overdueTasksCount}`
          )
      ),
      "Aucune donnee de pilotage operationnel sur cette periode."
    );

    if (overview.hardwareMonthlyReport) {
      const hardwareReport = overview.hardwareMonthlyReport;
      writePdfSectionTitle(doc, `Rapport quincaillerie - ${hardwareReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...hardwareReport.rows.map(
            (item) =>
              `${item.date} | ${item.designation} | quantite ${item.quantity} | vente ${item.salesAmount} XOF | versement ${item.paymentAmount} XOF | cout ${item.purchaseAmount} XOF | benefice ${item.grossProfit} XOF`
          ),
          `TOTAL | quantite ${hardwareReport.totals.quantity} | vente ${hardwareReport.totals.salesAmount} XOF | versement ${hardwareReport.totals.paymentAmount} XOF | cout ${hardwareReport.totals.purchaseAmount} XOF | benefice ${hardwareReport.totals.grossProfit} XOF`
        ]),
        "Aucune vente quincaillerie soumise ou approuvee sur cette periode."
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
              `${item.pondRef} | ${item.cycleRef} | ${item.species} | alevins ${item.fingerlingsQuantity} | aliment ${item.feedQuantity} | ventes ${item.soldQuantity} | mortalite ${item.mortalityCount} | net ${item.netAmount} XOF | execution ${item.executionRate}%`
          ),
          `TOTAL | bassins ${fishReport.totals.pondsCount} | cycles ${fishReport.totals.cyclesCount} | alevins ${fishReport.totals.fingerlingsQuantity} | aliment ${fishReport.totals.feedQuantity} | ventes ${fishReport.totals.soldQuantity} | mortalite ${fishReport.totals.mortalityCount} | net ${fishReport.totals.netAmount} XOF`
        ]),
        "Aucune operation piscicole sur cette periode."
      );
    }

    if (overview.livestockOperationsReport) {
      const livestockReport = overview.livestockOperationsReport;
      writePdfSectionTitle(doc, `Rapport elevage - ${livestockReport.periodLabel}`);
      writePdfList(
        doc,
        limitPdfRows([
          ...livestockReport.rows.map(
            (item) =>
              `${item.herdRef} | ${item.batchRef} | ${item.species} | achats ${item.animalPurchaseCount} | aliment ${item.feedQuantity} | ventes ${item.soldAnimalCount} | produits ${item.productQuantity} | mortalite ${item.mortalityCount} | net ${item.netAmount} XOF | execution ${item.executionRate}%`
          ),
          `TOTAL | troupeaux ${livestockReport.totals.herdsCount} | lots ${livestockReport.totals.batchesCount} | achats ${livestockReport.totals.animalPurchaseCount} | aliment ${livestockReport.totals.feedQuantity} | ventes ${livestockReport.totals.soldAnimalCount} | produits ${livestockReport.totals.productQuantity} | mortalite ${livestockReport.totals.mortalityCount} | net ${livestockReport.totals.netAmount} XOF`
        ]),
        "Aucune operation d'elevage sur cette periode."
      );
    }

    writePdfSectionTitle(doc, "Transactions par type et devise");
    writePdfList(
      doc,
      overview.financeByType.map(
        (item) =>
          `${toDisplayTransactionTypeLabel(item.type)} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency} | approuve ${item.approvedAmount} ${item.currency}`
      ),
      "Aucune transaction consolidee sur cette periode."
    );

    writePdfSectionTitle(doc, "Transactions par statut");
    writePdfList(
      doc,
      overview.financeByStatus.map(
        (item) =>
          `${toDisplayTransactionStatusLabel(item.status)} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency}`
      ),
      "Aucune transaction par statut sur cette periode."
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

    writePdfSectionTitle(doc, "Taches par statut");
    writePdfList(
      doc,
      overview.taskByStatus.map(
        (item) => `${toDisplayTaskStatusLabel(item.status)} | ${item.count} tache(s)`
      ),
      "Aucune tache consolidee sur cette periode."
    );

  }, (doc, pageNumber, totalPages) => {
    drawPdfBrandingFrame(doc, pageNumber, totalPages, periodLabel);
  });
}
