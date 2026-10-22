import { beforeEach, describe, expect, it, vi } from "vitest";
import { stockDecimal, stockFormat, saleStockCost } from "../utils/beverage-stock.js";
import { assertTransactionInputMatchesActivityProfile } from "../config/business-activity-profiles.js";
const db = vi.hoisted(() => ({ getConnection: vi.fn(), queryRows: vi.fn() }));
vi.mock("../lib/db.js", () => ({ getDbPool: () => db, queryRows: db.queryRows }));
import { countBeverageProduct, listBeverageProducts, withBeverageStockWrite } from "./beverage-stock.repository.js";

type Movement = { id: number; productId: string; transactionId: string; kind: string; quantity: string; costValue: string; active: number };
type Record = { activityCode: string; metadataJson: { [key: string]: string }; status: string; occurredAt: Date };
let state: { movements: Movement[]; records: { [key: string]: Record }; audits: unknown[][] };
let openingQuantity: string;
let openingValue: string;
let queue: Promise<void>;
let financialWrites: number;
const productId = "product-coca";
function products(local = state) {
  let quantity = stockDecimal(openingQuantity, 3), value = stockDecimal(openingValue, 9);
  for (const move of local.movements.filter((item) => item.active)) {
    const sign = ["ACHAT_STOCK", "INVENTORY_IN"].includes(move.kind) ? 1n : -1n;
    quantity += sign * stockDecimal(move.quantity, 3); value += sign * stockDecimal(move.costValue, 9);
  }
  return [{ id: productId, name: "Coca 50 cl", unit: "casier", openingQuantity, openingValue,
    quantity: stockFormat(quantity, 3), stockValue: stockFormat(value, 9), initializedAt: new Date("2026-10-22T00:00:00Z") }];
}
beforeEach(() => {
  state = { movements: [], records: {}, audits: [] }; openingQuantity = "10"; openingValue = "1000";
  queue = Promise.resolve(); financialWrites = 0;
  db.getConnection.mockImplementation(async () => {
    let local = state;
    let unlock: (() => void) | undefined;
    return {
      beginTransaction: async () => {},
      execute: async (sql: string, values: unknown[]) => {
        if (sql.includes("INSERT INTO audit_logs")) { local.audits.push(values); return [{}]; }
        expect(values[0]).toBe("company-a");
        if (sql.includes("FROM companies")) {
          expect(sql).toContain("FOR UPDATE");
          const previous = queue;
          queue = new Promise<void>((resolve) => { unlock = resolve; });
          await previous; local = structuredClone(state);
          return [[{ id: "company-a" }]];
        }
        if (sql.includes("FROM transactions")) return [[local.records[String(values[1])]].filter(Boolean)];
        if (sql.includes("kind = 'VENTE' AND id >")) return [local.movements.filter((item) => item.active && item.kind === "VENTE" && item.productId === values[1] && item.id > Number(values[2]))];
        if (sql.includes("kind IN ('INVENTORY_IN', 'INVENTORY_OUT') AND id >")) return [local.movements.filter((item) => item.active && item.kind.startsWith("INVENTORY_") && item.productId === values[1] && item.id > Number(values[2]))];
        if (sql.includes("FROM beverage_stock_movements")) return [local.movements.filter((item) => item.transactionId === values[1])];
        if (sql.includes("UPDATE beverage_stock_movements")) {
          local.movements.filter((item) => item.transactionId === values[1]).forEach((item) => { item.active = 0; }); return [{}];
        }
        if (sql.includes("INSERT INTO beverage_stock_movements")) {
          const old = local.movements.find((item) => item.transactionId === values[2]);
          const item = { id: old?.id ?? local.movements.length + 1, productId: String(values[1]), transactionId: String(values[2]), kind: String(values[3]), quantity: String(values[4]), costValue: String(values[5]), active: 1 };
          if (old) Object.assign(old, item); else local.movements.push(item);
          return [{}];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      query: async (sql: string, values: unknown[]) => { expect(sql).toContain("p.company_id = ?"); expect(values).toEqual(["company-a", "company-a"]); return [products(local)]; },
      commit: async () => { state = local; unlock?.(); },
      rollback: async () => { unlock?.(); }, release: () => {},
      persist: (id: string, metadata: { [key: string]: string }) => {
        financialWrites++; local.records[id] = { activityCode: "BEVERAGE_DEPOT", metadataJson: metadata, status: "SUBMITTED", occurredAt: new Date("2026-10-22T12:00:00Z") };
      },
      remove: (id: string) => { delete local.records[id]; },
      review: (id: string, status: string) => { local.records[id].status = status; }
    };
  });
});
async function save(id: string, kind = "VENTE", quantity = "4", extras: { [key: string]: string } = {}, action: "create" | "update" = "create") {
  let result: { [key: string]: string } = {};
  await withBeverageStockWrite({ companyId: "company-a", transactionId: id, action, activityCode: "BEVERAGE_DEPOT", occurredAt: new Date("2026-10-22T12:00:00Z"),
    metadata: { beverageOperationKind: kind, beverageProductId: productId, quantity, purchaseUnitPrice: "100", ...extras } }, async (connection, metadata) => {
    result = metadata;
    (connection as unknown as { persist: (id: string, data: { [key: string]: string }) => void }).persist(id, metadata);
  });
  return result;
}
describe("beverage stock integrity", () => {
  it("reports a missing stock schema as unavailable rather than an internal error or an empty stock", async () => {
    db.queryRows.mockRejectedValueOnce(Object.assign(new Error("Table 'amcco.beverage_products' doesn't exist"), { code: "ER_NO_SUCH_TABLE" }));
    await expect(listBeverageProducts("company-a")).rejects.toMatchObject({ statusCode: 503 });
  });
  it("does not disguise unrelated SQL failures as a missing schema", async () => {
    const failure = Object.assign(new Error("Connection lost"), { code: "PROTOCOL_CONNECTION_LOST" });
    db.queryRows.mockRejectedValueOnce(failure);
    await expect(listBeverageProducts("company-a")).rejects.toBe(failure);
  });
  it("loads zero-stock products with an explicit company scope in both aggregate and catalog queries", async () => {
    db.queryRows.mockResolvedValueOnce([{ id: productId, name: "Coca", unit: "casier", quantity: "0.000", stockValue: "0.000000000", openingQuantity: "0.000", openingValue: "0.000000000", initializedAt: new Date("2026-10-22T00:00:00Z") }]);
    await expect(listBeverageProducts("company-a")).resolves.toEqual([expect.objectContaining({ quantity: "0.000", averageUnitCost: "0.000000", stockValue: "0.00" })]);
    const [sql, values] = db.queryRows.mock.calls.at(-1)!;
    expect(values).toEqual(["company-a", "company-a"]);
    expect(sql).toContain("GROUP BY company_id, product_id");
    expect(sql).not.toContain("GROUP BY p.id");
  });
  it("rejects a sale without stock, even through a direct API write", async () => {
    openingQuantity = "0"; openingValue = "0";
    await expect(save("sale")).rejects.toThrow("Stock insuffisant");
    expect(financialWrites).toBe(0); expect(state.movements).toEqual([]);
  });
  it("requires a catalog product and rejects a product from another company", async () => {
    await expect(save("sale", "VENTE", "1", { beverageProductId: "" })).rejects.toThrow("Choisissez un produit");
    await expect(save("sale", "VENTE", "1", { beverageProductId: "other-company-coca" })).rejects.toThrow("cette entreprise");
    expect(financialWrites).toBe(0);
  });
  it("values successive purchases at weighted average cost and ignores spoofed sale costs", async () => {
    openingQuantity = "0"; openingValue = "0";
    await save("buy-1", "ACHAT_STOCK", "10");
    await save("buy-2", "ACHAT_STOCK", "10", { purchaseUnitPrice: "200" });
    const sale = await save("sale", "VENTE", "5", { purchaseUnitPrice: "1", productName: "Fake", beverageStockCost: "1" });
    expect(sale.purchaseUnitPrice).toBe("150.000000"); expect(sale.beverageStockCost).toBe("750.000000000");
    expect(sale.productName).toBe("Coca 50 cl"); expect(sale.beverageUnit).toBe("casier");
    expect(products()[0]).toMatchObject({ quantity: "15.000", stockValue: "2250.000000000" });
  });
  it("serializes two concurrent sales against the same stock", async () => {
    const results = await Promise.allSettled([save("sale-a", "VENTE", "7"), save("sale-b", "VENTE", "7")]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(products()[0].quantity).toBe("3.000"); expect(Object.keys(state.records)).toHaveLength(1);
  });
  it("restores a deleted sale exactly once", async () => {
    await save("sale", "VENTE", "4");
    await withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "delete" }, async (connection) => {
      (connection as unknown as { remove: (id: string) => void }).remove("sale");
    });
    expect(products()[0]).toMatchObject({ quantity: "10.000", stockValue: "1000.000000000" });
    await expect(withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "delete" }, async () => {})).rejects.toThrow("introuvable");
  });
  it("refuses removal of a purchase already used by a later sale", async () => {
    await save("buy", "ACHAT_STOCK", "5"); await save("sale", "VENTE", "1");
    await expect(withBeverageStockWrite({ companyId: "company-a", transactionId: "buy", action: "reject" }, async () => {})).rejects.toThrow("déjà servi");
    expect(products()[0].quantity).toBe("14.000");
  });
  it("permits reference-only purchase edits without changing its stock effect", async () => {
    await save("buy", "ACHAT_STOCK", "5"); await save("sale", "VENTE", "1");
    await save("buy", "ACHAT_STOCK", "5", { purchaseUnitPrice: "100.00", invoiceRef: "INV-NEW" }, "update");
    expect(products()[0].quantity).toBe("14.000"); expect(state.movements).toHaveLength(2);
    expect(state.records.buy.metadataJson.invoiceRef).toBe("INV-NEW");
  });
  it("rolls back an oversized sale edit and preserves the original record", async () => {
    await save("sale", "VENTE", "4");
    await expect(save("sale", "VENTE", "11", {}, "update")).rejects.toThrow("Stock insuffisant");
    expect(state.records.sale.metadataJson.quantity).toBe("4"); expect(products()[0].quantity).toBe("6.000");
  });
  it("restores stock on rejection and prevents a second review", async () => {
    await save("sale");
    await withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "reject" }, async (connection) => {
      (connection as unknown as { review: (id: string, status: string) => void }).review("sale", "REJECTED");
    });
    expect(products()[0].quantity).toBe("10.000");
    await expect(withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "reject" }, async () => {})).rejects.toThrow("déjà été traitée");
  });
  it("leaves historical transactions outside the new ledger", async () => {
    state.records.legacy = { activityCode: "BEVERAGE_DEPOT", metadataJson: { beverageOperationKind: "VENTE", productName: "Coca", quantity: "4", purchaseUnitPrice: "100" }, status: "APPROVED", occurredAt: new Date("2025-01-01") };
    await save("legacy", "VENTE", "4", { beverageProductId: "", productName: "Coca", historicalNote: "Archive" }, "update");
    expect(state.movements).toHaveLength(0); expect(products()[0].quantity).toBe("10.000");
    await expect(save("legacy", "VENTE", "5", { beverageProductId: "", productName: "Coca" }, "update")).rejects.toThrow("historique");
    await expect(save("legacy", "VENTE", "4", { productName: "Coca" }, "update")).rejects.toThrow("historique");
  });
  it("does not commit a stock change if the financial write fails", async () => {
    await save("sale");
    await expect(withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "delete" }, async () => { throw new Error("DB failed"); })).rejects.toThrow("DB failed");
    expect(products()[0].quantity).toBe("6.000"); expect(state.movements[0].active).toBe(1);
  });
  it("has no residual value when the last fractional quantity is sold", () => {
    const value = stockDecimal("1", 9), quantity = stockDecimal("3", 3);
    const first = saleStockCost(stockDecimal("1.5", 3), quantity, value);
    const last = saleStockCost(stockDecimal("1.5", 3), stockDecimal("1.5", 3), value - first);
    expect(first + last).toBe(value);
  });
  it("rounds new fractional-unit sales to whole XOF without changing the validation of historical sales", () => {
    const metadata = { beverageOperationKind: "VENTE", beverageProductId: productId, quantity: "0.5", saleUnitPrice: "501" };
    expect(() => assertTransactionInputMatchesActivityProfile("BEVERAGE_DEPOT", { type: "CASH_IN", currency: "XOF", amount: "251", metadata })).not.toThrow();
    expect(() => assertTransactionInputMatchesActivityProfile("BEVERAGE_DEPOT", { type: "CASH_IN", currency: "XOF", amount: "250.5", metadata })).toThrow("montant");
    expect(() => assertTransactionInputMatchesActivityProfile("BEVERAGE_DEPOT", { type: "CASH_IN", currency: "XOF", amount: "250.5", metadata: { ...metadata, beverageProductId: "", productName: "Coca", purchaseUnitPrice: "300" } })).not.toThrow();
  });
  it("records a physical shortage at average cost with an audit and without a financial write", async () => {
    await countBeverageProduct({ companyId: "company-a", actorId: "accountant", productId, expectedQuantity: "10", countedQuantity: "8", unitCost: "0", reason: "Deux casiers cassés" });
    expect(products()[0]).toMatchObject({ quantity: "8.000", stockValue: "800.000000000" });
    expect(state.movements[0]).toMatchObject({ kind: "INVENTORY_OUT", costValue: "200.000000000" });
    expect(state.audits).toHaveLength(1); expect(financialWrites).toBe(0);
  });
  it("rejects a stale physical count when an operator sold goods in the meantime", async () => {
    await save("sale");
    await expect(countBeverageProduct({ companyId: "company-a", actorId: "accountant", productId, expectedQuantity: "10", countedQuantity: "8", unitCost: "0", reason: "Comptage du soir" })).rejects.toThrow("stock a changé");
    expect(products()[0].quantity).toBe("6.000"); expect(state.audits).toHaveLength(0);
  });
  it("values stock found after depletion from the documented purchase cost", async () => {
    openingQuantity = "0"; openingValue = "0";
    await countBeverageProduct({ companyId: "company-a", actorId: "accountant", productId, expectedQuantity: "0", countedQuantity: "3", unitCost: "200", reason: "Casier retrouvé dans la réserve" });
    expect(products()[0]).toMatchObject({ quantity: "3.000", stockValue: "600.000000000" });
    expect((await save("sale", "VENTE", "1")).purchaseUnitPrice).toBe("200.000000");
  });
  it("freezes stock-affecting changes before a confirmed physical count", async () => {
    await save("sale", "VENTE", "1");
    await countBeverageProduct({ companyId: "company-a", actorId: "accountant", productId, expectedQuantity: "9", countedQuantity: "8", unitCost: "0", reason: "Casier cassé au rangement" });
    await expect(withBeverageStockWrite({ companyId: "company-a", transactionId: "sale", action: "delete" }, async () => {})).rejects.toThrow("Un comptage");
    expect(products()[0].quantity).toBe("8.000");
  });
});
