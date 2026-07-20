import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler } from "../lib/async-handler.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { login, logout, refresh, switchCompany } from "../services/auth.service.js";

function normalizeLoginEmail(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function normalizeLoginPassword(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function getStringPayloadValue(body: unknown, key: "email" | "password"): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function buildLoginInputDiagnostics(body: unknown) {
  const email = getStringPayloadValue(body, "email");
  const password = getStringPayloadValue(body, "password");

  return {
    emailLength: email === null ? null : Array.from(email).length,
    passwordLength: password === null ? null : Array.from(password).length,
    passwordHadOuterWhitespace: password === null ? null : password !== password.trim(),
    passwordHadZeroWidthCharacters: password === null ? null : /[\u200B-\u200D\uFEFF]/.test(password),
    passwordHadNonAsciiCharacters: password === null ? null : /[^\x20-\x7E]/.test(password)
  };
}

const loginSchema = z.object({
  email: z.string().transform(normalizeLoginEmail).pipe(z.string().email()),
  password: z.string().transform(normalizeLoginPassword).pipe(z.string().min(1))
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

const switchCompanySchema = z.object({
  refreshToken: z.string().min(20),
  targetCompanyId: z.string().uuid()
});

function getRequestMeta(req: { ip?: string; get: (name: string) => string | undefined }) {
  const userAgentHeader = req.get("user-agent");
  const clientLoginDiagnosticsHeader = req.get("x-amcco-login-diagnostics");
  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgentHeader ?? null,
    clientLoginDiagnostics: clientLoginDiagnosticsHeader ?? null
  };
}

export const authRouter = Router();
const authRateLimit = createRateLimitMiddleware({
  maxAttempts: env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  message: "Trop de tentatives d'authentification. Réessayez dans quelques minutes."
});

authRouter.post(
  "/auth/login",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await login({
      email: body.email,
      password: body.password,
      meta: {
        ...getRequestMeta(req),
        loginInput: buildLoginInputDiagnostics(req.body)
      }
    });
    res.status(200).json(result);
  })
);

authRouter.post(
  "/auth/switch-company",
  asyncHandler(async (req, res) => {
    const body = switchCompanySchema.parse(req.body);
    const result = await switchCompany({
      refreshToken: body.refreshToken,
      targetCompanyId: body.targetCompanyId,
      meta: getRequestMeta(req)
    });
    res.status(200).json(result);
  })
);

authRouter.post(
  "/auth/refresh",
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body);
    const result = await refresh({
      refreshToken: body.refreshToken,
      meta: getRequestMeta(req)
    });
    res.status(200).json(result);
  })
);

authRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const body = logoutSchema.parse(req.body ?? {});
    await logout({ refreshToken: body.refreshToken });
    res.status(200).json({ status: "logged_out" });
  })
);
