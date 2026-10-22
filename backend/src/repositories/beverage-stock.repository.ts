import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import { HttpError } from "../errors/http-error.js";
import { logger } from "../lib/logger.js";
import { toMetadataStringMap } from "../utils/metadata.js";
import { averageStockCost, saleStockCost, stockDecimal, stockFormat } from "../utils/beverage-stock.js";

export type BeverageProduct = {
  id: string; name: string; unit: string; quantity: string; stockValue: string;
  averageUnitCost: string; openingQuantity: string; initializedAt: string;
};
type ProductRow = RowDataPacket & {
  id: string; name: string; unit: string; openingQuantity: string; openingValue: string;
  quantity: string; stockValue: string; initializedAt: Date;
};
type Movement = RowDataPacket & { id: number; productId: string; kind: string; quantity: string; costValue: string; active: number };
type Existing = RowDataPacket & { activityCode: string | null; metadataJson: unknown; status: string; occurredAt: Date };
const productSelect = `SELECT p.id, p.name, p.unit, CAST(p.opening_quantity AS CHAR) AS openingQuantity,
  CAST(p.opening_value AS CHAR) AS openingValue, p.created_at AS initializedAt,
  CAST(p.opening_quantity + COALESCE(m.quantity_change, 0) AS CHAR) AS quantity,
  CAST(p.opening_value + COALESCE(m.value_change, 0) AS CHAR) AS stockValue
  FROM beverage_products p LEFT JOIN (
    SELECT company_id, product_id,
      SUM(IF(kind IN ('ACHAT_STOCK', 'INVENTORY_IN'), quantity, -quantity)) AS quantity_change,
      SUM(IF(kind IN ('ACHAT_STOCK', 'INVENTORY_IN'), cost_value, -cost_value)) AS value_change
    FROM beverage_stock_movements WHERE company_id = ? AND active = 1
    GROUP BY company_id, product_id
  ) m ON m.product_id = p.id AND m.company_id = p.company_id
  WHERE p.company_id = ? ORDER BY p.name, p.unit`;

function rethrowStockError(error: unknown): never {
  const databaseError = error as { code?: string; message?: string };
  if (databaseError?.code === "ER_NO_SUCH_TABLE" && /beverage_(products|stock_movements)/i.test(databaseError.message ?? "")) {
    logger.error({ code: databaseError.code }, "Beverage stock tables are missing; check backend schema initialization");
    throw new HttpError(503, "Le suivi de stock n'est pas encore disponible. Prévenez le comptable ou l'administrateur pour terminer sa mise en service.");
  }
  throw error;
}

function toProduct(row: ProductRow): BeverageProduct {
  const quantity = stockDecimal(row.quantity, 3);
  const value = stockDecimal(row.stockValue, 9);
  return { id: row.id, name: row.name, unit: row.unit, quantity: row.quantity,
    stockValue: stockFormat((value + 5000000n) / 10000000n, 2),
    averageUnitCost: averageStockCost(quantity, value), openingQuantity: row.openingQuantity,
    initializedAt: new Date(row.initializedAt).toISOString() };
}

export async function listBeverageProducts(companyId: string): Promise<BeverageProduct[]> {
  try {
    return (await queryRows<ProductRow[]>(productSelect, [companyId, companyId])).map(toProduct);
  } catch (error) { rethrowStockError(error); }
}

