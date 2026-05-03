import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  assertTransactionInputMatchesActivityProfile,
  getBusinessActivityProfile,
  normalizeActivityMetadata
} from "../config/business-activity-profiles.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import { HttpError } from "../errors/http-error.js";
import { getImageKitUploadAuthParameters, resolveImageKitProofUrl } from "../lib/imagekit.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  addTransactionProof,
  createFinancialAccount,
  deleteFinancialAccount,
  type FinancialAccountScopeType,
  createFinancialTransaction,
  deleteFinancialTransaction,
  findFinancialAccountById,
  findFinancialTransactionById,
  findSalaryTransactionByEmployeeAndPeriod,
  findTransactionById,
  listFinancialAccounts,
  listFinancialTransactions,
  listSalaryTransactions,
  listTransactionProofs,
  reviewTransaction,
  type SalaryConfirmationStatus,
  submitTransaction,
  type SalaryPaymentMethod,
  type TransactionProof,
  updateFinancialAccount,
  updateFinancialTransaction
} from "../repositories/finance.repository.js";
import {
  findMembershipByCompanyAndUser,
  listCompanyUsers
} from "../repositories/admin-users.repository.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
  email?: string;
  fullName?: string;
};

const ACCOUNT_CREATE_ROLES: RoleCode[] = ["SYS_ADMIN"];
const TRANSACTION_REVIEW_ROLES: RoleCode[] = ["SYS_ADMIN", "ACCOUNTANT"];
const SALARY_VIEW_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT"];
const SALARY_MANAGEMENT_ROLES: RoleCode[] = ["SYS_ADMIN", "ACCOUNTANT"];

type SalarySnapshot = {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: RoleCode;
  payPeriod: string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
  paymentMethod: SalaryPaymentMethod;
  note: string | null;
};

type SalaryConfirmationSnapshot = {
  status: SalaryConfirmationStatus;
  confirmedById: string | null;
  confirmedByEmail: string | null;
  confirmedAt: string | null;
};

