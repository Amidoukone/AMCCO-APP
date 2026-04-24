import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  addProofToTransaction,
  confirmCompanySalaryReceipt,
  createCompanyAccount,
  createCompanySalaryTransaction,
  createCompanyTransaction,
  deleteCompanySalaryTransaction,
  deleteCompanyAccount,
  deleteCompanyTransaction,
  exportCompanySalaryCsv,
  exportCompanySalaryExcel,
  getTransactionProofUploadAuth,
  getCompanySalarySummary,
  listCompanyAccounts,
  listCompanySalaryMembers,
  listCompanySalaryTransactions,
  listCompanyTransactionProofs,
  listCompanyTransactions,
  reviewCompanyTransaction,
  submitCompanyTransaction,
  updateCompanyAccount,
  updateCompanySalaryTransaction,
  updateCompanyTransaction
} from "../services/finance.service.js";

const listTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  type: z.enum(["CASH_IN", "CASH_OUT"]).optional(),
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional()
});

const listAccountsQuerySchema = z.object({
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional()
});

const accountScopeTypeSchema = z.enum(["GLOBAL", "DEDICATED", "RESTRICTED"]);

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  accountRef: z.string().trim().max(255).optional(),
  openingBalance: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  scopeType: accountScopeTypeSchema.default("GLOBAL"),
  primaryActivityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional(),
  allowedActivityCodes: z.array(z.enum(BUSINESS_ACTIVITY_CODES)).max(BUSINESS_ACTIVITY_CODES.length).optional()
});

const createTransactionSchema = z.object({
  accountId: z.string().trim().min(8).max(64),
  type: z.enum(["CASH_IN", "CASH_OUT"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().trim().min(3).max(8).default("XOF"),
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES),
  description: z.string().trim().max(2000).optional(),
  metadata: z.record(z.string().trim().min(1).max(64), z.string().trim().max(500)).optional(),
  occurredAt: z.string().datetime()
});

const salaryPaymentMethodSchema = z.enum(["BANK_TRANSFER", "CASH", "MOBILE_MONEY", "CHEQUE"]);

const listSalariesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  employeeUserId: z.string().trim().min(8).max(64).optional(),
  payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
});

const createSalarySchema = z.object({
  accountId: z.string().trim().min(8).max(64),
  employeeUserId: z.string().trim().min(8).max(64),
  payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  bonusAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  deductionAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().trim().min(3).max(8).default("XOF"),
  paymentMethod: salaryPaymentMethodSchema,
  note: z.string().trim().max(1000).optional(),
  occurredAt: z.string().datetime()
});

const salarySummaryQuerySchema = z.object({
  payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  employeeUserId: z.string().trim().min(8).max(64).optional()
});

const txIdParamSchema = z.object({
  transactionId: z.string().trim().min(8).max(64)
});

const accountIdParamSchema = z.object({
  accountId: z.string().trim().min(8).max(64)
});

const addProofSchema = z.object({
  storageKey: z.string().trim().min(3).max(255),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(100),
  fileSize: z.number().int().min(1)
});

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"])
});

export const financeRouter = Router();

financeRouter.use(authenticateAccessToken);

financeRouter.get(
  "/finance/accounts",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = listAccountsQuerySchema.parse(req.query);
    const items = await listCompanyAccounts({
      companyId: req.auth.companyId,
      activityCode: query.activityCode
    });
    res.status(200).json({ items });
  })
);

financeRouter.post(
  "/finance/accounts",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const body = createAccountSchema.parse(req.body);
    const item = await createCompanyAccount(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        name: body.name,
        accountRef: body.accountRef,
        openingBalance: body.openingBalance,
        scopeType: body.scopeType,
        primaryActivityCode: body.primaryActivityCode,
        allowedActivityCodes: body.allowedActivityCodes
      }
    );
    res.status(201).json({ item });
  })
);

financeRouter.patch(
  "/finance/accounts/:accountId",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = accountIdParamSchema.parse(req.params);
    const body = createAccountSchema.parse(req.body);
    const item = await updateCompanyAccount(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        accountId: params.accountId,
        name: body.name,
        accountRef: body.accountRef,
        openingBalance: body.openingBalance,
        scopeType: body.scopeType,
        primaryActivityCode: body.primaryActivityCode,
        allowedActivityCodes: body.allowedActivityCodes
      }
    );
    res.status(200).json({ item });
  })
);

financeRouter.delete(
  "/finance/accounts/:accountId",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = accountIdParamSchema.parse(req.params);
    await deleteCompanyAccount(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        accountId: params.accountId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);

financeRouter.get(
  "/finance/transactions",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = listTransactionsQuerySchema.parse(req.query);
    const items = await listCompanyTransactions({
      companyId: req.auth.companyId,
      limit: query.limit,
      offset: query.offset,
      status: query.status,
      type: query.type,
      activityCode: query.activityCode
    });
    res.status(200).json({ items });
  })
);

financeRouter.get(
  "/finance/salary-members",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const items = await listCompanySalaryMembers(req.auth.companyId);
    res.status(200).json({ items });
  })
);

