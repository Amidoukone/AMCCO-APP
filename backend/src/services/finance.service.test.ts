import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors/http-error.js";
import {
  countTransactionProofs,
  createFinancialAccount,
  createFinancialTransaction,
  findFinancialAccountById,
  findFinancialTransactionById,
  findTransactionById,
  reviewTransaction,
  submitTransaction
} from "../repositories/finance.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import {
  createCompanyAccount,
  createCompanyTransaction,
  reviewCompanyTransaction,
  submitCompanyTransaction
} from "./finance.service.js";

vi.mock("../repositories/finance.repository.js", () => ({
  countTransactionProofs: vi.fn(),
  findTransactionById: vi.fn(),
  reviewTransaction: vi.fn(),
  submitTransaction: vi.fn(),
  addTransactionProof: vi.fn(),
  createFinancialAccount: vi.fn(),
  createFinancialTransaction: vi.fn(),
  findFinancialAccountById: vi.fn(),
  findFinancialTransactionById: vi.fn(),
  listFinancialAccounts: vi.fn(),
  listFinancialTransactions: vi.fn(),
  listTransactionProofs: vi.fn()
}));

vi.mock("../repositories/audit.repository.js", () => ({
  createAuditLogRecord: vi.fn()
}));

vi.mock("./alerts.service.js", () => ({
  createRoleTargetedAlerts: vi.fn(),
  createUserTargetedAlerts: vi.fn()
}));

vi.mock("./company-activities.service.js", () => ({
  ensureCompanyActivityEnabledOrThrow: vi.fn()
}));

