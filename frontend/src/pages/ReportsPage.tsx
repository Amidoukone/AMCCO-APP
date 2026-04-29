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
  | "transactions-xlsx";

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

  async function handleExport(
    kind: "overview" | "transactions",
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
      } else if (kind === "transactions") {
        setSuccessMessage("Export Excel des transactions généré pour la période appliquée.");
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
        <p>Vue consolidée, rapide et exploitable.</p>
      </header>

      <section className="panel">
        <h3>Période</h3>
        <div className="reports-period-presets">
          <button
            type="button"
            className={activePreset === "TODAY" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("TODAY")}
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            className={activePreset === "LAST_7_DAYS" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("LAST_7_DAYS")}
          >
            7 jours
          </button>
          <button
            type="button"
            className={activePreset === "LAST_30_DAYS" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("LAST_30_DAYS")}
          >
            30 jours
          </button>
          <button
            type="button"
            className={activePreset === "THIS_MONTH" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => handleApplyPreset("THIS_MONTH")}
          >
            Ce mois
          </button>
        </div>
        <form className="reports-filter-form" onSubmit={handleApplyFilters}>
          <input
            type="date"
            value={periodForm.dateFrom}
            onChange={(event) =>
              setPeriodForm((prev) => ({
                ...prev,
                dateFrom: event.target.value
              }))
            }
          />
          <input
            type="date"
            value={periodForm.dateTo}
            onChange={(event) =>
              setPeriodForm((prev) => ({
                ...prev,
                dateTo: event.target.value
              }))
            }
          />
          <select
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
          <button type="submit">Mettre à jour</button>
          <button type="button" className="secondary-btn" onClick={handleResetFilters}>
            Réinitialiser les filtres
          </button>
        </form>
        <p className="hint">Secteur actif: {selectedActivity?.label ?? "Tous les secteurs"}.</p>
      </section>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      {!isLoading && overview ? (
        <>
          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <h3>Exports</h3>
                <p className="hint">
                  Dernière consolidation: {formatDateTime(overview.generatedAt)} | Période:{" "}
                  {formatAppliedRange(overview)}
                </p>
              </div>
              <div className="topbar-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleExport("overview", "pdf")}
                  disabled={busyExport !== null}
                >
                  {busyExport === "overview-pdf" ? "Préparation..." : "Rapport PDF"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleExport("transactions", "xlsx")}
                  disabled={busyExport !== null}
                >
                  {busyExport === "transactions-xlsx" ? "Préparation..." : "Transactions Excel"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>Transactions par type et devise</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Devise</th>
                    <th>Nombre</th>
                    <th>Montant total</th>
                    <th>Montant approuvé</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeByType.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Aucune transaction consolidée sur cette période.</td>
                    </tr>
                  ) : (
                    overview.financeByType.map((item) => (
                      <tr key={`${item.type}-${item.currency}`}>
                        <td>{item.type === "CASH_IN" ? "Entrée" : "Sortie"}</td>
                        <td>{item.currency}</td>
                        <td>{item.count}</td>
                        <td>
                          {item.totalAmount} {item.currency}
                        </td>
                        <td>
                          {item.approvedAmount} {item.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Tâches par statut</h3>
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
                      <td colSpan={2}>Aucune tâche consolidée sur cette période.</td>
                    </tr>
                  ) : (
                    overview.taskByStatus.map((item) => (
                      <tr key={item.status}>
                        <td>{taskStatusLabel(item.status)}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>


        </>
      ) : null}
    </>
  );
}
