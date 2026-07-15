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
import type { DashboardSummary, ReportOperationalMetric } from "../types/reporting";

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

function formatAmount(value: string, currency = "XOF"): string {
  const amount = Number(value);
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${formatted} ${currency}`;
}

function formatRate(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1
  }).format(value)}%`;
}

function getOperationalRowLabel(row: ReportOperationalMetric): string {
  return row.scope === "ACTIVITY" ? row.itemLabel : `${row.dimensionLabel}: ${row.itemLabel}`;
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

  const operationalRows = useMemo(() => {
    if (!summary) return [];
    const rows = selectedActivityCode
      ? summary.operationalPerformance.filter(
          (item) => item.scope === "SUBSECTION" && item.activityCode === selectedActivityCode
        )
      : summary.operationalPerformance.filter((item) => item.scope === "ACTIVITY");

    return rows
      .filter((item) => item.transactionsCount > 0 || item.totalTasksCount > 0)
      .slice(0, 8);
  }, [selectedActivityCode, summary]);

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

          <section className="panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="sidebar-section-label">Pilotage opérationnel</p>
                <h3>Rentabilité, efficacité et exécution</h3>
                <p className="hint">
                  Rentabilité calculée sur les flux approuvés en XOF, avec suivi des tâches,
                  blocages et retards.
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Périmètre</th>
                    <th>Entrées</th>
                    <th>Sorties</th>
                    <th>Net</th>
                    <th>Exécution</th>
                    <th>Ouvertes</th>
                    <th>Blocages</th>
                    <th>Retards</th>
                  </tr>
                </thead>
                <tbody>
                  {operationalRows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>Aucune donnée opérationnelle consolidée pour ce périmètre.</td>
                    </tr>
                  ) : (
                    operationalRows.map((row) => (
                      <tr key={`${row.scope}-${row.activityCode}-${row.dimensionKey}-${row.itemKey}`}>
                        <td>{getOperationalRowLabel(row)}</td>
                        <td>{formatAmount(row.approvedCashIn, row.currency)}</td>
                        <td>{formatAmount(row.approvedCashOut, row.currency)}</td>
                        <td>{formatAmount(row.netProfit, row.currency)}</td>
                        <td>{formatRate(row.executionRate)}</td>
                        <td>{row.openTasksCount}</td>
                        <td>{row.blockedTasksCount}</td>
                        <td>{row.overdueTasksCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

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
