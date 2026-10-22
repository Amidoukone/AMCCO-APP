import { HttpError } from "../errors/http-error.js";
import type { RoleCode } from "../types/role.js";
import { countBeverageProduct, createBeverageProduct, listBeverageProducts } from "../repositories/beverage-stock.repository.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";

type Actor = { companyId: string; actorId: string; role: RoleCode };
const readers: RoleCode[] = ["SYS_ADMIN", "OWNER", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE", "BEVERAGE_DEPOT_OPERATOR"];
const writers: RoleCode[] = ["SYS_ADMIN", "ACCOUNTANT", "BEVERAGE_DEPOT_OPERATOR"];

export async function getCompanyBeverageStock(actor: Actor) {
  if (!readers.includes(actor.role)) throw new HttpError(403, "Accès au stock du dépôt non autorisé.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  return listBeverageProducts(actor.companyId);
}

export async function addCompanyBeverageProduct(actor: Actor, input: {
  name: string; unit: string; openingQuantity: string; openingUnitCost: string;
}) {
  if (!writers.includes(actor.role)) throw new HttpError(403, "Création de produit non autorisée.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  const product = await createBeverageProduct({ ...input, companyId: actor.companyId, actorId: actor.actorId });
  return product;
}

export async function countCompanyBeverageStock(actor: Actor, input: { productId: string; expectedQuantity: string; countedQuantity: string; unitCost: string; reason: string }) {
  if (!["SYS_ADMIN", "ACCOUNTANT"].includes(actor.role)) throw new HttpError(403, "La correction d'un stock existant est réservée au comptable ou à l'administrateur.");
  await ensureCompanyActivityEnabledOrThrow(actor.companyId, "BEVERAGE_DEPOT");
  await countBeverageProduct({ ...input, companyId: actor.companyId, actorId: actor.actorId });
}
