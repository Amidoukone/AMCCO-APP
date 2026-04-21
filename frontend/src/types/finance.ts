import type { BusinessActivityCode } from "../config/businessActivities";

export type FinancialAccountScopeType = "GLOBAL" | "DEDICATED" | "RESTRICTED";

export type FinancialAccount = {
  id: string;
  companyId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  createdAt: string;
};

export type FinancialTransaction = {
  id: string;
  companyId: string;
  accountId: string;
  accountName: string;
  accountRef: string | null;
  accountScopeType: FinancialAccountScopeType;
  accountPrimaryActivityCode: BusinessActivityCode | null;
  accountAllowedActivityCodes: BusinessActivityCode[];
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string | null;
  metadata: Record<string, string>;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  requiresProof: boolean;
  createdById: string;
  createdByEmail: string;
  validatedById: string | null;
  validatedByEmail: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  proofsCount: number;
};

export type FinancialAccountSingleResponse = {
  item: FinancialAccount;
};

export type FinancialAccountListResponse = {
  items: FinancialAccount[];
};

export type FinancialTransactionSingleResponse = {
  item: FinancialTransaction;
};

export type FinancialTransactionListResponse = {
  items: FinancialTransaction[];
};

export type TransactionProof = {
  id: string;
  transactionId: string;
  storageKey: string;
  publicUrl: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

export type TransactionProofListResponse = {
  items: TransactionProof[];
};

export type FinanceProofUploadAuth = {
  uploadUrl: string;
  publicKey: string;
  urlEndpoint: string;
  token: string;
  expire: number;
  signature: string;
  folder: string;
};

export type FinanceProofUploadAuthResponse = {
  item: FinanceProofUploadAuth;
};
