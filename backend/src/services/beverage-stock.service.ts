import { HttpError } from "../errors/http-error.js";
import { env } from "../config/env.js";
import type { RoleCode } from "../types/role.js";
import {
  archiveBeverageProduct,
  cancelBeverageStockLoss,
  countBeverageProduct,
  createBeverageProduct,
  listBeverageProducts,
  listBeverageStockLosses,
  recordBeverageStockLoss
} from "../repositories/beverage-stock.repository.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";

type Actor = { companyId: string; actorId: string; role: RoleCode };
const readers: RoleCode[] = ["SYS_ADMIN", "OWNER", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE", "BEVERAGE_DEPOT_OPERATOR"];
const writers: RoleCode[] = ["SYS_ADMIN", "ACCOUNTANT", "BEVERAGE_DEPOT_OPERATOR"];

function isProductArchiveEnabled(): boolean {
  return env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED ?? env.NODE_ENV !== "production";
}

export async function getCompanyBeverageStock(actor: Actor) {
  if (!readers.includes(actor.role)) throw new HttpError(403, "Accès au stock du dépôt non autorisé.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  return listBeverageProducts(actor.companyId);
}

export async function getCompanyBeverageStockOverview(actor: Actor) {
  if (!readers.includes(actor.role)) throw new HttpError(403, "Accès au stock du dépôt non autorisé.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  const [items, losses] = await Promise.all([
    listBeverageProducts(actor.companyId),
    listBeverageStockLosses(actor.companyId, { limit: 50 })
  ]);
  return { items, losses, canArchiveProducts: writers.includes(actor.role) && isProductArchiveEnabled() };
}

export async function listCompanyBeverageLosses(actor: Actor, filters: { dateFrom?: string; dateTo?: string; limit?: number } = {}) {
  if (!readers.includes(actor.role)) throw new HttpError(403, "Accès au stock du dépôt non autorisé.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  return listBeverageStockLosses(actor.companyId, filters);
}

export async function addCompanyBeverageProduct(actor: Actor, input: {
  name: string; unit: string; openingQuantity: string; openingUnitCost: string;
}) {
  if (!writers.includes(actor.role)) throw new HttpError(403, "Création de produit non autorisée.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  const product = await createBeverageProduct({ ...input, companyId: actor.companyId, actorId: actor.actorId });
  return product;
}

export async function recordCompanyBeverageLoss(actor: Actor, input: {
  productId: string; quantity: string; expectedQuantity?: string; reason?: string;
}) {
  if (!writers.includes(actor.role)) throw new HttpError(403, "Déclaration de perte non autorisée.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  return recordBeverageStockLoss({ ...input, companyId: actor.companyId, actorId: actor.actorId });
}

export async function archiveCompanyBeverageProduct(actor: Actor, input: { productId: string; expectedQuantity: string }) {
  if (!writers.includes(actor.role)) throw new HttpError(403, "Suppression de produit non autorisée.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  if (!isProductArchiveEnabled()) throw new HttpError(403, "La suppression de produits est actuellement désactivée.");
  await archiveBeverageProduct({ ...input, companyId: actor.companyId, actorId: actor.actorId });
}

export async function cancelCompanyBeverageLoss(actor: Actor, lossId: string) {
  if (!writers.includes(actor.role)) throw new HttpError(403, "Annulation de perte non autorisée.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  await cancelBeverageStockLoss({ companyId: actor.companyId, lossId });
}

export async function countCompanyBeverageStock(actor: Actor, input: { productId: string; expectedQuantity: string; countedQuantity: string; unitCost: string; reason: string }) {
  if (!["SYS_ADMIN", "ACCOUNTANT"].includes(actor.role)) throw new HttpError(403, "La correction d'un stock existant est réservée au comptable ou à l'administrateur.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  await countBeverageProduct({ ...input, companyId: actor.companyId, actorId: actor.actorId });
}
