import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors/http-error.js";
import {
  confirmSalaryReceipt,
  countTransactionProofs,
  createFinancialAccount,
  createFinancialTransaction,
  deleteFinancialAccount,
  deleteFinancialTransaction,
  findFinancialAccountById,
  findFinancialTransactionById,
  findSalaryTransactionByEmployeeAndPeriod,
  findTransactionById,
  listSalaryTransactions,
  reviewTransaction,
  submitTransaction,
  updateFinancialAccount,
  updateFinancialTransaction
} from "../repositories/finance.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import { findMembershipByCompanyAndUser, listCompanyUsers } from "../repositories/admin-users.repository.js";
import {
  createCompanyAccount,
  confirmCompanySalaryReceipt,
  deleteCompanyAccount,
  deleteCompanySalaryTransaction,
  createCompanySalaryTransaction,
  createCompanyTransaction,
  deleteCompanyTransaction,
  exportCompanySalaryCsv,
  getCompanySalarySummary,
  reviewCompanyTransaction,
  submitCompanyTransaction,
  updateCompanyAccount,
  updateCompanySalaryTransaction,
  updateCompanyTransaction
} from "./finance.service.js";

vi.mock("../repositories/finance.repository.js", () => ({
  confirmSalaryReceipt: vi.fn(),
  countTransactionProofs: vi.fn(),
  findTransactionById: vi.fn(),
  reviewTransaction: vi.fn(),
  submitTransaction: vi.fn(),
  addTransactionProof: vi.fn(),
  createFinancialAccount: vi.fn(),
  createFinancialTransaction: vi.fn(),
  deleteFinancialAccount: vi.fn(),
  deleteFinancialTransaction: vi.fn(),
  findFinancialAccountById: vi.fn(),
  findFinancialTransactionById: vi.fn(),
  findSalaryTransactionByEmployeeAndPeriod: vi.fn(),
  listFinancialAccounts: vi.fn(),
  listSalaryTransactions: vi.fn(),
  listFinancialTransactions: vi.fn(),
  listTransactionProofs: vi.fn(),
  updateFinancialAccount: vi.fn(),
  updateFinancialTransaction: vi.fn()
}));

