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
import type { RoleCode } from "../types/role";

type PeriodFormState = {
  dateFrom: string;
  dateTo: string;
  activityCode: "ALL" | BusinessActivityCode;
};

type ReportPeriodQuery = {
  dateFrom?: string;
  dateTo?: string;
  activityCode?: BusinessActivityCode;
};

type ExportTarget =
  | "overview-pdf"
  | "transactions-xlsx"
  | "tasks-xlsx";

type ReportPeriodPreset = "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "THIS_MONTH";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR");
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

function roleLabel(role: RoleCode): string {
  if (role === "OWNER") {
    return "Propriétaire";
  }
  if (role === "SYS_ADMIN") {
    return "Administrateur système";
  }
  if (role === "ACCOUNTANT") {
    return "Comptable";
  }
  if (role === "SUPERVISOR") {
    return "Superviseur";
  }
  return "Employé";
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

function compatibilityLabel(value: boolean): string {
  return value ? "Compatible" : "Hors secteur";
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

function resolvePresetPeriod(preset: ReportPeriodPreset): Pick<PeriodFormState, "dateFrom" | "dateTo"> {
  const now = new Date();
  const today = toDateInputValue(now);

  if (preset === "TODAY") {
    return { dateFrom: today, dateTo: today };
  }

  if (preset === "LAST_7_DAYS") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { dateFrom: toDateInputValue(start), dateTo: today };
  }

  if (preset === "LAST_30_DAYS") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { dateFrom: toDateInputValue(start), dateTo: today };
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: toDateInputValue(monthStart), dateTo: today };
}

function normalizePeriodQuery(form: PeriodFormState): ReportPeriodQuery {
  return {
    dateFrom: form.dateFrom ? toStartOfDayIso(form.dateFrom) : undefined,
    dateTo: form.dateTo ? toEndOfDayIso(form.dateTo) : undefined,
    activityCode: form.activityCode === "ALL" ? undefined : form.activityCode
  };
}

function buildExportFileName(
  kind: "overview" | "transactions" | "tasks",
  format: "xlsx" | "pdf",
  form: PeriodFormState
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const from = form.dateFrom || "all";
  const to = form.dateTo || "all";
  return `amcco-${kind}-${from}-${to}-${stamp}.${format}`;
}

function formatAppliedRange(overview: ReportsOverview): string {
  if (!overview.filters.dateFrom && !overview.filters.dateTo) {
    return overview.filters.activityCode
      ? `Toutes périodes | ${getBusinessActivityLabel(overview.filters.activityCode)}`
      : "Toutes périodes";
  }

  const fromLabel = overview.filters.dateFrom
    ? new Date(overview.filters.dateFrom).toLocaleDateString("fr-FR")
    : "origine";
  const toLabel = overview.filters.dateTo
    ? new Date(overview.filters.dateTo).toLocaleDateString("fr-FR")
    : "aujourd'hui";

  const periodLabel = `${fromLabel} -> ${toLabel}`;
  if (!overview.filters.activityCode) {
    return periodLabel;
  }
  return `${periodLabel} | ${getBusinessActivityLabel(overview.filters.activityCode)}`;
}