export async function createBeverageProduct(input: {
  companyId: string; actorId: string; name: string; unit: string; openingQuantity: string; openingUnitCost: string;
}): Promise<BeverageProduct> {
  const quantity = stockDecimal(input.openingQuantity, 3);
  const cost = stockDecimal(input.openingUnitCost, 6);
  if (quantity > 0n && cost === 0n) throw new HttpError(400, "Le coût d'achat du stock de départ est requis.");
  const id = randomUUID();
  const name = input.name.trim().replace(/\s+/g, " ");
  const unit = input.unit.trim().replace(/\s+/g, " ");
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM companies WHERE id = ? FOR UPDATE", [input.companyId]);
    await connection.execute(`INSERT INTO beverage_products
      (id, company_id, name, unit, product_key, opening_quantity, opening_value, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.companyId, name, unit, `${name.toLocaleLowerCase("fr")}|${unit.toLocaleLowerCase("fr")}`,
      stockFormat(quantity, 3), stockFormat(quantity * cost, 9), input.actorId]);
    await connection.execute(`INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, 'BEVERAGE_PRODUCT_OPENED', 'BEVERAGE_PRODUCT', ?, ?)`, [randomUUID(), input.companyId, input.actorId, id,
      JSON.stringify({ name, unit, openingQuantity: input.openingQuantity, openingUnitCost: input.openingUnitCost, openingValue: stockFormat(quantity * cost, 9) })]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new HttpError(409, "Ce produit existe déjà avec cette unité. Utilisez-le pour les achats et les ventes.");
    rethrowStockError(error);
  } finally { connection.release(); }
  const product = (await listBeverageProducts(input.companyId)).find((item) => item.id === id);
  if (!product) throw new HttpError(500, "Impossible de recharger le produit créé.");
  return product;
}

export type BeverageStockAdjustment = { date: string; productName: string; unit: string; quantity: string; value: string; reason: string };
export async function listBeverageStockAdjustments(companyId: string, filters: { dateFrom?: string; dateTo?: string } = {}): Promise<BeverageStockAdjustment[]> {
  const values: unknown[] = [companyId];
  const clauses = ["m.company_id = ?", "m.active = 1", "m.kind IN ('INVENTORY_IN', 'INVENTORY_OUT')"];
  if (filters.dateFrom) { clauses.push("m.created_at >= ?"); values.push(new Date(filters.dateFrom)); }
  if (filters.dateTo) { clauses.push("m.created_at <= ?"); values.push(new Date(filters.dateTo)); }
  const rows = await queryRows<(RowDataPacket & BeverageStockAdjustment)[]>(`SELECT m.created_at AS date, p.name AS productName, p.unit,
    CAST(IF(m.kind = 'INVENTORY_IN', m.quantity, -m.quantity) AS CHAR) AS quantity,
    CAST(IF(m.kind = 'INVENTORY_IN', m.cost_value, -m.cost_value) AS CHAR) AS value, m.reason
    FROM beverage_stock_movements m JOIN beverage_products p ON p.id = m.product_id AND p.company_id = m.company_id
    WHERE ${clauses.join(" AND ")} ORDER BY m.id`, values).catch(rethrowStockError);
  return rows.map((row) => ({ ...row, date: new Date(row.date).toISOString() }));
}

export async function countBeverageProduct(input: { companyId: string; actorId: string; productId: string;
  expectedQuantity: string; countedQuantity: string; unitCost: string; reason: string }) {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM companies WHERE id = ? FOR UPDATE", [input.companyId]);
    const [products] = await connection.query<ProductRow[]>(productSelect, [input.companyId, input.companyId]);
    const product = products.find((row) => row.id === input.productId);
    if (!product) throw new HttpError(404, "Produit introuvable.");
    const available = stockDecimal(product.quantity, 3), counted = stockDecimal(input.countedQuantity, 3);
    if (available !== stockDecimal(input.expectedQuantity, 3)) throw new HttpError(409, "Le stock a changé pendant le comptage. Actualisez et vérifiez à nouveau la quantité physique.");
    const delta = counted - available;
    if (delta === 0n) throw new HttpError(400, "Le comptage correspond déjà au stock disponible.");
    const currentValue = stockDecimal(product.stockValue, 9);
    const unitCost = available > 0n ? (currentValue + available / 2n) / available : stockDecimal(input.unitCost, 6);
    if (delta > 0n && unitCost <= 0n) throw new HttpError(400, "Le coût d'achat est requis pour valoriser ce stock retrouvé.");
    const value = delta < 0n ? saleStockCost(-delta, available, currentValue) : delta * unitCost;
    const id = randomUUID();
    await connection.execute(`INSERT INTO beverage_stock_movements (company_id, product_id, transaction_id, kind, quantity, cost_value, reason, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [input.companyId, input.productId, id, delta > 0n ? "INVENTORY_IN" : "INVENTORY_OUT",
      stockFormat(delta < 0n ? -delta : delta, 3), stockFormat(value, 9), input.reason, input.actorId]);
    await connection.execute(`INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, 'BEVERAGE_STOCK_COUNTED', 'BEVERAGE_PRODUCT', ?, ?)`, [randomUUID(), input.companyId, input.actorId, input.productId,
      JSON.stringify({ before: product.quantity, counted: input.countedQuantity, quantityChange: stockFormat(delta, 3), value: stockFormat(value, 9), reason: input.reason })]);
    await connection.commit();
  } catch (error) { await connection.rollback(); rethrowStockError(error); } finally { connection.release(); }
}