type SalarySummaryItem = {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  count: number;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

type SalaryPaymentMethodSummaryItem = {
  paymentMethod: SalaryPaymentMethod;
  count: number;
  netAmount: string;
};

type SalaryEmployeeSummaryItem = {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: RoleCode;
  count: number;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

function canCreateAccount(role: RoleCode): boolean {
  return ACCOUNT_CREATE_ROLES.includes(role);
}

function canReviewTransaction(role: RoleCode): boolean {
  return TRANSACTION_REVIEW_ROLES.includes(role);
}

function canManageTransaction(role: RoleCode): boolean {
  return TRANSACTION_REVIEW_ROLES.includes(role);
}

function canDeleteApprovedTransaction(role: RoleCode): boolean {
  return role === "SYS_ADMIN";
}

function canManageSalary(role: RoleCode): boolean {
  return SALARY_MANAGEMENT_ROLES.includes(role);
}

function canViewAllSalaries(role: RoleCode): boolean {
  return SALARY_VIEW_ROLES.includes(role);
}

function ensureSalaryManagementAccess(role: RoleCode): void {
  if (!canManageSalary(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour gerer les salaires.");
  }
}

function ensureSalaryViewAccess(role: RoleCode): void {
  if (!canViewAllSalaries(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter les salaires.");
  }
}

function ensureTransactionManagementAccess(role: RoleCode): void {
  if (!canManageTransaction(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier ou supprimer les transactions.");
  }
}

function resolveSalaryAccessScope(input: {
  actorId: string;
  role: RoleCode;
  employeeUserId?: string;
}): string | undefined {
  if (canViewAllSalaries(input.role)) {
    return input.employeeUserId;
  }

  if (input.employeeUserId && input.employeeUserId !== input.actorId) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter le salaire d'un autre collaborateur.");
  }

  return input.actorId;
}

function assertAccountCreationGovernance(
  role: RoleCode,
  scopeType: FinancialAccountScopeType
): void {
  if (scopeType === "GLOBAL" && role === "ACCOUNTANT") {
    throw new HttpError(
      403,
      "Seuls le proprietaire ou l'admin systeme peuvent creer ce type de compte financier."
    );
  }
}

function assertAccountManagementGovernance(
  role: RoleCode,
  scopeType: FinancialAccountScopeType
): void {
  if (role !== "OWNER" && role !== "SYS_ADMIN") {
    throw new HttpError(403, "Permissions insuffisantes pour modifier ou supprimer ce compte financier.");
  }
}

function normalizeActivityCodes(input?: BusinessActivityCode[]): BusinessActivityCode[] {
  return Array.from(new Set((input ?? []).map((item) => item.trim() as BusinessActivityCode)));
}

function getEffectiveAllowedActivityCodes(input: {
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): BusinessActivityCode[] {
  if (input.scopeType === "DEDICATED") {
    return input.primaryActivityCode ? [input.primaryActivityCode] : [];
  }

  if (input.scopeType === "RESTRICTED") {
    return normalizeActivityCodes(input.allowedActivityCodes);
  }

  return [];
}

function assertAccountSupportsActivity(
  account: {
    name: string;
    scopeType: FinancialAccountScopeType;
    primaryActivityCode: BusinessActivityCode | null;
    allowedActivityCodes: BusinessActivityCode[];
  },
  activityCode: BusinessActivityCode
): void {
  void account;
  void activityCode;
}

function toActivityLabel(activityCode: BusinessActivityCode | null): string | null {
  return activityCode ? getBusinessActivityProfile(activityCode).label : null;
}

function toAccountScopeLabel(account: {
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
}): string {
  if (account.scopeType === "GLOBAL") {
    return "Tous les secteurs";
  }

  if (account.scopeType === "DEDICATED") {
    return account.primaryActivityCode
      ? `Dedie: ${toActivityLabel(account.primaryActivityCode) ?? account.primaryActivityCode}`
      : "Dedie";
  }

  return account.allowedActivityCodes.length > 0
    ? `Restreint: ${account.allowedActivityCodes
        .map((activityCode) => toActivityLabel(activityCode) ?? activityCode)
        .join(", ")}`
    : "Restreint";
}

function buildFinanceGovernanceMetadata(input: {
  account: {
    id: string;
    name: string;
    accountRef: string | null;
    scopeType: FinancialAccountScopeType;
    primaryActivityCode: BusinessActivityCode | null;
    allowedActivityCodes: BusinessActivityCode[];
  };
  activityCode?: BusinessActivityCode | null;
  transactionId?: string;
}) {
  return {
    transactionId: input.transactionId,
    activityCode: input.activityCode ?? null,
    activityLabel: toActivityLabel(input.activityCode ?? null),
    account: {
      id: input.account.id,
      name: input.account.name,
      ref: input.account.accountRef,
      scopeType: input.account.scopeType,
      scopeLabel: toAccountScopeLabel(input.account),
      primaryActivityCode: input.account.primaryActivityCode,
      primaryActivityLabel: toActivityLabel(input.account.primaryActivityCode),
      allowedActivityCodes: input.account.allowedActivityCodes,
      allowedActivityLabels: input.account.allowedActivityCodes.map(
        (activityCode) => toActivityLabel(activityCode) ?? activityCode
      )
    }
  };
}

function buildReviewerMetadata(
  reviewer: {
    userId?: string;
    fullName?: string;
    email?: string;
    role?: RoleCode;
  } | null | undefined,
  actor: ActorContext
) {
  const fullName = reviewer?.fullName?.trim() || null;
  const email = reviewer?.email?.trim() || null;
  const actorFullName = actor.fullName?.trim() || null;
  const actorEmail = actor.email?.trim() || null;

  return {
    id: reviewer?.userId ?? actor.actorId,
    fullName: fullName ?? actorFullName,
    email: email ?? actorEmail,
    role: reviewer?.role ?? actor.role,
    displayName: fullName ?? actorFullName ?? email ?? actorEmail ?? null
  };
}

function normalizeMoneyString(input: string | undefined, fallback = "0.00"): string {
  const value = input?.trim();
  return value && /^\d+(\.\d{1,2})?$/.test(value) ? value : fallback;
}

function toMoneyCents(input: string): number {
  const [wholePart, decimalPart = ""] = input.split(".");
  const normalizedDecimal = `${decimalPart}00`.slice(0, 2);
  return Number.parseInt(wholePart, 10) * 100 + Number.parseInt(normalizedDecimal, 10);
}

function centsToMoney(input: number): string {
  const isNegative = input < 0;
  const absoluteValue = Math.abs(input);
  const whole = Math.floor(absoluteValue / 100);
  const decimals = absoluteValue % 100;
  return `${isNegative ? "-" : ""}${whole}.${String(decimals).padStart(2, "0")}`;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(",");
  const lines = rows.map((row) => row.map((value) => escapeCsvValue(value)).join(","));
  return [headerLine, ...lines].join("\n");
}

function buildWorkbookBuffer(sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  }) as Buffer;
}

function isSalaryPaymentMethod(value: string): value is SalaryPaymentMethod {
  return ["BANK_TRANSFER", "CASH", "MOBILE_MONEY", "CHEQUE"].includes(value);
}

function extractSalarySnapshot(metadata?: Record<string, string> | null): SalarySnapshot | null {
  if (!metadata) {
    return null;
  }

  if (metadata.entryCategory !== "SALARY") {
    return null;
  }

  if (
    !metadata.employeeUserId ||
    !metadata.employeeFullName ||
    !metadata.employeeEmail ||
    !metadata.employeeRole ||
    !metadata.payPeriod ||
    !metadata.grossAmount ||
    !metadata.bonusAmount ||
    !metadata.deductionAmount ||
    !metadata.netAmount ||
    !metadata.paymentMethod
  ) {
    return null;
  }

  if (!isSalaryPaymentMethod(metadata.paymentMethod)) {
    return null;
  }

  return {
    employeeUserId: metadata.employeeUserId,
    employeeFullName: metadata.employeeFullName,
    employeeEmail: metadata.employeeEmail,
    employeeRole: metadata.employeeRole as RoleCode,
    payPeriod: metadata.payPeriod,
    grossAmount: metadata.grossAmount,
    bonusAmount: metadata.bonusAmount,
    deductionAmount: metadata.deductionAmount,
    netAmount: metadata.netAmount,
    paymentMethod: metadata.paymentMethod,
    note: metadata.note?.trim() || null
  };
}

function toSalaryActionLabel(snapshot: SalarySnapshot): string {
  return `${snapshot.employeeFullName} | ${snapshot.payPeriod}`;
}

function buildSalaryMetadata(input: SalarySnapshot): Record<string, string> {
  return {
    entryCategory: "SALARY",
    employeeUserId: input.employeeUserId,
    employeeFullName: input.employeeFullName,
    employeeEmail: input.employeeEmail,
    employeeRole: input.employeeRole,
    payPeriod: input.payPeriod,
    grossAmount: input.grossAmount,
    bonusAmount: input.bonusAmount,
    deductionAmount: input.deductionAmount,
    netAmount: input.netAmount,
    paymentMethod: input.paymentMethod,
    ...(input.note ? { note: input.note } : {})
  };
}

function buildSalaryConfirmationSnapshot(input: {
  salaryConfirmationStatus: SalaryConfirmationStatus;
  salaryConfirmedById: string | null;
  salaryConfirmedByEmail: string | null;
  salaryConfirmedAt: string | null;
}): SalaryConfirmationSnapshot {
  if (input.salaryConfirmationStatus === "PENDING") {
    return {
      status: "NOT_REQUIRED",
      confirmedById: null,
      confirmedByEmail: null,
      confirmedAt: null
    };
  }

  return {
    status: input.salaryConfirmationStatus,
    confirmedById: input.salaryConfirmedById,
    confirmedByEmail: input.salaryConfirmedByEmail,
    confirmedAt: input.salaryConfirmedAt
  };
}

function buildSalarySnapshotFromInput(input: {
  membership: {
    userId: string;
    fullName: string;
    email: string;
    role: RoleCode;
  };
  payPeriod: string;
  grossAmount: string;
  bonusAmount?: string;
  deductionAmount?: string;
  paymentMethod: SalaryPaymentMethod;
  note?: string;
}): SalarySnapshot {
  const grossAmount = normalizeMoneyString(input.grossAmount);
  const bonusAmount = normalizeMoneyString(input.bonusAmount);
  const deductionAmount = normalizeMoneyString(input.deductionAmount);
  const netCents = toMoneyCents(grossAmount) + toMoneyCents(bonusAmount) - toMoneyCents(deductionAmount);

  if (netCents <= 0) {
    throw new HttpError(400, "Le salaire net doit etre superieur a zero.");
  }

  return {
    employeeUserId: input.membership.userId,
    employeeFullName: input.membership.fullName,
    employeeEmail: input.membership.email,
    employeeRole: input.membership.role,
    payPeriod: input.payPeriod.trim(),
    grossAmount,
    bonusAmount,
    deductionAmount,
    netAmount: centsToMoney(netCents),
    paymentMethod: input.paymentMethod,
    note: input.note?.trim() || null
  };
}

type TransactionProofItem = TransactionProof & {
  publicUrl: string | null;
};

async function toTransactionProofItems(proofs: TransactionProof[]): Promise<TransactionProofItem[]> {
  return Promise.all(
    proofs.map(async (proof) => ({
      ...proof,
      publicUrl: await resolveImageKitProofUrl(proof.storageKey)
    }))
  );
}

async function findTransactionForProofs(companyId: string, transactionId: string) {
  const fullTransaction = await findFinancialTransactionById(companyId, transactionId);
  if (!fullTransaction) {
    throw new HttpError(500, "Impossible de recharger la transaction.");
  }
  if (extractSalarySnapshot(fullTransaction.metadata)) {
    throw new HttpError(400, "Les preuves ne sont pas gerees pour les salaires.");
  }
  return fullTransaction;
}

export async function listCompanyAccounts(input: {
  companyId: string;
  activityCode?: BusinessActivityCode;
}) {
  return listFinancialAccounts(input);
}

export async function listCompanySalaryMembers(companyId: string) {
  const members = await listCompanyUsers(companyId);
  return members.filter((member) => member.isActive);
}

export async function createCompanyAccount(
  actor: ActorContext,
  input: {
    name: string;
    accountRef?: string;
    openingBalance?: string;
    scopeType?: FinancialAccountScopeType;
    primaryActivityCode?: BusinessActivityCode;
    allowedActivityCodes?: BusinessActivityCode[];
  }
) {
  if (!canCreateAccount(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour creer un compte financier.");
  }

  const scopeType: FinancialAccountScopeType = "GLOBAL";
  const primaryActivityCode = null;

  const accountId = randomUUID();
  await createFinancialAccount({
    id: accountId,
    companyId: actor.companyId,
    name: input.name.trim(),
    accountRef: input.accountRef?.trim() || null,
    balance: input.openingBalance ?? "0.00",
    scopeType,
    primaryActivityCode,
    allowedActivityCodes: []
  });

  const created = await findFinancialAccountById(actor.companyId, accountId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger le compte financier cree.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_ACCOUNT_CREATED",
    entityType: "FINANCIAL_ACCOUNT",
    entityId: created.id,
    metadataJson: JSON.stringify({
      name: created.name,
      accountRef: created.accountRef,
      openingBalance: created.balance,
      scopeType: created.scopeType,
      scopeLabel: toAccountScopeLabel(created),
      primaryActivityCode: created.primaryActivityCode,
      primaryActivityLabel: toActivityLabel(created.primaryActivityCode),
      allowedActivityCodes: created.allowedActivityCodes,
      allowedActivityLabels: created.allowedActivityCodes.map(
        (activityCode) => toActivityLabel(activityCode) ?? activityCode
      )
    })
  });

  return created;
}

export async function updateCompanyAccount(
  actor: ActorContext,
  input: {
    accountId: string;
    name: string;
    accountRef?: string;
    openingBalance?: string;
    scopeType?: FinancialAccountScopeType;
    primaryActivityCode?: BusinessActivityCode;
    allowedActivityCodes?: BusinessActivityCode[];
  }
) {
  const existing = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!existing) {
    throw new HttpError(404, "Compte financier introuvable.");
  }

  assertAccountManagementGovernance(actor.role, existing.scopeType);

  if (existing.transactionsCount > 0) {
    throw new HttpError(
      400,
      "Ce compte financier est deja utilise par des transactions et ne peut plus etre modifie."
    );
  }

  const scopeType: FinancialAccountScopeType = "GLOBAL";
  const primaryActivityCode = null;
  assertAccountManagementGovernance(actor.role, scopeType);
  await updateFinancialAccount({
    companyId: actor.companyId,
    accountId: existing.id,
    name: input.name.trim(),
    accountRef: input.accountRef?.trim() || null,
    balance: input.openingBalance ?? existing.balance,
    scopeType,
    primaryActivityCode,
    allowedActivityCodes: []
  });

  const updated = await findFinancialAccountById(actor.companyId, existing.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger le compte financier modifie.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_ACCOUNT_UPDATED",
    entityType: "FINANCIAL_ACCOUNT",
    entityId: updated.id,
    metadataJson: JSON.stringify({
      previousScopeType: existing.scopeType,
      previousScopeLabel: toAccountScopeLabel(existing),
      previousName: existing.name,
      previousAccountRef: existing.accountRef,
      previousOpeningBalance: existing.balance,
      name: updated.name,
      accountRef: updated.accountRef,
      openingBalance: updated.balance,
      scopeType: updated.scopeType,
      scopeLabel: toAccountScopeLabel(updated),
      primaryActivityCode: updated.primaryActivityCode,
      primaryActivityLabel: toActivityLabel(updated.primaryActivityCode),
      allowedActivityCodes: updated.allowedActivityCodes,
      allowedActivityLabels: updated.allowedActivityCodes.map(
        (activityCode) => toActivityLabel(activityCode) ?? activityCode
      )
    })
  });

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_ACCOUNT_UPDATED",
      message: `Le compte financier ${updated.name} a ete modifie par l'admin systeme.`,
      severity: "WARNING",
      entityType: "FINANCIAL_ACCOUNT",
      entityId: updated.id,
      metadata: {
        accountId: updated.id,
        accountName: updated.name,
        actorRole: actor.role,
        scopeType: updated.scopeType,
        scopeLabel: toAccountScopeLabel(updated)
      }
    });
  }

  return updated;
}

