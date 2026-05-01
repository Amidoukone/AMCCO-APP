import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { DashboardRecentTask, DashboardRecentTransaction, DashboardSummary } from "../types/reporting";
import {
  financeStatusLabel,
  formatAmount,
  formatDateTime,
  isOverdue,
  taskStatusLabel
} from "../utils/dashboardDisplay";
import { getBusinessActivityLabel } from "../config/businessActivities";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

export function MyWorkPage(): JSX.Element {
  const navigate = useNavigate();
  const withAuthorizedToken = useAuthorizedRequest();
  const { selectedActivityCode } = useBusinessActivity();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const urgentTasks = useMemo<DashboardRecentTask[]>(() => {
    if (!summary) return [];
    return summary.recentTasks
      .filter((task) => task.status !== "DONE")
      .sort((left, right) => {
        const leftBlocked = left.status === "BLOCKED" ? 0 : 1;
        const rightBlocked = right.status === "BLOCKED" ? 0 : 1;
        if (leftBlocked !== rightBlocked) return leftBlocked - rightBlocked;
        return new Date(left.dueDate ?? left.updatedAt).getTime() - new Date(right.dueDate ?? right.updatedAt).getTime();
      })
      .slice(0, 8);
  }, [summary]);

  const pendingTransactions = useMemo<DashboardRecentTransaction[]>(() => {
    if (!summary) return [];
    return summary.recentTransactions
      .filter((transaction) => transaction.status === "SUBMITTED" || transaction.status === "DRAFT")
      .slice(0, 6);
  }, [summary]);

  return (
    <>
      <header className="section-header my-work-header">
        <div>
          <p className="sidebar-section-label">Espace personnel</p>
          <h2>Mon travail</h2>
        </div>
        <div className="my-work-header-actions">
          <button type="button" className="dashboard-inline-button" onClick={() => navigate("/operations/tasks")}>
            Voir les tâches
          </button>
          <button type="button" className="dashboard-inline-button" onClick={() => navigate("/finance/transactions")}>
            Voir les transactions
          </button>
        </div>
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {isLoading ? <p className="feedback-banner feedback-banner-loading">Chargement des priorités...</p> : null}

      {summary ? (
        <>
          <section className="grid my-work-metrics">
            <article className="metric-card">
              <h2>Mes tâches ouvertes</h2>
              <p className="metric-value">{summary.operations.myOpenTasksCount}</p>
            </article>
            <article className="metric-card">
              <h2>Bloquées</h2>
              <p className="metric-value">{summary.operations.blockedCount}</p>
            </article>
            <article className="metric-card">
              <h2>Échéances dépassées</h2>
              <p className="metric-value">{summary.operations.overdueCount}</p>
            </article>
            <article className="metric-card">
              <h2>Transactions à valider</h2>
              <p className="metric-value">{summary.finance.submittedCount}</p>
            </article>
          </section>

          <section className="dashboard-priority-grid my-work-grid">
            <article className="panel dashboard-priority-card">
              <div className="dashboard-panel-header">
                <div>
                  <p className="sidebar-section-label">Opérations</p>
                  <h3>Tâches prioritaires</h3>
                </div>
                <button type="button" className="dashboard-inline-button" onClick={() => navigate("/operations/tasks")}>
                  Voir tout
                </button>
              </div>
              {urgentTasks.length === 0 ? (
                <EmptyState
                  title="Aucune tâche urgente"
                  description="Aucune priorité immédiate."
                />
              ) : (
                <div className="dashboard-priority-list">
                  {urgentTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="dashboard-priority-item"
                      onClick={() => navigate(`/operations/tasks/${task.id}`)}
                    >
                      <div className="dashboard-priority-main">
                        <strong>{task.title}</strong>
                        <span>
                          {task.activityCode ? getBusinessActivityLabel(task.activityCode) : "Sans activité"} |{" "}
                          {task.assignedToFullName ?? "Non assignée"}
                        </span>
                      </div>
                      <div className="dashboard-priority-side">
                        <strong>{taskStatusLabel(task.status)}</strong>
                        <span className={isOverdue(task.dueDate) ? "priority-danger-text" : undefined}>
                          Échéance {formatDateTime(task.dueDate)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </article>

            <article className="panel dashboard-priority-card">
              <div className="dashboard-panel-header">
                <div>
                  <p className="sidebar-section-label">Finance</p>
                  <h3>Transactions en attente</h3>
                </div>
                <button type="button" className="dashboard-inline-button" onClick={() => navigate("/finance/transactions")}>
                  Voir tout
                </button>
              </div>
              {pendingTransactions.length === 0 ? (
                <EmptyState
                  title="Aucune transaction en attente"
                  description="Aucune action en attente."
                />
              ) : (
                <div className="dashboard-priority-list">
                  {pendingTransactions.map((transaction) => (
                    <button
                      key={transaction.id}
                      type="button"
                      className="dashboard-priority-item"
                      onClick={() => navigate(`/finance/transactions?transactionId=${transaction.id}`)}
                    >
                      <div className="dashboard-priority-main">
                        <strong>{transaction.accountName}</strong>
                        <span>
                          {transaction.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {transaction.activityCode ? getBusinessActivityLabel(transaction.activityCode) : "Sans activité"}
                        </span>
                      </div>
                      <div className="dashboard-priority-side">
                        <strong>{formatAmount(transaction.amount, transaction.currency)}</strong>
                        <span>{financeStatusLabel(transaction.status)} | {formatDateTime(transaction.occurredAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </article>
          </section>
        </>
      ) : null}
    </>
  );
}
