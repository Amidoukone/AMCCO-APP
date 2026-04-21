import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  addProofToTransaction,
  createCompanyAccount,
  createCompanyTransaction,
  getTransactionProofUploadAuth,
  listCompanyAccounts,
  listCompanyTransactionProofs,
  listCompanyTransactions,
  reviewCompanyTransaction,
  submitCompanyTransaction
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

const txIdParamSchema = z.object({
  transactionId: z.string().trim().min(8).max(64)
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
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT"),
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
        role: req.auth.role
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
        role: req.auth.role
      },
      {
        transactionId: params.transactionId,
        decision: body.decision
      }
    );
    res.status(200).json({ status: "reviewed" });
  })
);
