import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { BOOTSTRAP_COMPANY_CODE, BOOTSTRAP_COMPANY_ID, isBootstrapCompanyId } from "../lib/bootstrap-auth.js";
import { logger } from "../lib/logger.js";
import { getTokenExpiryDate, signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/token.js";
import { tokenHash } from "../lib/token-hash.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  countActiveCompanies,
  findActiveUserAuthById,
  findActiveUserByEmail,
  findActiveUserById,
  listActiveAuthUsersByEmail,
  findRefreshSessionById,
  findUserProfileForCompany,
  revokeRefreshSession,
  upsertRefreshSession
} from "../repositories/auth.repository.js";
import { findUserCompanyMembership } from "../repositories/companies.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import { updateUserPasswordHash } from "../repositories/admin-users.repository.js";
import type { AuthContext } from "../types/auth.js";
import type { AuthUserRecord } from "../repositories/auth.repository.js";
import type { RoleCode } from "../types/role.js";

export type ClientMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
  clientLoginDiagnostics?: string | null;
  loginInput?: {
    emailLength: number | null;
    passwordLength: number | null;
    passwordHadOuterWhitespace: boolean | null;
    passwordHadZeroWidthCharacters: boolean | null;
    passwordHadNonAsciiCharacters: boolean | null;
  };
};

function invalidCredentialsError(): HttpError {
  return new HttpError(401, "Identifiants invalides.");
}

function getEmailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}

function logInvalidLogin(
  reason: "user_not_found" | "bootstrap_user_not_found" | "password_mismatch" | "bootstrap_password_mismatch",
  input: {
    email: string;
    meta?: ClientMeta;
  }
): void {
  logger.warn(
    {
      event: "auth_login_failed",
      reason,
      emailHash: getEmailHash(input.email),
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null,
      clientLoginDiagnostics: input.meta?.clientLoginDiagnostics ?? null,
      input: input.meta?.loginInput ?? null
    },
    "Login failed"
  );
}

function getRolePriority(role: RoleCode): number {
  switch (role) {
    case "OWNER":
      return 0;
    case "SYS_ADMIN":
      return 1;
    case "ACCOUNTANT":
      return 2;
    case "SUPERVISOR":
      return 3;
    case "EMPLOYEE":
    default:
      return 4;
  }
}

