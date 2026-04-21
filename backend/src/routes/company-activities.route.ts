import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  getCompanyActivityProfile,
  getAdminCompanyActivities,
  listAvailableCompanyActivities,
  reclassifyLegacyCompanyData,
  updateCompanyActivityState
} from "../services/company-activities.service.js";

const activityCodeParamSchema = z.object({
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES)
});

const updateActivitySchema = z.object({
  isEnabled: z.boolean()
});

const reclassifyLegacySchema = z.object({
  targetActivityCode: z.enum(BUSINESS_ACTIVITY_CODES),
  scope: z.enum(["TRANSACTIONS", "TASKS", "BOTH"])
});

export const companyActivitiesRouter = Router();

companyActivitiesRouter.use(authenticateAccessToken);

companyActivitiesRouter.get(
  "/activities",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const payload = await listAvailableCompanyActivities(req.auth.companyId);
    res.status(200).json(payload);
  })
);

companyActivitiesRouter.get(
  "/activities/:activityCode/profile",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = activityCodeParamSchema.parse(req.params);
    const item = getCompanyActivityProfile(params.activityCode);
    res.status(200).json({ item });
  })
);

companyActivitiesRouter.get(
  "/admin/activities",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const payload = await getAdminCompanyActivities({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    });

    res.status(200).json(payload);
  })
);

companyActivitiesRouter.patch(
  "/admin/activities/:activityCode",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = activityCodeParamSchema.parse(req.params);
    const body = updateActivitySchema.parse(req.body);

    const item = await updateCompanyActivityState(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        activityCode: params.activityCode,
        isEnabled: body.isEnabled
      }
    );

    res.status(200).json({ item });
  })
);

companyActivitiesRouter.post(
  "/admin/activities/reclassify-legacy",
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = reclassifyLegacySchema.parse(req.body);
    const item = await reclassifyLegacyCompanyData(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        targetActivityCode: body.targetActivityCode,
        scope: body.scope
      }
    );

    res.status(200).json({ item });
  })
);