type StockWrite = {
  companyId: string; transactionId: string; action: "create" | "update" | "delete" | "reject" | "approve";
  activityCode?: string | null; metadata?: Record<string, string>; occurredAt?: Date;
};

/** Stock reservation and financial mutation commit together. The company lock also
 * serializes sales made through different accounts or different server instances. */
export async function withBeverageStockWrite(
  input: StockWrite,
  write: (connection: PoolConnection, metadata: Record<string, string>) => Promise<unknown>
): Promise<void> {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM companies WHERE id = ? FOR UPDATE", [input.companyId]);
    let existing: Existing | undefined;
    if (input.action !== "create") {
      const [rows] = await connection.execute<Existing[]>(`SELECT activity_code AS activityCode, metadata_json AS metadataJson, status, occurred_at AS occurredAt
        FROM transactions WHERE company_id = ? AND id = ? FOR UPDATE`, [input.companyId, input.transactionId]);
      existing = rows[0];
      if (!existing) throw new HttpError(404, "Transaction introuvable.");
      if ((input.action === "reject" || input.action === "approve") && existing.status !== "SUBMITTED") throw new HttpError(409, "Cette transaction a déjà été traitée. Actualisez la page.");
    }
    const [movements] = await connection.execute<Movement[]>(`SELECT id, product_id AS productId, kind,
      CAST(quantity AS CHAR) AS quantity, CAST(cost_value AS CHAR) AS costValue, active
      FROM beverage_stock_movements WHERE company_id = ? AND transaction_id = ? FOR UPDATE`, [input.companyId, input.transactionId]);
    const old = movements[0];
    const metadata = { ...input.metadata };
    delete metadata.beverageStockManaged;
    delete metadata.beverageStockCost;
    const oldMetadata = toMetadataStringMap(existing?.metadataJson);
    const kind = input.activityCode === "BEVERAGE_DEPOT" ? metadata.beverageOperationKind : undefined;
    const isStockOperation = kind === "VENTE" || kind === "ACHAT_STOCK";
    const isSave = input.action === "create" || input.action === "update";
    const isLegacy = existing?.activityCode === "BEVERAGE_DEPOT" && !old;
    if (isSave && isLegacy) {
      const changed = ["beverageOperationKind", "productName", "quantity", "purchaseUnitPrice", "saleUnitPrice"].some((key) => {
        const before = oldMetadata[key]?.trim() || "";
        const after = metadata[key]?.trim() || "";
        if (before === after) return false;
        if (before && after && ["quantity", "purchaseUnitPrice", "saleUnitPrice"].includes(key)) {
          return stockDecimal(before, key === "quantity" ? 3 : 6) !== stockDecimal(after, key === "quantity" ? 3 : 6);
        }
        return true;
      });
      if (changed) throw new HttpError(409, "Les quantités, produits et prix de l'historique antérieur au suivi de stock sont conservés. Utilisez les nouvelles opérations ou un comptage pour corriger le stock actuel.");
    }
    if (isSave && isStockOperation && !metadata.beverageProductId && !isLegacy) {
      throw new HttpError(400, "Choisissez un produit dans le stock du dépôt. Si la liste des produits n'apparaît pas, actualisez la page après avoir conservé votre saisie. Ajoutez d'abord le produit et son stock de départ si nécessaire.");
    }
    if (isLegacy && metadata.beverageProductId) throw new HttpError(400, "Cette opération appartient à l'historique antérieur au suivi de stock. Enregistrez les nouveaux mouvements séparément.");

    const sameStock = isSave && old?.active === 1 && old.productId === metadata.beverageProductId && old.kind === kind &&
      stockDecimal(metadata.quantity || "0", 3) === stockDecimal(old.quantity, 3) &&
      (kind === "VENTE" || stockDecimal(metadata.purchaseUnitPrice || "0", 6) === stockDecimal(oldMetadata.purchaseUnitPrice || "0", 6));
    const changesStock = input.action !== "approve" && !sameStock;
    if (changesStock && old?.active === 1) {
      const [laterCounts] = await connection.execute<RowDataPacket[]>(`SELECT id FROM beverage_stock_movements
        WHERE company_id = ? AND product_id = ? AND active = 1 AND kind IN ('INVENTORY_IN', 'INVENTORY_OUT') AND id > ? LIMIT 1`, [input.companyId, old.productId, old.id]);
      if (laterCounts.length) throw new HttpError(409, "Un comptage a déjà confirmé le stock après cette opération. Les quantités et coûts ne peuvent plus être modifiés ; les références restent modifiables. Faites corriger l'écart actuel par le comptable.");
    }
    if (changesStock && old?.active === 1 && old.kind === "ACHAT_STOCK") {
      const [laterSales] = await connection.execute<RowDataPacket[]>(`SELECT id FROM beverage_stock_movements
        WHERE company_id = ? AND product_id = ? AND active = 1 AND kind = 'VENTE' AND id > ? LIMIT 1`, [input.companyId, old.productId, old.id]);
      if (laterSales.length) throw new HttpError(409, "Cet achat a déjà servi à des ventes. Il ne peut plus être retiré ou modifier le stock ; ses références et observations restent modifiables. Contactez le comptable pour corriger l'écart constaté.");
    }
    if (changesStock && old?.active === 1) {
      await connection.execute("UPDATE beverage_stock_movements SET active = 0 WHERE company_id = ? AND transaction_id = ?", [input.companyId, input.transactionId]);
    }

    let movement: { productId: string; quantity: string; costValue: string } | undefined;
    if (isSave && isStockOperation && metadata.beverageProductId) {
      const [products] = await connection.query<ProductRow[]>(productSelect, [input.companyId, input.companyId]);
      const product = products.find((row) => row.id === metadata.beverageProductId);
      if (!product) throw new HttpError(400, "Produit introuvable dans le stock de cette entreprise.");
      // Financial dates may be backdated, but a stock movement cannot predate its physical opening count.
      if (input.occurredAt && input.occurredAt.toISOString().slice(0, 10) < new Date(product.initializedAt).toISOString().slice(0, 10)) throw new HttpError(400, "La date de l'opération précède le stock de départ de ce produit. Vérifiez la date.");
      const quantity = stockDecimal(metadata.quantity || "0", 3);
      if (quantity <= 0n) throw new HttpError(400, "La quantité doit être supérieure à zéro.");
      if (quantity > 999999999000n) throw new HttpError(400, "La quantité dépasse la limite autorisée par opération.");
      const available = stockDecimal(product.quantity, 3);
      const value = stockDecimal(product.stockValue, 9);
      const cost = sameStock && old ? stockDecimal(old.costValue, 9)
        : kind === "VENTE" ? saleStockCost(quantity, available, value)
          : quantity * stockDecimal(metadata.purchaseUnitPrice || "0", 6);
      if (kind === "ACHAT_STOCK" && cost <= 0n) throw new HttpError(400, "Le prix d'achat doit être supérieur à zéro.");
      metadata.productName = product.name;
      metadata.beverageUnit = product.unit;
      metadata.beverageStockManaged = "1";
      metadata.beverageStockCost = stockFormat(cost, 9);
      if (kind === "VENTE") metadata.purchaseUnitPrice = averageStockCost(quantity, cost);
      movement = { productId: product.id, quantity: stockFormat(quantity, 3), costValue: stockFormat(cost, 9) };
    }
    if (changesStock && old?.active === 1) {
      // Removing a purchase must never leave a negative stock, including concurrent edits.
      const [products] = await connection.query<ProductRow[]>(productSelect, [input.companyId, input.companyId]);
      const product = products.find((row) => row.id === old.productId);
      if (product && (product.quantity.startsWith("-") || product.stockValue.startsWith("-"))) throw new HttpError(409, "Ce mouvement est nécessaire au stock existant et ne peut pas être retiré.");
    }
    await write(connection, metadata);
    if (movement && changesStock) {
      await connection.execute(`INSERT INTO beverage_stock_movements (company_id, product_id, transaction_id, kind, quantity, cost_value, active)
        VALUES (?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), kind = VALUES(kind), quantity = VALUES(quantity), cost_value = VALUES(cost_value), active = 1`,
      [input.companyId, movement.productId, input.transactionId, kind!, movement.quantity, movement.costValue]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    rethrowStockError(error);
  } finally {
    connection.release();
  }
}