vi.mock("../repositories/admin-users.repository.js", () => ({
  findMembershipByCompanyAndUser: vi.fn(),
  listCompanyUsers: vi.fn()
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
    vi.mocked(listCompanyUsers).mockResolvedValue([]);
  });

  describe("createCompanySalaryTransaction", () => {
    it("rejects duplicate salary entries for the same employee and period", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
        membershipId: "membership-1",
        userId: "employee-1",
        companyId: actor.companyId,
        role: "EMPLOYEE",
        email: "employee@example.com",
        fullName: "Agent Test",
        isActive: true
      });
      vi.mocked(findSalaryTransactionByEmployeeAndPeriod).mockResolvedValue({
        id: "salary-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "85000.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "85000.00",
          bonusAmount: "0.00",
          deductionAmount: "0.00",
          netAmount: "85000.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "DRAFT",
        requiresProof: false,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });

      const promise = createCompanySalaryTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          accountId: "account-1",
          employeeUserId: "employee-1",
          payPeriod: "2026-04",
          grossAmount: "85000.00",
          paymentMethod: "BANK_TRANSFER",
          occurredAt: "2026-04-20T08:00:00.000Z"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 409,
        message: "Un salaire existe deja pour ce collaborateur sur cette periode."
      });
      expect(createFinancialTransaction).not.toHaveBeenCalled();
    });

    it("creates a salary transaction in draft with salary metadata", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
        membershipId: "membership-1",
        userId: "employee-1",
        companyId: actor.companyId,
        role: "EMPLOYEE",
        email: "employee@example.com",
        fullName: "Agent Test",
        isActive: true
      });
      vi.mocked(findSalaryTransactionByEmployeeAndPeriod).mockResolvedValue(null);
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER",
          note: "Prime de rendement"
        },
        status: "DRAFT",
        requiresProof: false,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });

      const result = await createCompanySalaryTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          accountId: "account-1",
          employeeUserId: "employee-1",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          paymentMethod: "BANK_TRANSFER",
          note: "Prime de rendement",
          occurredAt: "2026-04-20T08:00:00.000Z"
        }
      );

      expect(createFinancialTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: actor.companyId,
          accountId: "account-1",
          type: "CASH_OUT",
          amount: "92500.00",
          activityCode: null,
          requiresProof: false,
          metadata: expect.objectContaining({
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            payPeriod: "2026-04",
            netAmount: "92500.00"
          })
        })
      );
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: actor.companyId,
          actorId: actor.actorId,
          action: "FINANCE_SALARY_CREATED",
          entityType: "SALARY"
        })
      );
      expect(result.netAmount).toBe("92500.00");
      expect(result.employeeFullName).toBe("Agent Test");
    });
  });

  describe("updateCompanySalaryTransaction", () => {
    it("updates a non-approved salary and resets employee confirmation", async () => {
      vi.mocked(findFinancialTransactionById)
        .mockResolvedValueOnce({
          id: "salary-3",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Banque principale",
          accountRef: "BNK-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "92500.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent Test",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            employeeFullName: "Agent Test",
            employeeEmail: "employee@example.com",
            employeeRole: "EMPLOYEE",
            payPeriod: "2026-04",
            grossAmount: "90000.00",
            bonusAmount: "5000.00",
            deductionAmount: "2500.00",
            netAmount: "92500.00",
            paymentMethod: "BANK_TRANSFER"
          },
          status: "SUBMITTED",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "PENDING",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 0
        })
        .mockResolvedValueOnce({
          id: "salary-3",
          companyId: actor.companyId,
          accountId: "account-2",
          accountName: "Banque secondaire",
          accountRef: "BNK-02",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "96000.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent Test",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            employeeFullName: "Agent Test",
            employeeEmail: "employee@example.com",
            employeeRole: "EMPLOYEE",
            payPeriod: "2026-04",
            grossAmount: "93000.00",
            bonusAmount: "5000.00",
            deductionAmount: "2000.00",
            netAmount: "96000.00",
            paymentMethod: "BANK_TRANSFER",
            note: "Ajustement"
          },
          status: "DRAFT",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-21T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-21T08:00:00.000Z",
          proofsCount: 0
        });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-2",
        companyId: actor.companyId,
        name: "Banque secondaire",
        accountRef: "BNK-02",
        balance: "150000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        transactionsCount: 0,
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
        membershipId: "membership-1",
        userId: "employee-1",
        companyId: actor.companyId,
        role: "EMPLOYEE",
        email: "employee@example.com",
        fullName: "Agent Test",
        isActive: true
      });
      vi.mocked(findSalaryTransactionByEmployeeAndPeriod).mockResolvedValue({
        id: "salary-3",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "SUBMITTED",
        requiresProof: false,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "PENDING",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });

      const result = await updateCompanySalaryTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "salary-3",
          accountId: "account-2",
          employeeUserId: "employee-1",
          payPeriod: "2026-04",
          grossAmount: "93000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2000.00",
          currency: "XOF",
          paymentMethod: "BANK_TRANSFER",
          note: "Ajustement",
          occurredAt: "2026-04-21T08:00:00.000Z"
        }
      );

      expect(updateFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "salary-3",
        accountId: "account-2",
        type: "CASH_OUT",
        amount: "96000.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: expect.objectContaining({
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          netAmount: "96000.00"
        }),
        requiresProof: false,
        salaryConfirmationStatus: "NOT_REQUIRED",
        occurredAt: new Date("2026-04-21T08:00:00.000Z")
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_SALARY_UPDATED",
          entityId: "salary-3",
          metadataJson: expect.stringContaining("\"previousStatus\":\"SUBMITTED\"")
        })
      );
      expect(result.status).toBe("DRAFT");
      expect(result.salaryConfirmation.status).toBe("NOT_REQUIRED");
    });

    it("alerts owners when sys admin updates a salary", async () => {
      vi.mocked(findFinancialTransactionById)
        .mockResolvedValueOnce({
          id: "salary-4",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Banque principale",
          accountRef: "BNK-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "92500.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent Test",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            employeeFullName: "Agent Test",
            employeeEmail: "employee@example.com",
            employeeRole: "EMPLOYEE",
            payPeriod: "2026-04",
            grossAmount: "90000.00",
            bonusAmount: "5000.00",
            deductionAmount: "2500.00",
            netAmount: "92500.00",
            paymentMethod: "BANK_TRANSFER"
          },
          status: "DRAFT",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 0
        })
        .mockResolvedValueOnce({
          id: "salary-4",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Banque principale",
          accountRef: "BNK-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "94000.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent Test",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            employeeFullName: "Agent Test",
            employeeEmail: "employee@example.com",
            employeeRole: "EMPLOYEE",
            payPeriod: "2026-04",
            grossAmount: "90000.00",
            bonusAmount: "6000.00",
            deductionAmount: "2000.00",
            netAmount: "94000.00",
            paymentMethod: "BANK_TRANSFER"
          },
          status: "DRAFT",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 0
        });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        transactionsCount: 0,
        createdAt: "2026-04-20T08:00:00.000Z"
      });
      vi.mocked(findMembershipByCompanyAndUser).mockResolvedValue({
        membershipId: "membership-1",
        userId: "employee-1",
        companyId: actor.companyId,
        role: "EMPLOYEE",
        email: "employee@example.com",
        fullName: "Agent Test",
        isActive: true
      });
      vi.mocked(findSalaryTransactionByEmployeeAndPeriod).mockResolvedValue(null);

      await updateCompanySalaryTransaction(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          transactionId: "salary-4",
          accountId: "account-1",
          employeeUserId: "employee-1",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "6000.00",
          deductionAmount: "2000.00",
          currency: "XOF",
          paymentMethod: "BANK_TRANSFER",
          occurredAt: "2026-04-20T08:00:00.000Z"
        }
      );

      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_SALARY_UPDATED",
        message: "Le salaire Agent Test | 2026-04 a ete modifie par l'admin systeme.",
        severity: "WARNING",
        entityType: "SALARY",
        entityId: "salary-4",
        metadata: expect.objectContaining({
          transactionId: "salary-4",
          actorRole: "SYS_ADMIN",
          salary: expect.objectContaining({
            employeeUserId: "employee-1",
            payPeriod: "2026-04"
          })
        })
      });
    });
  });

  describe("deleteCompanySalaryTransaction", () => {
    it("allows an accountant to delete a non-approved salary", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-5",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "DRAFT",
        requiresProof: false,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });

      await deleteCompanySalaryTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "salary-5"
        }
      );

      expect(deleteFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "salary-5"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_SALARY_DELETED",
          entityId: "salary-5"
        })
      );
    });

    it("alerts owners when sys admin deletes an approved salary", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-6",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "APPROVED",
        requiresProof: false,
        createdById: actor.actorId,
        createdByEmail: "actor@example.com",
        validatedById: "reviewer-1",
        validatedByEmail: "reviewer@example.com",
        salaryConfirmationStatus: "CONFIRMED",
        salaryConfirmedById: "employee-1",
        salaryConfirmedByEmail: "employee@example.com",
        salaryConfirmedAt: "2026-04-20T10:00:00.000Z",
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T10:30:00.000Z",
        proofsCount: 0
      });

      await deleteCompanySalaryTransaction(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          transactionId: "salary-6"
        }
      );

      expect(deleteFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "salary-6"
      });
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_SALARY_DELETED",
        message: "Le salaire Agent Test | 2026-04 a ete supprime par l'admin systeme.",
        severity: "WARNING",
        entityType: "SALARY",
        entityId: "salary-6",
        metadata: expect.objectContaining({
          transactionId: "salary-6",
          actorRole: "SYS_ADMIN",
          salary: expect.objectContaining({
            employeeUserId: "employee-1",
            payPeriod: "2026-04"
          }),
          salaryStatus: "APPROVED"
        })
      });
    });
  });

  describe("salary summary and export", () => {
    it("builds a monthly salary summary and csv export", async () => {
      vi.mocked(listSalaryTransactions).mockResolvedValue([
        {
          id: "salary-1",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Banque principale",
          accountRef: "BNK-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "92500.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent Test",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-1",
            employeeFullName: "Agent Test",
            employeeEmail: "employee@example.com",
            employeeRole: "EMPLOYEE",
            payPeriod: "2026-04",
            grossAmount: "90000.00",
            bonusAmount: "5000.00",
            deductionAmount: "2500.00",
            netAmount: "92500.00",
            paymentMethod: "BANK_TRANSFER"
          },
          status: "APPROVED",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: "reviewer-1",
          validatedByEmail: "reviewer@example.com",
          salaryConfirmationStatus: "CONFIRMED",
          salaryConfirmedById: "employee-1",
          salaryConfirmedByEmail: "employee@example.com",
          salaryConfirmedAt: "2026-04-20T09:30:00.000Z",
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 0
        },
        {
          id: "salary-2",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Banque principale",
          accountRef: "BNK-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "75000.00",
          currency: "XOF",
          activityCode: null,
          description: "Salaire 2026-04 - Agent B",
          metadata: {
            entryCategory: "SALARY",
            employeeUserId: "employee-2",
            employeeFullName: "Agent B",
            employeeEmail: "agentb@example.com",
            employeeRole: "SUPERVISOR",
            payPeriod: "2026-04",
            grossAmount: "75000.00",
            bonusAmount: "0.00",
            deductionAmount: "0.00",
            netAmount: "75000.00",
            paymentMethod: "CASH"
          },
          status: "SUBMITTED",
          requiresProof: false,
          createdById: actor.actorId,
          createdByEmail: "actor@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "PENDING",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-21T08:00:00.000Z",
          createdAt: "2026-04-21T08:00:00.000Z",
          updatedAt: "2026-04-21T08:00:00.000Z",
          proofsCount: 0
        }
      ]);

      const summary = await getCompanySalarySummary({
        companyId: actor.companyId,
        role: "ACCOUNTANT",
        payPeriod: "2026-04"
      });

      expect(summary.totalCount).toBe(2);
      expect(summary.totalNetAmount).toBe("167500.00");
      expect(summary.approvedNetAmount).toBe("92500.00");
      expect(summary.pendingCount).toBe(1);
      expect(summary.byEmployee).toHaveLength(2);

      const csv = await exportCompanySalaryCsv({
        companyId: actor.companyId,
        role: "ACCOUNTANT",
        payPeriod: "2026-04"
      });

      expect(csv).toContain("salary_id");
      expect(csv).toContain("employee_full_name");
      expect(csv).toContain("\"Agent Test\"");
      expect(csv).toContain("\"BANK_TRANSFER\"");
    });
  });

  describe("submitCompanyTransaction", () => {
    it("rejects submission when required proof is missing", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "txn-1",
        companyId: actor.companyId,
        createdById: actor.actorId,
        activityCode: "GENERAL_STORE",
        status: "DRAFT",
        requiresProof: true,
        salaryConfirmationStatus: "NOT_REQUIRED"
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
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
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
        requiresProof: true,
        salaryConfirmationStatus: "NOT_REQUIRED"
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
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
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
        transactionId: "txn-1",
        salaryConfirmationStatus: "NOT_REQUIRED"
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

    it("submits a salary for employee confirmation and alerts the employee", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "salary-1",
        companyId: actor.companyId,
        createdById: "payroll-1",
        activityCode: null,
        status: "DRAFT",
        requiresProof: false,
        salaryConfirmationStatus: "NOT_REQUIRED"
      });
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "DRAFT",
        requiresProof: false,
        createdById: "payroll-1",
        createdByEmail: "payroll@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await submitCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "salary-1"
        }
      );

      expect(submitTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "salary-1",
        salaryConfirmationStatus: "PENDING"
      });
      expect(createUserTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientUserIds: ["employee-1"],
        code: "FINANCE_SALARY_SUBMITTED",
        message:
          "Le salaire Agent Test | 2026-04 est pret. Verifiez-le puis confirmez la reception du paiement.",
        severity: "WARNING",
        entityType: "SALARY",
        entityId: "salary-1",
        metadata: expect.objectContaining({
          transactionId: "salary-1",
          createdById: "payroll-1",
          salary: expect.objectContaining({
            employeeUserId: "employee-1",
            payPeriod: "2026-04"
          }),
          salaryConfirmation: expect.objectContaining({
            status: "PENDING"
          })
        })
      });
      expect(createRoleTargetedAlerts).not.toHaveBeenCalled();
    });
  });

  describe("confirmCompanySalaryReceipt", () => {
    it("confirms a submitted salary and alerts finance reviewers", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-1",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "SUBMITTED",
        requiresProof: false,
        createdById: "payroll-1",
        createdByEmail: "payroll@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "PENDING",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await confirmCompanySalaryReceipt(
        {
          actorId: "employee-1",
          companyId: actor.companyId,
          role: "EMPLOYEE"
        },
        {
          transactionId: "salary-1"
        }
      );

      expect(confirmSalaryReceipt).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "salary-1",
        confirmerId: "employee-1"
      });
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER", "SYS_ADMIN", "ACCOUNTANT"],
        excludeUserIds: ["employee-1"],
        code: "FINANCE_SALARY_RECEIPT_CONFIRMED",
        message:
          "Le salaire Agent Test | 2026-04 a ete confirme par Agent Test et peut maintenant etre approuve.",
        severity: "WARNING",
        entityType: "SALARY",
        entityId: "salary-1",
        metadata: expect.objectContaining({
          transactionId: "salary-1",
          salary: expect.objectContaining({
            employeeUserId: "employee-1"
          }),
          salaryConfirmation: expect.objectContaining({
            status: "CONFIRMED",
            confirmedById: "employee-1",
            confirmedByEmail: "employee@example.com"
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

  describe("updateCompanyTransaction", () => {
    it("allows an accountant to update a non-approved transaction and resets the workflow to draft", async () => {
      vi.mocked(findFinancialTransactionById)
        .mockResolvedValueOnce({
          id: "txn-3",
          companyId: actor.companyId,
          accountId: "account-1",
          accountName: "Caisse principale",
          accountRef: "CAI-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "25000.00",
          currency: "XOF",
          activityCode: "GENERAL_STORE",
          description: "Sortie initiale",
          metadata: {
            receiptNumber: "RC-1"
          },
          status: "SUBMITTED",
          requiresProof: true,
          createdById: "cashier-1",
          createdByEmail: "cashier@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 1
        })
        .mockResolvedValueOnce({
          id: "txn-3",
          companyId: actor.companyId,
          accountId: "account-2",
          accountName: "Caisse services",
          accountRef: "SVC-01",
          accountScopeType: "DEDICATED",
          accountPrimaryActivityCode: "SERVICES",
          accountAllowedActivityCodes: ["SERVICES"],
          type: "CASH_OUT",
          amount: "30000.00",
          currency: "XOF",
          activityCode: "SERVICES",
          description: "Intervention client maj",
          metadata: {
            serviceType: "Installation"
          },
          status: "DRAFT",
          requiresProof: true,
          createdById: "cashier-1",
          createdByEmail: "cashier@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-21T09:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-21T09:00:00.000Z",
          proofsCount: 1
        });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-2",
        companyId: actor.companyId,
        name: "Caisse services",
        accountRef: "SVC-01",
        balance: "50000.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "SERVICES",
        allowedActivityCodes: ["SERVICES"],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const result = await updateCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "txn-3",
          accountId: "account-2",
          type: "CASH_OUT",
          amount: "30000.00",
          currency: "xof",
          activityCode: "SERVICES",
          description: "Intervention client maj",
          metadata: {
            serviceType: "Installation"
          },
          occurredAt: "2026-04-21T09:00:00.000Z"
        }
      );

      expect(updateFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "txn-3",
        accountId: "account-2",
        type: "CASH_OUT",
        amount: "30000.00",
        currency: "XOF",
        activityCode: "SERVICES",
        description: "Intervention client maj",
        metadata: {
          serviceType: "Installation"
        },
        requiresProof: true,
        occurredAt: new Date("2026-04-21T09:00:00.000Z")
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: actor.actorId,
          action: "FINANCE_TRANSACTION_UPDATED",
          entityId: "txn-3",
          metadataJson: expect.stringContaining("\"previousStatus\":\"SUBMITTED\"")
        })
      );
      expect(result.status).toBe("DRAFT");
      expect(result.activityCode).toBe("SERVICES");
    });

    it("alerts owners when sys admin updates a transaction", async () => {
      vi.mocked(findFinancialTransactionById)
        .mockResolvedValueOnce({
          id: "txn-7",
          companyId: actor.companyId,
          accountId: "account-6",
          accountName: "Banque services",
          accountRef: "BS-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "18000.00",
          currency: "XOF",
          activityCode: "SERVICES",
          description: "Intervention initiale",
          metadata: {},
          status: "DRAFT",
          requiresProof: true,
          createdById: "cashier-7",
          createdByEmail: "cashier7@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
          proofsCount: 0
        })
        .mockResolvedValueOnce({
          id: "txn-7",
          companyId: actor.companyId,
          accountId: "account-6",
          accountName: "Banque services",
          accountRef: "BS-01",
          accountScopeType: "GLOBAL",
          accountPrimaryActivityCode: null,
          accountAllowedActivityCodes: [],
          type: "CASH_OUT",
          amount: "20000.00",
          currency: "XOF",
          activityCode: "SERVICES",
          description: "Intervention ajustee",
          metadata: {},
          status: "DRAFT",
          requiresProof: true,
          createdById: "cashier-7",
          createdByEmail: "cashier7@example.com",
          validatedById: null,
          validatedByEmail: null,
          salaryConfirmationStatus: "NOT_REQUIRED",
          salaryConfirmedById: null,
          salaryConfirmedByEmail: null,
          salaryConfirmedAt: null,
          occurredAt: "2026-04-21T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-21T08:00:00.000Z",
          proofsCount: 0
        });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-6",
        companyId: actor.companyId,
        name: "Banque services",
        accountRef: "BS-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        transactionsCount: 0,
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await updateCompanyTransaction(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          transactionId: "txn-7",
          accountId: "account-6",
          type: "CASH_OUT",
          amount: "20000.00",
          currency: "XOF",
          activityCode: "SERVICES",
          description: "Intervention ajustee",
          metadata: {},
          occurredAt: "2026-04-21T08:00:00.000Z"
        }
      );

      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_TRANSACTION_UPDATED",
        message: "La transaction Services divers 20000.00 XOF a ete modifiee par l'admin systeme.",
        severity: "WARNING",
        entityType: "TRANSACTION",
        entityId: "txn-7",
        metadata: expect.objectContaining({
          transactionId: "txn-7",
          accountId: "account-6",
          accountName: "Banque services",
          actorRole: "SYS_ADMIN",
          activityCode: "SERVICES",
          activityLabel: "Services divers",
          status: "DRAFT"
        })
      });
    });
  });

  describe("deleteCompanyTransaction", () => {
    it("allows an accountant to delete a non-approved transaction", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-4",
        companyId: actor.companyId,
        accountId: "account-3",
        accountName: "Caisse chantier",
        accountRef: "CH-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "15000.00",
        currency: "XOF",
        activityCode: "GENERAL_STORE",
        description: "Achat urgent",
        metadata: {},
        status: "DRAFT",
        requiresProof: false,
        createdById: "cashier-2",
        createdByEmail: "cashier2@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-3",
        companyId: actor.companyId,
        name: "Caisse chantier",
        accountRef: "CH-01",
        balance: "60000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await deleteCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "txn-4"
        }
      );

      expect(deleteFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "txn-4"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_TRANSACTION_DELETED",
          entityId: "txn-4",
          metadataJson: expect.stringContaining("\"deletedStatus\":\"DRAFT\"")
        })
      );
    });

    it("rejects approved transaction deletion from accountants", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-5",
        companyId: actor.companyId,
        accountId: "account-4",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_IN",
        amount: "90000.00",
        currency: "XOF",
        activityCode: "GENERAL_STORE",
        description: "Versement",
        metadata: {},
        status: "APPROVED",
        requiresProof: false,
        createdById: "cashier-3",
        createdByEmail: "cashier3@example.com",
        validatedById: "reviewer-1",
        validatedByEmail: "reviewer@example.com",
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 1
      });

      const promise = deleteCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "txn-5"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Seul l'admin systeme peut supprimer une transaction deja approuvee."
      });
      expect(deleteFinancialTransaction).not.toHaveBeenCalled();
    });

    it("allows sys admin to delete an approved transaction", async () => {
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "txn-6",
        companyId: actor.companyId,
        accountId: "account-5",
        accountName: "Banque siege",
        accountRef: "HQ-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_IN",
        amount: "120000.00",
        currency: "XOF",
        activityCode: "SERVICES",
        description: "Paiement client",
        metadata: {},
        status: "APPROVED",
        requiresProof: false,
        createdById: "cashier-4",
        createdByEmail: "cashier4@example.com",
        validatedById: "reviewer-2",
        validatedByEmail: "reviewer2@example.com",
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 2
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-5",
        companyId: actor.companyId,
        name: "Banque siege",
        accountRef: "HQ-01",
        balance: "420000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await deleteCompanyTransaction(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          transactionId: "txn-6"
        }
      );

      expect(deleteFinancialTransaction).toHaveBeenCalledWith({
        companyId: actor.companyId,
        transactionId: "txn-6"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_TRANSACTION_DELETED",
          entityId: "txn-6",
          metadataJson: expect.stringContaining("\"deletedStatus\":\"APPROVED\"")
        })
      );
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_TRANSACTION_DELETED",
        message: "La transaction Services divers 120000.00 XOF a ete supprimee par l'admin systeme.",
        severity: "WARNING",
        entityType: "TRANSACTION",
        entityId: "txn-6",
        metadata: expect.objectContaining({
          transactionId: "txn-6",
          accountId: "account-5",
          accountName: "Banque siege",
          actorRole: "SYS_ADMIN",
          activityCode: "SERVICES",
          activityLabel: "Services divers",
          status: "APPROVED"
        })
      });
    });
  });

  describe("createCompanyAccount", () => {
    it("rejects account creation from accountants", async () => {
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
        message: "Permissions insuffisantes pour creer un compte financier."
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
          role: "SYS_ADMIN"
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

  describe("updateCompanyAccount", () => {
    it("rejects account updates from accountants", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-global-1",
        companyId: actor.companyId,
        name: "Banque siege",
        accountRef: "HQ-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        transactionsCount: 0,
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = updateCompanyAccount(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          accountId: "account-global-1",
          name: "Banque siege modifiee",
          openingBalance: "100000.00",
          scopeType: "GLOBAL"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Permissions insuffisantes pour modifier ou supprimer ce compte financier."
      });
      expect(updateFinancialAccount).not.toHaveBeenCalled();
    });

    it("updates an unused restricted account", async () => {
      vi.mocked(findFinancialAccountById)
        .mockResolvedValueOnce({
          id: "account-7",
          companyId: actor.companyId,
          name: "Caisse mobile",
          accountRef: "MM-01",
          balance: "5000.00",
          scopeType: "RESTRICTED",
          primaryActivityCode: null,
          allowedActivityCodes: ["GENERAL_STORE"],
          transactionsCount: 0,
          createdAt: "2026-04-20T08:00:00.000Z"
        })
        .mockResolvedValueOnce({
          id: "account-7",
          companyId: actor.companyId,
          name: "Caisse mobile terrain",
          accountRef: "MM-02",
          balance: "7000.00",
          scopeType: "RESTRICTED",
          primaryActivityCode: null,
          allowedActivityCodes: ["GENERAL_STORE", "FOOD"],
          transactionsCount: 0,
          createdAt: "2026-04-20T08:00:00.000Z"
        });

      const result = await updateCompanyAccount(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          accountId: "account-7",
          name: " Caisse mobile terrain ",
          accountRef: " MM-02 ",
          openingBalance: "7000.00",
          scopeType: "RESTRICTED",
          allowedActivityCodes: ["GENERAL_STORE", "FOOD", "FOOD"]
        }
      );

      expect(updateFinancialAccount).toHaveBeenCalledWith({
        companyId: actor.companyId,
        accountId: "account-7",
        name: "Caisse mobile terrain",
        accountRef: "MM-02",
        balance: "7000.00",
        scopeType: "RESTRICTED",
        primaryActivityCode: null,
        allowedActivityCodes: ["GENERAL_STORE", "FOOD"]
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_ACCOUNT_UPDATED",
          entityId: "account-7",
          metadataJson: expect.stringContaining("\"previousScopeType\":\"RESTRICTED\"")
        })
      );
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_ACCOUNT_UPDATED",
        message: "Le compte financier Caisse mobile terrain a ete modifie par l'admin systeme.",
        severity: "WARNING",
        entityType: "FINANCIAL_ACCOUNT",
        entityId: "account-7",
        metadata: expect.objectContaining({
          accountId: "account-7",
          accountName: "Caisse mobile terrain",
          actorRole: "SYS_ADMIN"
        })
      });
      expect(result.name).toBe("Caisse mobile terrain");
      expect(result.allowedActivityCodes).toEqual(["GENERAL_STORE", "FOOD"]);
    });

    it("rejects updates for an account already used in transactions", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-8",
        companyId: actor.companyId,
        name: "Banque secondaire",
        accountRef: "BNK-02",
        balance: "25000.00",
        scopeType: "DEDICATED",
        primaryActivityCode: "SERVICES",
        allowedActivityCodes: ["SERVICES"],
        transactionsCount: 2,
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = updateCompanyAccount(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          accountId: "account-8",
          name: "Banque secondaire maj",
          openingBalance: "25000.00",
          scopeType: "DEDICATED",
          primaryActivityCode: "SERVICES"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message:
          "Ce compte financier est deja utilise par des transactions et ne peut plus etre modifie."
      });
      expect(updateFinancialAccount).not.toHaveBeenCalled();
    });
  });

  describe("deleteCompanyAccount", () => {
    it("rejects deletion for an account already used in transactions", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-9",
        companyId: actor.companyId,
        name: "Caisse principale",
        accountRef: "CAI-01",
        balance: "10000.00",
        scopeType: "RESTRICTED",
        primaryActivityCode: null,
        allowedActivityCodes: ["GENERAL_STORE"],
        transactionsCount: 1,
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = deleteCompanyAccount(
        {
          ...actor,
          role: "OWNER"
        },
        {
          accountId: "account-9"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message:
          "Ce compte financier est deja utilise par des transactions et ne peut pas etre supprime."
      });
      expect(deleteFinancialAccount).not.toHaveBeenCalled();
    });

    it("deletes an unused global account for sys admin", async () => {
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-10",
        companyId: actor.companyId,
        name: "Banque reserve",
        accountRef: "RES-01",
        balance: "0.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        transactionsCount: 0,
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      await deleteCompanyAccount(
        {
          ...actor,
          role: "SYS_ADMIN"
        },
        {
          accountId: "account-10"
        }
      );

      expect(deleteFinancialAccount).toHaveBeenCalledWith({
        companyId: actor.companyId,
        accountId: "account-10"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "FINANCE_ACCOUNT_DELETED",
          entityId: "account-10"
        })
      );
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER"],
        excludeUserIds: [actor.actorId],
        code: "FINANCE_ACCOUNT_DELETED",
        message: "Le compte financier Banque reserve a ete supprime par l'admin systeme.",
        severity: "WARNING",
        entityType: "FINANCIAL_ACCOUNT",
        entityId: "account-10",
        metadata: expect.objectContaining({
          accountId: "account-10",
          accountName: "Banque reserve",
          actorRole: "SYS_ADMIN"
        })
      });
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

    it("blocks salary approval until employee confirmation is recorded", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "salary-2",
        companyId: actor.companyId,
        createdById: "payroll-1",
        activityCode: null,
        status: "SUBMITTED",
        requiresProof: false,
        salaryConfirmationStatus: "PENDING"
      });
      vi.mocked(findFinancialTransactionById).mockResolvedValue({
        id: "salary-2",
        companyId: actor.companyId,
        accountId: "account-1",
        accountName: "Banque principale",
        accountRef: "BNK-01",
        accountScopeType: "GLOBAL",
        accountPrimaryActivityCode: null,
        accountAllowedActivityCodes: [],
        type: "CASH_OUT",
        amount: "92500.00",
        currency: "XOF",
        activityCode: null,
        description: "Salaire 2026-04 - Agent Test",
        metadata: {
          entryCategory: "SALARY",
          employeeUserId: "employee-1",
          employeeFullName: "Agent Test",
          employeeEmail: "employee@example.com",
          employeeRole: "EMPLOYEE",
          payPeriod: "2026-04",
          grossAmount: "90000.00",
          bonusAmount: "5000.00",
          deductionAmount: "2500.00",
          netAmount: "92500.00",
          paymentMethod: "BANK_TRANSFER"
        },
        status: "SUBMITTED",
        requiresProof: false,
        createdById: "payroll-1",
        createdByEmail: "payroll@example.com",
        validatedById: null,
        validatedByEmail: null,
        salaryConfirmationStatus: "PENDING",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
        occurredAt: "2026-04-20T08:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
        proofsCount: 0
      });
      vi.mocked(findFinancialAccountById).mockResolvedValue({
        id: "account-1",
        companyId: actor.companyId,
        name: "Banque principale",
        accountRef: "BNK-01",
        balance: "100000.00",
        scopeType: "GLOBAL",
        primaryActivityCode: null,
        allowedActivityCodes: [],
        createdAt: "2026-04-20T08:00:00.000Z"
      });

      const promise = reviewCompanyTransaction(
        {
          ...actor,
          role: "ACCOUNTANT"
        },
        {
          transactionId: "salary-2",
          decision: "APPROVED"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Le salaire doit d'abord etre confirme par le collaborateur avant approbation."
      });
      expect(reviewTransaction).not.toHaveBeenCalled();
    });

    it("reviews a submitted transaction and notifies its creator", async () => {
      vi.mocked(findTransactionById).mockResolvedValue({
        id: "txn-2",
        companyId: actor.companyId,
        createdById: "user-owner",
        activityCode: "SERVICES",
        status: "SUBMITTED",
        requiresProof: true,
        salaryConfirmationStatus: "NOT_REQUIRED"
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
        salaryConfirmationStatus: "NOT_REQUIRED",
        salaryConfirmedById: null,
        salaryConfirmedByEmail: null,
        salaryConfirmedAt: null,
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
