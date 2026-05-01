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
  void input;
  return "Tous les secteurs";
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
