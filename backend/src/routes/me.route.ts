import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { HttpError } from "../errors/http-error.js";
import { isBootstrapCompanyId } from "../lib/bootstrap-auth.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  findCompanyById,
  listUserCompanyMemberships
} from "../repositories/companies.repository.js";
import { findActiveUserById, findUserProfileForCompany } from "../repositories/auth.repository.js";

export const meRouter = Router();

meRouter.get(
  "/me",
  authenticateAccessToken,
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const memberships = await listUserCompanyMemberships(req.auth.userId);

    if (isBootstrapCompanyId(req.auth.companyId)) {
      const bootstrapUser = await findActiveUserById(req.auth.userId);
      if (!bootstrapUser) {
        throw new HttpError(404, "Utilisateur introuvable.");
      }

      res.status(200).json({
        user: {
          id: bootstrapUser.userId,
          email: bootstrapUser.email,
          fullName: bootstrapUser.fullName,
          role: req.auth.role
        },
        company: null,
        memberships,
        bootstrapMode: true
      });
      return;
    }

    const profile = await findUserProfileForCompany(req.auth.userId, req.auth.companyId);
    if (!profile) {
      throw new HttpError(404, "Profil utilisateur introuvable pour cette entreprise.");
    }
    const company = await findCompanyById(req.auth.companyId);
    if (!company || !company.isActive) {
      throw new HttpError(404, "Entreprise active introuvable.");
    }

    res.status(200).json({
      user: {
        id: profile.userId,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role
      },
      company,
      memberships,
      bootstrapMode: false
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
