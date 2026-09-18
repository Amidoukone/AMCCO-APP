import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createCompanyRentalTenant,
  deleteCompanyRentalTenant,
  listCompanyRentalTenants,
  updateCompanyRentalTenant
} from "../services/rental-tenants.service.js";

const tenantParamSchema = z.object({
  tenantId: z.string().trim().min(8).max(64)
});

const tenantListQuerySchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional()
});

const tenantBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  unitLabel: z.string().trim().min(1).max(160),
  monthlyRent: z.string().regex(/^\d+(\.\d{1,2})?$/),
  phone: z.string().trim().max(40).optional(),
  tenancyStart: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

const tenantUpdateBodySchema = tenantBodySchema.extend({
  isActive: z.boolean().optional()
});

export const rentalTenantsRouter = Router();

rentalTenantsRouter.use(authenticateAccessToken);

rentalTenantsRouter.get(
  "/rental/tenants",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = tenantListQuerySchema.parse(req.query);
    const items = await listCompanyRentalTenants({
      companyId: req.auth.companyId,
      activeOnly: query.activeOnly === "true"
    });
    res.status(200).json({ items });
  })
);

rentalTenantsRouter.post(
  "/rental/tenants",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = tenantBodySchema.parse(req.body);
    const item = await createCompanyRentalTenant(
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

rentalTenantsRouter.patch(
  "/rental/tenants/:tenantId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = tenantParamSchema.parse(req.params);
    const body = tenantUpdateBodySchema.parse(req.body);
    const item = await updateCompanyRentalTenant(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        tenantId: params.tenantId,
        name: body.name,
        unitLabel: body.unitLabel,
        monthlyRent: body.monthlyRent,
        phone: body.phone,
        tenancyStart: body.tenancyStart,
        isActive: body.isActive ?? true
      }
    );
    res.status(200).json({ item });
  })
);

rentalTenantsRouter.delete(
  "/rental/tenants/:tenantId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = tenantParamSchema.parse(req.params);
    await deleteCompanyRentalTenant(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        tenantId: params.tenantId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