export function pickPreferredAuthUser(
  records: AuthUserRecord[],
  preferredCompanyCode = "AMCCO"
): AuthUserRecord | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    const rolePriorityDiff = getRolePriority(left.role) - getRolePriority(right.role);
    if (rolePriorityDiff !== 0) {
      return rolePriorityDiff;
    }

    const preferredCompanyDiff =
      Number(left.companyCode !== preferredCompanyCode) -
      Number(right.companyCode !== preferredCompanyCode);
    if (preferredCompanyDiff !== 0) {
      return preferredCompanyDiff;
    }

    return left.companyCode.localeCompare(right.companyCode);
  })[0];
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
  meta?: ClientMeta;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    companyId: string;
    companyCode: string;
    bootstrapMode: boolean;
  };
}> {
  const authCandidates = await listActiveAuthUsersByEmail(input.email);
  const record = pickPreferredAuthUser(authCandidates, "AMCCO");
  if (!record) {
    const activeCompaniesCount = await countActiveCompanies();
    if (activeCompaniesCount > 0) {
      logInvalidLogin("user_not_found", input);
      throw invalidCredentialsError();
    }

    const bootstrapUser = await findActiveUserByEmail(input.email);
    if (!bootstrapUser) {
      logInvalidLogin("bootstrap_user_not_found", input);
      throw invalidCredentialsError();
    }

    const isPasswordValid = await verifyPassword(input.password, bootstrapUser.passwordHash);
    if (!isPasswordValid) {
      logInvalidLogin("bootstrap_password_mismatch", input);
      throw invalidCredentialsError();
    }

    const auth: AuthContext = {
      userId: bootstrapUser.userId,
      companyId: BOOTSTRAP_COMPANY_ID,
      role: "OWNER",
      email: bootstrapUser.email,
      fullName: bootstrapUser.fullName
    };

    const sessionId = randomUUID();
    const accessToken = signAccessToken(auth);
    const refreshToken = signRefreshToken(auth, sessionId);

    await upsertRefreshSession({
      id: sessionId,
      userId: auth.userId,
      companyId: null,
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
        bootstrapMode: true,
        ipAddress: input.meta?.ipAddress ?? null,
        userAgent: input.meta?.userAgent ?? null
      }
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: bootstrapUser.userId,
        email: bootstrapUser.email,
        fullName: bootstrapUser.fullName,
        role: auth.role,
        companyId: BOOTSTRAP_COMPANY_ID,
        companyCode: BOOTSTRAP_COMPANY_CODE,
        bootstrapMode: true
      }
    };
  }
  if (!record.userIsActive || !record.companyIsActive) {
    throw new HttpError(403, "Le compte utilisateur ou l'entreprise est désactivé.");
  }

  const isPasswordValid = await verifyPassword(input.password, record.passwordHash);
  if (!isPasswordValid) {
    logInvalidLogin("password_mismatch", input);
    throw invalidCredentialsError();
  }

  const auth: AuthContext = {
    userId: record.userId,
    companyId: record.companyId,
    role: record.role,
    email: record.email,
    fullName: record.fullName
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
      companyCode: record.companyCode,
      bootstrapMode: false
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

  const expectedCompanyId = session.companyId ?? BOOTSTRAP_COMPANY_ID;
  if (session.userId !== payload.userId || expectedCompanyId !== payload.companyId) {
    throw new HttpError(401, "Jeton de rafraichissement hors périmètre.");
  }

  if (isBootstrapCompanyId(payload.companyId)) {
    const bootstrapUser = await findActiveUserById(payload.userId);
    if (!bootstrapUser) {
      throw new HttpError(403, "L'utilisateur n'est plus actif.");
    }

    const auth: AuthContext = {
      userId: bootstrapUser.userId,
      companyId: BOOTSTRAP_COMPANY_ID,
      role: "OWNER",
      email: bootstrapUser.email,
      fullName: bootstrapUser.fullName
    };

    const accessToken = signAccessToken(auth);
    const refreshToken = signRefreshToken(auth, payload.sessionId);

    await upsertRefreshSession({
      id: payload.sessionId,
      userId: payload.userId,
      companyId: null,
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
        bootstrapMode: true,
        ipAddress: input.meta?.ipAddress ?? null,
        userAgent: input.meta?.userAgent ?? null
      }
    });

    return { accessToken, refreshToken };
  }

  const currentProfile = await findUserProfileForCompany(payload.userId, payload.companyId);
  if (!currentProfile) {
    throw new HttpError(403, "L'utilisateur n'a plus accès à cette entreprise.");
  }

  const auth: AuthContext = {
    userId: currentProfile.userId,
    companyId: payload.companyId,
    role: currentProfile.role,
    email: currentProfile.email,
    fullName: currentProfile.fullName
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

export async function switchCompany(input: {
  refreshToken: string;
  targetCompanyId: string;
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

  const targetMembership = await findUserCompanyMembership({
    userId: payload.userId,
    companyId: input.targetCompanyId
  });
  if (!targetMembership || !targetMembership.company.isActive) {
    throw new HttpError(403, "Aucun accès à l'entreprise cible.");
  }

  const auth: AuthContext = {
    userId: payload.userId,
    companyId: targetMembership.company.id,
    role: targetMembership.role,
    email: payload.email,
    fullName: payload.fullName
  };

  await revokeRefreshSession(payload.sessionId);

  const nextSessionId = randomUUID();
  const accessToken = signAccessToken(auth);
  const refreshToken = signRefreshToken(auth, nextSessionId);

  await upsertRefreshSession({
    id: nextSessionId,
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
    action: "AUTH_COMPANY_SWITCH",
    entityType: "SESSION",
    entityId: nextSessionId,
    metadata: {
      fromCompanyId: payload.companyId,
      toCompanyId: auth.companyId,
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

export async function changeOwnPassword(input: {
  userId: string;
  companyId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await findActiveUserAuthById(input.userId);
  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable.");
  }

  const currentPassword = input.currentPassword.trim();
  const newPassword = input.newPassword.trim();

  if (currentPassword.length === 0) {
    throw new HttpError(400, "Le mot de passe actuel est requis.");
  }

  if (newPassword.length < 8) {
    throw new HttpError(400, "Le nouveau mot de passe doit contenir au moins 8 caracteres.");
  }

  if (currentPassword === newPassword) {
    throw new HttpError(400, "Le nouveau mot de passe doit être différent de l'ancien.");
  }

  const isPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    throw new HttpError(400, "Le mot de passe actuel est incorrect.");
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPasswordHash({
    userId: input.userId,
    passwordHash
  });

  await safeCreateAuditLog({
    companyId: input.companyId,
    actorId: input.userId,
    action: "AUTH_PASSWORD_CHANGED",
    entityType: "USER",
    entityId: input.userId,
    metadata: {
      email: user.email
    }
  });
}
