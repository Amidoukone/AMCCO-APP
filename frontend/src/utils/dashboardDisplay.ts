import type { DashboardSummary } from "../types/reporting";

export type FinanceStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";

export type DashboardActionCard = {
  key: string;
  eyebrow: string;
  title: string;
  value: string;
  note: string;
  actionLabel: string;
  href: string;
  tone: "neutral" | "warning" | "critical";
};

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

export function formatAmount(value: string, currency: string): string {
  return `${value} ${currency}`;
}

export function financeStatusLabel(status: FinanceStatus): string {
  if (status === "DRAFT") return "Brouillon";
  if (status === "SUBMITTED") return "Soumise";
  if (status === "APPROVED") return "Approuvée";
  return "Rejetée";
}

export function taskStatusLabel(status: TaskStatus): string {
  if (status === "TODO") return "À faire";
  if (status === "IN_PROGRESS") return "En cours";
  if (status === "DONE") return "Terminée";
  return "Bloquée";
}

export function isOverdue(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() < Date.now();
}

export function buildDailyActionCards(
  summary: DashboardSummary
): DashboardActionCard[] {
  return [
    {
      key: "my-work",
      eyebrow: "Mes tâches",
      title: "Travail du jour",
      value: String(summary.operations.myOpenTasksCount),
      note: "Reprenez vos actions ouvertes.",
      actionLabel: "Ouvrir mon travail",
      href: "/my-work",
      tone: "neutral"
    },
    {
      key: "alerts",
      eyebrow: "Vigilance",
      title: "Alertes non lues",
      value: String(summary.company.unreadAlertsCount),
      note: "Traitez les alertes récentes.",
      actionLabel: "Ouvrir les alertes",
      href: "/alerts",
      tone: summary.company.unreadAlertsCount > 0 ? "warning" : "neutral"
    },
    {
      key: "blocked",
      eyebrow: "Blocages",
      title: "Tâches bloquées",
      value: String(summary.operations.blockedCount),
      note: "Priorisez les blocages actifs.",
      actionLabel: "Voir les blocages",
      href: "/operations/tasks",
      tone: summary.operations.blockedCount > 0 || summary.operations.overdueCount > 0 ? "critical" : "neutral"
    }
  ];
}

export function buildQuickSummaryPills(
  summary: DashboardSummary,
  selectedActivityLabel: string | null
): Array<{ label: string; value: string }> {
  return [
    {
      label: "Périmètre actif",
      value: selectedActivityLabel ?? "Tous les périmètres"
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
}

export function buildHeadlineCards(
  summary: DashboardSummary,
  selectedActivityLabel: string | null,
  openTasksCount: number
): Array<{ title: string; value: string; note: string }> {
  return [
    {
      title: "Utilisateurs actifs",
      value: String(summary.company.activeUsersCount),
      note: `${summary.company.totalMembershipsCount} membership(s) sur ${summary.company.companyCode}`
    },
    {
      title: "Comptes financiers",
      value: String(summary.company.financialAccountsCount),
      note: selectedActivityLabel
        ? `${summary.finance.accountsSummary.compatibleCount} compatible(s) avec ${selectedActivityLabel}`
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
}

export function getPriorityTasks(summary: DashboardSummary) {
  const blockedTasks = summary.recentTasks.filter((item) => item.status === "BLOCKED").slice(0, 4);
  const overdueTasks = summary.recentTasks
    .filter((item) => item.status !== "DONE" && isOverdue(item.dueDate))
    .slice(0, 4);

  return [...blockedTasks, ...overdueTasks]
    .filter((item, index, collection) => collection.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 4);
}
