import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken } from "../middleware/auth.middleware.js";
import {
  deleteCurrentUserAlert,
  deleteManyCurrentUserAlerts,
  getCurrentUserAlertsSummary,
  listCurrentUserAlerts,
  markAllCurrentUserAlertsAsRead,
  markCurrentUserAlertAsRead
} from "../services/alerts.service.js";

const listAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  unreadOnly: z.enum(["true", "false"]).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(64).optional()
});

const alertIdParamSchema = z.object({
  alertId: z.string().trim().min(8).max(64)
});

const deleteManyAlertsSchema = z.object({
  alertIds: z.array(z.string().trim().min(8).max(64)).min(1).max(500)
});

export const alertsRouter = Router();

alertsRouter.use(authenticateAccessToken);

alertsRouter.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = listAlertsQuerySchema.parse(req.query);
    const result = await listCurrentUserAlerts(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        limit: query.limit,
        offset: query.offset,
        unreadOnly: query.unreadOnly === "true",
        severity: query.severity,
        entityType: query.entityType,
        entityId: query.entityId
      }
    );

    res.status(200).json(result);
  })
);

alertsRouter.get(
  "/alerts/summary",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const item = await getCurrentUserAlertsSummary({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    });

    res.status(200).json({ item });
  })
);

alertsRouter.patch(
  "/alerts/read-all",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    await markAllCurrentUserAlertsAsRead({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    });

    res.status(200).json({ status: "read-all" });
  })
);

alertsRouter.patch(
  "/alerts/:alertId/read",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = alertIdParamSchema.parse(req.params);
    await markCurrentUserAlertAsRead(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        alertId: params.alertId
      }
    );

    res.status(200).json({ status: "read" });
  })
);

alertsRouter.delete(
  "/alerts/:alertId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = alertIdParamSchema.parse(req.params);
    await deleteCurrentUserAlert(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        alertId: params.alertId
      }
    );

    res.status(200).json({ status: "deleted" });
  })
);

alertsRouter.post(
  "/alerts/delete-many",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = deleteManyAlertsSchema.parse(req.body);
    await deleteManyCurrentUserAlerts(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        alertIds: body.alertIds
      }
    );

    res.status(200).json({ status: "deleted-many" });
  })
);
