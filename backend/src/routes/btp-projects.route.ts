import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createCompanyBtpProject,
  deleteCompanyBtpProject,
  listCompanyBtpProjects,
  updateCompanyBtpProject
} from "../services/btp-projects.service.js";

const projectParamSchema = z.object({
  projectId: z.string().trim().min(8).max(64)
});

const projectListQuerySchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional()
});

const projectBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientRef: z.string().trim().max(160).optional(),
  contractRef: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional()
});

const projectUpdateBodySchema = projectBodySchema.extend({
  isActive: z.boolean().optional()
});

export const btpProjectsRouter = Router();

btpProjectsRouter.use(authenticateAccessToken);

btpProjectsRouter.get(
  "/btp/projects",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = projectListQuerySchema.parse(req.query);
    const items = await listCompanyBtpProjects({
      companyId: req.auth.companyId,
      activeOnly: query.activeOnly === "true"
    });
    res.status(200).json({ items });
  })
);

btpProjectsRouter.post(
  "/btp/projects",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = projectBodySchema.parse(req.body);
    const item = await createCompanyBtpProject(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      body
    );
    res.status(201).json({ item });
  })
);

btpProjectsRouter.patch(
  "/btp/projects/:projectId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = projectParamSchema.parse(req.params);
    const body = projectUpdateBodySchema.parse(req.body);
    const item = await updateCompanyBtpProject(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        projectId: params.projectId,
        name: body.name,
        clientRef: body.clientRef,
        contractRef: body.contractRef,
        location: body.location,
        isActive: body.isActive ?? true
      }
    );
    res.status(200).json({ item });
  })
);

btpProjectsRouter.delete(
  "/btp/projects/:projectId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = projectParamSchema.parse(req.params);
    await deleteCompanyBtpProject(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        projectId: params.projectId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
