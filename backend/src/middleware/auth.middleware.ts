import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/http-error.js";
import { verifyAccessToken } from "../lib/token.js";
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

export function authenticateAccessToken(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    next(new HttpError(401, "En-tete d'autorisation manquant ou invalide."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
      email: payload.email
    };
    next();
  } catch {
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
