import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createGeneralStoreShop,
  deleteGeneralStoreShop,
  findGeneralStoreShopById,
  listGeneralStoreShops,
  updateGeneralStoreShop
} from "../repositories/general-store-shops.repository.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

type MysqlError = {
  code?: string;
};

function mysqlErrorCode(error: unknown): string | undefined {
  return (error as MysqlError).code;
}

function canManageGeneralStoreShops(role: RoleCode): boolean {
  return role === "SYS_ADMIN" || role === "ACCOUNTANT" || role === "SUPERVISOR";
}

export async function listCompanyGeneralStoreShops(input: {
  companyId: string;
  activeOnly?: boolean;
}) {
  return listGeneralStoreShops(input);
}

export async function createCompanyGeneralStoreShop(
  actor: ActorContext,
  input: {
    name: string;
    location?: string;
    phone?: string;
  }
) {
  if (!canManageGeneralStoreShops(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour créer une boutique.");
  }

  const shopId = randomUUID();
  try {
    await createGeneralStoreShop({
      id: shopId,
      companyId: actor.companyId,
      name: input.name.trim(),
      location: input.location?.trim() || null,
      phone: input.phone?.trim() || null
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Une boutique avec ce nom existe déjà.");
    }
    throw error;
  }

  const created = await findGeneralStoreShopById(actor.companyId, shopId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger la boutique créée.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "GENERAL_STORE_SHOP_CREATED",
    entityType: "GENERAL_STORE_SHOP",
    entityId: created.id,
    metadataJson: JSON.stringify({
      name: created.name,
      location: created.location
    })
  });

  return created;
}

export async function updateCompanyGeneralStoreShop(
  actor: ActorContext,
  input: {
    shopId: string;
    name: string;
    location?: string;
    phone?: string;
    isActive: boolean;
  }
) {
  if (!canManageGeneralStoreShops(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier une boutique.");
  }

  const existing = await findGeneralStoreShopById(actor.companyId, input.shopId);
  if (!existing) {
    throw new HttpError(404, "Boutique introuvable.");
  }

  try {
    await updateGeneralStoreShop({
      companyId: actor.companyId,
      shopId: input.shopId,
      name: input.name.trim(),
      location: input.location?.trim() || null,
      phone: input.phone?.trim() || null,
      isActive: input.isActive
    });
  } catch (error) {
    if (mysqlErrorCode(error) === "ER_DUP_ENTRY") {
      throw new HttpError(409, "Une boutique avec ce nom existe déjà.");
    }
    throw error;
  }

  const updated = await findGeneralStoreShopById(actor.companyId, input.shopId);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la boutique modifiée.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "GENERAL_STORE_SHOP_UPDATED",
    entityType: "GENERAL_STORE_SHOP",
    entityId: updated.id,
    metadataJson: JSON.stringify({
      name: updated.name,
      location: updated.location,
      isActive: updated.isActive
    })
  });

  return updated;
}

export async function deleteCompanyGeneralStoreShop(
  actor: ActorContext,
  input: {
    shopId: string;
  }
) {
  if (!canManageGeneralStoreShops(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer une boutique.");
  }

  const existing = await findGeneralStoreShopById(actor.companyId, input.shopId);
  if (!existing) {
    throw new HttpError(404, "Boutique introuvable.");
  }

  await deleteGeneralStoreShop({
    companyId: actor.companyId,
    shopId: input.shopId
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "GENERAL_STORE_SHOP_DELETED",
    entityType: "GENERAL_STORE_SHOP",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      name: existing.name
    })
  });
}