financeRouter.get(
  "/finance/salaries",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = listSalariesQuerySchema.parse(req.query);
    const items = await listCompanySalaryTransactions({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role,
      limit: query.limit,
      offset: query.offset,
      status: query.status,
      employeeUserId: query.employeeUserId,
      payPeriod: query.payPeriod
    });
    res.status(200).json({ items });
  })
);

financeRouter.post(
  "/finance/salaries",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const body = createSalarySchema.parse(req.body);
    const item = await createCompanySalaryTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        accountId: body.accountId,
        employeeUserId: body.employeeUserId,
        payPeriod: body.payPeriod,
        grossAmount: body.grossAmount,
        bonusAmount: body.bonusAmount,
        deductionAmount: body.deductionAmount,
        currency: body.currency,
        paymentMethod: body.paymentMethod,
        note: body.note,
        occurredAt: body.occurredAt
      }
    );
    res.status(201).json({ item });
  })
);

financeRouter.patch(
  "/finance/salaries/:transactionId",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const body = createSalarySchema.parse(req.body);
    const item = await updateCompanySalaryTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId,
        accountId: body.accountId,
        employeeUserId: body.employeeUserId,
        payPeriod: body.payPeriod,
        grossAmount: body.grossAmount,
        bonusAmount: body.bonusAmount,
        deductionAmount: body.deductionAmount,
        currency: body.currency,
        paymentMethod: body.paymentMethod,
        note: body.note,
        occurredAt: body.occurredAt
      }
    );
    res.status(200).json({ item });
  })
);

financeRouter.delete(
  "/finance/salaries/:transactionId",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    await deleteCompanySalaryTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);

financeRouter.patch(
  "/finance/salaries/:transactionId/confirm-receipt",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    await confirmCompanySalaryReceipt(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ status: "confirmed" });
  })
);

financeRouter.get(
  "/finance/salaries/summary",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = salarySummaryQuerySchema.parse(req.query);
    const item = await getCompanySalarySummary({
      companyId: req.auth.companyId,
      role: req.auth.role,
      payPeriod: query.payPeriod,
      employeeUserId: query.employeeUserId
    });
    res.status(200).json({ item });
  })
);

financeRouter.get(
  "/finance/salaries/exports/monthly.csv",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = salarySummaryQuerySchema.parse(req.query);
    const csv = await exportCompanySalaryCsv({
      companyId: req.auth.companyId,
      role: req.auth.role,
      payPeriod: query.payPeriod,
      employeeUserId: query.employeeUserId
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-salaires-${query.payPeriod}.csv"`
    );
    res.status(200).send(`\uFEFF${csv}`);
  })
);

financeRouter.get(
  "/finance/salaries/exports/monthly.xlsx",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = salarySummaryQuerySchema.parse(req.query);
    const workbook = await exportCompanySalaryExcel({
      companyId: req.auth.companyId,
      role: req.auth.role,
      payPeriod: query.payPeriod,
      employeeUserId: query.employeeUserId
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-salaires-${query.payPeriod}.xlsx"`
    );
    res.status(200).send(workbook);
  })
);

financeRouter.post(
  "/finance/transactions",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const body = createTransactionSchema.parse(req.body);
    const item = await createCompanyTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        accountId: body.accountId,
        type: body.type,
        amount: body.amount,
        currency: body.currency,
        activityCode: body.activityCode,
        description: body.description,
        metadata: body.metadata,
        occurredAt: body.occurredAt
      }
    );
    res.status(201).json({ item });
  })
);

financeRouter.patch(
  "/finance/transactions/:transactionId",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const body = createTransactionSchema.parse(req.body);
    const item = await updateCompanyTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId,
        accountId: body.accountId,
        type: body.type,
        amount: body.amount,
        currency: body.currency,
        activityCode: body.activityCode,
        description: body.description,
        metadata: body.metadata,
        occurredAt: body.occurredAt
      }
    );
    res.status(200).json({ item });
  })
);

financeRouter.get(
  "/finance/transactions/:transactionId/proofs",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const items = await listCompanyTransactionProofs(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ items });
  })
);

financeRouter.get(
  "/finance/transactions/:transactionId/proofs/upload-auth",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const item = await getTransactionProofUploadAuth(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ item });
  })
);

financeRouter.post(
  "/finance/transactions/:transactionId/proofs",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const body = addProofSchema.parse(req.body);
    const items = await addProofToTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId,
        storageKey: body.storageKey,
        fileName: body.fileName,
        mimeType: body.mimeType,
        fileSize: body.fileSize
      }
    );
    res.status(201).json({ items });
  })
);

financeRouter.patch(
  "/finance/transactions/:transactionId/submit",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    await submitCompanyTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role,
        email: req.auth.email,
        fullName: req.auth.fullName
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ status: "submitted" });
  })
);

financeRouter.patch(
  "/finance/transactions/:transactionId/review",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    const body = reviewSchema.parse(req.body);
    await reviewCompanyTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role,
        email: req.auth.email,
        fullName: req.auth.fullName
      },
      {
        transactionId: params.transactionId,
        decision: body.decision
      }
    );
    res.status(200).json({ status: "reviewed" });
  })
);

financeRouter.delete(
  "/finance/transactions/:transactionId",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = txIdParamSchema.parse(req.params);
    await deleteCompanyTransaction(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        transactionId: params.transactionId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
