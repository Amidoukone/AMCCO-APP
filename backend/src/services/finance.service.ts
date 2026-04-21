import { randomUUID } from "node:crypto";
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
  countTransactionProofs,
  createFinancialAccount,
  type FinancialAccountScopeType,
  createFinancialTransaction,
  findFinancialAccountById,
  findFinancialTransactionById,
  findTransactionById,
  listFinancialAccounts,
  listFinancialTransactions,
  listTransactionProofs,
  reviewTransaction,
  submitTransaction,
  type TransactionProof
} from "../repositories/finance.repository.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

const ACCOUNT_CREATE_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT"];
const TRANSACTION_REVIEW_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "ACCOUNTANT"];

function canCreateAccount(role: RoleCode): boolean {
  return ACCOUNT_CREATE_ROLES.includes(role);
}

function canReviewTransaction(role: RoleCode): boolean {
  return TRANSACTION_REVIEW_ROLES.includes(role);
}

function assertAccountCreationGovernance(
  role: RoleCode,
  scopeType: FinancialAccountScopeType
): void {
  if (scopeType === "GLOBAL" && role === "ACCOUNTANT") {
    throw new HttpError(
      403,
      "Seuls le proprietaire ou l'admin systeme peuvent creer un compte global entreprise."
    );
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
  const isAllowed =
    account.scopeType === "GLOBAL" ||
    account.primaryActivityCode === activityCode ||
    account.allowedActivityCodes.includes(activityCode);

  if (!isAllowed) {
    const profile = getBusinessActivityProfile(activityCode);
    throw new HttpError(
      400,
      `Le compte financier ${account.name} n'est pas autorise pour le secteur ${profile.label}.`
    );
  }
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
    return "Global entreprise";
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

export async function listCompanyAccounts(input: {
  companyId: string;
  activityCode?: BusinessActivityCode;
}) {
  return listFinancialAccounts(input);
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

  const scopeType = input.scopeType ?? "GLOBAL";
  const primaryActivityCode = input.primaryActivityCode ?? null;
  const allowedActivityCodes = normalizeActivityCodes(input.allowedActivityCodes);
  assertAccountCreationGovernance(actor.role, scopeType);

  if (scopeType === "DEDICATED" && !primaryActivityCode) {
    throw new HttpError(400, "Selectionne un secteur principal pour un compte dedie.");
  }

  if (scopeType === "RESTRICTED" && allowedActivityCodes.length === 0) {
    throw new HttpError(400, "Selectionne au moins un secteur autorise pour un compte restreint.");
  }

  const activityCodesToValidate =
    scopeType === "DEDICATED"
      ? (primaryActivityCode ? [primaryActivityCode] : [])
      : scopeType === "RESTRICTED"
        ? allowedActivityCodes
        : [];

  for (const activityCode of activityCodesToValidate) {
    await ensureCompanyActivityEnabledOrThrow(actor.companyId, activityCode);
  }

  const accountId = randomUUID();
  const effectiveAllowedActivityCodes = getEffectiveAllowedActivityCodes({
    scopeType,
    primaryActivityCode,
    allowedActivityCodes
  });
  await createFinancialAccount({
    id: accountId,
    companyId: actor.companyId,
    name: input.name.trim(),
    accountRef: input.accountRef?.trim() || null,
    balance: input.openingBalance ?? "0.00",
    scopeType,
    primaryActivityCode,
    allowedActivityCodes: scopeType === "RESTRICTED" ? effectiveAllowedActivityCodes : []
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
    occurredAt: string;
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
    occurredAt: new Date(input.occurredAt)
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

  if (transaction.status === "APPROVED" || transaction.status === "REJECTED") {
    throw new HttpError(400, "Ajout de preuve impossible apres validation finale.");
  }

  const proofId = randomUUID();
  await addTransactionProof({
    id: proofId,
    transactionId: input.transactionId,
    storageKey: input.storageKey.trim(),
    fileName: input.fileName.trim(),
    mimeType: input.mimeType.trim(),
    fileSize: input.fileSize
  });
  const fullTransaction = await findFinancialTransactionById(actor.companyId, transaction.id);
  if (!fullTransaction) {
    throw new HttpError(500, "Impossible de recharger la transaction apres ajout de preuve.");
  }
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
    actor.role === "OWNER" ||
    actor.role === "SYS_ADMIN" ||
    actor.role === "SUPERVISOR";

  if (!canSubmit) {
    throw new HttpError(403, "Permissions insuffisantes pour soumettre cette transaction.");
  }

  if (transaction.status !== "DRAFT") {
    throw new HttpError(400, "Seules les transactions en brouillon peuvent etre soumises.");
  }

  if (!transaction.activityCode) {
    throw new HttpError(400, "La transaction doit etre rattachee a un secteur.");
  }

  const fullTransaction = await findFinancialTransactionById(actor.companyId, transaction.id);
  if (!fullTransaction) {
    throw new HttpError(500, "Impossible de recharger la transaction avant soumission.");
  }
  const account = await findFinancialAccountById(actor.companyId, fullTransaction.accountId);
  if (!account) {
    throw new HttpError(500, "Impossible de recharger le compte financier avant soumission.");
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

  const profile = getBusinessActivityProfile(transaction.activityCode);

  if (transaction.requiresProof) {
    const proofsCount = await countTransactionProofs(transaction.id);
    if (proofsCount < 1) {
      throw new HttpError(400, "Une preuve est obligatoire avant la soumission.");
    }
  }

  await submitTransaction({
    companyId: actor.companyId,
    transactionId: transaction.id
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "FINANCE_TRANSACTION_SUBMITTED",
    entityType: "TRANSACTION",
    entityId: transaction.id,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: transaction.activityCode,
        transactionId: transaction.id
      }),
      activityCode: transaction.activityCode,
      activityLabel: profile.label,
      financeWorkflow: profile.finance.workflow.map((step) => step.code)
    })
  });

  await createRoleTargetedAlerts({
    companyId: actor.companyId,
    recipientRoles: ["OWNER", "SYS_ADMIN", "ACCOUNTANT"],
    excludeUserIds: [actor.actorId],
    code: "FINANCE_TRANSACTION_SUBMITTED",
    message: `Une transaction ${profile.label} a ete soumise et attend une validation comptable.`,
    severity: "WARNING",
    entityType: "TRANSACTION",
    entityId: transaction.id,
    metadata: {
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: transaction.activityCode,
        transactionId: transaction.id
      }),
      transactionId: transaction.id,
      createdById: transaction.createdById
    }
  });
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
    action: input.decision === "APPROVED" ? "FINANCE_TRANSACTION_APPROVED" : "FINANCE_TRANSACTION_REJECTED",
    entityType: "TRANSACTION",
    entityId: transaction.id,
    metadataJson: JSON.stringify({
      ...buildFinanceGovernanceMetadata({
        account,
        activityCode: transaction.activityCode,
        transactionId: transaction.id
      }),
      activityCode: transaction.activityCode,
      activityLabel: profile?.label ?? null,
      financeWorkflow: profile?.finance.workflow.map((step) => step.code) ?? []
    })
  });

  if (transaction.createdById !== actor.actorId) {
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds: [transaction.createdById],
      code:
        input.decision === "APPROVED" ? "FINANCE_TRANSACTION_APPROVED" : "FINANCE_TRANSACTION_REJECTED",
      message:
        input.decision === "APPROVED"
          ? `Votre transaction${profile ? ` ${profile.label}` : ""} a ete approuvee.`
          : `Votre transaction${profile ? ` ${profile.label}` : ""} a ete rejetee.`,
      severity: input.decision === "APPROVED" ? "INFO" : "WARNING",
      entityType: "TRANSACTION",
      entityId: transaction.id,
      metadata: {
        ...buildFinanceGovernanceMetadata({
          account,
          activityCode: transaction.activityCode,
          transactionId: transaction.id
        }),
        transactionId: transaction.id,
        decision: input.decision
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

  if (transaction.status === "APPROVED" || transaction.status === "REJECTED") {
    throw new HttpError(400, "Ajout de preuve impossible apres validation finale.");
  }

  const auth = getImageKitUploadAuthParameters();
  return {
    ...auth,
    folder: `/amcco/${actor.companyId}/transactions/${transaction.id}`
  };
}