export async function createCompanyTransaction(
  actor: ActorContext,
  input: {
    accountId: string;
    type: "CASH_IN" | "CASH_OUT";
    amount: string;
    currency: string;
    activityCode: BusinessActivityCode;
    description?: string;
    metadata?: Record<string, string>;
    occurredAt?: string;
  }
) {
  const account = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!account) {
    throw new HttpError(404, "Compte financier introuvable.");
  }
  assertAccountSupportsActivity(account, input.activityCode);

  await ensureCompanyActivityEnabledOrThrow(actor.companyId, input.activityCode);
  const currency = input.currency.trim().toUpperCase();
  const description = input.description?.trim();
  const metadata = normalizeActivityMetadata(input.metadata);
  try {
    assertTransactionInputMatchesActivityProfile(input.activityCode, {
      type: input.type,
      currency,
      description,
      metadata
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
  }
  const profile = getBusinessActivityProfile(input.activityCode);

  const transactionId = randomUUID();
  const governanceMetadata = buildFinanceGovernanceMetadata({
    account,
    activityCode: input.activityCode,
    transactionId
  });
  await createFinancialTransaction({
    id: transactionId,
    companyId: actor.companyId,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    currency,
    activityCode: input.activityCode,
    description: description || null,
    metadata,
    requiresProof: profile.finance.requiresProof,
    createdById: actor.actorId,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date()
  });

  await submitCompanyTransaction(actor, {
    transactionId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_TRANSACTION_CREATED",
    entityType: "TRANSACTION",
    entityId: transactionId,
    metadataJson: JSON.stringify({
      ...governanceMetadata,
      accountId: input.accountId,
      type: input.type,
      amount: input.amount,
      currency,
      activityCode: input.activityCode,
      activityLabel: profile.label,
      metadata,
      requiresProof: profile.finance.requiresProof,
      financeWorkflow: profile.finance.workflow.map((step) => step.code)
    })
  });

  const created = await findFinancialTransactionById(actor.companyId, transactionId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger la transaction creee.");
  }
  return created;
}

export async function updateCompanyTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
    accountId: string;
    type: "CASH_IN" | "CASH_OUT";
    amount: string;
    currency: string;
    activityCode: BusinessActivityCode;
    description?: string;
    metadata?: Record<string, string>;
    occurredAt?: string;
  }
) {
  ensureTransactionManagementAccess(actor.role);

  const existing = await findFinancialTransactionById(actor.companyId, input.transactionId);
  if (!existing) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  if (extractSalarySnapshot(existing.metadata)) {
    throw new HttpError(400, "Les salaires doivent etre geres depuis la page salaires.");
  }

  const account = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!account) {
    throw new HttpError(404, "Compte financier introuvable.");
  }
  assertAccountSupportsActivity(account, input.activityCode);

  await ensureCompanyActivityEnabledOrThrow(actor.companyId, input.activityCode);
  const currency = input.currency.trim().toUpperCase();
  const description = input.description?.trim();
  const metadata = normalizeActivityMetadata(input.metadata);
  try {
    assertTransactionInputMatchesActivityProfile(input.activityCode, {
      type: input.type,
      currency,
      description,
      metadata
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
  }

  const profile = getBusinessActivityProfile(input.activityCode);
  await updateFinancialTransaction({
    companyId: actor.companyId,
    transactionId: existing.id,
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    currency,
    activityCode: input.activityCode,
    description: description || null,
    metadata,
    requiresProof: profile.finance.requiresProof,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(existing.occurredAt)
  });

  await submitCompanyTransaction(actor, {
    transactionId: existing.id
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_TRANSACTION_UPDATED",
    entityType: "TRANSACTION",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: input.activityCode,
        transactionId: existing.id
      }),
      previousStatus: existing.status,
      accountId: input.accountId,
      type: input.type,
      amount: input.amount,
      currency,
      activityCode: input.activityCode,
      activityLabel: profile.label,
      metadata,
      requiresProof: profile.finance.requiresProof,
      financeWorkflow: profile.finance.workflow.map((step) => step.code)
    })
  });

  const updated = await findFinancialTransactionById(actor.companyId, existing.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la transaction modifiee.");
  }

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_TRANSACTION_UPDATED",
      message: `La transaction ${profile.label} ${updated.amount} ${updated.currency} a ete modifiee par l'admin systeme.`,
      severity: "WARNING",
      entityType: "TRANSACTION",
      entityId: updated.id,
      metadata: {
        transactionId: updated.id,
        accountId: updated.accountId,
        accountName: updated.accountName,
        actorRole: actor.role,
        activityCode: updated.activityCode,
        activityLabel: profile.label,
        status: updated.status
      }
    });
  }

  return updated;
}

