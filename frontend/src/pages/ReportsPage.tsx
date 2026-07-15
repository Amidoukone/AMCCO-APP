import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FeedbackBanner } from "../components/FeedbackBanner";
import {
  ApiError,
  downloadReportExportRequest,
  getReportsOverviewRequest
} from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  getBusinessActivityLabel,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { ReportsOverview } from "../types/reporting";

type ReportPeriodMode = "CUSTOM" | "MONTH" | "QUARTER" | "YEAR";

type PeriodFormState = {
  periodMode: ReportPeriodMode;
  dateFrom: string;
  dateTo: string;
  month: string;
  quarter: string;
  year: string;
  activityCode: BusinessActivityCode | "";
};

type ReportPeriodQuery = {
  dateFrom?: string;
  dateTo?: string;
  activityCode?: BusinessActivityCode;
};

type ExportTarget = "overview-pdf";

const REPORT_PERIOD_MODE_OPTIONS: Array<{ value: ReportPeriodMode; label: string }> = [
  { value: "CUSTOM", label: "Dates" },
  { value: "MONTH", label: "Mois" },
  { value: "QUARTER", label: "Trimestre" },
  { value: "YEAR", label: "Annee" }
];

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR");
}

function formatReportDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

function taskStatusLabel(status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"): string {
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

function transactionStatusLabel(status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "SUBMITTED") {
    return "Soumise";
  }
  if (status === "APPROVED") {
    return "Approuvée";
  }
  return "Rejetée";
}

function transactionTypeLabel(type: "CASH_IN" | "CASH_OUT"): string {
  return type === "CASH_IN" ? "Entrée" : "Sortie";
}

function parseAmount(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatAmount(value: string | number, currency?: string): string {
  const amount = typeof value === "number" ? value : parseAmount(value);
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);
  return currency ? `${formatted} ${currency}` : formatted;
}

function accountScopeLabel(account: ReportsOverview["financeAccounts"][number]): string {
  if (account.scopeType === "GLOBAL") {
    return "Global entreprise";
  }

  if (account.scopeType === "DEDICATED") {
    return account.primaryActivityCode
      ? `Dédié: ${getBusinessActivityLabel(account.primaryActivityCode)}`
      : "Dédié";
  }

  return account.allowedActivityCodes.length > 0
    ? `Restreint: ${account.allowedActivityCodes.map(getBusinessActivityLabel).join(", ")}`
    : "Restreint";
}

function highlightToneClass(emphasis: "INFO" | "WARNING" | "CRITICAL"): string {
  if (emphasis === "CRITICAL") {
    return "severity-critical";
  }
  if (emphasis === "WARNING") {
    return "severity-warning";
  }
  return "severity-info";
}