describe("finance.service", () => {
  const actor = {
    actorId: "user-actor",
    companyId: "company-1",
    role: "SUPERVISOR" as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureCompanyActivityEnabledOrThrow).mockResolvedValue(undefined);
  });

  describe("submitCompanyTransaction", () => {
    it("rejects submission when required proof is missing", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "txn-1",
        companyId: actor.companyId,
        createdById: actor.actorId,
        activityCode: "GENERAL_STORE",
        status: "DRAFT",
        requiresProof: true
      });
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Main cash",
        accountRef: "MC-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_IN",
        amount: "1000.00",
        currency: "XOF",
        activityCode: "GENERAL_STORE",
        description: "Vente comptoir",
        status: "DRAFT",
        requiresProof: true,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Main cash",
        accountRef: "MC-01",
        balance: "1200.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(countTransactionProofs).mockResolvedValue(0);

      const promise = submitCompanyTransaction(actor, {
        transactionId: "txn-1"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Une preuve est obligatoire avant la soumission."
      });
      expect(submitTransaction).not.toHaveBeenCalled();
      expect(createRoleTargetedAlerts).not.toHaveBeenCalled();
    });

    it("submits the transaction, audits, and alerts reviewers", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "txn-1",
        companyId: actor.companyId,
        createdById: actor.actorId,
        activityCode: "GENERAL_STORE",
        status: "DRAFT",
        requiresProof: true
      });
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Main cash",
        accountRef: "MC-01",
        accountScopeType: "RESTRICTED",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: ["GENERAL_STORE", "FOOD"],
        type: "CASH_IN",
        amount: "1000.00",
        currency: "XOF",
        activityCode: "GENERAL_STORE",
        description: "Vente comptoir",
        status: "DRAFT",
        requiresProof: true,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 1
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Main cash",
        accountRef: "MC-01",
        balance: "1200.00",
        scopeType: "RESTRICTED",
        primaryActivityCode: null,
        allowedActivityCodes: ["GENERAL_STORE", "FOOD"],
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(countTransactionProofs).mockResolvedValue(1);

      await submitCompanyTransaction(actor, {
        transactionId: "txn-1"
      });

      expect(submitTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "txn-1"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: actor.companyId,
          actorId: actor.actorId,
          action: "FINANCE_TRANSACTION_SUBMITTED",
          entityId: "txn-1",
          metadataJson: expect.stringContaining("\"scopeType\":\"RESTRICTED\"")
        })
      );
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER", "SYS_ADMIN", "ACCOUNTANT"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_TRANSACTION_SUBMITTED",
        message: "Une transaction Magasins (commerce general) a ete soumise et attend une validation comptable.",
        severity: "WARNING",
        entityType: "TRANSACTION",
        entityId: "txn-1",
        metadata: expect.objectContaining({
          transactionId: "txn-1",
          createdById: actor.actorId,
          activityCode: "GENERAL_STORE",
          account: expect.objectContaining({
            scopeType: "RESTRICTED",
            scopeLabel: "Restreint: Magasins (commerce general), Alimentation"
          })
        })
      });
    });
  });

  describe("createCompanyTransaction", () => {
    it("rejects a transaction when the account is not authorized for the selected activity", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Caisse mine",
        accountRef: null,
        balance: "0.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "MINING",
        allowedActivityCodes: ["MINING"],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = createCompanyTransaction(actor, {
        accountId: "account-1",
        type: "CASH_IN",
        amount: "1000.00",
        currency: "XOF",
        activityCode: "FOOD",
        description: "Vente caisse",
        occurredAt: "2026-04-20T08:00:00.000Z"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Le compte financier Caisse mine n'est pas autorise pour le secteur Alimentation."
      });
      expect(createFinancialTransaction).not.toHaveBeenCalled();
    });

    it("rejects a mining transaction without business description", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Caisse mine",
        accountRef: null,
        balance: "0.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = createCompanyTransaction(actor, {
        accountId: "account-1",
        type: "CASH_OUT",
        amount: "1000.00",
        currency: "USD",
        activityCode: "MINING",
        occurredAt: "2026-04-20T08:00:00.000Z"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Le secteur Exploitation miniere exige une description metier pour chaque transaction."
      });
      expect(createFinancialTransaction).not.toHaveBeenCalled();
    });

    it("rejects a rental transaction without property metadata", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Caisse location",
        accountRef: null,
        balance: "0.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = createCompanyTransaction(actor, {
        accountId: "account-1",
        type: "CASH_IN",
        amount: "250000.00",
        currency: "XOF",
        activityCode: "RENTAL",
        description: "Paiement loyer avril",
        occurredAt: "2026-04-20T08:00:00.000Z"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message:
          "Le secteur Location immobiliere exige le champ reference bien pour chaque transaction."
      });
      expect(createFinancialTransaction).not.toHaveBeenCalled();
    });
  });

  describe("createCompanyAccount", () => {
    it("rejects global account creation from accountants", async () => {
      const promise = createCompanyAccount(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          name: "Caisse globale",
          scopeType: "GLOBAL"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Seuls le proprietaire ou l'admin systeme peuvent creer un compte global entreprise."
      });
      expect(createFinancialAccount).not.toHaveBeenCalled();
    });

    it("creates a restricted account with allowed activities", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-2",
        companyId: actor.companyId,
        name: "Caisse transverse",
        accountRef: "CT-01",
        balance: "5000.00",
        scopeType: "RESTRICTED",
        primaryActivityCode: null,
        allowedActivityCodes: ["GENERAL_STORE", "FOOD"],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const result = await createCompanyAccount(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          name: " Caisse transverse ",
          accountRef: " CT-01 ",
          openingBalance: "5000.00",
          scopeType: "RESTRICTED",
          allowedActivityCodes: ["GENERAL_STORE", "FOOD", "FOOD"]
        }
      );

      expect(createFinancialAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: actor.companyId,
          name: "Caisse transverse",
          accountRef: "CT-01",
          balance: "5000.00",
          scopeType: "RESTRICTED",
          primaryActivityCode: null,
          allowedActivityCodes: ["GENERAL_STORE", "FOOD"]
        })
      );
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_ACCOUNT_CREATED",
          entityType: "FINANCIAL_ACCOUNT",
          metadataJson: expect.stringContaining("\"scopeLabel\":\"Restreint: Magasins (commerce general), Alimentation\"")
        })
      );
      expect(result.scopeType).toBe("RESTRICTED");
      expect(result.allowedActivityCodes).toEqual(["GENERAL_STORE", "FOOD"]);
    });
  });

  describe("reviewCompanyTransaction", () => {
    it("rejects reviewers without finance permission", async () => {
      const promise = reviewCompanyTransaction(
        {
          ...actor,
          role: "EMPLOYEE"
        },
        {
          transactionId: "txn-1",
          decision: "APPROVED"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Permissions insuffisantes pour valider les transactions."
      });
      expect(findTransactionById).not.toHaveBeenCalled();
    });

    it("reviews a submitted transaction and notifies its creator", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "txn-2",
        companyId: actor.companyId,
        createdById: "user-owner",
        activityCode: "SERVICES",
        status: "SUBMITTED",
        requiresProof: true
      });
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-2",
        companyId: actor.companyId,
        accountId: "account-9",
        accountName: "Caisse services",
        accountRef: "SVC-01",
        accountScopeType: "DEDICATED",
        accountPrimaryActivityCode: "SERVICES",
        accountAllowedActivityCodes: ["SERVICES"],
        type: "CASH_OUT",
        amount: "500.00",
        currency: "XOF",
        activityCode: "SERVICES",
        description: "Intervention externe",
        status: "SUBMITTED",
        requiresProof: true,
        createdById: "user-owner",
        createdByEmail: "owner@example.com",
        validatedById: null,
        validatedByEmail: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 1
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-9",
        companyId: actor.companyId,
        name: "Caisse services",
        accountRef: "SVC-01",
        balance: "900.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "SERVICES",
        allowedActivityCodes: ["SERVICES"],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await reviewCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "txn-2",
          decision: "REJECTED"
        }
      );

      expect(reviewTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "txn-2",
        reviewerId: actor.actorId,
        status: "REJECTED"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: actor.actorId,
          action: "FINANCE_TRANSACTION_REJECTED",
          entityId: "txn-2",
          metadataJson: expect.stringContaining("\"scopeType\":\"DEDICATED\"")
        })
      );
      expect(createUserTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientUserIds: ["user-owner"],
        code: "FINANCE_TRANSACTION_REJECTED",
        message: "Votre transaction Services divers a ete rejetee.",
        severity: "WARNING",
        entityType: "TRANSACTION",
        entityId: "txn-2",
        metadata: expect.objectContaining({
          transactionId: "txn-2",
          decision: "REJECTED",
          activityCode: "SERVICES",
          account: expect.objectContaining({
            scopeType: "DEDICATED",
            scopeLabel: "Dedie: Services divers"
          })
        })
      });
    });
  });
});