export async function listCompanySalaryTransactions(input: {
  actorId: string;
  companyId: string;
  role: RoleCode;
  limit?: number;
  offset?: number;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  employeeUserId?: string;
  payPeriod?: string;
}) {
  if (!canViewAllSalaries(input.role) && input.status === "DRAFT") {
    throw new HttpError(403, "Les brouillons de salaire sont reserves a la comptabilite.");
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const scopedEmployeeUserId = resolveSalaryAccessScope({
    actorId: input.actorId,
    role: input.role,
    employeeUserId: input.employeeUserId
  });
  const items = await listSalaryTransactions({
    companyId: input.companyId,
    limit,
    offset,
    status: input.status,
    employeeUserId: scopedEmployeeUserId,
    payPeriod: input.payPeriod
  });

  return items
    .map((item) => {
      const snapshot = extractSalarySnapshot(item.metadata);
      if (!snapshot) {
        return null;
      }
      return {
        ...item,
        ...snapshot,
        salaryConfirmation: buildSalaryConfirmationSnapshot(item)
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter((item) => canViewAllSalaries(input.role) || item.status !== "DRAFT");
}

export async function getCompanySalarySummary(input: {
  companyId: string;
  role: RoleCode;
  payPeriod: string;
  employeeUserId?: string;
}) {
  ensureSalaryViewAccess(input.role);

  const items = await listCompanySalaryTransactions({
    actorId: input.employeeUserId ?? "salary-summary",
    companyId: input.companyId,
    role: input.role,
    limit: 2000,
    offset: 0,
    payPeriod: input.payPeriod,
    employeeUserId: input.employeeUserId
  });

  const byStatus = new Map<SalarySummaryItem["status"], SalarySummaryItem>();
  const byPaymentMethod = new Map<SalaryPaymentMethod, SalaryPaymentMethodSummaryItem>();
  const byEmployee = new Map<string, SalaryEmployeeSummaryItem>();

  let totalGrossCents = 0;
  let totalBonusCents = 0;
  let totalDeductionCents = 0;
  let totalNetCents = 0;
  let approvedNetCents = 0;
  let pendingCount = 0;

  for (const item of items) {
    const grossCents = toMoneyCents(item.grossAmount);
    const bonusCents = toMoneyCents(item.bonusAmount);
    const deductionCents = toMoneyCents(item.deductionAmount);
    const netCents = toMoneyCents(item.netAmount);

    totalGrossCents += grossCents;
    totalBonusCents += bonusCents;
    totalDeductionCents += deductionCents;
    totalNetCents += netCents;
    if (item.status === "APPROVED") {
      approvedNetCents += netCents;
    }
    if (item.status === "DRAFT" || item.status === "SUBMITTED") {
      pendingCount += 1;
    }

    const statusSummary = byStatus.get(item.status) ?? {
      status: item.status,
      count: 0,
      grossAmount: "0.00",
      bonusAmount: "0.00",
      deductionAmount: "0.00",
      netAmount: "0.00"
    };
    statusSummary.count += 1;
    statusSummary.grossAmount = centsToMoney(toMoneyCents(statusSummary.grossAmount) + grossCents);
    statusSummary.bonusAmount = centsToMoney(toMoneyCents(statusSummary.bonusAmount) + bonusCents);
    statusSummary.deductionAmount = centsToMoney(
      toMoneyCents(statusSummary.deductionAmount) + deductionCents
    );
    statusSummary.netAmount = centsToMoney(toMoneyCents(statusSummary.netAmount) + netCents);
    byStatus.set(item.status, statusSummary);

    const paymentSummary = byPaymentMethod.get(item.paymentMethod) ?? {
      paymentMethod: item.paymentMethod,
      count: 0,
      netAmount: "0.00"
    };
    paymentSummary.count += 1;
    paymentSummary.netAmount = centsToMoney(toMoneyCents(paymentSummary.netAmount) + netCents);
    byPaymentMethod.set(item.paymentMethod, paymentSummary);

    const employeeSummary = byEmployee.get(item.employeeUserId) ?? {
      employeeUserId: item.employeeUserId,
      employeeFullName: item.employeeFullName,
      employeeEmail: item.employeeEmail,
      employeeRole: item.employeeRole,
      count: 0,
      grossAmount: "0.00",
      bonusAmount: "0.00",
      deductionAmount: "0.00",
      netAmount: "0.00"
    };
    employeeSummary.count += 1;
    employeeSummary.grossAmount = centsToMoney(toMoneyCents(employeeSummary.grossAmount) + grossCents);
    employeeSummary.bonusAmount = centsToMoney(toMoneyCents(employeeSummary.bonusAmount) + bonusCents);
    employeeSummary.deductionAmount = centsToMoney(
      toMoneyCents(employeeSummary.deductionAmount) + deductionCents
    );
    employeeSummary.netAmount = centsToMoney(toMoneyCents(employeeSummary.netAmount) + netCents);
    byEmployee.set(item.employeeUserId, employeeSummary);
  }

  return {
    payPeriod: input.payPeriod,
    employeeUserId: input.employeeUserId ?? null,
    totalCount: items.length,
    totalGrossAmount: centsToMoney(totalGrossCents),
    totalBonusAmount: centsToMoney(totalBonusCents),
    totalDeductionAmount: centsToMoney(totalDeductionCents),
    totalNetAmount: centsToMoney(totalNetCents),
    approvedNetAmount: centsToMoney(approvedNetCents),
    pendingCount,
    items,
    byStatus: Array.from(byStatus.values()),
    byPaymentMethod: Array.from(byPaymentMethod.values()),
    byEmployee: Array.from(byEmployee.values()).sort((left, right) =>
      left.employeeFullName.localeCompare(right.employeeFullName, "fr")
    )
  };
}

export async function createCompanySalaryTransaction(
  actor: ActorContext,
  input: {
    accountId: string;
    employeeUserId: string;
    payPeriod: string;
    grossAmount: string;
    bonusAmount?: string;
    deductionAmount?: string;
    currency?: string;
    paymentMethod: SalaryPaymentMethod;
    note?: string;
    occurredAt: string;
  }
) {
  ensureSalaryManagementAccess(actor.role);

  const account = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!account) {
    throw new HttpError(404, "Compte financier introuvable.");
  }

  const membership = await findMembershipByCompanyAndUser(actor.companyId, input.employeeUserId);
  if (!membership) {
    throw new HttpError(404, "Collaborateur introuvable pour cette entreprise.");
  }
  if (!membership.isActive) {
    throw new HttpError(400, "Le collaborateur selectionne est inactif.");
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.payPeriod.trim())) {
    throw new HttpError(400, "La periode de paie doit etre au format AAAA-MM.");
  }

  const existing = await findSalaryTransactionByEmployeeAndPeriod({
    companyId: actor.companyId,
    employeeUserId: input.employeeUserId,
    payPeriod: input.payPeriod.trim()
  });
  if (existing) {
    throw new HttpError(
      409,
      "Un salaire existe deja pour ce collaborateur sur cette periode."
    );
  }

  const snapshot = buildSalarySnapshotFromInput({
    membership,
    payPeriod: input.payPeriod,
    grossAmount: input.grossAmount,
    bonusAmount: input.bonusAmount,
    deductionAmount: input.deductionAmount,
    paymentMethod: input.paymentMethod,
    note: input.note
  });

  const transactionId = randomUUID();
  await createFinancialTransaction({
    id: transactionId,
    companyId: actor.companyId,
    accountId: input.accountId,
    type: "CASH_OUT",
    amount: snapshot.netAmount,
    currency: input.currency?.trim().toUpperCase() || "XOF",
    activityCode: null,
    description: `Salaire ${snapshot.payPeriod} - ${snapshot.employeeFullName}`,
    metadata: buildSalaryMetadata(snapshot),
    requiresProof: false,
    salaryConfirmationStatus: "NOT_REQUIRED",
    createdById: actor.actorId,
    occurredAt: new Date(input.occurredAt)
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_SALARY_CREATED",
    entityType: "SALARY",
    entityId: transactionId,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: null,
        transactionId
      }),
      salary: snapshot
    })
  });

  const created = await findFinancialTransactionById(actor.companyId, transactionId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger le salaire cree.");
  }

  const salarySnapshot = extractSalarySnapshot(created.metadata);
  if (!salarySnapshot) {
    throw new HttpError(500, "Impossible de reconstruire les informations du salaire.");
  }

  return {
    ...created,
    ...salarySnapshot,
    salaryConfirmation: buildSalaryConfirmationSnapshot(created)
  };
}

