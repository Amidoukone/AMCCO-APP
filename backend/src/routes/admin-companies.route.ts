import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { HttpError } from "../errors/http-error.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createCompanyForActor,
  deleteCompanyForActor,
  listAccessibleCompanies
  ,
  updateCompanyForActor
} from "../services/companies.service.js";

const companyIdParamSchema = z.object({
  companyId: z.string().trim().min(8).max(64)
});

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().max(64).optional().or(z.literal("")),
  legalName: z.string().trim().max(255).optional(),
  registrationNumber: z.string().trim().max(128).optional(),
  taxId: z.string().trim().max(128).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(64).optional(),
  website: z.string().trim().max(255).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(120).optional(),
  stateRegion: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(32).optional(),
  country: z.string().trim().max(120).optional(),
  businessSector: z.string().trim().max(120).optional(),
  contactFullName: z.string().trim().max(255).optional(),
  contactJobTitle: z.string().trim().max(255).optional()
});

const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    legalName: z.string().trim().max(255).optional(),
    registrationNumber: z.string().trim().max(128).optional(),
    taxId: z.string().trim().max(128).optional(),
    email: z.string().trim().email().max(255).optional().or(z.literal("")),
    phone: z.string().trim().max(64).optional(),
    website: z.string().trim().max(255).optional(),
    addressLine1: z.string().trim().max(255).optional(),
    addressLine2: z.string().trim().max(255).optional(),
    city: z.string().trim().max(120).optional(),
    stateRegion: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(32).optional(),
    country: z.string().trim().max(120).optional(),
    businessSector: z.string().trim().max(120).optional(),
    contactFullName: z.string().trim().max(255).optional(),
    contactJobTitle: z.string().trim().max(255).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Au moins un champ doit etre fourni."
  });

export const adminCompaniesRouter = Router();

adminCompaniesRouter.use(
  "/admin/companies",
  authenticateAccessToken,
  authorizeRoles("OWNER", "SYS_ADMIN")
);

adminCompaniesRouter.get(
  "/admin/companies",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const items = await listAccessibleCompanies(req.auth);
    res.status(200).json({ items });
  })
);

adminCompaniesRouter.post(
  "/admin/companies",
  authorizeRoles("SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = createCompanySchema.parse(req.body);
    const item = await createCompanyForActor(req.auth, body);
    res.status(201).json({ item });
  })
);

adminCompaniesRouter.patch(
  "/admin/companies/:companyId",
  authorizeRoles("SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = companyIdParamSchema.parse(req.params);
    const body = updateCompanySchema.parse(req.body);
    const item = await updateCompanyForActor(req.auth, {
      companyId: params.companyId,
      ...body
    });

    res.status(200).json({ item });
  })
);

adminCompaniesRouter.delete(
  "/admin/companies/:companyId",
  authorizeRoles("SYS_ADMIN"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = companyIdParamSchema.parse(req.params);
    await deleteCompanyForActor(req.auth, {
      companyId: params.companyId
    });

    res.status(200).json({ status: "deleted" });
  })
);
