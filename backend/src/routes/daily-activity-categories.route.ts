import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createCompanyDailyActivityCategory,
  deleteCompanyDailyActivityCategory,
  listCompanyDailyActivityCategories,
  updateCompanyDailyActivityCategory
} from "../services/daily-activity-categories.service.js";

const categoryParamSchema = z.object({
  categoryId: z.string().trim().min(8).max(64)
});

const categoryListQuerySchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional()
});

const categoryBodySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

const categoryUpdateBodySchema = categoryBodySchema.extend({
  isActive: z.boolean().optional()
});

export const dailyActivityCategoriesRouter = Router();

dailyActivityCategoriesRouter.use(authenticateAccessToken);

dailyActivityCategoriesRouter.get(
  "/daily-activities/categories",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = categoryListQuerySchema.parse(req.query);
    const items = await listCompanyDailyActivityCategories({
      companyId: req.auth.companyId,
      activeOnly: query.activeOnly === "true"
    });
    res.status(200).json({ items });
  })
);

dailyActivityCategoriesRouter.post(
  "/daily-activities/categories",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = categoryBodySchema.parse(req.body);
    const item = await createCompanyDailyActivityCategory(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      body
    );
    res.status(201).json({ item });
  })
);

dailyActivityCategoriesRouter.patch(
  "/daily-activities/categories/:categoryId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = categoryParamSchema.parse(req.params);
    const body = categoryUpdateBodySchema.parse(req.body);
    const item = await updateCompanyDailyActivityCategory(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        categoryId: params.categoryId,
        name: body.name,
        isActive: body.isActive ?? true
      }
    );
    res.status(200).json({ item });
  })
);

dailyActivityCategoriesRouter.delete(
  "/daily-activities/categories/:categoryId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = categoryParamSchema.parse(req.params);
    await deleteCompanyDailyActivityCategory(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        categoryId: params.categoryId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