export async function updateCompanySalaryTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
    accountId: string;
    employeeUserId: string;
    payPeriod: string;
    grossAmount: string;
    bonusAmount?: string;
    deductionAmount?: string;
    currency?: string;
    paymentMethod: SalaryPaymentMethod;
    note?: string;
    occurredAt: string;
  }
) {
  ensureSalaryManagementAccess(actor.role);

  const existing = await findFinancialTransactionById(actor.companyId, input.transactionId);
  if (!existing) {
    throw new HttpError(404, "Salaire introuvable.");
  }

  const existingSnapshot = extractSalarySnapshot(existing.metadata);
  if (!existingSnapshot) {
    throw new HttpError(400, "Cette transaction n'est pas un salaire.");
  }

  const account = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!account) {
    throw new HttpError(404, "Compte financier introuvable.");
  }

  const membership = await findMembershipByCompanyAndUser(actor.companyId, input.employeeUserId);
  if (!membership) {
    throw new HttpError(404, "Collaborateur introuvable pour cette entreprise.");
  }
  if (!membership.isActive) {
    throw new HttpError(400, "Le collaborateur selectionne est inactif.");
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.payPeriod.trim())) {
    throw new HttpError(400, "La periode de paie doit etre au format AAAA-MM.");
  }

  const duplicate = await findSalaryTransactionByEmployeeAndPeriod({
    companyId: actor.companyId,
    employeeUserId: input.employeeUserId,
    payPeriod: input.payPeriod.trim()
  });
  if (duplicate && duplicate.id !== existing.id) {
    throw new HttpError(
      409,
      "Un salaire existe deja pour ce collaborateur sur cette periode."
    );
  }

  const snapshot = buildSalarySnapshotFromInput({
    membership,
    payPeriod: input.payPeriod,
    grossAmount: input.grossAmount,
    bonusAmount: input.bonusAmount,
    deductionAmount: input.deductionAmount,
    paymentMethod: input.paymentMethod,
    note: input.note
  });

  await updateFinancialTransaction({
    companyId: actor.companyId,
    transactionId: existing.id,
    accountId: input.accountId,
    type: "CASH_OUT",
    amount: snapshot.netAmount,
    currency: input.currency?.trim().toUpperCase() || "XOF",
    activityCode: null,
    description: `Salaire ${snapshot.payPeriod} - ${snapshot.employeeFullName}`,
    metadata: buildSalaryMetadata(snapshot),
    requiresProof: false,
    salaryConfirmationStatus: "NOT_REQUIRED",
    occurredAt: new Date(input.occurredAt)
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_SALARY_UPDATED",
    entityType: "SALARY",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: null,
        transactionId: existing.id
      }),
      previousStatus: existing.status,
      previousSalary: existingSnapshot,
      salary: snapshot,
      salaryConfirmation: {
        status: "NOT_REQUIRED",
        confirmedById: null,
        confirmedByEmail: null,
        confirmedAt: null
      }
    })
  });

  const updated = await findFinancialTransactionById(actor.companyId, existing.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger le salaire modifie.");
  }

  const updatedSnapshot = extractSalarySnapshot(updated.metadata);
  if (!updatedSnapshot) {
    throw new HttpError(500, "Impossible de reconstruire les informations du salaire modifie.");
  }

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_SALARY_UPDATED",
      message: `Le salaire ${toSalaryActionLabel(updatedSnapshot)} a ete modifie par l'admin systeme.`,
      severity: "WARNING",
      entityType: "SALARY",
      entityId: updated.id,
      metadata: {
        transactionId: updated.id,
        salary: updatedSnapshot,
        salaryConfirmation: {
          status: "NOT_REQUIRED",
          confirmedById: null,
          confirmedByEmail: null,
          confirmedAt: null
        },
        actorRole: actor.role
      }
    });
  }

  return {
    ...updated,
    ...updatedSnapshot,
    salaryConfirmation: buildSalaryConfirmationSnapshot(updated)
  };
}

