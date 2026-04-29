import { getBusinessActivityLabel, type BusinessActivityCode } from "../config/businessActivities";
import type { FinancialAccount, FinancialAccountScopeType, FinancialTransaction } from "../types/finance";

function formatActivityList(activityCodes: BusinessActivityCode[]): string {
  return activityCodes.map((activityCode) => getBusinessActivityLabel(activityCode)).join(", ");
}

export function formatAccountScopeLabel(input: {
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): string {
  if (input.scopeType === "GLOBAL") {
    return "Global entreprise";
  }

  if (input.scopeType === "DEDICATED") {
    return input.primaryActivityCode
      ? `Dedie: ${getBusinessActivityLabel(input.primaryActivityCode)}`
      : "Dedie";
  }

  return input.allowedActivityCodes.length > 0
    ? `Restreint: ${formatActivityList(input.allowedActivityCodes)}`
    : "Restreint";
}

export function formatAccountGovernanceDetails(input: {
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  activityCode: BusinessActivityCode | null;
  accountRef: string | null;
}): string[] {
  const lines = [formatAccountScopeLabel(input)];

  if (input.accountRef) {
    lines.push(`Reference: ${input.accountRef}`);
  }

  if (input.activityCode) {
    lines.push(`Secteur transaction: ${getBusinessActivityLabel(input.activityCode)}`);
  }

  if (input.scopeType === "DEDICATED" && input.primaryActivityCode) {
    lines.push(`Secteur compte: ${getBusinessActivityLabel(input.primaryActivityCode)}`);
  }

  if (input.scopeType === "RESTRICTED" && input.allowedActivityCodes.length > 0) {
    lines.push(`Secteurs autorises: ${formatActivityList(input.allowedActivityCodes)}`);
  }

  return lines;
}

export function getTransactionGovernanceLines(transaction: FinancialTransaction): string[] {
  return formatAccountGovernanceDetails({
    scopeType: transaction.accountScopeType,
    primaryActivityCode: transaction.accountPrimaryActivityCode,
    allowedActivityCodes: transaction.accountAllowedActivityCodes,
    activityCode: transaction.activityCode,
    accountRef: transaction.accountRef
  });
}

export function getTransactionDecisionShortcuts(transactionId: string): {
  alertsPath: string;
  auditPath: string;
} {
  const encoded = encodeURIComponent(transactionId);
  return {
    alertsPath: `/alerts?entityType=TRANSACTION&entityId=${encoded}`,
    auditPath: `/settings/security?entityType=TRANSACTION&entityId=${encoded}`
  };
}

export function getAccountGovernanceLines(account: FinancialAccount): string[] {
  return formatAccountGovernanceDetails({
    scopeType: account.scopeType,
    primaryActivityCode: account.primaryActivityCode,
    allowedActivityCodes: account.allowedActivityCodes,
    activityCode: null,
    accountRef: account.accountRef
  });
}
