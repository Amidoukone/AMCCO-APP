import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  downloadReportExportRequest,
  getReportsOverviewRequest
} from "../lib/api";
import {
  getBusinessActivityLabel,
  type BusinessActivityCode
} from "../config/businessActivities";
import { ROLE_LABELS } from "../config/permissions";
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
  | "transactions-xlsx"
  | "tasks-xlsx";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR");
}

function financeStatusLabel(status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"): string {
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
    ? `Restreint: ${account.allowedActivityCodes
        .map((activityCode) => getBusinessActivityLabel(activityCode))
        .join(", ")}`
    : "Restreint";
}

function accountCompatibilityLabel(account: ReportsOverview["financeAccounts"][number]): string {
  return account.isCompatibleWithSelectedActivity ? "Compatible" : "Hors secteur actif";
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
  const { refreshSession, session } = useAuth();
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

  const withAuthorizedToken = useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      if (!session?.accessToken) {
        throw new ApiError(401, "Session absente");
      }
      try {
        return await action(session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw new ApiError(401, "Session expirée. Reconnectez-vous.");
        }
        return action(refreshed);
      }
    },
    [refreshSession, session?.accessToken]
  );

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

  const reportCards = useMemo(() => {
    if (!overview) {
      return [];
    }
    const financeCount = overview.financeByStatus.reduce((sum, item) => sum + item.count, 0);
    const taskCount = overview.taskByStatus.reduce((sum, item) => sum + item.count, 0);
    const memberCount = overview.roleDistribution.reduce((sum, item) => sum + item.count, 0);
    const blockedCount =
      overview.taskByStatus.find((item) => item.status === "BLOCKED")?.count ?? 0;

    return [
      {
        title: "Transactions consolidées",
        value: String(financeCount),
        note: `${overview.financeByType.length} ligne(s) devise/type sur ${formatAppliedRange(overview)}`
      },
      {
        title: "Tâches consolidées",
        value: String(taskCount),
        note: `${blockedCount} tâche(s) bloquée(s) sur la période`
      },
      {
        title: "Comptes compatibles",
        value: String(overview.financeAccountsSummary.compatibleCount),
        note: overview.filters.activityCode
          ? `${overview.financeAccountsSummary.incompatibleCount} hors ${getBusinessActivityLabel(overview.filters.activityCode)}`
          : `${overview.financeAccountsSummary.totalCount} compte(s) entreprise`
      },
      {
        title: "Effectif actif",
        value: String(memberCount),
        note: "Instantane actuel des memberships actifs"
      }
    ];
  }, [overview]);

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
      } else if (kind === "transactions") {
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
        <p>
          Consolidation finance et opérations, avec un cadrage par secteur et des exports
          immédiats.
        </p>
      </header>

      <section className="panel">
        <h3>Période</h3>
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
        <p className="hint">
          Secteur actif: {selectedActivity?.label ?? "Tous les secteurs"}.
        </p>
        <p className="hint">
          Les transactions suivent leur date d'opération. Les tâches et la charge équipe sont
          basées sur la dernière activité enregistrée. La répartition des rôles reflète
          l'organisation actuelle.
        </p>
      </section>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}
      {isLoading ? <p>Chargement...</p> : null}

      {!isLoading && overview ? (
        <>
          {overview.activityProfile ? (
            <section className="panel sector-focus-panel">
              <div className="dashboard-panel-header">
                <div>
                  <p className="sidebar-section-label">Profil sectoriel</p>
                  <h3>{overview.activityProfile.label}</h3>
                  <p className="hint">
                    {overview.activityProfile.operationsModel} | Règles: {overview.sectorRulesVersion}
                  </p>
                  <p className="hint">
                    Priorité de suivi: {overview.activityProfile.reporting.focusArea}
                  </p>
                </div>
              </div>
              {overview.activityHighlights.length > 0 ? (
                <div className="highlight-grid">
                  {overview.activityHighlights.map((item) => (
                    <article key={item.code} className={`highlight-card severity-${item.emphasis.toLowerCase()}`}>
                      <p className="sidebar-section-label">{item.label}</p>
                      <strong>{item.value}</strong>
                      <p className="hint">{item.description}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="grid">
            {reportCards.map((card) => (
              <article key={card.title} className="metric-card">
                <h2>{card.title}</h2>
                <p className="metric-value">{card.value}</p>
                <p className="metric-note">{card.note}</p>
              </article>
            ))}
          </section>

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
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleExport("tasks", "xlsx")}
                  disabled={busyExport !== null}
                >
                  {busyExport === "tasks-xlsx" ? "Préparation..." : "Tâches Excel"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>Transactions par statut et devise</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Devise</th>
                    <th>Nombre</th>
                    <th>Montant total</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeByStatus.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Aucune transaction consolidée sur cette période.</td>
                    </tr>
                  ) : (
                    overview.financeByStatus.map((item) => (
                      <tr key={`${item.status}-${item.currency}`}>
                        <td>{financeStatusLabel(item.status)}</td>
                        <td>{item.currency}</td>
                        <td>{item.count}</td>
                        <td>
                          {item.totalAmount} {item.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
            <h3>Transactions par activité</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Activité</th>
                    <th>Nombre</th>
                    <th>Montant total</th>
                    <th>Montant approuvé</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeByActivity.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Aucune transaction consolidée sur cette période.</td>
                    </tr>
                  ) : (
                    overview.financeByActivity.map((item) => (
                      <tr key={item.activityCode}>
                        <td>{getBusinessActivityLabel(item.activityCode)}</td>
                        <td>{item.count}</td>
                        <td>{item.totalAmount}</td>
                        <td>{item.approvedAmount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Gouvernance des comptes financiers</h3>
            <p className="hint">
              {overview.filters.activityCode
                ? `Lecture de compatibilite sur le secteur ${getBusinessActivityLabel(overview.filters.activityCode)}.`
                : "Sans filtre sectoriel, la gouvernance est lue au niveau entreprise."}
            </p>
            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>Total</strong>
                <span>{overview.financeAccountsSummary.totalCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Globaux</strong>
                <span>{overview.financeAccountsSummary.globalCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Dédiés</strong>
                <span>{overview.financeAccountsSummary.dedicatedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Restreints</strong>
                <span>{overview.financeAccountsSummary.restrictedCount}</span>
              </article>
            </div>
            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>Compatibles</strong>
                <span>{overview.financeAccountsSummary.compatibleCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Incompatibles</strong>
                <span>{overview.financeAccountsSummary.incompatibleCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Dédiés au secteur</strong>
                <span>{overview.financeAccountsSummary.dedicatedToSelectedActivityCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Restreints incluant le secteur</strong>
                <span>{overview.financeAccountsSummary.restrictedToSelectedActivityCount}</span>
              </article>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Reference</th>
                    <th>Portée</th>
                    <th>Compatibilite</th>
                    <th>Solde initial / courant</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.financeAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Aucun compte financier configuré.</td>
                    </tr>
                  ) : (
                    overview.financeAccounts.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.accountRef ?? "-"}</td>
                        <td>{accountScopeLabel(item)}</td>
                        <td>{accountCompatibilityLabel(item)}</td>
                        <td>{item.balance}</td>
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

          <section className="panel">
            <h3>Tâches par activité</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Activité</th>
                    <th>Total</th>
                    <th>Ouvertes</th>
                    <th>Bloquées</th>
                    <th>Terminées</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.taskByActivity.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Aucune tâche consolidée sur cette période.</td>
                    </tr>
                  ) : (
                    overview.taskByActivity.map((item) => (
                      <tr key={item.activityCode}>
                        <td>{getBusinessActivityLabel(item.activityCode)}</td>
                        <td>{item.totalCount}</td>
                        <td>{item.openCount}</td>
                        <td>{item.blockedCount}</td>
                        <td>{item.doneCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Repartition des roles</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Rôle</th>
                    <th>Effectif</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.roleDistribution.length === 0 ? (
                    <tr>
                      <td colSpan={2}>Aucun membre actif.</td>
                    </tr>
                  ) : (
                    overview.roleDistribution.map((item) => (
                      <tr key={item.role}>
                        <td>{ROLE_LABELS[item.role]}</td>
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