function formatRate(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1
  }).format(value)}%`;
}

function operationalScopeLabel(scope: "ACTIVITY" | "SUBSECTION"): string {
  return scope === "ACTIVITY" ? "Secteur" : "Sous-section";
}

function buildApprovedCurrencyRows(overview: ReportsOverview): Array<{
  currency: string;
  cashIn: number;
  cashOut: number;
  net: number;
}> {
  const rows = new Map<string, { currency: string; cashIn: number; cashOut: number; net: number }>();

  for (const item of overview.financeByType) {
    const current = rows.get(item.currency) ?? {
      currency: item.currency,
      cashIn: 0,
      cashOut: 0,
      net: 0
    };
    const approvedAmount = parseAmount(item.approvedAmount);
    if (item.type === "CASH_IN") {
      current.cashIn += approvedAmount;
    } else {
      current.cashOut += approvedAmount;
    }
    current.net = current.cashIn - current.cashOut;
    rows.set(item.currency, current);
  }

  return Array.from(rows.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

function buildReportMetrics(overview: ReportsOverview) {
  const transactionCount = overview.financeByType.reduce((sum, item) => sum + item.count, 0);
  const submittedTransactions = overview.financeByStatus
    .filter((item) => item.status === "SUBMITTED")
    .reduce((sum, item) => sum + item.count, 0);
  const approvedTransactions = overview.financeByStatus
    .filter((item) => item.status === "APPROVED")
    .reduce((sum, item) => sum + item.count, 0);
  const totalTasks = overview.taskByStatus.reduce((sum, item) => sum + item.count, 0);
  const openTasks = overview.taskByStatus
    .filter((item) => item.status !== "DONE")
    .reduce((sum, item) => sum + item.count, 0);
  const blockedTasks = overview.taskByStatus
    .filter((item) => item.status === "BLOCKED")
    .reduce((sum, item) => sum + item.count, 0);
  const doneTasks = overview.taskByStatus
    .filter((item) => item.status === "DONE")
    .reduce((sum, item) => sum + item.count, 0);
  const approvedCurrencyRows = buildApprovedCurrencyRows(overview);
  const netApprovedLabel = approvedCurrencyRows.length > 0
    ? approvedCurrencyRows.map((item) => formatAmount(item.net, item.currency)).join(" / ")
    : "0";

  return {
    transactionCount,
    submittedTransactions,
    approvedTransactions,
    totalTasks,
    openTasks,
    blockedTasks,
    doneTasks,
    approvedCurrencyRows,
    netApprovedLabel
  };
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function toStartOfDayIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

function toEndOfDayIso(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCurrentQuarterValue(value = new Date()): string {
  return String(Math.floor(value.getMonth() / 3) + 1);
}

function getCurrentYearValue(value = new Date()): string {
  return String(value.getFullYear());
}

function createDefaultPeriodForm(activityCode: BusinessActivityCode | ""): PeriodFormState {
  const now = new Date();
  return {
    periodMode: "CUSTOM",
    dateFrom: "",
    dateTo: "",
    month: toMonthInputValue(now),
    quarter: getCurrentQuarterValue(now),
    year: getCurrentYearValue(now),
    activityCode
  };
}

function isValidYearValue(value: string): boolean {
  const year = Number(value);
  return /^\d{4}$/.test(value) && Number.isInteger(year) && year >= 1900 && year <= 9999;
}

function isValidMonthInputValue(value: string): boolean {
  const [yearPart, monthPart] = value.split("-");
  const month = Number(monthPart);
  return isValidYearValue(yearPart) && Number.isInteger(month) && month >= 1 && month <= 12;
}

function resolvePeriodRange(form: PeriodFormState): Pick<ReportPeriodQuery, "dateFrom" | "dateTo"> {
  if (form.periodMode === "MONTH") {
    const [yearValue, monthValue] = form.month.split("-").map(Number);
    if (!isValidMonthInputValue(form.month)) {
      return {};
    }

    const start = new Date(yearValue, monthValue - 1, 1);
    const end = new Date(yearValue, monthValue, 0);
    return {
      dateFrom: toStartOfDayIso(toDateInputValue(start)),
      dateTo: toEndOfDayIso(toDateInputValue(end))
    };
  }

  if (form.periodMode === "QUARTER") {
    const yearValue = Number(form.year);
    const quarterValue = Number(form.quarter);
    if (!isValidYearValue(form.year) || !Number.isInteger(quarterValue) || quarterValue < 1 || quarterValue > 4) {
      return {};
    }

    const startMonth = (quarterValue - 1) * 3;
    const start = new Date(yearValue, startMonth, 1);
    const end = new Date(yearValue, startMonth + 3, 0);
    return {
      dateFrom: toStartOfDayIso(toDateInputValue(start)),
      dateTo: toEndOfDayIso(toDateInputValue(end))
    };
  }

  if (form.periodMode === "YEAR") {
    const yearValue = Number(form.year);
    if (!isValidYearValue(form.year)) {
      return {};
    }

    return {
      dateFrom: toStartOfDayIso(`${yearValue}-01-01`),
      dateTo: toEndOfDayIso(`${yearValue}-12-31`)
    };
  }

  return {
    dateFrom: form.dateFrom ? toStartOfDayIso(form.dateFrom) : undefined,
    dateTo: form.dateTo ? toEndOfDayIso(form.dateTo) : undefined
  };
}

function normalizePeriodQuery(form: PeriodFormState): ReportPeriodQuery {
  const periodRange = resolvePeriodRange(form);
  return {
    ...periodRange,
    activityCode: form.activityCode || undefined
  };
}

function validatePeriodForm(form: PeriodFormState): string | null {
  if (!form.activityCode) {
    return "Selectionnez un secteur pour afficher le rapport.";
  }

  if (form.periodMode === "CUSTOM") {
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      return "La date de debut doit etre inferieure ou egale a la date de fin.";
    }
    return null;
  }

  if (form.periodMode === "MONTH" && !isValidMonthInputValue(form.month)) {
    return "Selectionnez un mois valide pour le rapport.";
  }

  if ((form.periodMode === "QUARTER" || form.periodMode === "YEAR") && !isValidYearValue(form.year)) {
    return "Saisissez une annee valide pour le rapport.";
  }

  if (form.periodMode === "QUARTER" && !["1", "2", "3", "4"].includes(form.quarter)) {
    return "Selectionnez un trimestre valide pour le rapport.";
  }

  return null;
}

function buildExportPeriodFilePart(form: PeriodFormState): string {
  if (form.periodMode === "MONTH") {
    return `mois-${form.month || "non-selectionne"}`;
  }

  if (form.periodMode === "QUARTER") {
    return `trimestre-${form.year || "annee"}-T${form.quarter || "0"}`;
  }

  if (form.periodMode === "YEAR") {
    return `annee-${form.year || "non-selectionnee"}`;
  }

  return `dates-${form.dateFrom || "all"}-${form.dateTo || "all"}`;
}

function buildExportFileName(form: PeriodFormState): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `amcco-rapport-${buildExportPeriodFilePart(form)}-${stamp}.pdf`;
}

function formatAppliedRange(overview: ReportsOverview): string {
  if (!overview.filters.dateFrom && !overview.filters.dateTo) {
    return overview.filters.activityCode
      ? `Toutes périodes | ${getBusinessActivityLabel(overview.filters.activityCode)}`
      : "Toutes périodes | Secteur non selectionne";
  }

  const fromLabel = overview.filters.dateFrom
    ? new Date(overview.filters.dateFrom).toLocaleDateString("fr-FR")
    : "origine";
  const toLabel = overview.filters.dateTo
    ? new Date(overview.filters.dateTo).toLocaleDateString("fr-FR")
    : "aujourd'hui";

  const periodLabel = `${fromLabel} -> ${toLabel}`;
  if (!overview.filters.activityCode) {
    return `${periodLabel} | Secteur non selectionne`;
  }
  return `${periodLabel} | ${getBusinessActivityLabel(overview.filters.activityCode)}`;
}

export function ReportsPage(): JSX.Element {
  const withAuthorizedToken = useAuthorizedRequest();
  const { enabledActivities, selectedActivity, selectedActivityCode } = useBusinessActivity();
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(() =>
    createDefaultPeriodForm(selectedActivityCode ?? "")
  );
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFormState>(() =>
    createDefaultPeriodForm(selectedActivityCode ?? "")
  );
  const [isLoading, setIsLoading] = useState(true);
  const [busyExport, setBusyExport] = useState<ExportTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!appliedPeriod.activityCode) {
      setOverview(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        getReportsOverviewRequest(accessToken, normalizePeriodQuery(appliedPeriod))
      );
      setOverview(response.item);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [appliedPeriod, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const nextActivityCode = selectedActivityCode ?? "";
    setPeriodForm((prev) =>
      prev.activityCode === nextActivityCode ? prev : { ...prev, activityCode: nextActivityCode }
    );
    setAppliedPeriod((prev) =>
      prev.activityCode === nextActivityCode ? prev : { ...prev, activityCode: nextActivityCode }
    );
  }, [selectedActivityCode]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const validationMessage = validatePeriodForm(periodForm);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setSuccessMessage(null);
    setErrorMessage(null);
    setAppliedPeriod(periodForm);
  }

  function handleResetFilters(): void {
    const nextActivityCode = selectedActivityCode ?? "";
    setSuccessMessage(null);
    setErrorMessage(null);
    const nextPeriod = createDefaultPeriodForm(nextActivityCode);
    setPeriodForm(nextPeriod);
    setAppliedPeriod(nextPeriod);
  }

  const reportMetrics = useMemo(
    () => (overview ? buildReportMetrics(overview) : null),
    [overview]
  );
  const hasFocusedOperationsReport = Boolean(
    overview?.agricultureOperationsReport ||
    overview?.fishFarmingOperationsReport ||
    overview?.livestockOperationsReport
  );

  async function handleExport(): Promise<void> {
    const validationMessage = validatePeriodForm(periodForm);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    const exportPeriod = periodForm;
    setAppliedPeriod(exportPeriod);
    setBusyExport("overview-pdf");
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await withAuthorizedToken((accessToken) =>
        downloadReportExportRequest(
          accessToken,
          "overview",
          "pdf",
          normalizePeriodQuery(exportPeriod)
        )
      );
      triggerBlobDownload(blob, buildExportFileName(exportPeriod));

      setSuccessMessage("Export PDF du rapport genere pour la periode selectionnee.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyExport(null);
    }
  }

  return (
    <>
      <header className="section-header">
        <h2>Rapports PDF</h2>
        <p>Donnees du secteur choisi, calculees depuis les transactions, taches et comptes.</p>
      </header>

      <section className="panel">
        <h3>Filtres du rapport</h3>
        <div className="reports-period-presets" role="group" aria-label="Type de periode">
          {REPORT_PERIOD_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={periodForm.periodMode === option.value ? "view-preset-btn is-active" : "view-preset-btn"}
              onClick={() =>
                setPeriodForm((prev) => ({
                  ...prev,
                  periodMode: option.value
                }))
              }
              aria-pressed={periodForm.periodMode === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <form className="reports-filter-form" onSubmit={handleApplyFilters}>
          {periodForm.periodMode === "CUSTOM" ? (
            <>
              <label className="reports-filter-field" htmlFor="reports-date-from">
                <span>Date debut</span>
                <input
                  id="reports-date-from"
                  type="date"
                  value={periodForm.dateFrom}
                  onChange={(event) =>
                    setPeriodForm((prev) => ({
                      ...prev,
                      dateFrom: event.target.value
                    }))
                  }
                />
              </label>
              <label className="reports-filter-field" htmlFor="reports-date-to">
                <span>Date fin</span>
                <input
                  id="reports-date-to"
                  type="date"
                  value={periodForm.dateTo}
                  onChange={(event) =>
                    setPeriodForm((prev) => ({
                      ...prev,
                      dateTo: event.target.value
                    }))
                  }
                />
              </label>
            </>
          ) : null}
          {periodForm.periodMode === "MONTH" ? (
            <label className="reports-filter-field" htmlFor="reports-month">
              <span>Mois</span>
              <input
                id="reports-month"
                type="month"
                value={periodForm.month}
                onChange={(event) =>
                  setPeriodForm((prev) => ({
                    ...prev,
                    month: event.target.value
                  }))
                }
              />
            </label>
          ) : null}
          {periodForm.periodMode === "QUARTER" ? (
            <>
              <label className="reports-filter-field" htmlFor="reports-quarter-year">
                <span>Annee</span>
                <input
                  id="reports-quarter-year"
                  type="number"
                  min="1900"
                  max="9999"
                  step="1"
                  value={periodForm.year}
                  onChange={(event) =>
                    setPeriodForm((prev) => ({
                      ...prev,
                      year: event.target.value
                    }))
                  }
                />
              </label>
              <label className="reports-filter-field" htmlFor="reports-quarter">
                <span>Trimestre</span>
                <select
                  id="reports-quarter"
                  value={periodForm.quarter}
                  onChange={(event) =>
                    setPeriodForm((prev) => ({
                      ...prev,
                      quarter: event.target.value
                    }))
                  }
                >
                  <option value="1">T1 - Janvier a Mars</option>
                  <option value="2">T2 - Avril a Juin</option>
                  <option value="3">T3 - Juillet a Septembre</option>
                  <option value="4">T4 - Octobre a Decembre</option>
                </select>
              </label>
            </>
          ) : null}
          {periodForm.periodMode === "YEAR" ? (
            <label className="reports-filter-field" htmlFor="reports-year">
              <span>Annee</span>
              <input
                id="reports-year"
                type="number"
                min="1900"
                max="9999"
                step="1"
                value={periodForm.year}
                onChange={(event) =>
                  setPeriodForm((prev) => ({
                    ...prev,
                    year: event.target.value
                  }))
                }
              />
            </label>
          ) : null}
          <label className="reports-filter-field" htmlFor="reports-activity-code">
            <span>Secteur</span>
            <select
              id="reports-activity-code"
              value={periodForm.activityCode}
              onChange={(event) =>
                setPeriodForm((prev) => ({
                  ...prev,
                  activityCode: event.target.value as BusinessActivityCode
                }))
              }
              disabled={enabledActivities.length === 0}
            >
              {enabledActivities.length === 0 ? (
                <option value="">Aucun secteur actif</option>
              ) : null}
              {enabledActivities.map((activity) => (
                <option key={activity.code} value={activity.code}>
                  {activity.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Mettre à jour</button>
          <button type="button" className="secondary-btn" onClick={handleResetFilters}>
            Réinitialiser les filtres
          </button>
        </form>
        <p className="hint">
          Secteur applique: {selectedActivity?.label ?? "aucun secteur actif"}.
        </p>
      </section>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      {!isLoading && overview && reportMetrics ? (
        <>
          <section className="panel reports-overview-panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Vue du rapport</h3>
                <p className="hint">
                  Consolidation: {formatDateTime(overview.generatedAt)} | Période:{" "}
                  {formatAppliedRange(overview)}
                </p>
              </div>
            </div>

            <div className="reports-summary-grid">
              <article className="reports-kpi-card">
                <span>Transactions filtrées</span>
                <strong>{formatCount(reportMetrics.transactionCount)}</strong>
                <small>
                  {formatCount(reportMetrics.submittedTransactions)} soumises,{" "}
                  {formatCount(reportMetrics.approvedTransactions)} approuvées
                </small>
              </article>
              <article className="reports-kpi-card">
                <span>Solde approuvé</span>
                <strong>{reportMetrics.netApprovedLabel}</strong>
                <small>Entrées approuvées moins sorties approuvées</small>
              </article>
              <article className="reports-kpi-card">
                <span>Tâches suivies</span>
                <strong>
                  {formatCount(reportMetrics.openTasks)} / {formatCount(reportMetrics.totalTasks)}
                </strong>
                <small>
                  {formatCount(reportMetrics.blockedTasks)} bloquées,{" "}
                  {formatCount(reportMetrics.doneTasks)} terminées
                </small>
              </article>
            </div>
          </section>

          <section className="panel reports-export-panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Export PDF avec les filtres selectionnes</h3>
                <p className="hint">Le fichier PDF reprend la periode et le secteur choisis dans les filtres.</p>
              </div>
              <div className="reports-export-grid">
                <article className="reports-export-card">
                  <strong className="reports-export-card-title">Rapport PDF</strong>
                  <p className="hint">Synthese, flux financiers, comptes et taches du secteur.</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleExport()}
                    disabled={busyExport !== null}
                  >
                    {busyExport === "overview-pdf" ? "Préparation..." : "Télécharger PDF"}
                  </button>
                </article>
              </div>
            </div>
          </section>

          {!hasFocusedOperationsReport ? (
            <>
          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Profil du secteur</h3>
                <p className="hint">
                  {overview.activityProfile
                    ? `${overview.activityProfile.label} | ${overview.activityProfile.reporting.focusArea}`
                    : "Aucun secteur selectionne."}
                </p>
              </div>
            </div>

            {overview.activityProfile ? (
              <div className="reports-profile-grid">
                <article className="reports-focus-note">
                  <strong>Mode opérationnel</strong>
                  <span>{overview.activityProfile.operationsModel}</span>
                </article>
                <article className="reports-focus-note">
                  <strong>Sections exportées</strong>
                  <span>{overview.activityProfile.reporting.exportSections.join(" | ")}</span>
                </article>
                <article className="reports-focus-note">
                  <strong>Devises autorisées</strong>
                  <span>{overview.activityProfile.finance.allowedCurrencies.join(", ")}</span>
                </article>
              </div>
            ) : (
              <p className="hint">Selectionnez un secteur actif pour afficher son profil.</p>
            )}

            {overview.activityHighlights.length > 0 ? (
              <div className="reports-highlight-grid">
                {overview.activityHighlights.map((item) => (
                  <article
                    className={`highlight-card ${highlightToneClass(item.emphasis)}`}
                    key={item.code}
                  >
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Rentabilité et exécution</h3>
                <p className="hint">
                  Pilotage adapté au contexte malien: marge XOF, suivi des tâches,
                  blocages, retards et efficacité opérationnelle.
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Niveau</th>
                    <th>Secteur</th>
                    <th>Dimension</th>
                    <th>Élément</th>
                    <th>Entrées XOF</th>
                    <th>Sorties XOF</th>
                    <th>Net XOF</th>
                    <th>Marge</th>
                    <th>Rent. coûts</th>
                    <th>Exécution</th>
                    <th>Ouvertes</th>
                    <th>Bloquées</th>
                    <th>Retards</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.operationalPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={13}>
                        Aucune donnée de rentabilité ou d'exécution sur la période filtrée.
                      </td>
                    </tr>
                  ) : (
                    overview.operationalPerformance
                      .filter((row) => row.transactionsCount > 0 || row.totalTasksCount > 0)
                      .map((row) => (
                        <tr key={`${row.scope}-${row.activityCode}-${row.dimensionKey}-${row.itemKey}`}>
                          <td>{operationalScopeLabel(row.scope)}</td>
                          <td>{getBusinessActivityLabel(row.activityCode)}</td>
                          <td>{row.dimensionLabel}</td>
                          <td>{row.itemLabel}</td>
                          <td>{formatAmount(row.approvedCashIn, row.currency)}</td>
                          <td>{formatAmount(row.approvedCashOut, row.currency)}</td>
                          <td>{formatAmount(row.netProfit, row.currency)}</td>
                          <td>{formatRate(row.marginRate)}</td>
                          <td>{formatRate(row.returnOnCostRate)}</td>
                          <td>{formatRate(row.executionRate)}</td>
                          <td>{formatCount(row.openTasksCount)}</td>
                          <td>{formatCount(row.blockedTasksCount)}</td>
                          <td>{formatCount(row.overdueTasksCount)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
            </>
          ) : null}

          {overview.hardwareMonthlyReport ? (
            <section className="panel">
              <div className="dashboard-panel-header">
                <div>
                  <h3>Rapport quincaillerie</h3>
                  <p className="hint">
                    {overview.hardwareMonthlyReport.periodLabel} | ventes soumises ou approuvees en XOF.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Designation</th>
                      <th>Quantite</th>
                      <th>Vente par jour</th>
                      <th>Versement</th>
                      <th>Cout achat</th>
                      <th>Benefice</th>
                      <th>Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.hardwareMonthlyReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          Aucune vente quincaillerie soumise ou approuvee sur la periode filtree.
                        </td>
                      </tr>
                    ) : (
                      overview.hardwareMonthlyReport.rows.map((row) => (
                        <tr key={`${row.date}-${row.designation}`}>
                          <td>{formatReportDate(row.date)}</td>
                          <td>{row.designation}</td>
                          <td>{formatCount(row.quantity)}</td>
                          <td>{formatAmount(row.salesAmount, row.currency)}</td>
                          <td>{formatAmount(row.paymentAmount, row.currency)}</td>
                          <td>{formatAmount(row.purchaseAmount, row.currency)}</td>
                          <td>{formatAmount(row.grossProfit, row.currency)}</td>
                          <td>{formatRate(row.marginRate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>TOTAL</th>
                      <th>{formatCount(overview.hardwareMonthlyReport.totals.quantity)}</th>
                      <th>
                        {formatAmount(
                          overview.hardwareMonthlyReport.totals.salesAmount,
                          overview.hardwareMonthlyReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.hardwareMonthlyReport.totals.paymentAmount,
                          overview.hardwareMonthlyReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.hardwareMonthlyReport.totals.purchaseAmount,
                          overview.hardwareMonthlyReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.hardwareMonthlyReport.totals.grossProfit,
                          overview.hardwareMonthlyReport.totals.currency
                        )}
                      </th>
                      <th>{formatRate(overview.hardwareMonthlyReport.totals.marginRate)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : null}

          {overview.agricultureOperationsReport ? (
            <section className="panel">
              <div className="dashboard-panel-header">
                <div>
                  <h3>Rapport activite agricole</h3>
                  <p className="hint">
                    {overview.agricultureOperationsReport.periodLabel} | suivi par campagne, parcelle,
                    type de champ et culture.
                  </p>
                </div>
              </div>

              <div className="reports-summary-grid">
                <article className="reports-kpi-card">
                  <span>Parcelles suivies</span>
                  <strong>{formatCount(overview.agricultureOperationsReport.totals.parcelsCount)}</strong>
                  <small>
                    Surface: {formatAmount(overview.agricultureOperationsReport.totals.surfaceArea)} ha
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Solde agricole</span>
                  <strong>
                    {formatAmount(
                      overview.agricultureOperationsReport.totals.netAmount,
                      overview.agricultureOperationsReport.totals.currency
                    )}
                  </strong>
                  <small>
                    Recettes - depenses sur les operations agricoles.
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Execution terrain</span>
                  <strong>{formatRate(overview.agricultureOperationsReport.totals.executionRate)}</strong>
                  <small>
                    {formatCount(overview.agricultureOperationsReport.totals.doneTasksCount)} terminees,{" "}
                    {formatCount(overview.agricultureOperationsReport.totals.openTasksCount)} ouvertes
                  </small>
                </article>
              </div>

              <div className="reports-data-grid">
                <article className="reports-table-panel">
                  <div className="reports-table-header">
                    <h4>Types d'operations</h4>
                    <span>{formatCount(overview.agricultureOperationsReport.operationRows.length)} type(s)</span>
                  </div>
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Operation</th>
                          <th>Transactions</th>
                          <th>Taches</th>
                          <th>Recettes</th>
                          <th>Depenses</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.agricultureOperationsReport.operationRows.length === 0 ? (
                          <tr>
                            <td colSpan={6}>Aucune operation agricole sur la periode filtree.</td>
                          </tr>
                        ) : (
                          overview.agricultureOperationsReport.operationRows.map((row) => (
                            <tr key={row.operationKind}>
                              <td>{row.operationLabel}</td>
                              <td>{formatCount(row.transactionsCount)}</td>
                              <td>{formatCount(row.tasksCount)}</td>
                              <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                              <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                              <td>{formatAmount(row.netAmount, row.currency)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Campagne</th>
                      <th>Parcelle</th>
                      <th>Type de champ</th>
                      <th>Culture</th>
                      <th>Surface</th>
                      <th>Recettes</th>
                      <th>Depenses</th>
                      <th>Net</th>
                      <th>Execution</th>
                      <th>Blocages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.agricultureOperationsReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={10}>
                          Aucune parcelle agricole alimentee sur la periode filtree.
                        </td>
                      </tr>
                    ) : (
                      overview.agricultureOperationsReport.rows.map((row) => (
                        <tr key={`${row.campaignRef}-${row.parcelRef}-${row.fieldType}-${row.cropType}`}>
                          <td>{row.campaignRef}</td>
                          <td>{row.parcelRef}</td>
                          <td>{row.fieldType}</td>
                          <td>{row.cropType}</td>
                          <td>{formatAmount(row.surfaceArea)} ha</td>
                          <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                          <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                          <td>{formatAmount(row.netAmount, row.currency)}</td>
                          <td>{formatRate(row.executionRate)}</td>
                          <td>{formatCount(row.blockedTasksCount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4}>TOTAL</th>
                      <th>{formatAmount(overview.agricultureOperationsReport.totals.surfaceArea)} ha</th>
                      <th>
                        {formatAmount(
                          overview.agricultureOperationsReport.totals.cashInAmount,
                          overview.agricultureOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.agricultureOperationsReport.totals.cashOutAmount,
                          overview.agricultureOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.agricultureOperationsReport.totals.netAmount,
                          overview.agricultureOperationsReport.totals.currency
                        )}
                      </th>
                      <th>{formatRate(overview.agricultureOperationsReport.totals.executionRate)}</th>
                      <th>{formatCount(overview.agricultureOperationsReport.totals.blockedTasksCount)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : null}

          {overview.fishFarmingOperationsReport ? (
            <section className="panel">
              <div className="dashboard-panel-header">
                <div>
                  <h3>Rapport pisciculture</h3>
                  <p className="hint">
                    {overview.fishFarmingOperationsReport.periodLabel} | suivi par bassin, cycle
                    d'elevage, espece, aliments, ventes et alertes.
                  </p>
                </div>
              </div>

              <div className="reports-summary-grid">
                <article className="reports-kpi-card">
                  <span>Bassins suivis</span>
                  <strong>{formatCount(overview.fishFarmingOperationsReport.totals.pondsCount)}</strong>
                  <small>
                    {formatCount(overview.fishFarmingOperationsReport.totals.cyclesCount)} cycle(s) actif(s)
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Solde piscicole</span>
                  <strong>
                    {formatAmount(
                      overview.fishFarmingOperationsReport.totals.netAmount,
                      overview.fishFarmingOperationsReport.totals.currency
                    )}
                  </strong>
                  <small>
                    Recettes - depenses sur les cycles piscicoles.
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Execution bassin</span>
                  <strong>{formatRate(overview.fishFarmingOperationsReport.totals.executionRate)}</strong>
                  <small>
                    {formatCount(overview.fishFarmingOperationsReport.totals.doneTasksCount)} terminees,{" "}
                    {formatCount(overview.fishFarmingOperationsReport.totals.openTasksCount)} ouvertes
                  </small>
                </article>
              </div>

              <div className="reports-data-grid">
                <article className="reports-table-panel">
                  <div className="reports-table-header">
                    <h4>Types d'operations</h4>
                    <span>{formatCount(overview.fishFarmingOperationsReport.operationRows.length)} type(s)</span>
                  </div>
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Operation</th>
                          <th>Transactions</th>
                          <th>Taches</th>
                          <th>Recettes</th>
                          <th>Depenses</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.fishFarmingOperationsReport.operationRows.length === 0 ? (
                          <tr>
                            <td colSpan={6}>Aucune operation piscicole sur la periode filtree.</td>
                          </tr>
                        ) : (
                          overview.fishFarmingOperationsReport.operationRows.map((row) => (
                            <tr key={row.operationKind}>
                              <td>{row.operationLabel}</td>
                              <td>{formatCount(row.transactionsCount)}</td>
                              <td>{formatCount(row.tasksCount)}</td>
                              <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                              <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                              <td>{formatAmount(row.netAmount, row.currency)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Bassin</th>
                      <th>Cycle</th>
                      <th>Espece</th>
                      <th>Alevins</th>
                      <th>Aliment</th>
                      <th>Ventes</th>
                      <th>Mortalite</th>
                      <th>Recettes</th>
                      <th>Depenses</th>
                      <th>Net</th>
                      <th>Execution</th>
                      <th>Blocages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.fishFarmingOperationsReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={12}>
                          Aucun bassin piscicole alimente sur la periode filtree.
                        </td>
                      </tr>
                    ) : (
                      overview.fishFarmingOperationsReport.rows.map((row) => (
                        <tr key={`${row.pondRef}-${row.cycleRef}-${row.species}`}>
                          <td>{row.pondRef}</td>
                          <td>{row.cycleRef}</td>
                          <td>{row.species}</td>
                          <td>{formatAmount(row.fingerlingsQuantity)}</td>
                          <td>{formatAmount(row.feedQuantity)}</td>
                          <td>{formatAmount(row.soldQuantity)}</td>
                          <td>{formatAmount(row.mortalityCount)}</td>
                          <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                          <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                          <td>{formatAmount(row.netAmount, row.currency)}</td>
                          <td>{formatRate(row.executionRate)}</td>
                          <td>{formatCount(row.blockedTasksCount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>TOTAL</th>
                      <th>{formatAmount(overview.fishFarmingOperationsReport.totals.fingerlingsQuantity)}</th>
                      <th>{formatAmount(overview.fishFarmingOperationsReport.totals.feedQuantity)}</th>
                      <th>{formatAmount(overview.fishFarmingOperationsReport.totals.soldQuantity)}</th>
                      <th>{formatAmount(overview.fishFarmingOperationsReport.totals.mortalityCount)}</th>
                      <th>
                        {formatAmount(
                          overview.fishFarmingOperationsReport.totals.cashInAmount,
                          overview.fishFarmingOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.fishFarmingOperationsReport.totals.cashOutAmount,
                          overview.fishFarmingOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.fishFarmingOperationsReport.totals.netAmount,
                          overview.fishFarmingOperationsReport.totals.currency
                        )}
                      </th>
                      <th>{formatRate(overview.fishFarmingOperationsReport.totals.executionRate)}</th>
                      <th>{formatCount(overview.fishFarmingOperationsReport.totals.blockedTasksCount)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : null}

          {overview.livestockOperationsReport ? (
            <section className="panel">
              <div className="dashboard-panel-header">
                <div>
                  <h3>Rapport elevage</h3>
                  <p className="hint">
                    {overview.livestockOperationsReport.periodLabel} | suivi par troupeau, lot,
                    espece, alimentation, soins, ventes et mortalite.
                  </p>
                </div>
              </div>

              <div className="reports-summary-grid">
                <article className="reports-kpi-card">
                  <span>Troupeaux suivis</span>
                  <strong>{formatCount(overview.livestockOperationsReport.totals.herdsCount)}</strong>
                  <small>
                    {formatCount(overview.livestockOperationsReport.totals.batchesCount)} lot(s) actif(s)
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Solde elevage</span>
                  <strong>
                    {formatAmount(
                      overview.livestockOperationsReport.totals.netAmount,
                      overview.livestockOperationsReport.totals.currency
                    )}
                  </strong>
                  <small>
                    Recettes - depenses sur les lots d'elevage.
                  </small>
                </article>
                <article className="reports-kpi-card">
                  <span>Execution elevage</span>
                  <strong>{formatRate(overview.livestockOperationsReport.totals.executionRate)}</strong>
                  <small>
                    {formatCount(overview.livestockOperationsReport.totals.doneTasksCount)} terminees,{" "}
                    {formatCount(overview.livestockOperationsReport.totals.openTasksCount)} ouvertes
                  </small>
                </article>
              </div>

              <div className="reports-data-grid">
                <article className="reports-table-panel">
                  <div className="reports-table-header">
                    <h4>Types d'operations</h4>
                    <span>{formatCount(overview.livestockOperationsReport.operationRows.length)} type(s)</span>
                  </div>
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Operation</th>
                          <th>Transactions</th>
                          <th>Taches</th>
                          <th>Recettes</th>
                          <th>Depenses</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.livestockOperationsReport.operationRows.length === 0 ? (
                          <tr>
                            <td colSpan={6}>Aucune operation d'elevage sur la periode filtree.</td>
                          </tr>
                        ) : (
                          overview.livestockOperationsReport.operationRows.map((row) => (
                            <tr key={row.operationKind}>
                              <td>{row.operationLabel}</td>
                              <td>{formatCount(row.transactionsCount)}</td>
                              <td>{formatCount(row.tasksCount)}</td>
                              <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                              <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                              <td>{formatAmount(row.netAmount, row.currency)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Troupeau</th>
                      <th>Lot</th>
                      <th>Espece</th>
                      <th>Achats</th>
                      <th>Aliment</th>
                      <th>Ventes</th>
                      <th>Produits</th>
                      <th>Mortalite</th>
                      <th>Recettes</th>
                      <th>Depenses</th>
                      <th>Net</th>
                      <th>Execution</th>
                      <th>Blocages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.livestockOperationsReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={13}>
                          Aucun lot d'elevage alimente sur la periode filtree.
                        </td>
                      </tr>
                    ) : (
                      overview.livestockOperationsReport.rows.map((row) => (
                        <tr key={`${row.herdRef}-${row.batchRef}-${row.species}`}>
                          <td>{row.herdRef}</td>
                          <td>{row.batchRef}</td>
                          <td>{row.species}</td>
                          <td>{formatAmount(row.animalPurchaseCount)}</td>
                          <td>{formatAmount(row.feedQuantity)}</td>
                          <td>{formatAmount(row.soldAnimalCount)}</td>
                          <td>{formatAmount(row.productQuantity)}</td>
                          <td>{formatAmount(row.mortalityCount)}</td>
                          <td>{formatAmount(row.cashInAmount, row.currency)}</td>
                          <td>{formatAmount(row.cashOutAmount, row.currency)}</td>
                          <td>{formatAmount(row.netAmount, row.currency)}</td>
                          <td>{formatRate(row.executionRate)}</td>
                          <td>{formatCount(row.blockedTasksCount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>TOTAL</th>
                      <th>{formatAmount(overview.livestockOperationsReport.totals.animalPurchaseCount)}</th>
                      <th>{formatAmount(overview.livestockOperationsReport.totals.feedQuantity)}</th>
                      <th>{formatAmount(overview.livestockOperationsReport.totals.soldAnimalCount)}</th>
                      <th>{formatAmount(overview.livestockOperationsReport.totals.productQuantity)}</th>
                      <th>{formatAmount(overview.livestockOperationsReport.totals.mortalityCount)}</th>
                      <th>
                        {formatAmount(
                          overview.livestockOperationsReport.totals.cashInAmount,
                          overview.livestockOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.livestockOperationsReport.totals.cashOutAmount,
                          overview.livestockOperationsReport.totals.currency
                        )}
                      </th>
                      <th>
                        {formatAmount(
                          overview.livestockOperationsReport.totals.netAmount,
                          overview.livestockOperationsReport.totals.currency
                        )}
                      </th>
                      <th>{formatRate(overview.livestockOperationsReport.totals.executionRate)}</th>
                      <th>{formatCount(overview.livestockOperationsReport.totals.blockedTasksCount)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : null}

          {!hasFocusedOperationsReport ? (
            <>
          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Rapport financier</h3>
                <p className="hint">Transactions, montants et comptes issus des écritures filtrées.</p>
              </div>
            </div>

            <div className="reports-data-grid">
              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Flux approuvés par devise</h4>
                  <span>{formatCount(reportMetrics.approvedCurrencyRows.length)} devise(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Devise</th>
                        <th>Entrées approuvées</th>
                        <th>Sorties approuvées</th>
                        <th>Solde net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportMetrics.approvedCurrencyRows.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Aucun montant approuvé sur la période filtrée.</td>
                        </tr>
                      ) : (
                        reportMetrics.approvedCurrencyRows.map((item) => (
                          <tr key={item.currency}>
                            <td>{item.currency}</td>
                            <td>{formatAmount(item.cashIn, item.currency)}</td>
                            <td>{formatAmount(item.cashOut, item.currency)}</td>
                            <td>{formatAmount(item.net, item.currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Transactions par statut</h4>
                  <span>{formatCount(overview.financeByStatus.length)} ligne(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Statut</th>
                        <th>Devise</th>
                        <th>Nombre</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.financeByStatus.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Aucune transaction sur la période filtrée.</td>
                        </tr>
                      ) : (
                        overview.financeByStatus.map((item) => (
                          <tr key={`${item.status}-${item.currency}`}>
                            <td>{transactionStatusLabel(item.status)}</td>
                            <td>{item.currency}</td>
                            <td>{formatCount(item.count)}</td>
                            <td>{formatAmount(item.totalAmount, item.currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <div className="reports-data-grid">
              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Transactions par type</h4>
                  <span>{formatCount(overview.financeByType.length)} ligne(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Devise</th>
                        <th>Nombre</th>
                        <th>Total</th>
                        <th>Approuvé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.financeByType.length === 0 ? (
                        <tr>
                          <td colSpan={5}>Aucune transaction par type sur la période filtrée.</td>
                        </tr>
                      ) : (
                        overview.financeByType.map((item) => (
                          <tr key={`${item.type}-${item.currency}`}>
                            <td>{transactionTypeLabel(item.type)}</td>
                            <td>{item.currency}</td>
                            <td>{formatCount(item.count)}</td>
                            <td>{formatAmount(item.totalAmount, item.currency)}</td>
                            <td>{formatAmount(item.approvedAmount, item.currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

            </div>
          </section>
            </>
          ) : null}

          {!hasFocusedOperationsReport ? (
            <>
          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Comptes financiers</h3>
                <p className="hint">
                  {formatCount(overview.financeAccountsSummary.totalCount)} compte(s) disponible(s)
                  pour le secteur applique.
                </p>
              </div>
              <div className="reports-inline-metrics">
                <span>Globaux: {formatCount(overview.financeAccountsSummary.globalCount)}</span>
                <span>Dédiés: {formatCount(overview.financeAccountsSummary.dedicatedCount)}</span>
                <span>Restreints: {formatCount(overview.financeAccountsSummary.restrictedCount)}</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Référence</th>
                    <th>Portée</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Aucun compte financier disponible pour ce secteur.</td>
                    </tr>
                  ) : (
                    overview.financeAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.accountRef ?? "-"}</td>
                        <td>{accountScopeLabel(account)}</td>
                        <td>{formatAmount(account.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Rapport opérationnel</h3>
                <p className="hint">Taches consolidees par statut pour le secteur applique.</p>
              </div>
            </div>

            <div className="reports-data-grid">
              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Tâches par statut</h4>
                  <span>{formatCount(reportMetrics.totalTasks)} tâche(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Statut</th>
                        <th>Nombre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.taskByStatus.length === 0 ? (
                        <tr>
                          <td colSpan={2}>Aucune tâche sur la période filtrée.</td>
                        </tr>
                      ) : (
                        overview.taskByStatus.map((item) => (
                          <tr key={item.status}>
                            <td>{taskStatusLabel(item.status)}</td>
                            <td>{formatCount(item.count)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

            </div>
          </section>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
