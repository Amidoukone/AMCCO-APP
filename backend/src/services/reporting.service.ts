import { Buffer } from "node:buffer";
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
  listReportRoleDistribution,
  listReportTaskByActivity,
  listReportTaskByStatus,
  listTasksForExport,
  listTransactionsForExport,
  toTaskExportRecord,
  toTransactionExportRecord,
  type ReportPeriodFilter,
  type DashboardSummary,
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
const REPORTING_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"];
const SECTOR_RULES_VERSION = "amcco-sector-rules-v1";

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

function buildWorkbookBuffer(sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
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
      dateFrom: filters.dateFrom ?? "",
      dateTo: filters.dateTo ?? ""
    }
  ];
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

function drawAmccoPdfLogo(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.roundedRect(x, y, 28, 28, 8).fill("#0f2544");
  doc
    .fillColor("#ffffff")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("A", x + 8.5, y + 5.5, {
      width: 12,
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

  for (const item of overview.roleDistribution) {
    rows.push({
      category: "RoleDistribution",
      item: item.role,
      label: item.role,
      value: item.count,
      extra: ""
    });
  }

  for (const item of overview.topAssignees) {
    rows.push({
      category: "TopAssignees",
      item: item.fullName,
      label: `${item.fullName} (${item.role})`,
      value: item.openTasksCount,
      extra: `en cours ${item.inProgressTasksCount} | bloquees ${item.blockedTasksCount} | terminees ${item.doneTasksCount}`
    });
  }

  return rows;
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
    taskActivitySummary
  ] = await Promise.all([
    getDashboardCompanySummary(actor.companyId, actor.actorId),
    getDashboardFinanceSummary(actor.companyId, filters),
    getDashboardOperationsSummary(actor.companyId, actor.actorId, filters),
    listFinancialAccounts({ companyId: actor.companyId }),
    listDashboardRecentTransactions(actor.companyId, 6, filters),
    listDashboardRecentTasks(actor.companyId, 6, actor.role, actor.actorId, filters),
    actor.role === "EMPLOYEE" ? Promise.resolve([]) : listDashboardWorkload(actor.companyId, 5, filters),
    listDashboardFinanceActivitySummary(actor.companyId),
    listDashboardTaskActivitySummary(actor.companyId)
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

  const [
    financeByStatus,
    financeByType,
    financeByActivity,
    financialAccounts,
    taskByStatus,
    taskByActivity,
    roleDistribution,
    topAssignees
  ] =
    await Promise.all([
      listReportFinanceByStatus(actor.companyId, filters),
      listReportFinanceByType(actor.companyId, filters),
      listReportFinanceByActivity(actor.companyId, filters),
      listFinancialAccounts({ companyId: actor.companyId }),
      listReportTaskByStatus(actor.companyId, filters),
      listReportTaskByActivity(actor.companyId, filters),
      listReportRoleDistribution(actor.companyId),
      listDashboardWorkload(actor.companyId, 10, filters)
    ]);

  const financeByActivitySummary = buildReportFinanceByActivitySummary(financeByActivity);
  const taskByActivitySummary = buildReportTaskByActivitySummary(taskByActivity);
  const selectedFinanceActivity = filters.activityCode
    ? financeByActivitySummary.find((item) => item.activityCode === filters.activityCode)
    : null;
  const selectedTaskActivity = filters.activityCode
    ? taskByActivitySummary.find((item) => item.activityCode === filters.activityCode)
    : null;
  const financeAccountsSummary = buildFinancialAccountsSummary(
    financialAccounts,
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
    activityProfile: filters.activityCode ? getBusinessActivityProfile(filters.activityCode) : null,
    availableActivityProfiles: listBusinessActivityProfiles(),
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
    financeAccounts: buildFinancialAccountGovernanceItems(financialAccounts, filters.activityCode),
    taskByStatus,
    taskByActivity: taskByActivitySummary,
    roleDistribution,
    topAssignees
  };
}

export async function exportCompanyTransactionsCsv(
  actor: ActorContext,
  input: ReportFiltersInput = {}
): Promise<string> {
  ensureReportingAccess(actor.role);
  const filters = normalizeReportFilters(input);
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
  const overview = await getCompanyReportsOverview(actor, input);
  const rows = await listTransactionsForExport(actor.companyId, filters);
  const records = rows.map(toTransactionExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters)
    },
    {
      name: "Synthese",
      rows: buildOverviewSummaryRows(overview)
    },
    {
      name: "Transactions",
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
  const overview = await getCompanyReportsOverview(actor, input);
  const rows = await listTasksForExport(actor.companyId, filters);
  const records = rows.map(toTaskExportRecord);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: buildOverviewMetadataRows(filters)
    },
    {
      name: "Synthese",
      rows: buildOverviewSummaryRows(overview)
    },
    {
      name: "Taches",
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
  const overview = await getCompanyReportsOverview(actor, input);
  const periodLabel = toDisplayPeriodLabel(filters);

  return buildPdfBuffer((doc) => {
    doc.on("pageAdded", () => {
      doc.y = 96;
    });
    doc.y = 96;
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

    writePdfSectionTitle(doc, "Transactions par type et devise");
    writePdfList(
      doc,
      overview.financeByType.map(
        (item) =>
          `${item.type} | ${item.currency} | ${item.count} transaction(s) | total ${item.totalAmount} ${item.currency} | approuve ${item.approvedAmount} ${item.currency}`
      ),
      "Aucune transaction consolidee sur cette periode."
    );

    writePdfSectionTitle(doc, "Taches par statut");
    writePdfList(
      doc,
      overview.taskByStatus.map((item) => `${item.status} | ${item.count} tache(s)`),
      "Aucune tache consolidee sur cette periode."
    );

    
  }, (doc, pageNumber, totalPages) => {
    drawPdfBrandingFrame(doc, pageNumber, totalPages, periodLabel);
  });
}
