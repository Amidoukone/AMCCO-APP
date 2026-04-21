import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { logger } from "../lib/logger.js";
import { getTokenExpiryDate, signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/token.js";
import { tokenHash } from "../lib/token-hash.js";
import { verifyPassword } from "../lib/password.js";
import {
  findAuthUserByEmailAndCompanyCode,
  findRefreshSessionById,
  findUserProfileForCompany,
  revokeRefreshSession,
  upsertRefreshSession
} from "../repositories/auth.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import type { AuthContext } from "../types/auth.js";

export type ClientMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function invalidCredentialsError(): HttpError {
  return new HttpError(401, "Identifiants invalides.");
}

async function safeCreateAuditLog(input: {
  companyId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await createAuditLogRecord({
      auditId: randomUUID(),
      companyId: input.companyId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: JSON.stringify(input.metadata)
    });
  } catch (error) {
    logger.warn({ error, action: input.action }, "Audit log write failed");
  }
}

export async function login(input: {
  email: string;
  password: string;
  companyCode: string;
  meta?: ClientMeta;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; role: string; companyId: string; companyCode: string };
}> {
  const record = await findAuthUserByEmailAndCompanyCode(input.email, input.companyCode);
  if (!record) {
    throw invalidCredentialsError();
  }
  if (!record.userIsActive || !record.companyIsActive) {
    throw new HttpError(403, "Le compte utilisateur ou l'entreprise est desactive.");
  }

  const isPasswordValid = await verifyPassword(input.password, record.passwordHash);
  if (!isPasswordValid) {
    throw invalidCredentialsError();
  }

  const auth: AuthContext = {
    userId: record.userId,
    companyId: record.companyId,
    role: record.role,
    email: record.email
  };

  const sessionId = randomUUID();
  const accessToken = signAccessToken(auth);
  const refreshToken = signRefreshToken(auth, sessionId);

  await upsertRefreshSession({
    id: sessionId,
    userId: auth.userId,
    companyId: auth.companyId,
    tokenHash: tokenHash(refreshToken),
    expiresAt: getTokenExpiryDate(refreshToken),
    ipAddress: input.meta?.ipAddress ?? null,
    userAgent: input.meta?.userAgent ?? null
  });

  await safeCreateAuditLog({
    companyId: auth.companyId,
    actorId: auth.userId,
    action: "AUTH_LOGIN",
    entityType: "SESSION",
    entityId: sessionId,
    metadata: {
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null
    }
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: record.userId,
      email: record.email,
      fullName: record.fullName,
      role: record.role,
      companyId: record.companyId,
      companyCode: record.companyCode
    }
  };
}

export async function refresh(input: {
  refreshToken: string;
  meta?: ClientMeta;
}): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const payload = verifyRefreshToken(input.refreshToken);
  const session = await findRefreshSessionById(payload.sessionId);

  if (!session) {
    throw new HttpError(401, "Jeton de rafraichissement invalide.");
  }

  const now = new Date();
  if (session.revokedAt || session.expiresAt <= now) {
    throw new HttpError(401, "Jeton de rafraichissement expire ou revoque.");
  }

  if (session.tokenHash !== tokenHash(input.refreshToken)) {
    throw new HttpError(401, "Jeton de rafraichissement non reconnu.");
  }

  if (session.userId !== payload.userId || session.companyId !== payload.companyId) {
    throw new HttpError(401, "Jeton de rafraichissement hors perimetre.");
  }

  const currentProfile = await findUserProfileForCompany(payload.userId, payload.companyId);
  if (!currentProfile) {
    throw new HttpError(403, "L'utilisateur n'a plus acces a cette entreprise.");
  }

  const auth: AuthContext = {
    userId: currentProfile.userId,
    companyId: payload.companyId,
    role: currentProfile.role,
    email: currentProfile.email
  };

  const accessToken = signAccessToken(auth);
  const refreshToken = signRefreshToken(auth, payload.sessionId);

  await upsertRefreshSession({
    id: payload.sessionId,
    userId: payload.userId,
    companyId: payload.companyId,
    tokenHash: tokenHash(refreshToken),
    expiresAt: getTokenExpiryDate(refreshToken),
    ipAddress: input.meta?.ipAddress ?? null,
    userAgent: input.meta?.userAgent ?? null
  });

  await safeCreateAuditLog({
    companyId: auth.companyId,
    actorId: auth.userId,
    action: "AUTH_REFRESH",
    entityType: "SESSION",
    entityId: payload.sessionId,
    metadata: {
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null
    }
  });

  return { accessToken, refreshToken };
}

export async function logout(input: { refreshToken?: string }): Promise<void> {
  if (!input.refreshToken) {
    return;
  }
  try {
    const payload = verifyRefreshToken(input.refreshToken);
    await revokeRefreshSession(payload.sessionId);
    await safeCreateAuditLog({
      companyId: payload.companyId,
      actorId: payload.userId,
      action: "AUTH_LOGOUT",
      entityType: "SESSION",
      entityId: payload.sessionId,
      metadata: {}
    });
  } catch {
    return;
  }
}
