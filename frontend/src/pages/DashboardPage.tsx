import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHero } from "../components/dashboard/DashboardHero";
import { DashboardPriorityPanels } from "../components/dashboard/DashboardPriorityPanels";
import { SectorWorkspaceNav } from "../components/SectorWorkspaceNav";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { BusinessActivityCode } from "../config/businessActivities";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { DashboardSummary } from "../types/reporting";
import type { DashboardActionCard } from "../utils/dashboardDisplay";
import { formatAmount } from "../utils/dashboardDisplay";

function withActivity(path: string, activityCode: string | null): string {
  return activityCode ? `${path}?activityCode=${activityCode}` : path;
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeCompany, user } = useAuth();
  const { selectedActivity, selectedActivityCode, isLoading: isLoadingActivities } = useBusinessActivity();
  const authorized = useAuthorizedRequest();
  const [loaded, setLoaded] = useState<{ companyId: string; activityCode: BusinessActivityCode | null; data: DashboardSummary } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
  const summary = loaded && loaded.companyId === activeCompany?.id && loaded.activityCode === selectedActivityCode
    ? loaded.data
    : null;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (isLoadingActivities) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await authorized((token) => getDashboardSummaryRequest(token, { activityCode: selectedActivityCode ?? undefined, includeDetails: false }));
      if (requestId === requestRef.current) setLoaded({ companyId: activeCompany?.id ?? "", activityCode: selectedActivityCode, data: response.item });
    } catch (error) {
      if (requestId === requestRef.current) setErrorMessage(error instanceof ApiError ? error.message : "Chargement impossible. Vérifiez la connexion backend.");
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [activeCompany?.id, authorized, isLoadingActivities, selectedActivityCode]);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo<DashboardActionCard[]>(() => {
    if (!summary) return [];
    const canCreate = user?.role !== "OWNER";
    const openTasksCount = summary.operations.todoCount + summary.operations.inProgressCount + summary.operations.blockedCount;
    const hasUrgentTasks = summary.operations.blockedCount > 0 || summary.operations.overdueCount > 0;
    return [
      { key: "transactions", eyebrow: "Finance", title: "Transactions", value: String(summary.finance.totalTransactionsCount), note: "Saisies et dernières écritures.", actionLabel: canCreate ? "Ajouter ou consulter" : "Consulter", href: `${withActivity("/finance/transactions", selectedActivityCode)}${canCreate ? "#transaction-create" : ""}`, tone: "neutral" },
      { key: "tasks", eyebrow: "Opérations", title: "À traiter", value: String(openTasksCount), note: "Tâches ouvertes du secteur.", actionLabel: canCreate ? "Créer ou suivre" : "Suivre", href: `${withActivity("/operations/tasks", selectedActivityCode)}${canCreate ? "#task-create" : ""}`, tone: hasUrgentTasks ? "critical" : "neutral" },
      { key: "reports", eyebrow: "Bilan", title: "Rapport PDF", value: "PDF", note: "Bilan du secteur et téléchargement.", actionLabel: "Ouvrir les rapports", href: withActivity("/reports", selectedActivityCode), tone: "neutral" }
    ];
  }, [selectedActivityCode, summary, user?.role]);

  const pills = useMemo(() => {
    if (!summary) return [];
    const totals = summary.finance.totalsByCurrency;
    const net = totals.length === 1 ? formatAmount(totals[0].netApprovedTotal, totals[0].currency) : totals.length === 0 ? "Aucun mouvement" : `${totals.length} devises`;
    return [{ label: "Secteur", value: selectedActivity?.label ?? "Tous les secteurs" }, { label: "Flux net", value: net }, { label: "Alertes", value: String(summary.company.unreadAlertsCount) }];
  }, [selectedActivity?.label, summary]);

  return <>
    <header className="section-header"><h2>Vue d’ensemble</h2></header>
    <SectorWorkspaceNav />
    {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
    {isLoading ? <p>Chargement en cours...</p> : null}
    {!isLoading && summary ? <>
      <DashboardHero actionCards={actions} quickSummaryPills={pills} onNavigate={navigate} />
      <DashboardPriorityPanels summary={summary} selectedActivityCode={selectedActivityCode} onNavigate={navigate} />
    </> : null}
  </>;
}
