import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { PageGuide } from "../components/PageGuide";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { DashboardRecentTask, DashboardRecentTransaction, DashboardSummary } from "../types/reporting";
import { financeStatusLabel, formatAmount, formatDateTime, isOverdue, taskStatusLabel } from "../utils/dashboardDisplay";
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
  const { activeCompany } = useAuth();
  const { selectedActivityCode, isLoading: isLoadingActivities } = useBusinessActivity();
  const activityQuery = selectedActivityCode
    ? `?activityCode=${encodeURIComponent(selectedActivityCode)}`
    : "";
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedSummaryRef = useRef(false);
  const summaryLoadRequestRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadedCompanyIdRef = useRef(activeCompany?.id);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    hasLoadedSummaryRef.current = false;
    setSummary(null);
    setIsLoading(true);
    setIsRefreshing(false);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  const loadData = useCallback(async () => {
    const requestId = ++summaryLoadRequestRef.current;
    if (isLoadingActivities) {
      setIsRefreshing(false);
      return;
    }
    if (hasLoadedSummaryRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        getDashboardSummaryRequest(accessToken, {
          activityCode: selectedActivityCode ?? undefined
        })
      );
      if (requestId !== summaryLoadRequestRef.current) return;
      hasLoadedSummaryRef.current = true;
      setSummary(response.item);
    } catch (error) {
      if (requestId === summaryLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === summaryLoadRequestRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeCompany?.id, isLoadingActivities, selectedActivityCode, withAuthorizedToken]);

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

  const recentTransactions = useMemo<DashboardRecentTransaction[]>(() => {
    if (!summary) return [];
    return summary.recentTransactions.slice(0, 6);
  }, [summary]);

  return (
    <>
      <header className="section-header my-work-header mobile-title-duplicate">
        <div>
          <p className="sidebar-section-label">Espace personnel</p>
          <h2>Mon travail</h2>
        </div>
        <div className="my-work-header-actions">
          <button type="button" className="dashboard-inline-button" onClick={() => navigate(`/operations/tasks${activityQuery}`)}>
            Voir les tâches
          </button>
          <button type="button" className="dashboard-inline-button" onClick={() => navigate(`/finance/transactions${activityQuery}`)}>
            Voir les transactions
          </button>
        </div>
      </header>

      <FeedbackBanner
        errorMessage={errorMessage}
        isLoading={isLoading}
        loadingLabel="Chargement des priorités..."
      />
      {isRefreshing ? <p className="dashboard-refresh-status" role="status">Mise à jour des priorités…</p> : null}

      <PageGuide
        title="Guide de travail"
        description={`Vue personnelle centrée sur ${
          selectedActivityCode ? getBusinessActivityLabel(selectedActivityCode) : "tous les secteurs accessibles"
        }.`}
        items={[
          {
            term: "Priorité",
            description: "Tâche ouverte à traiter rapidement, surtout si elle est bloquée ou proche de son échéance."
          },
          {
            term: "Bloquée",
            description: "Travail arrêté par un problème qui demande une décision ou une intervention."
          },
          {
            term: "Échéance",
            description: "Date limite de traitement; une échéance dépassée doit être régularisée ou replanifiée."
          },
          {
            term: "Transaction récente",
            description: "Dernière écriture financière comptabilisée dans le périmètre courant."
          }
        ]}
      />

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
          </section>

          <section className="dashboard-priority-grid my-work-grid">
            <article className="panel dashboard-priority-card">
              <div className="dashboard-panel-header">
                <div>
                  <p className="sidebar-section-label">Opérations</p>
                  <h3>Tâches prioritaires</h3>
                </div>
                <button type="button" className="dashboard-inline-button" onClick={() => navigate(`/operations/tasks${activityQuery}`)}>
                  Voir tout
                </button>
              </div>
              {urgentTasks.length === 0 ? (
                <EmptyState
                  title="Aucune tâche urgente"
                  description="Aucune priorité immédiate dans le périmètre courant."
                  actionLabel="Ouvrir les tâches"
                  onAction={() => navigate(`/operations/tasks${activityQuery}`)}
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
                        {task.activityCode || task.assignedToFullName ? (
                          <span>
                            {task.activityCode ? getBusinessActivityLabel(task.activityCode) : null}
                            {task.activityCode && task.assignedToFullName ? " · " : null}
                            {task.assignedToFullName ?? null}
                          </span>
                        ) : null}
                      </div>
                      <div className="dashboard-priority-side">
                        <strong>{taskStatusLabel(task.status)}</strong>
                        <span
                          className={
                            isOverdue(task.dueDate)
                              ? "my-work-task-deadline priority-danger-text"
                              : "my-work-task-deadline"
                          }
                        >
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
                  <h3>Transactions récentes</h3>
                </div>
                <button type="button" className="dashboard-inline-button" onClick={() => navigate(`/finance/transactions${activityQuery}`)}>
                  Voir tout
                </button>
              </div>
              {recentTransactions.length === 0 ? (
                <EmptyState
                  title="Aucune transaction récente"
                  description="Aucune écriture récente n'est disponible dans le périmètre courant."
                  actionLabel="Ouvrir les transactions"
                  onAction={() => navigate(`/finance/transactions${activityQuery}`)}
                />
              ) : (
                <div className="dashboard-priority-list">
                  {recentTransactions.map((transaction) => (
                    <button
                      key={transaction.id}
                      type="button"
                      className="dashboard-priority-item"
                      onClick={() => {
                        const transactionActivity = transaction.activityCode ?? selectedActivityCode;
                        const query = new URLSearchParams({ transactionId: transaction.id });
                        if (transactionActivity) query.set("activityCode", transactionActivity);
                        navigate(`/finance/transactions?${query.toString()}`);
                      }}
                    >
                      <div className="dashboard-priority-main">
                        <strong>{transaction.accountName}</strong>
                        <span>
                          {transaction.type === "CASH_IN" ? "Entrée" : "Sortie"}
                          {transaction.activityCode
                            ? ` · ${getBusinessActivityLabel(transaction.activityCode)}`
                            : null}
                        </span>
                      </div>
                      <div className="dashboard-priority-side">
                        <strong>{formatAmount(transaction.amount, transaction.currency)}</strong>
                        <span>
                          {financeStatusLabel(transaction.status)} | {formatDateTime(transaction.occurredAt)}
                        </span>
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
