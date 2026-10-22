import { readFile } from "node:fs/promises";
import { getDbPool, queryRows } from "./db.js";
import { stringColumnDefinition, type IdColumn } from "./schema-identifiers.js";

// Use the same additive schema at normal startup and during explicit db:init.
// Existing stock, transactions and initial inventories are never replayed here.
export async function ensureBeverageStockSchemaReady(): Promise<void> {
  const schema = await readFile(new URL("../../sql/028_beverage_stock.sql", import.meta.url), "utf8");
  // Foreign keys must use the exact type, character set and collation of their
  // parent columns. A database default can differ from an older companies table.
  const columns = await queryRows<IdColumn[]>(`
    SELECT TABLE_NAME AS tableName, COLUMN_TYPE AS columnType,
      CHARACTER_SET_NAME AS characterSet, COLLATION_NAME AS collation
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'id'
      AND TABLE_NAME IN ('companies', 'beverage_products')
  `);
  const companyId = columns.find((column) => column.tableName === "companies");
  if (!companyId) throw new Error("companies.id is missing; initialize the base schema before preparing beverage stock.");
  const companyDefinition = stringColumnDefinition(companyId);
  const existingProductId = columns.find((column) => column.tableName === "beverage_products");
  const newProductId: IdColumn = { ...companyId, tableName: "beverage_products", columnType: "varchar(36)" };
  const productDefinition = stringColumnDefinition(existingProductId ?? newProductId);
  const statements = schema.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    const adapted = statement
      .replace(/\bcompany_id VARCHAR\(36\) NOT NULL/g, `company_id ${companyDefinition} NOT NULL`)
      .replace(/\bproduct_id VARCHAR\(36\) NOT NULL/g, `product_id ${productDefinition} NOT NULL`)
      .replace(/\bid VARCHAR\(36\) PRIMARY KEY/g, `id ${productDefinition} PRIMARY KEY`);
    await getDbPool().execute(adapted);
  }
}
