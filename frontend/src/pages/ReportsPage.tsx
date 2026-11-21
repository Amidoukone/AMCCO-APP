import { useActionScope } from "../lib/useActionScope";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { SectorWorkspaceNav } from "../components/SectorWorkspaceNav";

import {
  ApiError,
  downloadReportExportRequest,
  getReportsOverviewRequest
} from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { useAuth } from "../context/AuthContext";

import {
  getBusinessActivityLabel,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { ReportsOverview } from "../types/reporting";

import { formatDateTime, formatCount, formatAmount, buildReportMetrics } from "../utils/reportDisplay";

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
  { value: "YEAR", label: "Année" }
];

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
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
    return "Sélectionnez un secteur pour afficher le rapport.";
  }

  if (form.periodMode === "CUSTOM") {
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      return "La date de début doit être inférieure ou égale à la date de fin.";
    }
    return null;
  }

  if (form.periodMode === "MONTH" && !isValidMonthInputValue(form.month)) {
    return "Sélectionnez un mois valide pour le rapport.";
  }

  if ((form.periodMode === "QUARTER" || form.periodMode === "YEAR") && !isValidYearValue(form.year)) {
    return "Saisissez une annee valide pour le rapport.";
  }

  if (form.periodMode === "QUARTER" && !["1", "2", "3", "4"].includes(form.quarter)) {
    return "Sélectionnez un trimestre valide pour le rapport.";
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

function toFileNamePart(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "non-renseigne";
}

function buildFileTimestamp(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  const milliseconds = String(value.getMilliseconds()).padStart(3, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function buildExportFileName(form: PeriodFormState): string {
  const activityPart = form.activityCode ? toFileNamePart(form.activityCode) : "secteur-non-selectionne";

  return `amcco-rapport-${activityPart}-${buildExportPeriodFilePart(form)}-${buildFileTimestamp()}.pdf`;
}

function formatAppliedRange(overview: ReportsOverview): string {
  if (!overview.filters.dateFrom && !overview.filters.dateTo) {
    return overview.filters.activityCode
      ? `Toutes périodes | ${getBusinessActivityLabel(overview.filters.activityCode)}`
      : "Toutes périodes | Secteur non sélectionné";
  }

  const fromLabel = overview.filters.dateFrom
    ? new Date(overview.filters.dateFrom).toLocaleDateString("fr-FR")
    : "origine";
  const toLabel = overview.filters.dateTo
    ? new Date(overview.filters.dateTo).toLocaleDateString("fr-FR")
    : "aujourd'hui";

  const periodLabel = `${fromLabel} -> ${toLabel}`;
  if (!overview.filters.activityCode) {
    return `${periodLabel} | Secteur non sélectionné`;
  }
  return `${periodLabel} | ${getBusinessActivityLabel(overview.filters.activityCode)}`;
}

function summarizePeriodForm(form: PeriodFormState): string {
  if (form.periodMode === "MONTH") return form.month || "Choisir un mois";
  if (form.periodMode === "QUARTER") return `T${form.quarter} ${form.year}`;
  if (form.periodMode === "YEAR") return form.year || "Choisir une année";
  if (!form.dateFrom && !form.dateTo) return "Toutes les dates";
  return `${form.dateFrom || "Début"} – ${form.dateTo || "Aujourd'hui"}`;
}

const ReportsDetails = lazy(() => import("./ReportsDetails").then(({ ReportsDetails }) => ({ default: ReportsDetails })));

export function ReportsPage(): JSX.Element {
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const { enabledActivities, isLoading: isLoadingActivities, selectedActivity, selectedActivityCode, setSelectedActivityCode } = useBusinessActivity();
  const [, setSearchParams] = useSearchParams();
  const [loadedOverview, setLoadedOverview] = useState<{ companyId: string; data: ReportsOverview } | null>(null);
  const overview = loadedOverview && loadedOverview.companyId === activeCompany?.id ? loadedOverview.data : null;
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(() =>
    createDefaultPeriodForm(selectedActivityCode ?? "")
  );
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFormState>(() =>
    createDefaultPeriodForm(selectedActivityCode ?? "")
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOverviewRef = useRef(false);
  const overviewLoadRequestRef = useRef(0);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [isReportFiltersExpanded, setIsReportFiltersExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
  const [isReportDetailsExpanded, setIsReportDetailsExpanded] = useState(false);
  const [busyExport, setBusyExport] = useState<ExportTarget | null>(null);
  const exportScope = JSON.stringify([activeCompany?.id, normalizePeriodQuery(appliedPeriod)]);
  const actionScopeKey = JSON.stringify([exportScope, user?.id]);
  const captureActionScope = useActionScope(actionScopeKey);
  useEffect(() => {
    setBusyExport(null);
  }, [actionScopeKey]);
  const exportScopeRef = useRef(exportScope);
  exportScopeRef.current = exportScope;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    hasLoadedOverviewRef.current = false;
    setLoadedOverview(null);
    setIsLoading(true);
    setIsRefreshing(false);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  const loadData = useCallback(async () => {
    const requestId = ++overviewLoadRequestRef.current;
    if (isLoadingActivities) {
      setIsRefreshing(false);
      return;
    }
    if (!appliedPeriod.activityCode) {
      hasLoadedOverviewRef.current = false;
      setLoadedOverview(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (hasLoadedOverviewRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        getReportsOverviewRequest(accessToken, normalizePeriodQuery(appliedPeriod))
      );
      if (requestId !== overviewLoadRequestRef.current) return;
      hasLoadedOverviewRef.current = true;
      setLoadedOverview({ companyId: activeCompany?.id ?? "", data: response.item });
    } catch (error) {
      if (requestId === overviewLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === overviewLoadRequestRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeCompany?.id, appliedPeriod, isLoadingActivities, withAuthorizedToken]);

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
    if (periodForm.activityCode) {
      setSelectedActivityCode(periodForm.activityCode);
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("activityCode", periodForm.activityCode);
        return next;
      }, { replace: true });
    }
    setAppliedPeriod(periodForm);
    if (window.matchMedia("(max-width: 640px)").matches) {
      setIsReportFiltersExpanded(false);
    }
  }

  function handleResetFilters(): void {
    const nextActivityCode = selectedActivityCode ?? "";
    setSuccessMessage(null);
    setErrorMessage(null);
    const nextPeriod = createDefaultPeriodForm(nextActivityCode);
    setPeriodForm(nextPeriod);
    setAppliedPeriod(nextPeriod);
    if (window.matchMedia("(max-width: 640px)").matches) {
      setIsReportFiltersExpanded(false);
    }
  }

  const reportMetrics = useMemo(
    () => (overview ? buildReportMetrics(overview) : null),
    [overview]
  );
  const currentPeriodQuery = normalizePeriodQuery(appliedPeriod);
  const isOverviewCurrent =
    overview?.filters.activityCode === selectedActivityCode &&
    overview.filters.dateFrom === (currentPeriodQuery.dateFrom ?? null) &&
    overview.filters.dateTo === (currentPeriodQuery.dateTo ?? null);

  async function handleExport(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!isOverviewCurrent || isLoading || isRefreshing || busyExport) return;
    const validationMessage = validatePeriodForm(appliedPeriod);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    const exportPeriod = appliedPeriod;
    const requestedScope = exportScopeRef.current;
    setBusyExport("overview-pdf");
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await withAuthorizedToken((accessToken) =>
        downloadReportExportRequest(
          accessToken,
          normalizePeriodQuery(exportPeriod)
        )
      );
      if (!isCurrentAction()) return;
      if (exportScopeRef.current !== requestedScope) return;
      triggerBlobDownload(blob, buildExportFileName(exportPeriod));

      setSuccessMessage("Export PDF du rapport généré pour la période sélectionnée.");
    } catch (error) {
      if (!isCurrentAction()) return;
      if (exportScopeRef.current === requestedScope) setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyExport(null);
    }
  }

  return (
    <div className="reports-page">
      <header className="section-header">
        <h2>Rapports du secteur</h2>
        <p>{selectedActivityCode === "TRANSPORT"
          ? "Suivi des entrées, sorties et opérations du secteur Transport."
          : "Données du secteur choisi, calculées depuis les transactions, tâches et comptes."}</p>
      </header>

      <SectorWorkspaceNav />

      <section className="panel reports-control-panel">
        <details
          className="reports-filter-disclosure"
          open={isReportFiltersExpanded}
          onToggle={(event) => setIsReportFiltersExpanded(event.currentTarget.open)}
        >
          <summary>
            <span>Période et secteur</span>
            <small>{selectedActivity?.label ?? "Choisir un secteur"} | {summarizePeriodForm(periodForm)}</small>
          </summary>
          <div className="reports-filter-content">
        <div className="reports-period-presets" role="group" aria-label="Type de période">
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
                <span>Date début</span>
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
                <span>Année</span>
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
                  <option value="1">T1 - Janvier à Mars</option>
                  <option value="2">T2 - Avril à Juin</option>
                  <option value="3">T3 - Juillet à Septembre</option>
                  <option value="4">T4 - Octobre à Décembre</option>
                </select>
              </label>
            </>
          ) : null}
          {periodForm.periodMode === "YEAR" ? (
            <label className="reports-filter-field" htmlFor="reports-year">
              <span>Année</span>
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
          Secteur appliqué: {selectedActivity?.label ?? "aucun secteur actif"}.
        </p>
          </div>
        </details>
      </section>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading || isRefreshing}
      />

      {!isLoading && overview && isOverviewCurrent && reportMetrics ? (
        <>
          <div
            className="reports-result-scroll"
            role="region"
            aria-label="Détails du rapport"
            tabIndex={0}
          >
            <section className="panel" aria-label="Périmètre du rapport affiché">
              <h3>{overview.activityProfile?.label ?? selectedActivity?.label}</h3>
              <p><strong>Période appliquée :</strong> {formatAppliedRange(overview)}</p>
              <p className="hint">Établi le {formatDateTime(overview.generatedAt)}. Les montants comptabilisés comprennent les opérations enregistrées ou finalisées et excluent les brouillons et rejets. Les devises sont présentées séparément, sans conversion.</p>
              {["GENERAL_STORE", "RENTAL", "BTP"].includes(selectedActivityCode ?? "") ? <p className="hint">Les situations de boutiques, loyers ou chantiers sont cumulées à la date d’arrêté indiquée dans leurs tableaux ; elles ne se limitent pas aux seuls mouvements de la période.</p> : null}
              {JSON.stringify(normalizePeriodQuery(periodForm)) !== JSON.stringify(normalizePeriodQuery(appliedPeriod)) ? <p className="hint" role="status">Des filtres ont été modifiés. Cliquez sur « Mettre à jour » pour les appliquer ; le rapport et le PDF conservent la période appliquée ci-dessus.</p> : null}
              {reportMetrics.accountedCurrencyRows.some((row) => row.currency !== "XOF") ? (
                <>
                  <h4>Flux comptabilisés par devise</h4>
                  <div className="table-wrap"><table className="admin-table">
                    <thead><tr><th>Devise</th><th>Entrées</th><th>Sorties</th><th>Solde net</th></tr></thead>
                    <tbody>{reportMetrics.accountedCurrencyRows.map((row) => <tr key={row.currency}><td>{row.currency}</td><td>{formatAmount(row.cashIn, row.currency)}</td><td>{formatAmount(row.cashOut, row.currency)}</td><td>{formatAmount(row.net, row.currency)}</td></tr>)}</tbody>
                  </table></div>
                  {["HARDWARE", "GENERAL_STORE", "RENTAL", "AGRICULTURE", "BTP", "FISH_FARMING"].includes(selectedActivityCode ?? "") ? <p className="hint">Les tableaux métier de ce secteur portent sur le XOF. Ce récapitulatif présente aussi les autres devises et figure en complément dans le PDF.</p> : null}
                </>
              ) : null}
            </section>
          {overview.transportOperationsReport ? null : <section className="panel reports-overview-panel">
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
                <span>{selectedActivityCode === "HARDWARE" ? "Achats filtrés" : "Transactions filtrées"}</span>
                <strong>{formatCount(reportMetrics.transactionCount)}</strong>
                <small>{formatCount(reportMetrics.activeTransactions)} comptabilisées</small>
              </article>
              {selectedActivityCode === "HARDWARE" && overview.hardwareMonthlyReport ? (
                <article className="reports-kpi-card">
                  <span>Bénéfice total</span>
                  <strong>
                    {formatAmount(
                      overview.hardwareMonthlyReport.totals.grossProfit,
                      overview.hardwareMonthlyReport.totals.currency
                    )}
                  </strong>
                  <small>Bénéfice cumulé sur les achats comptabilisés</small>
                </article>
              ) : (
                <>
                  <article className="reports-kpi-card">
                    <span>Solde comptabilisé</span>
                    <strong>{reportMetrics.netAccountedLabel}</strong>
                    <small>Entrées comptabilisées moins sorties comptabilisées</small>
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
                </>
              )}
            </div>
          </section>}

          <section className="panel reports-export-panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Export PDF du rapport affiché</h3>
                  <p className="hint">Le PDF reprend le secteur et la période appliquée affichés ci-dessus. Appliquez vos nouveaux filtres avant de les exporter.</p>
              </div>
              <div className="reports-export-grid">
                <article className="reports-export-card">
                  <strong className="reports-export-card-title">Rapport PDF</strong>
                  <p className="hint">Synthèse et tableaux métier du secteur, avec pagination et période de référence.</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleExport()}
                    disabled={busyExport !== null || isRefreshing}
                  >
                    {busyExport === "overview-pdf" ? "Préparation..." : "Télécharger PDF"}
                  </button>
                </article>
              </div>
            </div>
          </section>

          <details
            id="reports-sector-details"
            className="reports-details-disclosure"
            hidden
            open={isReportDetailsExpanded}
            onToggle={(event) => setIsReportDetailsExpanded(event.currentTarget.open)}
          >
            <summary>Rapport détaillé · {overview.activityProfile?.label ?? selectedActivity?.label}</summary>

          {isReportDetailsExpanded ? (
            <Suspense fallback={null}><ReportsDetails overview={overview} selectedActivityCode={selectedActivityCode} /></Suspense>
          ) : null}
          </details>
          </div>
        </>
      ) : null}
    </div>
  );
}
