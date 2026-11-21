import { formatAmountForDisplay } from "../lib/amountFormatting";
import type { ReportsOverview } from "../types/reporting";

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR");
}

export function parseAmount(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export function formatAmount(value: string | number, currency?: string): string {
  if (currency) {
    return `${formatAmountForDisplay(value)} ${currency}`;
  }
  const amount = typeof value === "number" ? value : parseAmount(value);
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount);
}

export function buildAccountedCurrencyRows(overview: ReportsOverview): Array<{
  currency: string;
  cashIn: number;
  cashOut: number;
  net: number;
}> {
  const rows = new Map<string, { currency: string; cashIn: number; cashOut: number; net: number }>();

  for (const item of overview.financeByType) {
    const current = rows.get(item.currency) ?? {
      currency: item.currency,
      cashIn: 0,
      cashOut: 0,
      net: 0
    };
    const accountedAmount = parseAmount(item.approvedAmount);
    if (item.type === "CASH_IN") {
      current.cashIn += accountedAmount;
    } else {
      current.cashOut += accountedAmount;
    }
    current.net = current.cashIn - current.cashOut;
    rows.set(item.currency, current);
  }

  return Array.from(rows.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function buildReportMetrics(overview: ReportsOverview) {
  const transactionCount = overview.financeByType.reduce((sum, item) => sum + item.count, 0);
  const activeTransactions = overview.financeByStatus
    .filter((item) => item.status === "SUBMITTED" || item.status === "APPROVED")
    .reduce((sum, item) => sum + item.count, 0);
  const draftTransactions = overview.financeByStatus
    .filter((item) => item.status === "DRAFT")
    .reduce((sum, item) => sum + item.count, 0);
  const rejectedTransactions = overview.financeByStatus
    .filter((item) => item.status === "REJECTED")
    .reduce((sum, item) => sum + item.count, 0);
  const totalTasks = overview.taskByStatus.reduce((sum, item) => sum + item.count, 0);
  const openTasks = overview.taskByStatus
    .filter((item) => item.status !== "DONE")
    .reduce((sum, item) => sum + item.count, 0);
  const blockedTasks = overview.taskByStatus
    .filter((item) => item.status === "BLOCKED")
    .reduce((sum, item) => sum + item.count, 0);
  const doneTasks = overview.taskByStatus
    .filter((item) => item.status === "DONE")
    .reduce((sum, item) => sum + item.count, 0);
  const accountedCurrencyRows = buildAccountedCurrencyRows(overview);
  const netAccountedLabel = accountedCurrencyRows.length > 0
    ? accountedCurrencyRows.map((item) => formatAmount(item.net, item.currency)).join(" / ")
    : "0";

  return {
    transactionCount,
    activeTransactions,
    draftTransactions,
    rejectedTransactions,
    totalTasks,
    openTasks,
    blockedTasks,
    doneTasks,
    accountedCurrencyRows,
    netAccountedLabel
  };
}
