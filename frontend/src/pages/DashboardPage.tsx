import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { DashboardPriorityPanels } from "../components/dashboard/DashboardPriorityPanels";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  buildDailyActionCards,
  buildQuickSummaryPills,
  formatDateTime,
  type DashboardActionCard
} from "../utils/dashboardDisplay";
import type { DashboardSummary } from "../types/reporting";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
}

function buildActivityQuery(activityCode: string | null): string {
  return activityCode ? `?activityCode=${activityCode}` : "";
}

function buildOwnerActionCards(
  summary: DashboardSummary,
  selectedActivityCode: string | null
): DashboardActionCard[] {
  const activityQuery = buildActivityQuery(selectedActivityCode);
  const blockedOrLateCount = summary.operations.blockedCount + summary.operations.overdueCount;

  return [
    {
      key: "owner-finance-review",
      eyebrow: "Contrôle",
      title: "Transactions soumises",
      value: String(summary.finance.submittedCount),
      note: "À suivre avant validation comptable.",
      actionLabel: "Ouvrir les transactions",
      href: `/finance/transactions${activityQuery}`,
      tone: summary.finance.submittedCount > 0 ? "warning" : "neutral"
    },
    {
      key: "owner-alerts",
      eyebrow: "Vigilance",
      title: "Alertes non lues",
      value: String(summary.company.unreadAlertsCount),
      note: "Signaux récents à contrôler.",
      actionLabel: "Consulter les alertes",
      href: "/alerts",
      tone: summary.company.unreadAlertsCount > 0 ? "warning" : "neutral"
    },
    {
      key: "owner-blockers",
      eyebrow: "Opérations",
      title: "Blocages",
      value: String(blockedOrLateCount),
      note: "Tâches bloquées ou en retard.",
      actionLabel: "Voir les tâches",
      href: `/operations/tasks${activityQuery}`,
      tone: blockedOrLateCount > 0 ? "critical" : "neutral"
    },
    {
      key: "owner-reports",
      eyebrow: "Synthèse",
      title: "Rapports",
      value: String(summary.finance.totalsByCurrency.length || 1),
      note: "Exporter une vue PDF ou Excel.",
      actionLabel: "Ouvrir les rapports",
      href: "/reports",
      tone: "neutral"
    }
  ];
}

function buildOwnerSummaryPills(
  summary: DashboardSummary,
  selectedActivityLabel: string | null
): Array<{ label: string; value: string }> {
  const netApproved =
    summary.finance.totalsByCurrency.length === 1
      ? `${summary.finance.totalsByCurrency[0].netApprovedTotal} ${summary.finance.totalsByCurrency[0].currency}`
      : `${summary.finance.totalsByCurrency.length} devise(s)`;

  return [
    {
      label: "Entreprise",
      value: summary.company.companyName
    },
    {
      label: "Périmètre",
      value: selectedActivityLabel ?? "Tous les secteurs"
    },
    {
      label: "Net approuvé",
      value: netApproved
    },
    {
      label: "Utilisateurs actifs",
      value: String(summary.company.activeUsersCount)
    }
  ];
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const isReadOnlyOwner = user?.role === "OWNER";

  const quickSummaryPills = useMemo(() => {
    if (!summary) return [];
    if (isReadOnlyOwner) {
      return buildOwnerSummaryPills(summary, selectedActivity?.label ?? null);
    }
    return buildQuickSummaryPills(summary, selectedActivity?.label ?? null);
  }, [isReadOnlyOwner, selectedActivity?.label, summary]);

  const dailyActionCards = useMemo(() => {
    if (!summary) return [];
    if (isReadOnlyOwner) {
      return buildOwnerActionCards(summary, selectedActivityCode);
    }
    return buildDailyActionCards(summary);
  }, [isReadOnlyOwner, selectedActivityCode, summary]);

  return (
    <>
      <header className="section-header">
        <h2>Pilotage du jour</h2>
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

          {isReadOnlyOwner ? (
            <section className="panel owner-command-panel">
              <div className="dashboard-panel-header">
                <div>
                  <p className="sidebar-section-label">Vue propriétaire</p>
                  <h3>Contrôle rapide</h3>
                  <p className="hint">
                    Consultez les points sensibles sans modifier les opérations terrain.
                  </p>
                </div>
              </div>
              <div className="owner-command-grid">
                <article className="owner-command-card">
                  <strong>Finance</strong>
                  <span>{summary.finance.submittedCount} soumise(s)</span>
                  <span>{summary.finance.rejectedCount} rejetée(s)</span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => navigate(`/finance/transactions${buildActivityQuery(selectedActivityCode)}`)}
                  >
                    Contrôler
                  </button>
                </article>
                <article className="owner-command-card">
                  <strong>Opérations</strong>
                  <span>{summary.operations.blockedCount} bloquée(s)</span>
                  <span>{summary.operations.overdueCount} en retard</span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => navigate(`/operations/tasks${buildActivityQuery(selectedActivityCode)}`)}
                  >
                    Suivre
                  </button>
                </article>
                <article className="owner-command-card">
                  <strong>Reporting</strong>
                  <span>{summary.company.auditEventsLast7Days} audit(s) sur 7 jours</span>
                  <span>{summary.company.unreadAlertsCount} alerte(s) non lue(s)</span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => navigate("/reports")}
                  >
                    Exporter
                  </button>
                </article>
              </div>
            </section>
          ) : null}

          {selectedActivity && selectedActivitySummary ? (
            <section className="panel sector-focus-panel">
              <div>
                <p className="sidebar-section-label">Focus secteur</p>
                <h3>{selectedActivity.label}</h3>
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
        </>
      ) : null}
    </>
  );
}
