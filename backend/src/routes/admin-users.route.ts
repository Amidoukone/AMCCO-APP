import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  changeCompanyUserRole,
  createCompanyUser,
  deleteCompanyUser,
  listUsersForCompany,
  resetCompanyUserPassword,
  updateCompanyUser
} from "../services/admin-users.service.js";
import { ROLE_CODES } from "../types/role.js";
import { HttpError } from "../errors/http-error.js";

const userIdParamSchema = z.object({
  userId: z.string().trim().min(8).max(64)
});

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(ROLE_CODES)
});

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => typeof value.fullName === "string" || typeof value.isActive === "boolean", {
    message: "Au moins un champ doit etre fourni."
  });

const changeRoleSchema = z.object({
  role: z.enum(ROLE_CODES)
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

export const adminUsersRouter = Router();

adminUsersRouter.use("/admin/users", authenticateAccessToken, authorizeRoles("OWNER", "SYS_ADMIN"));

adminUsersRouter.get(
  "/admin/users",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const items = await listUsersForCompany(req.auth.companyId);
    res.status(200).json({ items });
  })
);

adminUsersRouter.post(
  "/admin/users",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = createUserSchema.parse(req.body);
    const item = await createCompanyUser(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId
      },
      {
        email: body.email,
        fullName: body.fullName,
        password: body.password,
        role: body.role
      }
    );

    res.status(201).json({ item });
  })
);

adminUsersRouter.patch(
  "/admin/users/:userId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = userIdParamSchema.parse(req.params);
    const body = updateUserSchema.parse(req.body);

    const item = await updateCompanyUser(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId
      },
      {
        userId: params.userId,
        fullName: body.fullName,
        isActive: body.isActive
      }
    );

    res.status(200).json({ item });
  })
);

adminUsersRouter.patch(
  "/admin/users/:userId/role",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = userIdParamSchema.parse(req.params);
    const body = changeRoleSchema.parse(req.body);

    const item = await changeCompanyUserRole(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId
      },
      {
        userId: params.userId,
        role: body.role
      }
    );

    res.status(200).json({ item });
  })
);

adminUsersRouter.patch(
  "/admin/users/:userId/password",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = userIdParamSchema.parse(req.params);
    const body = resetPasswordSchema.parse(req.body);

    await resetCompanyUserPassword(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId
      },
      {
        userId: params.userId,
        newPassword: body.newPassword
      }
    );

    res.status(200).json({ status: "password_reset" });
  })
);

adminUsersRouter.delete(
  "/admin/users/:userId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = userIdParamSchema.parse(req.params);
    await deleteCompanyUser(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId
      },
      params.userId
    );

    res.status(200).json({ status: "deleted" });
  })
);
