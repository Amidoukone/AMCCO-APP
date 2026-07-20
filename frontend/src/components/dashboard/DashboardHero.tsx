import type { DashboardActionCard } from "../../utils/dashboardDisplay";

type DashboardHeroProps = {
  actionCards: DashboardActionCard[];
  quickSummaryPills: Array<{ label: string; value: string }>;
  onNavigate: (href: string) => void;
};

export function DashboardHero({
  actionCards,
  quickSummaryPills,
  onNavigate
}: DashboardHeroProps): JSX.Element {
  return (
    <section className="panel dashboard-overview-panel">
      {actionCards.length > 0 ? (
        <div className="dashboard-action-grid">
          {actionCards.map((card) => (
            <button
              key={card.key}
              className={`dashboard-action-card tone-${card.tone}`}
              type="button"
              onClick={() => {
                onNavigate(card.href);
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
      ) : null}

      {quickSummaryPills.length > 0 ? (
        <div className="dashboard-summary-strip">
          {quickSummaryPills.map((item) => (
            <article key={item.label} className="dashboard-summary-pill">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
