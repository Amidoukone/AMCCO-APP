import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { login, logout, refresh, switchCompany } from "../services/auth.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
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
  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgentHeader ?? null
  };
}

export const authRouter = Router();

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await login({
      email: body.email.toLowerCase(),
      password: body.password,
      meta: getRequestMeta(req)
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
