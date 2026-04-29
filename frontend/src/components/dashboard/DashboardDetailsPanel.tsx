import { BUSINESS_ACTIVITY_LABELS } from "../../config/businessActivities";
import type { DashboardSummary } from "../../types/reporting";
import { formatAmount, formatDateTime } from "../../utils/dashboardDisplay";

type DashboardDetailsPanelProps = {
  summary: DashboardSummary;
  selectedActivityCode: string | null;
  headlineCards: Array<{ title: string; value: string; note: string }>;
  canSeeWorkload: boolean;
};

export function DashboardDetailsPanel({
  summary,
  selectedActivityCode,
  headlineCards,
  canSeeWorkload
}: DashboardDetailsPanelProps): JSX.Element {
  return (
    <details className="panel dashboard-section-toggle">
      <summary className="dashboard-section-summary">
        <span>Vue détaillée entreprise</span>
        <small>Indicateurs globaux finance et opérations.</small>
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
                <strong>Tâches non assignées</strong>
                <span>{summary.operations.unassignedCount}</span>
              </article>
            </div>
          </article>

          <article className="panel">
            <h3>Activités AMCCO</h3>
            <div className="activity-grid">
              {summary.activitySummary.map((item) => (
                <article
                  key={item.activityCode}
                  className={
                    item.activityCode === selectedActivityCode ? "activity-card is-selected" : "activity-card"
                  }
                >
                  <h4>{BUSINESS_ACTIVITY_LABELS[item.activityCode]}</h4>
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
            <p className="hint">
              {selectedActivityCode
                ? `${summary.finance.accountsSummary.incompatibleCount} compte(s) hors secteur actif.`
                : "Lecture globale sans filtre de secteur."}
            </p>

            <div className="dashboard-currency-list">
              {summary.finance.totalsByCurrency.length === 0 ? (
                <p className="hint">Aucun montant approuvé disponible.</p>
              ) : (
                summary.finance.totalsByCurrency.map((item) => (
                  <article key={item.currency} className="dashboard-currency-card">
                    <h4>{item.currency}</h4>
                    <p>Entrées approuvées : {formatAmount(item.approvedCashInTotal, item.currency)}</p>
                    <p>Sorties approuvées : {formatAmount(item.approvedCashOutTotal, item.currency)}</p>
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
  );
}
