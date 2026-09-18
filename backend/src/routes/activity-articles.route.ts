import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  createCompanyActivityArticle,
  deleteCompanyActivityArticle,
  listCompanyActivityArticles,
  updateCompanyActivityArticle
} from "../services/activity-articles.service.js";

const activityCodeParamSchema = z.object({
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES)
});

const articleParamSchema = activityCodeParamSchema.extend({
  articleId: z.string().trim().min(8).max(64)
});

const articleBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultMargin: z.string().regex(/^\d+(\.\d{1,2})?$/).optional()
});

export const activityArticlesRouter = Router();

activityArticlesRouter.use(authenticateAccessToken);

activityArticlesRouter.get(
  "/activities/:activityCode/articles",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = activityCodeParamSchema.parse(req.params);
    const items = await listCompanyActivityArticles({
      companyId: req.auth.companyId,
      activityCode: params.activityCode
    });
    res.status(200).json({ items });
  })
);

activityArticlesRouter.post(
  "/activities/:activityCode/articles",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = activityCodeParamSchema.parse(req.params);
    const body = articleBodySchema.parse(req.body);
    const item = await createCompanyActivityArticle(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        activityCode: params.activityCode,
        name: body.name,
        defaultMargin: body.defaultMargin
      }
    );
    res.status(201).json({ item });
  })
);

activityArticlesRouter.patch(
  "/activities/:activityCode/articles/:articleId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = articleParamSchema.parse(req.params);
    const body = articleBodySchema.parse(req.body);
    const item = await updateCompanyActivityArticle(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        articleId: params.articleId,
        name: body.name,
        defaultMargin: body.defaultMargin
      }
    );
    res.status(200).json({ item });
  })
);

activityArticlesRouter.delete(
  "/activities/:activityCode/articles/:articleId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = articleParamSchema.parse(req.params);
    await deleteCompanyActivityArticle(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        articleId: params.articleId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
