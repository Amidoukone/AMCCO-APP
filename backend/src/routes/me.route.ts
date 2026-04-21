import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { HttpError } from "../errors/http-error.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { findUserProfileForCompany } from "../repositories/auth.repository.js";

export const meRouter = Router();

meRouter.get(
  "/me",
  authenticateAccessToken,
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const profile = await findUserProfileForCompany(req.auth.userId, req.auth.companyId);
    if (!profile) {
      throw new HttpError(404, "Profil utilisateur introuvable pour cette entreprise.");
    }

    res.status(200).json({
      user: {
        id: profile.userId,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role
      },
      companyId: req.auth.companyId
    });
  })
);

meRouter.get(
  "/admin/ping",
  authenticateAccessToken,
  authorizeRoles("OWNER", "SYS_ADMIN"),
  asyncHandler(async (_req, res) => {
    res.status(200).json({
      status: "ok",
      scope: "admin"
    });
  })
);
