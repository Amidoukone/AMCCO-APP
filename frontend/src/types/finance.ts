import type { BusinessActivityCode } from "../config/businessActivities";

export type FinancialAccountScopeType = "GLOBAL" | "DEDICATED" | "RESTRICTED";
export type SalaryPaymentMethod = "BANK_TRANSFER" | "CASH" | "MOBILE_MONEY" | "CHEQUE";
export type SalaryConfirmationStatus = "NOT_REQUIRED" | "PENDING" | "CONFIRMED";

export type FinancialAccount = {
  id: string;
  companyId: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  transactionsCount: number;
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

export type SalaryMember = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: string;
  membershipCreatedAt: string;
};

export type SalaryTransaction = FinancialTransaction & {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: string;
  payPeriod: string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
  paymentMethod: SalaryPaymentMethod;
  note: string | null;
  salaryConfirmation: {
    status: SalaryConfirmationStatus;
    confirmedById: string | null;
    confirmedByEmail: string | null;
    confirmedAt: string | null;
  };
};

export type SalaryMemberListResponse = {
  items: SalaryMember[];
};

export type SalaryTransactionSingleResponse = {
  item: SalaryTransaction;
};

export type SalaryTransactionListResponse = {
  items: SalaryTransaction[];
};

export type SalarySummaryByStatusItem = {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  count: number;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

export type SalarySummaryByPaymentMethodItem = {
  paymentMethod: SalaryPaymentMethod;
  count: number;
  netAmount: string;
};

export type SalarySummaryByEmployeeItem = {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: string;
  count: number;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
};

export type SalarySummary = {
  payPeriod: string;
  employeeUserId: string | null;
  totalCount: number;
  totalGrossAmount: string;
  totalBonusAmount: string;
  totalDeductionAmount: string;
  totalNetAmount: string;
  approvedNetAmount: string;
  pendingCount: number;
  items: SalaryTransaction[];
  byStatus: SalarySummaryByStatusItem[];
  byPaymentMethod: SalarySummaryByPaymentMethodItem[];
  byEmployee: SalarySummaryByEmployeeItem[];
};

export type SalarySummaryResponse = {
  item: SalarySummary;
};