export async function exportCompanySalaryCsv(input: {
  companyId: string;
  role: RoleCode;
  payPeriod: string;
  employeeUserId?: string;
}): Promise<string> {
  const summary = await getCompanySalarySummary(input);

  return buildCsv(
    [
      "salary_id",
      "pay_period",
      "employee_full_name",
      "employee_email",
      "employee_role",
      "account_name",
      "gross_amount",
      "bonus_amount",
      "deduction_amount",
      "net_amount",
      "currency",
      "payment_method",
      "status",
      "created_by_email",
      "validated_by_email",
      "occurred_at",
      "created_at",
      "updated_at",
      "note"
    ],
    summary.items.map((item) => [
      item.id,
      item.payPeriod,
      item.employeeFullName,
      item.employeeEmail,
      item.employeeRole,
      item.accountName,
      item.grossAmount,
      item.bonusAmount,
      item.deductionAmount,
      item.netAmount,
      item.currency,
      item.paymentMethod,
      item.status,
      item.createdByEmail,
      item.validatedByEmail,
      item.occurredAt,
      item.createdAt,
      item.updatedAt,
      item.note
    ])
  );
}

export async function exportCompanySalaryExcel(input: {
  companyId: string;
  role: RoleCode;
  payPeriod: string;
  employeeUserId?: string;
}): Promise<Buffer> {
  const summary = await getCompanySalarySummary(input);

  return buildWorkbookBuffer([
    {
      name: "Resume",
      rows: [
        {
          payPeriod: summary.payPeriod,
          totalCount: summary.totalCount,
          totalGrossAmount: summary.totalGrossAmount,
          totalBonusAmount: summary.totalBonusAmount,
          totalDeductionAmount: summary.totalDeductionAmount,
          totalNetAmount: summary.totalNetAmount,
          approvedNetAmount: summary.approvedNetAmount,
          pendingCount: summary.pendingCount
        }
      ]
    },
    {
      name: "Par statut",
      rows: summary.byStatus.map((item) => ({
        status: item.status,
        count: item.count,
        grossAmount: item.grossAmount,
        bonusAmount: item.bonusAmount,
        deductionAmount: item.deductionAmount,
        netAmount: item.netAmount
      }))
    },
    {
      name: "Par collaborateur",
      rows: summary.byEmployee.map((item) => ({
        employeeFullName: item.employeeFullName,
        employeeEmail: item.employeeEmail,
        employeeRole: item.employeeRole,
        count: item.count,
        grossAmount: item.grossAmount,
        bonusAmount: item.bonusAmount,
        deductionAmount: item.deductionAmount,
        netAmount: item.netAmount
      }))
    },
    {
      name: "Salaires",
      rows: summary.items.map((item) => ({
        salaryId: item.id,
        payPeriod: item.payPeriod,
        employeeFullName: item.employeeFullName,
        employeeEmail: item.employeeEmail,
        employeeRole: item.employeeRole,
        accountName: item.accountName,
        grossAmount: item.grossAmount,
        bonusAmount: item.bonusAmount,
        deductionAmount: item.deductionAmount,
        netAmount: item.netAmount,
        currency: item.currency,
        paymentMethod: item.paymentMethod,
        status: item.status,
        createdByEmail: item.createdByEmail,
        validatedByEmail: item.validatedByEmail ?? "",
        occurredAt: item.occurredAt,
        note: item.note ?? ""
      }))
    }
  ]);
}

export async function listCompanyTransactions(input: {
  companyId: string;
  limit?: number;
  offset?: number;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  type?: "CASH_IN" | "CASH_OUT";
  activityCode?: BusinessActivityCode;
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  return listFinancialTransactions({
    companyId: input.companyId,
    limit,
    offset,
    status: input.status,
    type: input.type,
    activityCode: input.activityCode
  });
}

export async function deleteCompanyAccount(
  actor: ActorContext,
  input: {
    accountId: string;
  }
) {
  const existing = await findFinancialAccountById(actor.companyId, input.accountId);
  if (!existing) {
    throw new HttpError(404, "Compte financier introuvable.");
  }

  assertAccountManagementGovernance(actor.role, existing.scopeType);

  if (existing.transactionsCount > 0) {
    throw new HttpError(
      400,
      "Ce compte financier est deja utilise par des transactions et ne peut pas etre supprime."
    );
  }

  await deleteFinancialAccount({
    companyId: actor.companyId,
    accountId: existing.id
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_ACCOUNT_DELETED",
    entityType: "FINANCIAL_ACCOUNT",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      name: existing.name,
      accountRef: existing.accountRef,
      openingBalance: existing.balance,
      scopeType: existing.scopeType,
      scopeLabel: toAccountScopeLabel(existing),
      primaryActivityCode: existing.primaryActivityCode,
      primaryActivityLabel: toActivityLabel(existing.primaryActivityCode),
      allowedActivityCodes: existing.allowedActivityCodes,
      allowedActivityLabels: existing.allowedActivityCodes.map(
        (activityCode) => toActivityLabel(activityCode) ?? activityCode
      )
    })
  });

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_ACCOUNT_DELETED",
      message: `Le compte financier ${existing.name} a ete supprime par l'admin systeme.`,
      severity: "WARNING",
      entityType: "FINANCIAL_ACCOUNT",
      entityId: existing.id,
      metadata: {
        accountId: existing.id,
        accountName: existing.name,
        actorRole: actor.role,
        scopeType: existing.scopeType,
        scopeLabel: toAccountScopeLabel(existing)
      }
    });
  }
}

export async function deleteCompanyTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  const existing = await findFinancialTransactionById(actor.companyId, input.transactionId);
  if (!existing) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  if (extractSalarySnapshot(existing.metadata)) {
    throw new HttpError(400, "Les salaires doivent etre geres depuis la page salaires.");
  }

  ensureTransactionManagementAccess(actor.role);

  const account = await findFinancialAccountById(actor.companyId, existing.accountId);
  await deleteFinancialTransaction({
    companyId: actor.companyId,
    transactionId: existing.id
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_TRANSACTION_DELETED",
    entityType: "TRANSACTION",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      ...(account
        ? buildFinanceGovernanceMetadata({
            account,
            activityCode: existing.activityCode,
            transactionId: existing.id
          })
        : { transactionId: existing.id }),
      deletedStatus: existing.status,
      accountId: existing.accountId,
      accountName: existing.accountName,
      type: existing.type,
      amount: existing.amount,
      currency: existing.currency,
      activityCode: existing.activityCode,
      description: existing.description,
      metadata: existing.metadata,
      requiresProof: existing.requiresProof,
      proofsCount: existing.proofsCount
    })
  });

  if (actor.role === "SYS_ADMIN") {
    const activityLabel = existing.activityCode ? toActivityLabel(existing.activityCode) : null;
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_TRANSACTION_DELETED",
      message: `La transaction ${activityLabel ?? "finance"} ${existing.amount} ${existing.currency} a ete supprimee par l'admin systeme.`,
      severity: "WARNING",
      entityType: "TRANSACTION",
      entityId: existing.id,
      metadata: {
        transactionId: existing.id,
        accountId: existing.accountId,
        accountName: existing.accountName,
        actorRole: actor.role,
        activityCode: existing.activityCode,
        activityLabel,
        status: existing.status
      }
    });
  }
}

