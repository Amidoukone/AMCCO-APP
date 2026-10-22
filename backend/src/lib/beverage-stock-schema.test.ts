import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ execute: vi.fn(), queryRows: vi.fn() }));
vi.mock("./db.js", () => ({ getDbPool: () => ({ execute: db.execute }), queryRows: db.queryRows }));
import { ensureBeverageStockSchemaReady } from "./beverage-stock-schema.js";
import { ensureBusinessActivitySchemaReady } from "./schema-bootstrap.js";
import { ensureOperatorFinancialAccountsReady } from "./operator-account-bootstrap.js";
vi.mock("./operator-account-bootstrap.js", () => ({ ensureOperatorFinancialAccountsReady: vi.fn() }));

beforeEach(() => {
  db.execute.mockReset().mockResolvedValue([{}]);
  db.queryRows.mockReset().mockImplementation(async (sql: string) => sql.includes("information_schema.COLUMNS")
    ? [{ tableName: "companies", columnType: "varchar(36)", characterSet: "utf8mb4", collation: "utf8mb4_0900_ai_ci" }]
    : sql === "SELECT id FROM companies" ? [] : [{ Field: "exists", Null: "YES", Type: "HARDWARE_OPERATOR HYDROCARBON_OPERATOR BEVERAGE_DEPOT_OPERATOR", constraintName: "exists" }]);
});
describe("stock schema initialization", () => {
  it("uses only the two additive idempotent statements from the versioned migration", async () => {
    await ensureBeverageStockSchemaReady();
    const statements = db.execute.mock.calls.map(([sql]) => String(sql));
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS beverage_products");
    expect(statements[1]).toContain("CREATE TABLE IF NOT EXISTS beverage_stock_movements");
    for (const sql of statements) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\s+(?:INTO|TABLE|FROM|beverage_)/i);
  });
  it("prepares stock tables during the existing normal backend startup", async () => {
    await ensureBusinessActivitySchemaReady();
    const statements = db.execute.mock.calls.map(([sql]) => String(sql));
    const productIndex = statements.findIndex((sql) => sql.includes("CREATE TABLE IF NOT EXISTS beverage_products"));
    expect(productIndex).toBeGreaterThanOrEqual(0);
    expect(statements[productIndex + 1]).toContain("CREATE TABLE IF NOT EXISTS beverage_stock_movements");
    expect(ensureOperatorFinancialAccountsReady).toHaveBeenCalledOnce();
  });
  it("fails startup when stock preparation fails, instead of serving a broken stock screen", async () => {
    const failure = new Error("DDL permission denied");
    db.execute.mockImplementation(async (sql: string) => { if (sql.includes("CREATE TABLE IF NOT EXISTS beverage_products")) throw failure; return [{}]; });
    await expect(ensureBusinessActivitySchemaReady()).rejects.toBe(failure);
  });
  it.each([
    ["utf8mb4", "utf8mb4_0900_ai_ci", "varchar(36)"],
    ["utf8mb4", "utf8mb4_unicode_ci", "varchar(36)"],
    ["latin1", "latin1_swedish_ci", "char(36)"]
  ])("matches parent identifiers for %s / %s / %s without altering companies", async (characterSet, collation, columnType) => {
    db.queryRows.mockResolvedValueOnce([{ tableName: "companies", columnType, characterSet, collation }]);
    await ensureBeverageStockSchemaReady();
    const statements = db.execute.mock.calls.map(([sql]) => String(sql));
    for (const sql of statements) {
      expect(sql).toContain(`company_id ${columnType} CHARACTER SET ${characterSet} COLLATE ${collation} NOT NULL`);
      expect(sql).not.toMatch(/ALTER\s+TABLE|DROP\s+TABLE|FOREIGN_KEY_CHECKS/i);
    }
    expect(statements[0]).toContain(`id varchar(36) CHARACTER SET ${characterSet} COLLATE ${collation} PRIMARY KEY`);
    expect(statements[1]).toContain(`product_id varchar(36) CHARACTER SET ${characterSet} COLLATE ${collation} NOT NULL`);
  });
  it("matches a pre-existing product table separately from companies when their collations differ", async () => {
    db.queryRows.mockResolvedValueOnce([
      { tableName: "companies", columnType: "varchar(36)", characterSet: "utf8mb4", collation: "utf8mb4_0900_ai_ci" },
      { tableName: "beverage_products", columnType: "varchar(36)", characterSet: "utf8mb4", collation: "utf8mb4_unicode_ci" }
    ]);
    await ensureBeverageStockSchemaReady();
    const movementSql = String(db.execute.mock.calls[1][0]);
    expect(movementSql).toContain("company_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL");
    expect(movementSql).toContain("product_id varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL");
  });
  it("stops before any DDL if the parent table is missing", async () => {
    db.queryRows.mockResolvedValueOnce([]);
    await expect(ensureBeverageStockSchemaReady()).rejects.toThrow("companies.id is missing");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
