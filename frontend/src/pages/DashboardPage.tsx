import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { BUSINESS_ACTIVITY_LABELS, getBusinessActivityLabel } from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { DashboardSummary } from "../types/reporting";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

function formatAmount(value: string, currency: string): string {
  return `${value} ${currency}`;
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

export function DashboardPage(): JSX.Element {
  const { refreshSession, session, user } = useAuth();
  const { selectedActivity, selectedActivityCode, selectedProfile } = useBusinessActivity();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        getDashboardSummaryRequest(accessToken, {
          activityCode: selectedActivityCode ?? undefined
        })
      );
      setSummary(response.item);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const headlineCards = useMemo(() => {
    if (!summary) {
      return [];
    }
    const openTasksCount =
      summary.operations.todoCount +
      summary.operations.inProgressCount +
      summary.operations.blockedCount;

    return [
      {
        title: "Utilisateurs actifs",
        value: String(summary.company.activeUsersCount),
        note: `${summary.company.totalMembershipsCount} membership(s) sur ${summary.company.companyCode}`
      },
      {
        title: "Comptes financiers",
        value: String(summary.company.financialAccountsCount),
        note: selectedActivityCode
          ? `${summary.finance.accountsSummary.compatibleCount} compatible(s) avec ${getBusinessActivityLabel(selectedActivityCode)}`
          : `${summary.finance.totalTransactionsCount} transaction(s) enregistrées`
      },
      {
        title: "Tâches ouvertes",
        value: String(openTasksCount),
        note: `${summary.operations.overdueCount} échéance(s) dépassée(s)`
      },
      {
        title: "Mes tâches ouvertes",
        value: String(summary.operations.myOpenTasksCount),
        note: `${summary.operations.dueSoonCount} échéance(s) proche(s) sur 72h`
      }
    ];
  }, [selectedActivityCode, summary]);

  const canSeeWorkload = useMemo(() => {
    return user?.role !== "EMPLOYEE";
  }, [user?.role]);

  const selectedActivitySummary = useMemo(() => {
    if (!summary || !selectedActivityCode) {
      return null;
    }
    return summary.activitySummary.find((item) => item.activityCode === selectedActivityCode) ?? null;
  }, [selectedActivityCode, summary]);

  const selectedActivityHighlights = useMemo(() => {
    if (!summary || !selectedActivityCode) {
      return [];
    }
    return summary.activityHighlightsByCode[selectedActivityCode] ?? [];
  }, [selectedActivityCode, summary]);

  return (
    <>
      <header className="section-header">
        <h2>Vue d'ensemble</h2>
        <p>
          Pilotage transversal de l'entreprise, avec un focus de travail sur le secteur{" "}
          <strong>{selectedActivity?.label ?? "aucun secteur actif"}</strong>.
        </p>
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {isLoading ? <p>Chargement...</p> : null}

      {!isLoading && summary ? (
        <>
          {selectedActivity && selectedActivitySummary ? (
            <section className="panel sector-focus-panel">
              <div>
                <p className="sidebar-section-label">Focus secteur</p>
                <h3>{selectedActivity.label}</h3>
                <p className="hint">{selectedActivity.description}</p>
                {selectedProfile ? (
                  <p className="hint">
                    Mode opératoire: {selectedProfile.operationsModel} | Règles:{" "}
                    {summary.sectorRulesVersion}
                  </p>
                ) : null}
              </div>
              <div className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                  <strong>Transactions</strong>
                  <span>{selectedActivitySummary.transactionsCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Transactions à revoir</strong>
                  <span>{selectedActivitySummary.submittedTransactionsCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Tâches ouvertes</strong>
                  <span>{selectedActivitySummary.openTasksCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Tâches bloquées</strong>
                  <span>{selectedActivitySummary.blockedTasksCount}</span>
                </article>
              </div>
            </section>
          ) : null}

          {selectedActivityHighlights.length > 0 ? (
            <section className="panel">
              <h3>Indicateurs sectoriels</h3>
              <div className="highlight-grid">
                {selectedActivityHighlights.map((item) => (
                  <article key={item.code} className={`highlight-card severity-${item.emphasis.toLowerCase()}`}>
                    <p className="sidebar-section-label">{item.label}</p>
                    <strong>{item.value}</strong>
                    <p className="hint">{item.description}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid">
            {headlineCards.map((card) => (
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
                <h3>Contexte entreprise</h3>
                <p className="hint">
                  {summary.company.companyName} ({summary.company.companyCode}) | Mise à jour{" "}
                  {formatDateTime(summary.generatedAt)}
                </p>
                <p className="hint">
                  Les indicateurs ci-dessous suivent le secteur actif:{" "}
                  {selectedActivity?.label ?? "Tous les secteurs"}.
                </p>
              </div>
            </div>
            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>Alertes non lues</strong>
                <span>{summary.company.unreadAlertsCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Activité audit 7 jours</strong>
                <span>{summary.company.auditEventsLast7Days}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Transactions à revoir</strong>
                <span>{summary.finance.submittedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Tâches non assignées</strong>
                <span>{summary.operations.unassignedCount}</span>
              </article>
            </div>
          </section>

          <section className="panel">
            <h3>Activités AMCCO</h3>
            <p className="hint">
              Vue sectorielle des neuf activités du cahier des charges, pour relier finance et
              exécution terrain.
            </p>
            <div className="activity-grid">
              {summary.activitySummary.map((item) => (
                <article
                  key={item.activityCode}
                  className={
                    item.activityCode === selectedActivityCode
                      ? "activity-card is-selected"
                      : "activity-card"
                  }
                >
                  <h4>{BUSINESS_ACTIVITY_LABELS[item.activityCode]}</h4>
                  <p className="activity-card-stat">
                    Transactions: {item.transactionsCount} | A revoir: {item.submittedTransactionsCount}
                  </p>
                  <p className="activity-card-stat">
                    Tâches: {item.totalTasksCount} | Ouvertes: {item.openTasksCount}
                  </p>
                  <p className="activity-card-stat">Bloquées: {item.blockedTasksCount}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Finance</h3>
            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>Brouillons</strong>
                <span>{summary.finance.draftCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Soumises</strong>
                <span>{summary.finance.submittedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Approuvées</strong>
                <span>{summary.finance.approvedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Rejetées</strong>
                <span>{summary.finance.rejectedCount}</span>
              </article>
            </div>

            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>Comptes compatibles</strong>
                <span>{summary.finance.accountsSummary.compatibleCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Globaux</strong>
                <span>{summary.finance.accountsSummary.globalCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Dédiés</strong>
                <span>{summary.finance.accountsSummary.dedicatedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Restreints</strong>
                <span>{summary.finance.accountsSummary.restrictedCount}</span>
              </article>
            </div>

            <p className="hint">
              {selectedActivityCode
                ? `${summary.finance.accountsSummary.incompatibleCount} compte(s) restent hors du secteur ${getBusinessActivityLabel(selectedActivityCode)}.`
                : "Sans secteur actif, la vue comptes reste globale à l'entreprise."}
            </p>

            <div className="dashboard-currency-list">
              {summary.finance.totalsByCurrency.length === 0 ? (
                <p className="hint">Aucun montant approuvé n'est disponible pour le moment.</p>
              ) : (
                summary.finance.totalsByCurrency.map((item) => (
                  <article key={item.currency} className="dashboard-currency-card">
                    <h4>{item.currency}</h4>
                    <p>Entrées approuvées: {formatAmount(item.approvedCashInTotal, item.currency)}</p>
                    <p>Sorties approuvées: {formatAmount(item.approvedCashOutTotal, item.currency)}</p>
                    <p>Net approuvé: {formatAmount(item.netApprovedTotal, item.currency)}</p>
                  </article>
                ))
              )}
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activité</th>
                    <th>Compte</th>
                    <th>Type</th>
                    <th>Montant</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Aucune transaction récente.</td>
                    </tr>
                  ) : (
                    summary.recentTransactions.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.occurredAt)}</td>
                        <td>{getBusinessActivityLabel(item.activityCode)}</td>
                        <td>{item.accountName}</td>
                        <td>{item.type === "CASH_IN" ? "Entrée" : "Sortie"}</td>
                        <td>{formatAmount(item.amount, item.currency)}</td>
                        <td>{financeStatusLabel(item.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Opérations</h3>
            <div className="dashboard-kpi-grid">
              <article className="dashboard-kpi-card">
                <strong>À faire</strong>
                <span>{summary.operations.todoCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>En cours</strong>
                <span>{summary.operations.inProgressCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Bloquées</strong>
                <span>{summary.operations.blockedCount}</span>
              </article>
              <article className="dashboard-kpi-card">
                <strong>Terminées</strong>
                <span>{summary.operations.doneCount}</span>
              </article>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tâche</th>
                    <th>Activité</th>
                    <th>Statut</th>
                    <th>Assigné</th>
                    <th>Échéance</th>
                    <th>Mise à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Aucune tâche récente.</td>
                    </tr>
                  ) : (
                    summary.recentTasks.map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>{getBusinessActivityLabel(item.activityCode)}</td>
                        <td>{taskStatusLabel(item.status)}</td>
                        <td>{item.assignedToFullName ?? "Non assignée"}</td>
                        <td>{formatDateTime(item.dueDate)}</td>
                        <td>{formatDateTime(item.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {canSeeWorkload ? (
            <section className="panel">
              <h3>Charge équipe</h3>
              <div className="operations-member-grid">
                {summary.workload.length === 0 ? (
                  <p className="hint">Aucun membre assignable disponible.</p>
                ) : (
                  summary.workload.map((item) => (
                    <article key={item.userId} className="operations-member-card">
                      <h4>{item.fullName}</h4>
                      <p className="hint">{item.role}</p>
                      <p className="hint">
                        Ouvertes: {item.openTasksCount} | En cours: {item.inProgressTasksCount}
                      </p>
                      <p className="hint">
                        Bloquées: {item.blockedTasksCount} | Terminées: {item.doneTasksCount}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