export async function deleteCompanySalaryTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  const existing = await findFinancialTransactionById(actor.companyId, input.transactionId);
  if (!existing) {
    throw new HttpError(404, "Salaire introuvable.");
  }

  const salarySnapshot = extractSalarySnapshot(existing.metadata);
  if (!salarySnapshot) {
    throw new HttpError(400, "Cette transaction n'est pas un salaire.");
  }

  if (existing.status === "APPROVED") {
    if (!canDeleteApprovedTransaction(actor.role)) {
      throw new HttpError(
        403,
        "Seul l'admin systeme peut supprimer un salaire deja approuve."
      );
    }
  } else {
    ensureSalaryManagementAccess(actor.role);
  }

  await deleteFinancialTransaction({
    companyId: actor.companyId,
    transactionId: existing.id
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_SALARY_DELETED",
    entityType: "SALARY",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      salary: salarySnapshot,
      salaryStatus: existing.status,
      salaryConfirmation: buildSalaryConfirmationSnapshot(existing),
      transactionId: existing.id,
      accountId: existing.accountId,
      accountName: existing.accountName,
      amount: existing.amount,
      currency: existing.currency,
      proofsCount: existing.proofsCount
    })
  });

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.actorId],
      code: "FINANCE_SALARY_DELETED",
      message: `Le salaire ${toSalaryActionLabel(salarySnapshot)} a ete supprime par l'admin systeme.`,
      severity: "WARNING",
      entityType: "SALARY",
      entityId: existing.id,
      metadata: {
        transactionId: existing.id,
        salary: salarySnapshot,
        salaryStatus: existing.status,
        salaryConfirmation: buildSalaryConfirmationSnapshot(existing),
        actorRole: actor.role
      }
    });
  }
}

export async function addProofToTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }
) {
  const transaction = await findTransactionById(actor.companyId, input.transactionId);
  if (!transaction) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  const canEdit =
    transaction.createdById === actor.actorId ||
    actor.role === "OWNER" ||
    actor.role === "SYS_ADMIN" ||
    actor.role === "SUPERVISOR" ||
    actor.role === "ACCOUNTANT";

  if (!canEdit) {
    throw new HttpError(403, "Permissions insuffisantes pour ajouter une preuve.");
  }

  if (transaction.status === "REJECTED") {
    throw new HttpError(400, "Ajout de preuve impossible apres validation finale.");
  }

  const fullTransaction = await findTransactionForProofs(actor.companyId, transaction.id);
  const proofId = randomUUID();
  await addTransactionProof({
    id: proofId,
    transactionId: input.transactionId,
    storageKey: input.storageKey.trim(),
    fileName: input.fileName.trim(),
    mimeType: input.mimeType.trim(),
    fileSize: input.fileSize
  });
  const account = await findFinancialAccountById(actor.companyId, fullTransaction.accountId);
  if (!account) {
    throw new HttpError(500, "Impossible de recharger le compte financier apres ajout de preuve.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_PROOF_ADDED",
    entityType: "TRANSACTION_PROOF",
    entityId: proofId,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: fullTransaction.activityCode,
        transactionId: input.transactionId
      }),
      transactionId: input.transactionId,
      fileName: input.fileName,
      fileSize: input.fileSize
    })
  });

  const proofs = await listTransactionProofs(input.transactionId);
  return toTransactionProofItems(proofs);
}

export async function listCompanyTransactionProofs(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  const transaction = await findTransactionById(actor.companyId, input.transactionId);
  if (!transaction) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  await findTransactionForProofs(actor.companyId, transaction.id);
  const proofs = await listTransactionProofs(input.transactionId);
  return toTransactionProofItems(proofs);
}

export async function submitCompanyTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  const transaction = await findTransactionById(actor.companyId, input.transactionId);
  if (!transaction) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  const canSubmit =
    transaction.createdById === actor.actorId ||
    actor.role === "SYS_ADMIN" ||
    actor.role === "ACCOUNTANT" ||
    actor.role === "SUPERVISOR";

  if (!canSubmit) {
    throw new HttpError(403, "Permissions insuffisantes pour soumettre cette transaction.");
  }

  if (transaction.status !== "DRAFT") {
    throw new HttpError(400, "Seules les transactions en brouillon peuvent etre soumises.");
  }

  const fullTransaction = await findFinancialTransactionById(actor.companyId, transaction.id);
  if (!fullTransaction) {
    throw new HttpError(500, "Impossible de recharger la transaction avant soumission.");
  }
  const account = await findFinancialAccountById(actor.companyId, fullTransaction.accountId);
  if (!account) {
    throw new HttpError(500, "Impossible de recharger le compte financier avant soumission.");
  }
  const salarySnapshot = extractSalarySnapshot(fullTransaction.metadata);
  const profile =
    !salarySnapshot && transaction.activityCode
      ? getBusinessActivityProfile(transaction.activityCode)
      : null;

  if (salarySnapshot && !canManageSalary(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour soumettre ce salaire.");
  }

  if (!salarySnapshot) {
    if (!transaction.activityCode) {
      throw new HttpError(400, "La transaction doit etre rattachee a un secteur.");
    }

    try {
      assertTransactionInputMatchesActivityProfile(transaction.activityCode, {
        type: fullTransaction.type,
        currency: fullTransaction.currency,
        description: fullTransaction.description ?? undefined,
        metadata: fullTransaction.metadata
      });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
    }
  }

  const reviewerMembership = await findMembershipByCompanyAndUser(actor.companyId, actor.actorId);
  const reviewer = buildReviewerMetadata(reviewerMembership, actor);

  await submitTransaction({
    companyId: actor.companyId,
    transactionId: transaction.id,
    salaryConfirmationStatus: "NOT_REQUIRED"
  });

  await reviewTransaction({
    companyId: actor.companyId,
    transactionId: transaction.id,
    reviewerId: actor.actorId,
    status: "APPROVED"
  });

  const actionCode = salarySnapshot ? "FINANCE_SALARY_SUBMITTED" : "FINANCE_TRANSACTION_SUBMITTED";
  const entityType = salarySnapshot ? "SALARY" : "TRANSACTION";
  const traceMetadata = {
    ...buildFinanceGovernanceMetadata({
      account,
      activityCode: transaction.activityCode,
      transactionId: transaction.id
    }),
    activityCode: transaction.activityCode,
    activityLabel: profile?.label ?? null,
    financeWorkflow: profile?.finance.workflow.map((step) => step.code) ?? [],
    status: "APPROVED",
    reviewer,
    ...(salarySnapshot ? { salary: salarySnapshot } : {}),
    ...(salarySnapshot
      ? {
          salaryConfirmation: {
            status: "NOT_REQUIRED",
            confirmedById: null,
            confirmedByEmail: null,
            confirmedAt: null
          }
        }
      : {})
  };

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: actionCode,
    entityType,
    entityId: transaction.id,
    metadataJson: JSON.stringify(traceMetadata)
  });

  if (salarySnapshot) {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER", "SYS_ADMIN", "ACCOUNTANT"],
      excludeUserIds: [actor.actorId],
      code: actionCode,
      message: `Le salaire ${toSalaryActionLabel(salarySnapshot)} a ete finalise et est disponible dans le suivi de paie.`,
      severity: "INFO",
      entityType,
      entityId: transaction.id,
      metadata: {
        ...traceMetadata,
        transactionId: transaction.id,
        createdById: transaction.createdById
      }
    });
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds: [salarySnapshot.employeeUserId],
      code: actionCode,
      message: `Votre salaire ${toSalaryActionLabel(salarySnapshot)} a ete enregistre par la comptabilite et est disponible dans votre suivi.`,
      severity: "INFO",
      entityType,
      entityId: transaction.id,
      metadata: {
        ...traceMetadata,
        transactionId: transaction.id,
        createdById: transaction.createdById
      }
    });
    return;
  }

  await createRoleTargetedAlerts({
    companyId: actor.companyId,
    recipientRoles: ["OWNER", "SYS_ADMIN", "ACCOUNTANT"],
    excludeUserIds: [actor.actorId],
    code: actionCode,
    message: `Une transaction ${profile?.label ?? "finance"} a ete enregistree et est disponible dans le suivi financier.`,
    severity: "INFO",
    entityType,
    entityId: transaction.id,
    metadata: {
      ...traceMetadata,
      transactionId: transaction.id,
      createdById: transaction.createdById
    }
  });
}

