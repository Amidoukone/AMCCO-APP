import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { listCompanyAuditLogs } from "../services/audit.service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().trim().min(8).max(64).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(64).optional()
});

export const adminAuditRouter = Router();

adminAuditRouter.use("/admin/audit-logs", authenticateAccessToken, authorizeRoles("OWNER", "SYS_ADMIN"));

adminAuditRouter.get(
  "/admin/audit-logs",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = querySchema.parse(req.query);
    const items = await listCompanyAuditLogs({
      companyId: req.auth.companyId,
      limit: query.limit,
      offset: query.offset,
      action: query.action,
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId
    });

    res.status(200).json({ items });
  })
);
