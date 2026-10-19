import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { DashboardPriorityPanels } from "../components/dashboard/DashboardPriorityPanels";
import { PageGuide } from "../components/PageGuide";
import { SectorWorkspaceNav } from "../components/SectorWorkspaceNav";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  buildDailyActionCards,
  buildQuickSummaryPills,
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

function getAccountedTransactionCount(summary: DashboardSummary): number {
  return summary.finance.submittedCount + summary.finance.approvedCount;
}

function buildOwnerActionCards(
  summary: DashboardSummary,
  selectedActivityCode: string | null
): DashboardActionCard[] {
  const activityQuery = buildActivityQuery(selectedActivityCode);
  const blockedOrLateCount = summary.operations.blockedCount + summary.operations.overdueCount;
  const accountedTransactionCount = getAccountedTransactionCount(summary);

  return [
    {
      key: "owner-finance-review",
      eyebrow: "Finance",
      title: "Transactions comptabilisées",
      value: String(accountedTransactionCount),
      note: "Entrées et sorties enregistrées dans le suivi.",
      actionLabel: "Ouvrir les transactions",
      href: `/finance/transactions${activityQuery}`,
      tone: "neutral"
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
  const netAccounted =
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
      label: "Net comptabilisé",
      value: netAccounted
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
  const { activeCompany, user } = useAuth();
  const { selectedActivity, selectedActivityCode, isLoading: isLoadingActivities } = useBusinessActivity();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedSummaryRef = useRef(false);
  const summaryLoadRequestRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const withAuthorizedToken = useAuthorizedRequest();
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
    return buildDailyActionCards(summary, selectedActivityCode);
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

  const transportOperationalRow = useMemo(() => {
    if (!summary || selectedActivityCode !== "TRANSPORT") return null;
    return summary.operationalPerformance.find(
      (item) => item.scope === "ACTIVITY" && item.activityCode === "TRANSPORT"
    ) ?? null;
  }, [selectedActivityCode, summary]);

  return (
    <>
      <header className="section-header">
        <h2>Pilotage du jour</h2>
      </header>

      <SectorWorkspaceNav />

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {isLoading ? <p>Chargement en cours...</p> : null}
      {isRefreshing ? <p className="dashboard-refresh-status" role="status">Mise à jour…</p> : null}

      {!isLoading && summary ? (
        <>
          <PageGuide
            title="Guide de pilotage"
            description={`Les indicateurs affichés couvrent ${
              selectedActivity?.label ?? "tous les secteurs accessibles"
            } pour aider à décider quoi contrôler en priorité.`}
            items={[
              {
                term: "Net comptabilisé",
                description: "Solde des entrées moins les sorties déjà enregistrées dans le suivi financier."
              },
              {
                term: "Exécution",
                description: "Part des tâches terminées par rapport au volume de tâches suivies."
              },
              {
                term: "Blocage",
                description: "Tâche arrêtée par un problème nécessitant une décision ou un appui."
              },
              {
                term: "Périmètre",
                description: "Entreprise complète ou secteur sélectionné dans le contexte courant."
              }
            ]}
          />

          <DashboardHero
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
                  <span>{getAccountedTransactionCount(summary)} comptabilisée(s)</span>
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

          <section className="panel dashboard-operational-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="sidebar-section-label">Pilotage opérationnel</p>
                <h3>{selectedActivityCode === "TRANSPORT" ? "Synthèse transport" : "Rentabilité, efficacité et exécution"}</h3>
                <p className="hint">
                  {selectedActivityCode === "TRANSPORT"
                    ? "Entrées, sorties et solde comptabilisés en XOF. Les trajets, véhicules et charges sont détaillés dans le rapport Transport."
                    : "Rentabilité calculée sur les flux comptabilisés en XOF, avec suivi des tâches, blocages et retards."}
                </p>
              </div>
            </div>
            {selectedActivityCode === "TRANSPORT" ? (
              <div className="dashboard-transport-overview">
                {transportOperationalRow ? (
                  <>
                    <div className="dashboard-kpi-grid">
                      <article className="dashboard-kpi-card">
                        <strong>Entrées</strong>
                        <span>{formatAmount(transportOperationalRow.approvedCashIn, "XOF")}</span>
                      </article>
                      <article className="dashboard-kpi-card">
                        <strong>Sorties</strong>
                        <span>{formatAmount(transportOperationalRow.approvedCashOut, "XOF")}</span>
                      </article>
                      <article className="dashboard-kpi-card">
                        <strong>Solde</strong>
                        <span>{formatAmount(transportOperationalRow.netProfit, "XOF")}</span>
                      </article>
                    </div>
                    {transportOperationalRow.totalTasksCount > 0 ? (
                      <div className="dashboard-transport-task-summary">
                        <strong>Suivi des tâches</strong>
                        <span>{transportOperationalRow.doneTasksCount}/{transportOperationalRow.totalTasksCount} terminées ({formatRate(transportOperationalRow.executionRate)})</span>
                        <span>{transportOperationalRow.openTasksCount} ouvertes</span>
                        {transportOperationalRow.blockedTasksCount > 0 ? <span>{transportOperationalRow.blockedTasksCount} blocages</span> : null}
                        {transportOperationalRow.overdueTasksCount > 0 ? <span>{transportOperationalRow.overdueTasksCount} retards</span> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Aucun flux comptabilisé ni tâche pour le transport dans ce périmètre.</p>
                )}
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => navigate("/reports?activityCode=TRANSPORT")}
                >
                  Voir le rapport Transport
                </button>
              </div>
            ) : (
            <div className="table-wrap dashboard-operational-table-wrap mobile-auto-card-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      <abbr title="Entreprise, secteur ou sous-section analysée.">Périmètre</abbr>
                    </th>
                    <th>
                      <abbr title="Total des entrées financières comptabilisées.">Entrées</abbr>
                    </th>
                    <th>
                      <abbr title="Total des sorties financières comptabilisées.">Sorties</abbr>
                    </th>
                    <th>
                      <abbr title="Entrées moins sorties sur le périmètre.">Net</abbr>
                    </th>
                    <th>
                      <abbr title="Taux de tâches terminées dans le périmètre.">Exécution</abbr>
                    </th>
                    <th>
                      <abbr title="Tâches encore non terminées.">Ouvertes</abbr>
                    </th>
                    <th>
                      <abbr title="Tâches arrêtées par un problème.">Blocages</abbr>
                    </th>
                    <th>
                      <abbr title="Tâches ouvertes dont l'échéance est dépassée.">Retards</abbr>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {operationalRows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="dashboard-table-empty">
                          <strong>Aucune donnée opérationnelle consolidée.</strong>
                          <span>
                            Créez ou consultez les tâches et transactions du périmètre pour alimenter ce tableau.
                          </span>
                          <div className="actions-inline">
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => navigate(`/operations/tasks${buildActivityQuery(selectedActivityCode)}`)}
                            >
                              Voir les tâches
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() =>
                                navigate(`/finance/transactions${buildActivityQuery(selectedActivityCode)}`)
                              }
                            >
                              Voir les transactions
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    operationalRows.map((row) => (
                      <tr key={`${row.scope}-${row.activityCode}-${row.dimensionKey}-${row.itemKey}`}>
                        <td data-label="Périmètre">{getOperationalRowLabel(row)}</td>
                        <td data-label="Entrées">{formatAmount(row.approvedCashIn, row.currency)}</td>
                        <td data-label="Sorties">{formatAmount(row.approvedCashOut, row.currency)}</td>
                        <td data-label="Net">{formatAmount(row.netProfit, row.currency)}</td>
                        <td data-label="Exécution">{formatRate(row.executionRate)}</td>
                        <td data-label="Ouvertes">{row.openTasksCount}</td>
                        <td data-label="Blocages">{row.blockedTasksCount}</td>
                        <td data-label="Retards">{row.overdueTasksCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            )}
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