export async function confirmCompanySalaryReceipt(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  void actor;
  void input;
  throw new HttpError(400, "La confirmation employe n'est plus requise pour les salaires.");
}

export async function reviewCompanyTransaction(
  actor: ActorContext,
  input: {
    transactionId: string;
    decision: "APPROVED" | "REJECTED";
  }
) {
  if (!canReviewTransaction(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour valider les transactions.");
  }

  const transaction = await findTransactionById(actor.companyId, input.transactionId);
  if (!transaction) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  if (transaction.status !== "SUBMITTED") {
    throw new HttpError(400, "Seules les transactions soumises peuvent etre validees.");
  }

  const profile = transaction.activityCode
    ? getBusinessActivityProfile(transaction.activityCode)
    : null;
  const fullTransaction = await findFinancialTransactionById(actor.companyId, transaction.id);
  if (!fullTransaction) {
    throw new HttpError(500, "Impossible de recharger la transaction avant validation.");
  }
  const account = await findFinancialAccountById(actor.companyId, fullTransaction.accountId);
  if (!account) {
    throw new HttpError(500, "Impossible de recharger le compte financier avant validation.");
  }
  const salarySnapshot = extractSalarySnapshot(fullTransaction.metadata);
  const actionCode = salarySnapshot
    ? input.decision === "APPROVED"
      ? "FINANCE_SALARY_APPROVED"
      : "FINANCE_SALARY_REJECTED"
    : input.decision === "APPROVED"
      ? "FINANCE_TRANSACTION_APPROVED"
      : "FINANCE_TRANSACTION_REJECTED";
  const entityType = salarySnapshot ? "SALARY" : "TRANSACTION";

  const confirmationMetadata = salarySnapshot
    ? buildSalaryConfirmationSnapshot(fullTransaction)
    : null;
  const reviewerMembership = await findMembershipByCompanyAndUser(actor.companyId, actor.actorId);
  const reviewer = buildReviewerMetadata(reviewerMembership, actor);
  const reviewerSuffix = reviewer.displayName ? ` par ${reviewer.displayName}` : "";

  await reviewTransaction({
    companyId: actor.companyId,
    transactionId: transaction.id,
    reviewerId: actor.actorId,
    status: input.decision
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: actionCode,
    entityType,
    entityId: transaction.id,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: transaction.activityCode,
        transactionId: transaction.id
      }),
      activityCode: transaction.activityCode,
      activityLabel: profile?.label ?? null,
      financeWorkflow: profile?.finance.workflow.map((step) => step.code) ?? [],
      reviewer,
      ...(salarySnapshot ? { salary: salarySnapshot, salaryConfirmation: confirmationMetadata } : {})
    })
  });

  const recipientUserIds = salarySnapshot
    ? Array.from(new Set([transaction.createdById, salarySnapshot.employeeUserId])).filter(
        (userId) => userId !== actor.actorId
      )
    : transaction.createdById !== actor.actorId
      ? [transaction.createdById]
      : [];

  if (recipientUserIds.length > 0) {
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds,
      code: actionCode,
      message:
        salarySnapshot
          ? input.decision === "APPROVED"
            ? `Le salaire ${toSalaryActionLabel(salarySnapshot)} a ete approuve${reviewerSuffix}.`
            : `Le salaire ${toSalaryActionLabel(salarySnapshot)} a ete rejete${reviewerSuffix}.`
          : input.decision === "APPROVED"
            ? `Votre transaction${profile ? ` ${profile.label}` : ""} a ete approuvee${reviewerSuffix}.`
            : `Votre transaction${profile ? ` ${profile.label}` : ""} a ete rejetee${reviewerSuffix}.`,
      severity: input.decision === "APPROVED" ? "INFO" : "WARNING",
      entityType,
      entityId: transaction.id,
      metadata: {
        ...buildFinanceGovernanceMetadata({
          account,
          activityCode: transaction.activityCode,
          transactionId: transaction.id
        }),
        transactionId: transaction.id,
        decision: input.decision,
        reviewer,
        ...(salarySnapshot ? { salary: salarySnapshot, salaryConfirmation: confirmationMetadata } : {})
      }
    });
  }
}

export async function getTransactionProofUploadAuth(
  actor: ActorContext,
  input: {
    transactionId: string;
  }
) {
  const transaction = await findTransactionById(actor.companyId, input.transactionId);
  if (!transaction) {
    throw new HttpError(404, "Transaction introuvable.");
  }

  const canEdit =
    transaction.createdById === actor.actorId ||
    actor.role === "OWNER" ||
    actor.role === "SYS_ADMIN" ||
    actor.role === "SUPERVISOR" ||
    actor.role === "ACCOUNTANT";

  if (!canEdit) {
    throw new HttpError(403, "Permissions insuffisantes pour ajouter une preuve.");
  }

  if (transaction.status === "REJECTED") {
    throw new HttpError(400, "Ajout de preuve impossible apres validation finale.");
  }

  await findTransactionForProofs(actor.companyId, transaction.id);
  const auth = getImageKitUploadAuthParameters();
  return {
    ...auth,
    folder: `/amcco/${actor.companyId}/transactions/${transaction.id}`
  };
}
