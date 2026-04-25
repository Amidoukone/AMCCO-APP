import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BUSINESS_ACTIVITY_LABELS, getBusinessActivityLabel } from "../config/businessActivities";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ApiError, getDashboardSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
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

function isOverdue(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() < Date.now();
}

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedActivity, selectedActivityCode, selectedProfile } = useBusinessActivity();
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

  const openTasksCount = useMemo(() => {
    if (!summary) {
      return 0;
    }
    return (
      summary.operations.todoCount +
      summary.operations.inProgressCount +
      summary.operations.blockedCount
    );
  }, [summary]);

  const headlineCards = useMemo(() => {
    if (!summary) {
      return [];
    }

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
  }, [openTasksCount, selectedActivityCode, summary]);

  const quickSummaryPills = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      {
        label: "Périmètre actif",
        value: selectedActivity?.label ?? "Tous les périmètres"
      },
      {
        label: "Audit sur 7 jours",
        value: String(summary.company.auditEventsLast7Days)
      },
      {
        label: "Comptes compatibles",
        value: String(summary.finance.accountsSummary.compatibleCount)
      },
      {
        label: "Tâches non assignées",
        value: String(summary.operations.unassignedCount)
      }
    ];
  }, [selectedActivity?.label, summary]);

  const dailyActionCards = useMemo(() => {
    if (!summary) {
      return [];
    }

    const financeHref = selectedActivityCode
      ? `/finance/transactions?activityCode=${selectedActivityCode}`
      : "/finance/transactions";

    return [
      {
        key: "my-work",
        eyebrow: "Mes tâches",
        title: "Travail du jour",
        value: String(summary.operations.myOpenTasksCount),
        note: "Reprenez vos actions ouvertes et poursuivez les dossiers en cours.",
        actionLabel: "Ouvrir les opérations",
        href: "/operations/tasks",
        tone: "neutral"
      },
      {
        key: "alerts",
        eyebrow: "Vigilance",
        title: "Alertes non lues",
        value: String(summary.company.unreadAlertsCount),
        note: "Traitez les alertes récentes avant qu'elles ne bloquent l'exécution.",
        actionLabel: "Ouvrir le centre d'alertes",
        href: "/alerts",
        tone: summary.company.unreadAlertsCount > 0 ? "warning" : "neutral"
      },
      {
        key: "transactions",
        eyebrow: "Finance",
        title: "Transactions à revoir",
        value: String(summary.finance.submittedCount),
        note: "Vérifiez les transactions soumises et finalisez les validations utiles.",
        actionLabel: "Ouvrir les flux financiers",
        href: financeHref,
        tone: summary.finance.submittedCount > 0 ? "warning" : "neutral"
      },
      {
        key: "blocked",
        eyebrow: "Blocages",
        title: "Tâches bloquées",
        value: String(summary.operations.blockedCount),
        note: "Priorisez les blocages et les échéances dépassées pour fluidifier l'équipe.",
        actionLabel: "Voir les blocages",
        href: "/operations/tasks",
        tone: summary.operations.blockedCount > 0 || summary.operations.overdueCount > 0 ? "critical" : "neutral"
      }
    ];
  }, [selectedActivityCode, summary]);

  const submittedTransactions = useMemo(() => {
    if (!summary) {
      return [];
    }
    return summary.recentTransactions.filter((item) => item.status === "SUBMITTED").slice(0, 4);
  }, [summary]);

  const blockedTasks = useMemo(() => {
    if (!summary) {
      return [];
    }
    return summary.recentTasks.filter((item) => item.status === "BLOCKED").slice(0, 4);
  }, [summary]);

  const overdueTasks = useMemo(() => {
    if (!summary) {
      return [];
    }
    return summary.recentTasks
      .filter((item) => item.status !== "DONE" && isOverdue(item.dueDate))
      .slice(0, 4);
  }, [summary]);

  return (
    <>
      <header className="section-header">
        <h2>Pilotage du jour</h2>
        <p>
          Vue de travail quotidienne de l&apos;entreprise, avec un pilotage prioritaire sur le
          périmètre <strong>{selectedActivity?.label ?? "tous les périmètres"}</strong>.
        </p>
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {isLoading ? <p>Chargement en cours...</p> : null}

      {!isLoading && summary ? (
        <>
          <section className="panel dashboard-overview-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="sidebar-section-label">Priorités</p>
                <h3>À traiter aujourd&apos;hui</h3>
                <p className="hint">
                  Les cartes ci-dessous ouvrent directement les modules utiles pour faire avancer
                  les tâches, les validations et les alertes.
                </p>
              </div>
              <div className="dashboard-focus-note">
                <strong>{selectedActivity?.label ?? "Tous les périmètres"}</strong>
                <span>Périmètre de pilotage</span>
                <span>Mise à jour {formatDateTime(summary.generatedAt)}</span>
              </div>
            </div>

            <div className="dashboard-action-grid">
              {dailyActionCards.map((card) => (
                <button
                  key={card.key}
                  className={`dashboard-action-card tone-${card.tone}`}
                  type="button"
                  onClick={() => {
                    navigate(card.href);
                  }}
                >
                  <span className="dashboard-action-eyebrow">{card.eyebrow}</span>
                  <strong>{card.title}</strong>
                  <span className="dashboard-action-value">{card.value}</span>
                  <span className="dashboard-action-note">{card.note}</span>
                  <span className="dashboard-action-link">{card.actionLabel}</span>
                </button>
              ))}
            </div>

            <div className="dashboard-summary-strip">
              {quickSummaryPills.map((item) => (
                <article key={item.label} className="dashboard-summary-pill">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </section>

          {selectedActivity && selectedActivitySummary ? (
            <section className="panel sector-focus-panel">
              <div>
                <p className="sidebar-section-label">Focus secteur</p>
                <h3>{selectedActivity.label}</h3>
                <p className="hint">{selectedActivity.description}</p>
                {selectedProfile ? (
                  <p className="hint">
                    Mode opératoire : {selectedProfile.operationsModel} | Règles :{" "}
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
              <div className="dashboard-panel-header">
                <div>
                  <h3>Repères sectoriels</h3>
                  <p className="hint">
                    Indicateurs de vigilance liés au périmètre actif pour orienter les arbitrages.
                  </p>
                </div>
              </div>
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

          <section className="dashboard-priority-grid">
            <article className="panel dashboard-priority-card">
              <div className="dashboard-panel-header">
                <div>
                  <h3>Transactions à revoir</h3>
                  <p className="hint">
                    Transactions soumises récemment, prêtes pour vérification ou décision.
                  </p>
                </div>
                <button
                  className="dashboard-inline-button"
                  type="button"
                  onClick={() => {
                    navigate(
                      selectedActivityCode
                        ? `/finance/transactions?activityCode=${selectedActivityCode}`
                        : "/finance/transactions"
                    );
                  }}
                >
                  Ouvrir le module
                </button>
              </div>

              {submittedTransactions.length === 0 ? (
                <p className="hint">Aucune transaction soumise n&apos;attend de traitement immédiat.</p>
              ) : (
                <div className="dashboard-priority-list">
                  {submittedTransactions.map((item) => (
                    <button
                      key={item.id}
                      className="dashboard-priority-item"
                      type="button"
                      onClick={() => {
                        navigate(
                          `/finance/transactions?transactionId=${item.id}${
                            selectedActivityCode ? `&activityCode=${selectedActivityCode}` : ""
                          }`
                        );
                      }}
                    >
                      <div className="dashboard-priority-main">
                        <strong>{item.accountName}</strong>
                        <span>
                          {item.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {item.activityCode ? getBusinessActivityLabel(item.activityCode) : "Sans activité"}
                        </span>
                      </div>
                      <div className="dashboard-priority-side">
                        <strong>{formatAmount(item.amount, item.currency)}</strong>
                        <span>
                          {financeStatusLabel(item.status)} | {formatDateTime(item.occurredAt)}
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
                  <h3>Blocages et échéances</h3>
                  <p className="hint">
                    Les éléments ci-dessous demandent une action rapide pour garder le flux
                    opérationnel fluide.
                  </p>
                </div>
                <button
                  className="dashboard-inline-button"
                  type="button"
                  onClick={() => {
                    navigate("/operations/tasks");
                  }}
                >
                  Voir les opérations
                </button>
              </div>

              <div className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                  <strong>Bloquées</strong>
                  <span>{summary.operations.blockedCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Échéances dépassées</strong>
                  <span>{summary.operations.overdueCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Échéances proches</strong>
                  <span>{summary.operations.dueSoonCount}</span>
                </article>
                <article className="dashboard-kpi-card">
                  <strong>Non assignées</strong>
                  <span>{summary.operations.unassignedCount}</span>
                </article>
              </div>

              {blockedTasks.length === 0 && overdueTasks.length === 0 ? (
                <p className="hint">Aucun blocage immédiat n&apos;est détecté dans la vue courante.</p>
              ) : (
                <div className="dashboard-priority-list">
                  {[...blockedTasks, ...overdueTasks]
                    .filter((item, index, collection) => {
                      return collection.findIndex((entry) => entry.id === item.id) === index;
                    })
                    .slice(0, 4)
                    .map((item) => (
                      <button
                        key={item.id}
                        className="dashboard-priority-item"
                        type="button"
                        onClick={() => {
                          navigate(`/operations/tasks/${item.id}`);
                        }}
                      >
                        <div className="dashboard-priority-main">
                          <strong>{item.title}</strong>
                          <span>
                            {item.activityCode
                              ? getBusinessActivityLabel(item.activityCode)
                              : "Sans activité"}{" "}
                            | {item.assignedToFullName ?? "Non assignée"}
                          </span>
                        </div>
                        <div className="dashboard-priority-side">
                          <strong>{taskStatusLabel(item.status)}</strong>
                          <span>
                            Échéance {formatDateTime(item.dueDate)} | Mise à jour{" "}
                            {formatDateTime(item.updatedAt)}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </article>
          </section>

          <details className="panel dashboard-section-toggle">
            <summary className="dashboard-section-summary">
              <span>Vue détaillée entreprise</span>
              <small>
                Ouvrez ce bloc pour consulter les repères globaux, la couverture sectorielle et les
                équilibres finance-opérations.
              </small>
            </summary>

            <div className="dashboard-section-body">
              <section className="grid">
                {headlineCards.map((card) => (
                  <article key={card.title} className="metric-card">
                    <h2>{card.title}</h2>
                    <p className="metric-value">{card.value}</p>
                    <p className="metric-note">{card.note}</p>
                  </article>
                ))}
              </section>

              <section className="dashboard-detail-sections">
                <article className="panel">
                  <div className="dashboard-panel-header">
                    <div>
                      <h3>Contexte entreprise</h3>
                      <p className="hint">
                        {summary.company.companyName} ({summary.company.companyCode}) | Mise à jour{" "}
                        {formatDateTime(summary.generatedAt)}
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
                </article>

                <article className="panel">
                  <h3>Activités AMCCO</h3>
                  <p className="hint">
                    Lecture transversale des activités pour relier les flux financiers et
                    l&apos;exécution terrain.
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
                          Transactions : {item.transactionsCount} | À revoir :{" "}
                          {item.submittedTransactionsCount}
                        </p>
                        <p className="activity-card-stat">
                          Tâches : {item.totalTasksCount} | Ouvertes : {item.openTasksCount}
                        </p>
                        <p className="activity-card-stat">Bloquées : {item.blockedTasksCount}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="panel">
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

                  <p className="hint">
                    {selectedActivityCode
                      ? `${summary.finance.accountsSummary.incompatibleCount} compte(s) restent hors du secteur ${getBusinessActivityLabel(selectedActivityCode)}.`
                      : "Sans périmètre actif, la lecture des comptes reste globale à l'entreprise."}
                  </p>

                  <div className="dashboard-currency-list">
                    {summary.finance.totalsByCurrency.length === 0 ? (
                      <p className="hint">Aucun montant approuvé n&apos;est disponible pour le moment.</p>
                    ) : (
                      summary.finance.totalsByCurrency.map((item) => (
                        <article key={item.currency} className="dashboard-currency-card">
                          <h4>{item.currency}</h4>
                          <p>
                            Entrées approuvées :{" "}
                            {formatAmount(item.approvedCashInTotal, item.currency)}
                          </p>
                          <p>
                            Sorties approuvées :{" "}
                            {formatAmount(item.approvedCashOutTotal, item.currency)}
                          </p>
                          <p>Net approuvé : {formatAmount(item.netApprovedTotal, item.currency)}</p>
                        </article>
                      ))
                    )}
                  </div>
                </article>

                <article className="panel">
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

                  {canSeeWorkload ? (
                    <div className="operations-member-grid">
                      {summary.workload.length === 0 ? (
                        <p className="hint">Aucun membre assignable disponible.</p>
                      ) : (
                        summary.workload.map((item) => (
                          <article key={item.userId} className="operations-member-card">
                            <h4>{item.fullName}</h4>
                            <p className="hint">{item.role}</p>
                            <p className="hint">
                              Ouvertes : {item.openTasksCount} | En cours : {item.inProgressTasksCount}
                            </p>
                            <p className="hint">
                              Bloquées : {item.blockedTasksCount} | Terminées : {item.doneTasksCount}
                            </p>
                          </article>
                        ))
                      )}
                    </div>
                  ) : null}
                </article>
              </section>
            </div>
          </details>

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
