import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { ROLE_CODES } from "../types/role.js";
import type { AccessTokenPayload, AuthContext, RefreshTokenPayload } from "../types/auth.js";

const baseAuthPayloadSchema = z.object({
  userId: z.string().min(1),
  companyId: z.string().min(1),
  role: z.enum(ROLE_CODES),
  email: z.string().email(),
  fullName: z.string().min(1).optional()
});

const accessTokenSchema = baseAuthPayloadSchema.extend({
  type: z.literal("access")
});

const refreshTokenSchema = baseAuthPayloadSchema.extend({
  type: z.literal("refresh"),
  sessionId: z.string().uuid()
});

function parseVerifiedPayload<T>(
  token: string,
  secret: string,
  schema: z.ZodType<T>
): T {
  const decoded = jwt.verify(token, secret) as JwtPayload | string;
  if (typeof decoded === "string") {
    throw new Error("Charge utile du jeton invalide");
  }
  return schema.parse(decoded);
}

export function signAccessToken(auth: AuthContext): string {
  const payload: AccessTokenPayload = { ...auth, type: "access" };
  const expiresIn: SignOptions["expiresIn"] = env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn });
}

export function signRefreshToken(auth: AuthContext, sessionId: string): string {
  const payload: RefreshTokenPayload = { ...auth, type: "refresh", sessionId };
  const expiresIn: SignOptions["expiresIn"] = env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return parseVerifiedPayload(token, env.JWT_ACCESS_SECRET, accessTokenSchema);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return parseVerifiedPayload(token, env.JWT_REFRESH_SECRET, refreshTokenSchema);
}

export function getTokenExpiryDate(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | string | null;
  if (!decoded || typeof decoded === "string" || typeof decoded.exp !== "number") {
    throw new Error("Le jeton ne contient pas de date d'expiration");
  }
  return new Date(decoded.exp * 1000);
}
