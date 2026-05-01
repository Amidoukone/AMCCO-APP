import { getBusinessActivityLabel } from "../../config/businessActivities";
import type { DashboardSummary } from "../../types/reporting";
import {
  financeStatusLabel,
  formatAmount,
  formatDateTime,
  taskStatusLabel
} from "../../utils/dashboardDisplay";

type DashboardPriorityPanelsProps = {
  summary: DashboardSummary;
  selectedActivityCode: string | null;
  onNavigate: (href: string) => void;
};

export function DashboardPriorityPanels({
  summary,
  selectedActivityCode,
  onNavigate
}: DashboardPriorityPanelsProps): JSX.Element {
  const recentTransactions = summary.recentTransactions.slice(0, 4);
  const blockedTasks = summary.recentTasks.filter((item) => item.status === "BLOCKED").slice(0, 4);
  const overdueTasks = summary.recentTasks
    .filter((item) => item.status !== "DONE" && item.dueDate && new Date(item.dueDate).getTime() < Date.now())
    .slice(0, 4);
  const priorityTasks = [...blockedTasks, ...overdueTasks]
    .filter((item, index, collection) => collection.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 4);

  return (
    <section className="dashboard-priority-grid">
      <article className="panel dashboard-priority-card">
        <div className="dashboard-panel-header">
          <div>
            <h3>Transactions récentes</h3>
          </div>
          <button
            className="dashboard-inline-button"
            type="button"
            onClick={() => {
              onNavigate(
                selectedActivityCode
                  ? `/finance/transactions?activityCode=${selectedActivityCode}`
                  : "/finance/transactions"
              );
            }}
          >
            Voir les transactions
          </button>
        </div>

        {recentTransactions.length > 0 ? (
          <div className="dashboard-priority-list">
            {recentTransactions.map((item) => (
              <button
                key={item.id}
                className="dashboard-priority-item"
                type="button"
                onClick={() => {
                  onNavigate(
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
        ) : null}
      </article>

      <article className="panel dashboard-priority-card">
        <div className="dashboard-panel-header">
          <div>
            <h3>Blocages et échéances</h3>
          </div>
          <button
            className="dashboard-inline-button"
            type="button"
            onClick={() => {
              onNavigate("/operations/tasks");
            }}
          >
            Voir les tâches
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

        {priorityTasks.length > 0 ? (
          <div className="dashboard-priority-list">
            {priorityTasks.map((item) => (
              <button
                key={item.id}
                className="dashboard-priority-item"
                type="button"
                onClick={() => {
                  onNavigate(`/operations/tasks/${item.id}`);
                }}
              >
                <div className="dashboard-priority-main">
                  <strong>{item.title}</strong>
                  <span>
                    {item.activityCode ? getBusinessActivityLabel(item.activityCode) : "Sans activité"} |{" "}
                    {item.assignedToFullName ?? "Non assignée"}
                  </span>
                </div>
                <div className="dashboard-priority-side">
                  <strong>{taskStatusLabel(item.status)}</strong>
                  <span>
                    Échéance {formatDateTime(item.dueDate)} | Mise à jour {formatDateTime(item.updatedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </article>
    </section>
  );
}
