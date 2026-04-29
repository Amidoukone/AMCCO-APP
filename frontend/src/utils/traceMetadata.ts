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

export type TaskNavigationTarget = {
  taskId: string;
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

function asTaskStatusLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value === "TODO") {
    return "À faire";
  }
  if (value === "IN_PROGRESS") {
    return "En cours";
  }
  if (value === "DONE") {
    return "Terminée";
  }
  if (value === "BLOCKED") {
    return "Bloquée";
  }
  return value;
}

export function getTaskNavigationTarget(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  metadata: unknown
): TaskNavigationTarget | null {
  const normalizedEntityType = entityType?.trim().toUpperCase() ?? null;
  const root = asObject(metadata);
  const taskId =
    (normalizedEntityType === "TASK" ? asString(entityId) : null) ??
    asString(root?.taskId);

  if (!taskId) {
    return null;
  }

  if (normalizedEntityType && normalizedEntityType !== "TASK" && normalizedEntityType !== "TASK_COMMENT") {
    return null;
  }

  return { taskId };
}

export function buildTaskPath(target: TaskNavigationTarget): string {
  return `/operations/tasks/${encodeURIComponent(target.taskId)}`;
}

export function getTaskTraceLines(action: string, metadata: unknown): string[] {
  const root = asObject(metadata);
  if (!root) {
    return [];
  }

  const lines: string[] = [];
  const title = asString(root.title) ?? asString(root.nextTitle);
  const activityLabel = asString(root.activityLabel);
  const activityCode = asString(root.activityCode);
  const note = asString(root.note);
  const bodyPreview = asString(root.bodyPreview);
  const dueDate = asString(root.dueDate);
  const previousStatus = asTaskStatusLabel(asString(root.previousStatus));
  const nextStatus = asTaskStatusLabel(asString(root.nextStatus));

  if (title) {
    lines.push(`Tâche: ${title}`);
  }

  if (activityLabel || activityCode) {
    lines.push(`Secteur: ${activityLabel ?? activityCode}`);
  }

  if (action === "TASK_STATUS_CHANGED" && (previousStatus || nextStatus)) {
    lines.push(`Statut: ${previousStatus ?? "-"} -> ${nextStatus ?? "-"}`);
  }

  if (dueDate) {
    lines.push(`Échéance: ${dueDate}`);
  }

  if (note) {
    lines.push(`Note: ${note}`);
  }

  if (action === "TASK_COMMENT_ADDED" && bodyPreview) {
    lines.push(`Commentaire: ${bodyPreview}`);
  }

  return lines;
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
  const reviewer = asObject(root.reviewer);
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

  if (reviewer) {
    const reviewerDisplayName =
      asString(reviewer.displayName) ?? asString(reviewer.fullName) ?? asString(reviewer.email);
    if (reviewerDisplayName) {
      lines.push(`Validateur: ${reviewerDisplayName}`);
    }
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
    if (status && status !== "NOT_REQUIRED") {
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
