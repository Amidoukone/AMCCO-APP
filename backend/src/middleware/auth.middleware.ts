import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/http-error.js";
import { isBootstrapCompanyId } from "../lib/bootstrap-auth.js";
import { verifyAccessToken } from "../lib/token.js";
import { findActiveUserById, findUserProfileForCompany } from "../repositories/auth.repository.js";
import type { RoleCode } from "../types/role.js";

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

export async function authenticateAccessToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next(new HttpError(401, "En-tete d'autorisation manquant ou invalide."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (isBootstrapCompanyId(payload.companyId)) {
      const bootstrapUser = await findActiveUserById(payload.userId);
      if (!bootstrapUser) {
        next(new HttpError(401, "Session d'initialisation invalide."));
        return;
      }

      req.auth = {
        userId: bootstrapUser.userId,
        companyId: payload.companyId,
        role: payload.role,
        email: bootstrapUser.email,
        fullName: bootstrapUser.fullName
      };
      next();
      return;
    }

    const currentProfile = await findUserProfileForCompany(payload.userId, payload.companyId);
    if (!currentProfile) {
      next(new HttpError(401, "Session invalide pour cette entreprise."));
      return;
    }

    req.auth = {
      userId: currentProfile.userId,
      companyId: payload.companyId,
      role: currentProfile.role,
      email: currentProfile.email,
      fullName: currentProfile.fullName
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, "Jeton d'acces invalide ou expire."));
  }
}

export function authorizeRoles(...allowedRoles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, "Authentification requise."));
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      next(new HttpError(403, "Permissions insuffisantes."));
      return;
    }

    next();
  };
}
