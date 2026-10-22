// Real MySQL gate. Only generated amcco_review_* databases on a loopback server are used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

assert.ok(process.argv.includes("--local"), "Explicit --local is required");
const settings = process.env.AMCCO_REVIEW_MYSQL_URL ? {} : dotenv.parse(await readFile(new URL("../backend/.env", import.meta.url), "utf8"));
const source = new URL(process.env.AMCCO_REVIEW_MYSQL_URL ?? settings.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Remote databases are forbidden");
const adminURL = new URL(source); adminURL.pathname = "/";
const admin = await mysql.createConnection(adminURL.href);
const created = [];
let db;
try {
  for (const [index, collation] of ["utf8mb4_0900_ai_ci", "utf8mb4_unicode_ci", "utf8mb4_0900_ai_ci"].entries()) {
    const database = `amcco_review_${Date.now()}_${index}`;
    assert.match(database, /^amcco_review_\d+_[012]$/);
    assert.notEqual(database, decodeURIComponent(source.pathname.slice(1)));
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE ${collation}`);
    created.push(database);
    const target = new URL(source); target.pathname = `/${database}`;
    process.env.DATABASE_URL = target.href;
    process.env.DB_SSL = "false"; process.env.NODE_ENV = "test";
    process.env.JWT_ACCESS_SECRET = "isolated-review-access-secret-12345";
    process.env.JWT_REFRESH_SECRET = "isolated-review-refresh-secret-12345";
    const { env } = await import("../backend/dist/config/env.js");
    env.DATABASE_URL = target.href; env.DB_SSL = false;
    db = await import("../backend/dist/lib/db.js");
    const pool = db.getDbPool();
    const [[current]] = await pool.query("SELECT DATABASE() AS name");
    assert.equal(current.name, database);
    const schema = (await readFile(new URL("../backend/sql/001_init_schema.sql", import.meta.url), "utf8"))
      .replaceAll("DEFAULT CHARSET=utf8mb4", `DEFAULT CHARSET=utf8mb4 COLLATE=${collation}`);
    for (const sql of schema.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean)) {
      if (/^(?:CREATE\s+DATABASE|USE\s+)/i.test(sql)) continue;
      await pool.query(sql);
    }
    if (index === 2) {
      const productDDL = (await readFile(new URL("../backend/sql/028_beverage_stock.sql", import.meta.url), "utf8")).split(";")[0]
        .replace("company_id VARCHAR(36)", `company_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE ${collation}`)
        .replace("DEFAULT CHARSET=utf8mb4", "DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
      await pool.query(productDDL);
    }
    const historicalCompany = randomUUID(), historicalUser = randomUUID(), historicalAccount = randomUUID();
    const historicalTransaction = randomUUID(), historicalTask = randomUUID();
    await pool.execute("INSERT INTO companies (id, name, code) VALUES (?, 'Historical fixture', ?)", [historicalCompany, `HIST-${index}`]);
    await pool.execute("INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, 'fixture-no-login', 'Historical fixture')", [historicalUser, `${historicalUser}@example.invalid`]);
    await pool.execute("INSERT INTO financial_accounts (id, company_id, name, balance) VALUES (?, ?, 'Historical cash', 123456)", [historicalAccount, historicalCompany]);
    await pool.execute(`INSERT INTO transactions (id, company_id, account_id, type, amount, currency, activity_code, status, metadata_json, created_by_id, occurred_at)
      VALUES (?, ?, ?, 'CASH_IN', 20000, 'XOF', 'BEVERAGE_DEPOT', 'APPROVED', ?, ?, '2025-01-01 12:00:00')`,
      [historicalTransaction, historicalCompany, historicalAccount, JSON.stringify({ beverageOperationKind: "VENTE", productName: "Historical Coca", quantity: "100", purchaseUnitPrice: "150", saleUnitPrice: "200", archivedNote: "preserve" }), historicalUser]);
    await pool.execute(`INSERT INTO tasks (id, company_id, title, activity_code, metadata_json, created_by_id)
      VALUES (?, ?, 'Historical task', 'BEVERAGE_DEPOT', ?, ?)`, [historicalTask, historicalCompany, JSON.stringify({ archivedReference: "KEEP-2025" }), historicalUser]);
    const history = async () => {
      const snapshots = [];
      for (const [table, id] of [["companies", historicalCompany], ["users", historicalUser], ["financial_accounts", historicalAccount], ["transactions", historicalTransaction], ["tasks", historicalTask]]) {
        const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        snapshots.push(rows);
      }
      return snapshots;
    };
    const beforeInitialization = await history();
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../backend/dist/scripts/init-schema.js", import.meta.url))], { env: process.env });
    const { ensureBusinessActivitySchemaReady } = await import("../backend/dist/lib/schema-bootstrap.js");
    await ensureBusinessActivitySchemaReady();
    await ensureBusinessActivitySchemaReady();
    assert.deepEqual(await history(), beforeInitialization, "Initialization preserves existing companies, users, account balances, transactions and tasks");
    const [[movementCount]] = await pool.query("SELECT COUNT(*) AS total FROM beverage_stock_movements");
    assert.equal(Number(movementCount.total), 0, "Historical sales must never be replayed into stock");
    const [columns] = await pool.query(`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLLATION_NAME AS collation
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('companies', 'beverage_products', 'beverage_stock_movements')`, [database]);
    const column = (t, c) => columns.find((row) => row.t === t && row.c === c).collation;
    assert.equal(column("beverage_products", "company_id"), column("companies", "id"));
    assert.equal(column("beverage_stock_movements", "company_id"), column("companies", "id"));
    assert.equal(column("beverage_stock_movements", "product_id"), column("beverage_products", "id"));
    if (index === 2) assert.notEqual(column("companies", "id"), column("beverage_products", "id"));
    console.log(`PASS MySQL schema ${collation}${index === 2 ? " / existing unicode product table" : ""}`);
    if (index !== 0) { await db.closeDbPool(); continue; }

    const companyId = randomUUID();
    await pool.execute("INSERT INTO companies (id, name, code) VALUES (?, 'Isolated review', ?)", [companyId, `REVIEW-${randomUUID()}`]);
    await pool.execute("INSERT INTO company_activities (company_id, activity_code) VALUES (?, 'BEVERAGE_DEPOT')", [companyId]);
    const actors = [];
    for (const role of ["BEVERAGE_DEPOT_OPERATOR", "BEVERAGE_DEPOT_OPERATOR", "ACCOUNTANT"]) {
      const actorId = randomUUID();
      await pool.execute("INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, 'review-no-login', 'Review fixture')", [actorId, `${actorId}@example.invalid`]);
      await pool.execute("INSERT INTO memberships (id, user_id, company_id, role) VALUES (?, ?, ?, ?)", [randomUUID(), actorId, companyId, role]);
      const accountId = randomUUID();
      await pool.execute("INSERT INTO financial_accounts (id, company_id, name, scope_type, primary_activity_code) VALUES (?, ?, 'Review cash', 'DEDICATED', 'BEVERAGE_DEPOT')", [accountId, companyId]);
      actors.push({ actorId, companyId, role, accountId });
    }
    const finance = await import("../backend/dist/services/finance.service.js");
    const stock = await import("../backend/dist/services/beverage-stock.service.js");
    const { getCompanyReportsOverview, exportCompanyReportsPdf } = await import("../backend/dist/services/reporting.service.js");
    const [operator, otherOperator, accountant] = actors;
    const product = await stock.addCompanyBeverageProduct(operator, { name: "Review Coca", unit: "casier", openingQuantity: "10", openingUnitCost: "150" });
    const available = async (id = product.id) => (await stock.getCompanyBeverageStock(operator)).find((item) => item.id === id);
    const post = (actor, kind, quantity, unitPrice, id = product.id) => finance.createCompanyTransaction(actor, {
      accountId: actor.accountId, activityCode: "BEVERAGE_DEPOT", currency: "XOF", type: kind === "VENTE" ? "CASH_IN" : "CASH_OUT",
      amount: String(Math.round(Number(quantity) * Number(unitPrice))), metadata: { beverageOperationKind: kind, beverageProductId: id,
        quantity, ...(kind === "VENTE" ? { saleUnitPrice: unitPrice, purchaseUnitPrice: "1" } : { purchaseUnitPrice: unitPrice, supplierRef: "Review supplier" }) }
    });
    const sale = await post(operator, "VENTE", "2", "200");
    assert.equal(sale.status, "APPROVED"); assert.equal(sale.metadata.beverageStockCost, "300.000000000");
    assert.equal(Number((await available()).quantity), 8);
    const concurrent = await Promise.allSettled([post(operator, "VENTE", "6", "200"), post(otherOperator, "VENTE", "6", "200")]);
    assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(concurrent.find((item) => item.status === "rejected").reason.statusCode, 409);
    assert.equal(Number((await available()).quantity), 2);
    const updated = await finance.updateCompanyTransaction(operator, { transactionId: sale.id, accountId: sale.accountId, activityCode: sale.activityCode,
      type: sale.type, amount: sale.amount, currency: sale.currency, metadata: sale.metadata, description: "Review edit", occurredAt: sale.occurredAt });
    assert.equal(updated.metadata.beverageStockCost, sale.metadata.beverageStockCost);
    assert.equal(Number((await available()).quantity), 2);
    await finance.deleteCompanyTransaction(operator, { transactionId: sale.id });
    assert.equal(Number((await available()).quantity), 4);
    const purchase = await post(operator, "ACHAT_STOCK", "6", "250");
    assert.equal(Number((await available()).quantity), 10);
    assert.equal(Number((await available()).averageUnitCost), 210);
    const nextSale = await post(operator, "VENTE", "2", "300");
    assert.equal(nextSale.metadata.beverageStockCost, "420.000000000");
    await assert.rejects(finance.deleteCompanyTransaction(operator, { transactionId: purchase.id }), (error) => error.statusCode === 409);
    assert.equal(Number((await available()).quantity), 8);
    await stock.countCompanyBeverageStock(accountant, { productId: product.id, expectedQuantity: "8", countedQuantity: "7", unitCost: "0", reason: "Review shortage" });
    assert.equal(Number((await available()).stockValue), 1470);
    await assert.rejects(stock.countCompanyBeverageStock(operator, { productId: product.id, expectedQuantity: "7", countedQuantity: "6", unitCost: "0", reason: "Not authorized" }), (error) => error.statusCode === 403);
    const report = await getCompanyReportsOverview(accountant, { activityCode: "BEVERAGE_DEPOT" });
    assert.equal(report.beverageDepotReport.totals.grossMarginAmount, "480.00");
    assert.equal(report.beverageDepotReport.netOperatingResultAmount, "270.00");
    assert.ok((await exportCompanyReportsPdf(accountant, { activityCode: "BEVERAGE_DEPOT" })).byteLength > 1000);
    const second = await stock.addCompanyBeverageProduct(operator, { name: "Review Fanta", unit: "casier", openingQuantity: "10", openingUnitCost: "100" });
    const rejected = await post(operator, "VENTE", "3", "150", second.id);
    await pool.execute("UPDATE transactions SET status = 'SUBMITTED' WHERE id = ? AND company_id = ?", [rejected.id, companyId]);
    await finance.reviewCompanyTransaction(accountant, { transactionId: rejected.id, decision: "REJECTED" });
    assert.equal(Number((await available(second.id)).quantity), 10);
    console.log("PASS real MySQL: stock opening, automatic approval, concurrent accounts, edits, deletion, weighted cost, blocked purchase removal, count permissions, margins, PDF and rejected sale restoration");
    await db.closeDbPool();
  }
} finally {
  await db?.closeDbPool();
  for (const database of created) {
    assert.match(database, /^amcco_review_\d+_[012]$/);
    assert.notEqual(database, decodeURIComponent(source.pathname.slice(1)));
    await admin.query(`DROP DATABASE \`${database}\``);
  }
  await admin.end();
  console.log("Isolated review databases removed; application databases were not used.");
}
