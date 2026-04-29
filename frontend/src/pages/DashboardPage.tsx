import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { DashboardPriorityPanels } from "../components/dashboard/DashboardPriorityPanels";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { buildDailyActionCards, buildQuickSummaryPills, formatDateTime } from "../utils/dashboardDisplay";
import type { DashboardSummary } from "../types/reporting";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { selectedActivity, selectedActivityCode } = useBusinessActivity();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const withAuthorizedToken = useAuthorizedRequest();

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

  const selectedActivitySummary = useMemo(() => {
    if (!summary || !selectedActivityCode) return null;
    return summary.activitySummary.find((item) => item.activityCode === selectedActivityCode) ?? null;
  }, [selectedActivityCode, summary]);

  const quickSummaryPills = useMemo(() => {
    if (!summary) return [];
    return buildQuickSummaryPills(summary, selectedActivity?.label ?? null);
  }, [selectedActivity?.label, summary]);

  const dailyActionCards = useMemo(() => {
    if (!summary) return [];
    return buildDailyActionCards(summary);
  }, [summary]);

  return (
    <>
      <header className="section-header">
        <h2>Pilotage du jour</h2>
        <p>Vue opérationnelle claire et actionnable.</p>
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {isLoading ? <p>Chargement en cours...</p> : null}

      {!isLoading && summary ? (
        <>
          <DashboardHero
            title={selectedActivity?.label ?? "Tous les périmètres"}
            updatedAt={formatDateTime(summary.generatedAt)}
            actionCards={dailyActionCards}
            quickSummaryPills={quickSummaryPills}
            onNavigate={(href) => {
              navigate(href);
            }}
          />

          {selectedActivity && selectedActivitySummary ? (
            <section className="panel sector-focus-panel">
              <div>
                <p className="sidebar-section-label">Focus secteur</p>
                <h3>{selectedActivity.label}</h3>
                <p className="hint">{selectedActivity.description}</p>
              </div>
              <div className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                  <strong>Transactions</strong>
                  <span>{selectedActivitySummary.transactionsCount}</span>
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

          <DashboardPriorityPanels
            summary={summary}
            selectedActivityCode={selectedActivityCode}
            onNavigate={(href) => {
              navigate(href);
            }}
          />

          <section className="dashboard-footer-actions">
            <button
              className="dashboard-inline-button"
              type="button"
              onClick={() => {
                navigate("/reports");
              }}
            >
              Ouvrir les rapports
            </button>
            <button
              className="dashboard-inline-button"
              type="button"
              onClick={() => {
                navigate("/settings/security");
              }}
            >
              Consulter la sécurité
            </button>
          </section>
        </>
      ) : null}
    </>
  );
}
