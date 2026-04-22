import {
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../config/businessActivities";

type MetadataObject = Record<string, unknown>;

export type FinanceTransactionNavigationTarget = {
  kind: "transaction" | "salary";
  transactionId: string;
  activityCode: BusinessActivityCode | null;
};

function asObject(value: unknown): MetadataObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as MetadataObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getFinanceTransactionNavigationTarget(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  metadata: unknown
): FinanceTransactionNavigationTarget | null {
  const normalizedEntityType = entityType?.trim().toUpperCase() ?? null;
  const root = asObject(metadata);
  const salaryRoot = asObject(root?.salary);
  const isSalary =
    normalizedEntityType === "SALARY" ||
    asString(root?.entryCategory) === "SALARY" ||
    salaryRoot !== null;
  const transactionId =
    ((normalizedEntityType === "TRANSACTION" || normalizedEntityType === "SALARY")
      ? asString(entityId)
      : null) ??
    asString(root?.transactionId);

  if (!transactionId) {
    return null;
  }

  if (normalizedEntityType && normalizedEntityType !== "TRANSACTION" && normalizedEntityType !== "SALARY") {
    return null;
  }

  const rawActivityCode = asString(root?.activityCode);
  return {
    kind: isSalary ? "salary" : "transaction",
    transactionId,
    activityCode:
      !isSalary && rawActivityCode && isBusinessActivityCode(rawActivityCode) ? rawActivityCode : null
  };
}

export function buildFinanceTransactionPath(
  target: FinanceTransactionNavigationTarget
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("transactionId", target.transactionId);
  if (target.kind === "transaction" && target.activityCode) {
    searchParams.set("activityCode", target.activityCode);
  }
  return target.kind === "salary"
    ? `/finance/salaries?${searchParams.toString()}`
    : `/finance/transactions?${searchParams.toString()}`;
}

export function getFinanceTraceLines(metadata: unknown): string[] {
  const root = asObject(metadata);
  if (!root) {
    return [];
  }

  const lines: string[] = [];
  const transactionId = asString(root.transactionId);
  const activityLabel = asString(root.activityLabel);
  const activityCode = asString(root.activityCode);
  const decision = asString(root.decision);
  const account = asObject(root.account);
  const salary = asObject(root.salary);
  const salaryConfirmation = asObject(root.salaryConfirmation);

  if (transactionId) {
    lines.push(`${salary ? "Salaire" : "Transaction"}: ${transactionId}`);
  }

  if (activityLabel || activityCode) {
    lines.push(`Secteur: ${activityLabel ?? activityCode}`);
  }

  if (account) {
    const accountName = asString(account.name);
    const accountRef = asString(account.ref);
    const scopeLabel = asString(account.scopeLabel);

    if (accountName || accountRef) {
      lines.push(`Compte: ${accountName ?? "-"}${accountRef ? ` (${accountRef})` : ""}`);
    }

    if (scopeLabel) {
      lines.push(`Portee: ${scopeLabel}`);
    }
  }

  if (decision) {
    lines.push(`Decision: ${decision}`);
  }

  if (salary) {
    const employeeFullName = asString(salary.employeeFullName);
    const payPeriod = asString(salary.payPeriod);
    if (employeeFullName) {
      lines.push(`Employe: ${employeeFullName}`);
    }
    if (payPeriod) {
      lines.push(`Periode: ${payPeriod}`);
    }
  }

  if (salaryConfirmation) {
    const status = asString(salaryConfirmation.status);
    if (status) {
      lines.push(`Confirmation salaire: ${status}`);
    }
  }

  return lines;
}

export function formatMetadataForDisplay(metadata: unknown): string {
  const financeLines = getFinanceTraceLines(metadata);
  if (financeLines.length > 0) {
    return financeLines.join(" | ");
  }

  return metadata ? JSON.stringify(metadata) : "-";
}
