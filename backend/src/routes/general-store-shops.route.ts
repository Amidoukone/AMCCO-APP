import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  createCompanyGeneralStoreShop,
  deleteCompanyGeneralStoreShop,
  listCompanyGeneralStoreShops,
  updateCompanyGeneralStoreShop
} from "../services/general-store-shops.service.js";

const shopParamSchema = z.object({
  shopId: z.string().trim().min(8).max(64)
});

const shopListQuerySchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional()
});

const shopBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional()
});

const shopUpdateBodySchema = shopBodySchema.extend({
  isActive: z.boolean().optional()
});

export const generalStoreShopsRouter = Router();

generalStoreShopsRouter.use(authenticateAccessToken);

generalStoreShopsRouter.get(
  "/general-store/shops",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const query = shopListQuerySchema.parse(req.query);
    const items = await listCompanyGeneralStoreShops({
      companyId: req.auth.companyId,
      activeOnly: query.activeOnly === "true"
    });
    res.status(200).json({ items });
  })
);

generalStoreShopsRouter.post(
  "/general-store/shops",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const body = shopBodySchema.parse(req.body);
    const item = await createCompanyGeneralStoreShop(
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

generalStoreShopsRouter.patch(
  "/general-store/shops/:shopId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = shopParamSchema.parse(req.params);
    const body = shopUpdateBodySchema.parse(req.body);
    const item = await updateCompanyGeneralStoreShop(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        shopId: params.shopId,
        name: body.name,
        location: body.location,
        phone: body.phone,
        isActive: body.isActive ?? true
      }
    );
    res.status(200).json({ item });
  })
);

generalStoreShopsRouter.delete(
  "/general-store/shops/:shopId",
  authorizeRoles("SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }

    const params = shopParamSchema.parse(req.params);
    await deleteCompanyGeneralStoreShop(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        shopId: params.shopId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);