export function ReportsPage(): JSX.Element {
  const withAuthorizedToken = useAuthorizedRequest();
  const { activities, selectedActivity, selectedActivityCode } = useBusinessActivity();
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodFormState>({
    dateFrom: "",
    dateTo: "",
    activityCode: selectedActivityCode ?? "ALL"
  });
  const [appliedPeriod, setAppliedPeriod] = useState<PeriodFormState>({
    dateFrom: "",
    dateTo: "",
    activityCode: selectedActivityCode ?? "ALL"
  });
  const [isLoading, setIsLoading] = useState(true);
  const [busyExport, setBusyExport] = useState<ExportTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
    const nextActivityCode = selectedActivityCode ?? "ALL";
    setPeriodForm((prev) =>
      prev.activityCode === nextActivityCode ? prev : { ...prev, activityCode: nextActivityCode }
    );
    setAppliedPeriod((prev) =>
      prev.activityCode === nextActivityCode ? prev : { ...prev, activityCode: nextActivityCode }
    );
  }, [selectedActivityCode]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (periodForm.dateFrom && periodForm.dateTo && periodForm.dateFrom > periodForm.dateTo) {
      setErrorMessage("La date de début doit être inférieure ou égale à la date de fin.");
      return;
    }

    setSuccessMessage(null);
    setErrorMessage(null);
    setAppliedPeriod(periodForm);
  }

  function handleResetFilters(): void {
    const nextActivityCode = selectedActivityCode ?? "ALL";
    setSuccessMessage(null);
    setErrorMessage(null);
    setPeriodForm({
      dateFrom: "",
      dateTo: "",
      activityCode: nextActivityCode
    });
    setAppliedPeriod({
      dateFrom: "",
      dateTo: "",
      activityCode: nextActivityCode
    });
  }

  function handleApplyPreset(preset: ReportPeriodPreset): void {
    const period = resolvePresetPeriod(preset);
    setSuccessMessage(null);
    setErrorMessage(null);
    setPeriodForm((prev) => {
      const next = { ...prev, ...period };
      setAppliedPeriod(next);
      return next;
    });
  }

  const activePreset = useMemo<ReportPeriodPreset | null>(() => {
    if (!periodForm.dateFrom || !periodForm.dateTo) {
      return null;
    }

    const today = resolvePresetPeriod("TODAY");
    if (periodForm.dateFrom === today.dateFrom && periodForm.dateTo === today.dateTo) {
      return "TODAY";
    }

    const last7Days = resolvePresetPeriod("LAST_7_DAYS");
    if (periodForm.dateFrom === last7Days.dateFrom && periodForm.dateTo === last7Days.dateTo) {
      return "LAST_7_DAYS";
    }

    const last30Days = resolvePresetPeriod("LAST_30_DAYS");
    if (periodForm.dateFrom === last30Days.dateFrom && periodForm.dateTo === last30Days.dateTo) {
      return "LAST_30_DAYS";
    }

    const thisMonth = resolvePresetPeriod("THIS_MONTH");
    if (periodForm.dateFrom === thisMonth.dateFrom && periodForm.dateTo === thisMonth.dateTo) {
      return "THIS_MONTH";
    }

    return null;
  }, [periodForm.dateFrom, periodForm.dateTo]);

  const reportMetrics = useMemo(
    () => (overview ? buildReportMetrics(overview) : null),
    [overview]
  );

  async function handleExport(
    kind: "overview" | "transactions" | "tasks",
    format: "xlsx" | "pdf"
  ): Promise<void> {
    const exportTarget = `${kind}-${format}` as ExportTarget;
    setBusyExport(exportTarget);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await withAuthorizedToken((accessToken) =>
        downloadReportExportRequest(
          accessToken,
          kind,
          format,
          normalizePeriodQuery(appliedPeriod)
        )
      );
      triggerBlobDownload(blob, buildExportFileName(kind, format, appliedPeriod));

      if (kind === "overview") {
        setSuccessMessage("Export PDF du rapport généré pour la période appliquée.");
      } else if (kind === "transactions" && format === "xlsx") {
        setSuccessMessage("Export Excel des transactions généré pour la période appliquée.");
      } else if (kind === "tasks" && format === "xlsx") {
        setSuccessMessage("Export Excel des tâches généré pour la période appliquée.");
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyExport(null);
    }
  }

  return (
    <>
      <header className="section-header">
        <h2>Rapports et exports</h2>
        <p>Données calculées depuis les transactions, tâches, comptes et utilisateurs filtrés.</p>
      </header>

      <section className="panel">
        <h3>Filtres du rapport</h3>
        <div className="reports-period-presets">
          <button
            type="button"
            className={activePreset === "TODAY" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("TODAY")}
            aria-pressed={activePreset === "TODAY"}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            className={activePreset === "LAST_7_DAYS" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("LAST_7_DAYS")}
            aria-pressed={activePreset === "LAST_7_DAYS"}
          >
            7 jours
          </button>
          <button
            type="button"
            className={activePreset === "LAST_30_DAYS" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("LAST_30_DAYS")}
            aria-pressed={activePreset === "LAST_30_DAYS"}
          >
            30 jours
          </button>
          <button
            type="button"
            className={activePreset === "THIS_MONTH" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("THIS_MONTH")}
            aria-pressed={activePreset === "THIS_MONTH"}
          >
            Ce mois
          </button>
        </div>
        <form className="reports-filter-form" onSubmit={handleApplyFilters}>
          <label className="reports-filter-field" htmlFor="reports-date-from">
            <span>Date de début</span>
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
            <span>Date de fin</span>
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
          <label className="reports-filter-field" htmlFor="reports-activity-code">
            <span>Secteur</span>
            <select
              id="reports-activity-code"
              value={periodForm.activityCode}
              onChange={(event) =>
                setPeriodForm((prev) => ({
                  ...prev,
                  activityCode: event.target.value as "ALL" | BusinessActivityCode
                }))
              }
            >
              <option value="ALL">Toutes les activités</option>
              {activities.map((activity) => (
                <option key={activity.code} value={activity.code}>
                  {activity.label}
                  {activity.isEnabled ? "" : " (inactif)"}
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
          Secteur appliqué: {selectedActivity?.label ?? "Tous les secteurs"}.
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
              <div className="reports-scope-strip">
                <span className="reports-scope-pill">
                  <strong>Règles</strong>
                  <span>{overview.sectorRulesVersion}</span>
                </span>
                <span className="reports-scope-pill">
                  <strong>Secteur</strong>
                  <span>
                    {overview.filters.activityCode
                      ? getBusinessActivityLabel(overview.filters.activityCode)
                      : "Tous les secteurs"}
                  </span>
                </span>
                <span className="reports-scope-pill">
                  <strong>Comptes</strong>
                  <span>
                    {formatCount(overview.financeAccountsSummary.compatibleCount)} compatibles /{" "}
                    {formatCount(overview.financeAccountsSummary.totalCount)}
                  </span>
                </span>
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
              <article className="reports-kpi-card">
                <span>Utilisateurs par rôle</span>
                <strong>
                  {formatCount(overview.roleDistribution.reduce((sum, item) => sum + item.count, 0))}
                </strong>
                <small>{formatCount(overview.roleDistribution.length)} rôles représentés</small>
              </article>
            </div>
          </section>

          <section className="panel reports-export-panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Exports avec les filtres appliqués</h3>
                <p className="hint">Chaque fichier reprend la période et le secteur visibles sur cette page.</p>
              </div>
              <div className="reports-export-grid">
                <article className="reports-export-card">
                  <strong>Rapport PDF</strong>
                  <p className="hint">Synthèse, flux financiers, comptes, tâches et équipe.</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleExport("overview", "pdf")}
                    disabled={busyExport !== null}
                  >
                    {busyExport === "overview-pdf" ? "Préparation..." : "Télécharger PDF"}
                  </button>
                </article>
                <article className="reports-export-card">
                  <strong>Transactions Excel</strong>
                  <p className="hint">Lignes financières détaillées selon les filtres.</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleExport("transactions", "xlsx")}
                    disabled={busyExport !== null}
                  >
                    {busyExport === "transactions-xlsx" ? "Préparation..." : "Télécharger Excel"}
                  </button>
                </article>
                <article className="reports-export-card">
                  <strong>Tâches Excel</strong>
                  <p className="hint">Tâches opérationnelles détaillées selon les filtres.</p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleExport("tasks", "xlsx")}
                    disabled={busyExport !== null}
                  >
                    {busyExport === "tasks-xlsx" ? "Préparation..." : "Télécharger Excel"}
                  </button>
                </article>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Profil du secteur</h3>
                <p className="hint">
                  {overview.activityProfile
                    ? `${overview.activityProfile.label} | ${overview.activityProfile.reporting.focusArea}`
                    : `${formatCount(overview.availableActivityProfiles.length)} secteurs disponibles dans le référentiel.`}
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
              <div className="reports-profile-grid">
                {overview.availableActivityProfiles.map((profile) => (
                  <article className="reports-focus-note" key={profile.activityCode}>
                    <strong>{profile.label}</strong>
                    <span>{profile.reporting.focusArea}</span>
                  </article>
                ))}
              </div>
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

              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Transactions par secteur</h4>
                  <span>{formatCount(overview.financeByActivity.length)} secteur(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Secteur</th>
                        <th>Nombre</th>
                        <th>Total</th>
                        <th>Approuvé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.financeByActivity.map((item) => (
                        <tr key={item.activityCode}>
                          <td>{getBusinessActivityLabel(item.activityCode)}</td>
                          <td>{formatCount(item.count)}</td>
                          <td>{formatAmount(item.totalAmount)}</td>
                          <td>{formatAmount(item.approvedAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Comptes financiers</h3>
                <p className="hint">
                  {formatCount(overview.financeAccountsSummary.totalCount)} compte(s),{" "}
                  {formatCount(overview.financeAccountsSummary.compatibleCount)} compatible(s)
                  avec le secteur appliqué.
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
                    <th>Compatibilité</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Aucun compte financier enregistré.</td>
                    </tr>
                  ) : (
                    overview.financeAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{account.accountRef ?? "-"}</td>
                        <td>{accountScopeLabel(account)}</td>
                        <td>{compatibilityLabel(account.isCompatibleWithSelectedActivity)}</td>
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
                <p className="hint">Tâches consolidées par statut, secteur et responsable.</p>
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

              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Tâches par secteur</h4>
                  <span>{formatCount(overview.taskByActivity.length)} secteur(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Secteur</th>
                        <th>Total</th>
                        <th>Ouvertes</th>
                        <th>Bloquées</th>
                        <th>Terminées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.taskByActivity.map((item) => (
                        <tr key={item.activityCode}>
                          <td>{getBusinessActivityLabel(item.activityCode)}</td>
                          <td>{formatCount(item.totalCount)}</td>
                          <td>{formatCount(item.openCount)}</td>
                          <td>{formatCount(item.blockedCount)}</td>
                          <td>{formatCount(item.doneCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <div className="reports-data-grid">
              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Responsables les plus chargés</h4>
                  <span>{formatCount(overview.topAssignees.length)} responsable(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Responsable</th>
                        <th>Rôle</th>
                        <th>Ouvertes</th>
                        <th>En cours</th>
                        <th>Bloquées</th>
                        <th>Terminées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.topAssignees.length === 0 ? (
                        <tr>
                          <td colSpan={6}>Aucune tâche assignée sur la période filtrée.</td>
                        </tr>
                      ) : (
                        overview.topAssignees.map((item) => (
                          <tr key={item.userId}>
                            <td>{item.fullName}</td>
                            <td>{roleLabel(item.role)}</td>
                            <td>{formatCount(item.openTasksCount)}</td>
                            <td>{formatCount(item.inProgressTasksCount)}</td>
                            <td>{formatCount(item.blockedTasksCount)}</td>
                            <td>{formatCount(item.doneTasksCount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="reports-table-panel">
                <div className="reports-table-header">
                  <h4>Répartition des rôles</h4>
                  <span>{formatCount(overview.roleDistribution.length)} rôle(s)</span>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Rôle</th>
                        <th>Utilisateurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.roleDistribution.length === 0 ? (
                        <tr>
                          <td colSpan={2}>Aucun utilisateur actif rattaché à ce rapport.</td>
                        </tr>
                      ) : (
                        overview.roleDistribution.map((item) => (
                          <tr key={item.role}>
                            <td>{roleLabel(item.role)}</td>
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
  );
}
