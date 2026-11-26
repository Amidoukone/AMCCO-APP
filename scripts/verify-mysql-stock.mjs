// Real MySQL gate. Only generated amcco_review_* databases on a loopback server are used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import request from "supertest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

assert.ok(process.argv.includes("--local"), "Explicit --local is required");
const settings = process.env.AMCCO_REVIEW_MYSQL_URL ? {} : dotenv.parse(await readFile(new URL("../backend/.env", import.meta.url), "utf8"));
const source = new URL(process.env.AMCCO_REVIEW_MYSQL_URL ?? settings.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Remote databases are forbidden");
const adminURL = new URL(source); adminURL.pathname = "/";
const admin = await mysql.createConnection(adminURL.href);
const created = [];
let db;
try {
  for (const [index, fixture] of [
    { collation: "utf8mb4_0900_ai_ci" },
    { collation: "utf8mb4_unicode_ci" },
    { collation: "utf8mb4_0900_ai_ci", existingCatalog: "legacy" },
    { collation: "utf8mb4_0900_ai_ci", existingCatalog: "with-loss" }
  ].entries()) {
    const { collation, existingCatalog } = fixture;
    const database = `amcco_review_${Date.now()}_${index}`;
    assert.match(database, /^amcco_review_\d+_[0-3]$/);
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
    if (existingCatalog) {
      const statements = (await readFile(new URL("../backend/sql/028_beverage_stock.sql", import.meta.url), "utf8")).split(";").map((s) => s.trim()).filter(Boolean);
      const productDDL = statements[0]
        .replace(/^\s*archived_at .+\r?\n/m, "")
        .replace("company_id VARCHAR(36)", `company_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE ${collation}`)
        .replace("DEFAULT CHARSET=utf8mb4", "DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
      await pool.query(productDDL);
      const movementDDL = statements[1]
        .replace("company_id VARCHAR(36)", `company_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE ${collation}`)
        .replace("product_id VARCHAR(36)", "product_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      await pool.query(existingCatalog === "legacy" ? movementDDL.replace("'INVENTORY_OUT', 'LOSS'", "'INVENTORY_OUT'") : movementDDL);
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
    const historicalProduct = randomUUID();
    const legacyKinds = ["ACHAT_STOCK", "VENTE", "INVENTORY_IN", "INVENTORY_OUT"];
    if (existingCatalog === "with-loss") legacyKinds.push("LOSS");
    if (existingCatalog) {
      await pool.execute(`INSERT INTO beverage_products
        (id, company_id, name, unit, product_key, opening_quantity, opening_value, created_by_id)
        VALUES (?, ?, 'Existing product', 'casier', 'existing-product', 12, 6000, ?)`,
        [historicalProduct, historicalCompany, historicalUser]);
      for (const kind of legacyKinds) {
        await pool.execute(`INSERT INTO beverage_stock_movements
          (company_id, product_id, transaction_id, kind, quantity, cost_value, active, reason, created_by_id)
          VALUES (?, ?, ?, ?, 1.5, 750, ?, 'Historical movement', ?)`,
          [historicalCompany, historicalProduct, randomUUID(), kind, kind === "INVENTORY_OUT" ? 0 : 1, historicalUser]);
      }
    }
    const history = async () => {
      const snapshots = [];
      for (const [table, id] of [["companies", historicalCompany], ["users", historicalUser], ["financial_accounts", historicalAccount], ["transactions", historicalTransaction], ["tasks", historicalTask]]) {
        const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        snapshots.push(rows);
      }
      if (existingCatalog) {
        const [products] = await pool.execute(`SELECT id, company_id, name, unit, product_key, opening_quantity, opening_value, created_by_id, created_at
          FROM beverage_products WHERE company_id = ?`, [historicalCompany]);
        const [movements] = await pool.execute("SELECT * FROM beverage_stock_movements WHERE company_id = ? ORDER BY id", [historicalCompany]);
        snapshots.push(products, movements);
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
    assert.equal(Number(movementCount.total), existingCatalog ? legacyKinds.length : 0, "Historical sales must never be replayed into stock");
    const [columns] = await pool.query(`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLLATION_NAME AS collation
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('companies', 'beverage_products', 'beverage_stock_movements')`, [database]);
    const column = (t, c) => columns.find((row) => row.t === t && row.c === c).collation;
    assert.equal(column("beverage_products", "company_id"), column("companies", "id"));
    assert.equal(column("beverage_stock_movements", "company_id"), column("companies", "id"));
    assert.equal(column("beverage_stock_movements", "product_id"), column("beverage_products", "id"));
    if (existingCatalog) {
      assert.notEqual(column("companies", "id"), column("beverage_products", "id"));
      const [[existingProduct]] = await pool.execute("SELECT archived_at FROM beverage_products WHERE id = ?", [historicalProduct]);
      assert.equal(existingProduct.archived_at, null);
      const [kindCols] = await pool.query("SHOW COLUMNS FROM beverage_stock_movements LIKE 'kind'");
      assert.ok(String(kindCols[0]?.Type ?? "").includes("'LOSS'"), "The movement enum must include LOSS after initialization");
      const { listBeverageProducts, listBeverageStockLosses } = await import("../backend/dist/repositories/beverage-stock.repository.js");
      const stock = await listBeverageProducts(historicalCompany);
      const losses = await listBeverageStockLosses(historicalCompany);
      assert.equal(stock[0]?.id, historicalProduct);
      assert.equal(stock[0].quantity, existingCatalog === "with-loss" ? "12.000" : "13.500");
      assert.equal(losses.length, existingCatalog === "with-loss" ? 1 : 0);
    }
    console.log(`PASS MySQL schema ${collation}${existingCatalog ? ` / existing catalog (${existingCatalog})` : ""}`);
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
    const recordedLoss = await stock.recordCompanyBeverageLoss(operator, { productId: product.id, quantity: "1", reason: "Casse — 1 casier" });
    const afterLoss = await available();
    assert.equal(Number(afterLoss.quantity), 6);
    assert.equal(Number(afterLoss.soldQuantity), 8);
    assert.equal(Number(afterLoss.lostQuantity), 1);
    assert.equal(Number(afterLoss.lostValue), 210);
    const reportWithLoss = await getCompanyReportsOverview(accountant, { activityCode: "BEVERAGE_DEPOT" });
    assert.equal(reportWithLoss.beverageDepotReport.stockLossAmount, "210.00");
    assert.equal(reportWithLoss.beverageDepotReport.netOperatingResultAmount, "60.00");
    assert.ok((await exportCompanyReportsPdf(accountant, { activityCode: "BEVERAGE_DEPOT" })).byteLength > 1000);
    await stock.cancelCompanyBeverageLoss(operator, recordedLoss.id);
    assert.equal(Number((await available()).quantity), 7);
    assert.equal(Number((await available()).lostQuantity), 0);
    const second = await stock.addCompanyBeverageProduct(operator, { name: "Review Fanta", unit: "casier", openingQuantity: "10", openingUnitCost: "100" });
    const rejected = await post(operator, "VENTE", "3", "150", second.id);
    await pool.execute("UPDATE transactions SET status = 'SUBMITTED' WHERE id = ? AND company_id = ?", [rejected.id, companyId]);
    await finance.reviewCompanyTransaction(accountant, { transactionId: rejected.id, decision: "REJECTED" });
    assert.equal(Number((await available(second.id)).quantity), 10);
    const retainedLoss = await stock.recordCompanyBeverageLoss(operator, { productId: product.id, quantity: "1", reason: "Review archived history" });
    const { logger } = await import("../backend/dist/lib/logger.js");
    logger.level = "warn";
    const { app } = await import("../backend/dist/app.js");
    if (process.env.RENDER_GIT_COMMIT) {
      const health = await request(app).get(`${env.API_PREFIX}/health`).expect(200);
      assert.equal(health.body.revision, process.env.RENDER_GIT_COMMIT);
    }
    const { signAccessToken } = await import("../backend/dist/lib/token.js");
    const token = signAccessToken({ companyId, userId: operator.actorId, role: operator.role, email: `${operator.actorId}@example.invalid`, fullName: "Review fixture" });
    const archive = (id, expectedQuantity) => request(app)
      .delete(`${env.API_PREFIX}/finance/beverage-products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedQuantity });
    const getStock = () => request(app)
      .get(`${env.API_PREFIX}/finance/beverage-products`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = false;
    assert.equal((await getStock()).body.canArchiveProducts, false);
    await archive(product.id, "6").expect(403);
    assert.equal(Number((await available()).quantity), 6);
    env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = true;
    assert.equal((await getStock()).body.canArchiveProducts, true);
    await archive(product.id, "7").expect(409);
    await archive(historicalProduct, "6").expect(404);
    const beforeArchive = await getCompanyReportsOverview(accountant, { activityCode: "BEVERAGE_DEPOT" });
    const [balancesBeforeArchive] = await pool.execute("SELECT id, balance FROM financial_accounts WHERE company_id = ? ORDER BY id", [companyId]);
    const deletions = await Promise.all([archive(product.id, "6"), archive(product.id, "6")]);
    assert.deepEqual(deletions.map(({ status }) => status).sort(), [200, 404]);
    assert.equal(await available(), undefined);
    assert.equal(Number((await available(second.id)).quantity), 10);
    await assert.rejects(post(operator, "VENTE", "1", "300"), (error) => error.statusCode === 400);
    await assert.rejects(post(operator, "ACHAT_STOCK", "1", "250"), (error) => error.statusCode === 400);
    const [balancesAfterArchive] = await pool.execute("SELECT id, balance FROM financial_accounts WHERE company_id = ? ORDER BY id", [companyId]);
    assert.deepEqual(balancesAfterArchive, balancesBeforeArchive);
    const afterArchive = await getCompanyReportsOverview(accountant, { activityCode: "BEVERAGE_DEPOT" });
    assert.equal(afterArchive.beverageDepotReport.currentStock.products.some(({ id }) => id === product.id), false);
    for (const field of ["totals", "stockLosses", "stockAdjustments", "netOperatingResultAmount"]) {
      assert.deepEqual(afterArchive.beverageDepotReport[field], beforeArchive.beverageDepotReport[field]);
    }
    assert.ok(afterArchive.beverageDepotReport.stockLosses.some(({ id }) => id === retainedLoss.id));
    env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = false;
    const pausedStock = (await getStock()).body;
    assert.equal(pausedStock.canArchiveProducts, false);
    assert.equal(pausedStock.items.some(({ id }) => id === product.id), false);
    assert.ok(pausedStock.losses.some(({ id }) => id === retainedLoss.id));
    env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = true;
    const archivedSale = await finance.updateCompanyTransaction(operator, {
      transactionId: nextSale.id, accountId: nextSale.accountId, activityCode: nextSale.activityCode, type: nextSale.type,
      amount: nextSale.amount, currency: nextSale.currency, metadata: nextSale.metadata, description: "Archived product reference", occurredAt: nextSale.occurredAt
    });
    assert.equal(archivedSale.metadata.beverageStockCost, nextSale.metadata.beverageStockCost);
    const [[audit]] = await pool.execute("SELECT actor_id FROM audit_logs WHERE company_id = ? AND entity_id = ? AND action = 'BEVERAGE_PRODUCT_ARCHIVED'", [companyId, product.id]);
    assert.equal(audit.actor_id, operator.actorId);
    const replacement = await stock.addCompanyBeverageProduct(operator, { name: product.name, unit: product.unit, openingQuantity: "0", openingUnitCost: "0" });
    assert.notEqual(replacement.id, product.id);
    assert.equal(Number(replacement.quantity), 0);
    if (process.env.AMCCO_MYSQLDUMP_PATH) {
      const { stdout: dump } = await promisify(execFile)(process.env.AMCCO_MYSQLDUMP_PATH, [
        "--no-defaults", "--protocol=TCP", `--host=${source.hostname === "[::1]" ? "::1" : source.hostname}`,
        `--port=${source.port || "3306"}`, `--user=${decodeURIComponent(source.username)}`,
        "--single-transaction", "--skip-lock-tables", "--skip-add-drop-table", "--no-tablespaces",
        "--set-gtid-purged=OFF", "--column-statistics=0", database
      ], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(source.password) }, maxBuffer: 8 * 1024 * 1024 });
      assert.doesNotMatch(dump, /^\s*(?:USE\s|CREATE\s+DATABASE\s)/im);
      const restoredDatabase = `amcco_review_${Date.now()}_restore`;
      assert.notEqual(restoredDatabase, decodeURIComponent(source.pathname.slice(1)));
      await admin.query(`CREATE DATABASE \`${restoredDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
      created.push(restoredDatabase);
      const restoredURL = new URL(source);
      restoredURL.pathname = `/${restoredDatabase}`;
      const restored = await mysql.createConnection({ uri: restoredURL.href, multipleStatements: true });
      try {
        await restored.query(dump);
        for (const table of ["beverage_products", "beverage_stock_movements", "transactions", "financial_accounts", "audit_logs"]) {
          const sql = `SELECT * FROM ${table} ORDER BY id`;
          const [beforeBackup] = await pool.query(sql);
          const [afterRestore] = await restored.query(sql);
          assert.deepEqual(afterRestore, beforeBackup, `Restored rows differ in ${table}`);
        }
      } finally {
        await restored.end();
      }
      console.log("PASS MySQL backup and restore: catalog, movements, transactions, balances and audit logs match");
    }
    if (process.argv.includes("--browser")) {
      // Build the frontend with VITE_API_BASE_URL=/api/v1 before this optional check.
      const { chromium } = await import("playwright-core");
      const { default: express } = await import("express");
      const web = express();
      const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
      web.use(express.static(frontend));
      web.get("/finance/transactions", (_req, res) => res.sendFile("index.html", { root: frontend }));
      web.use(app);
      const server = web.listen(0, "127.0.0.1");
      let browser;
      try {
        await once(server, "listening");
        const baseURL = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.AMCCO_BROWSER_PATH });
        const errors = [];
        for (const width of [1440, 390]) {
          const demo = await stock.addCompanyBeverageProduct(operator, { name: `Boisson recette ${width}`, unit: "casier", openingQuantity: "10", openingUnitCost: "100" });
          const history = await post(operator, "VENTE", "2", "150", demo.id);
          await stock.recordCompanyBeverageLoss(operator, { productId: demo.id, quantity: "1", reason: `Perte recette ${width}` });
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          page.setDefaultTimeout(12000);
          page.on("pageerror", (error) => errors.push(error.message));
          await page.addInitScript((accessToken) => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken, refreshToken: "fixture" })), token);
          await page.route("**/*", (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
          env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = false;
          await page.goto(`${baseURL}/finance/transactions?activityCode=BEVERAGE_DEPOT`);
          const panel = page.getByRole("region", { name: "Stock du dépôt", exact: true });
          const row = panel.getByRole("row").filter({ hasText: demo.name });
          const dialog = page.getByRole("dialog", { name: "Supprimer le produit et son stock ?" });
          const openArchive = () => row.getByRole("button", { name: "Supprimer", exact: true }).click();
          const confirm = () => dialog.getByRole("button", { name: "Supprimer le produit", exact: true }).click();
          await row.getByRole("button", { name: "Vendre", exact: true }).waitFor();
          assert.equal(await row.getByRole("button", { name: "Supprimer", exact: true }).count(), 0);
          env.BEVERAGE_PRODUCT_ARCHIVE_ENABLED = true;
          await page.reload();
          await openArchive();
          assert.match(await dialog.innerText(), /7 casiers/);
          await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
          assert.equal(Number((await available(demo.id)).quantity), 7);
          await openArchive();
          await post(otherOperator, "VENTE", "1", "150", demo.id);
          await confirm();
          await panel.getByRole("alert").filter({ hasText: "Le stock a changé" }).waitFor();
          await openArchive();
          assert.match(await dialog.innerText(), /6 casiers/);
          await confirm();
          await panel.getByRole("status").filter({ hasText: "ont été retirés du stock actif" }).waitFor();
          await row.waitFor({ state: "detached" });
          await panel.getByText(/^Historique des pertes/).click();
          await panel.getByText(`Perte recette ${width}`, { exact: true }).waitFor();
          await page.goto(`${baseURL}/finance/transactions?activityCode=BEVERAGE_DEPOT&transactionId=${history.id}`);
          await page.locator("#transaction-detail").getByRole("button", { name: "Modifier", exact: true }).click();
          await page.getByText(/Produit retiré du stock actif/).waitFor();
          const form = page.locator(".finance-transaction-form");
          assert.equal(await form.getByLabel(/^Quantité/).isEditable(), false);
          await form.getByLabel(/^Précision/).fill(`Référence historique ${width}`);
          const patch = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/finance\/transactions\/[a-f0-9-]+$/.test(response.url()));
          await form.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
          assert.equal((await patch).status(), 200);
          const persisted = await finance.getCompanyTransaction(operator, history.id);
          assert.equal(persisted.description, `Référence historique ${width}`);
          assert.equal(persisted.metadata.beverageStockCost, "200.000000000");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.close();
        }
        await pool.execute("INSERT INTO memberships (id, user_id, company_id, role) VALUES (?, ?, ?, 'OWNER')", [randomUUID(), historicalUser, companyId]);
        const ownerToken = signAccessToken({ companyId, userId: historicalUser, role: "OWNER", email: `${historicalUser}@example.invalid`, fullName: "Historical fixture" });
        const ownerPage = await browser.newPage();
        await ownerPage.addInitScript((accessToken) => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken, refreshToken: "fixture" })), ownerToken);
        await ownerPage.route("**/*", (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
        await ownerPage.goto(`${baseURL}/finance/transactions?activityCode=BEVERAGE_DEPOT`);
        const ownerStock = ownerPage.getByRole("region", { name: "Stock du dépôt", exact: true });
        await ownerStock.getByRole("row").filter({ hasText: replacement.name }).waitFor();
        assert.equal(await ownerStock.getByRole("button", { name: "Supprimer", exact: true }).count(), 0);
        await request(app).delete(`${env.API_PREFIX}/finance/beverage-products/${replacement.id}`)
          .set("Authorization", `Bearer ${ownerToken}`).send({ expectedQuantity: "0" }).expect(403);
        await ownerPage.close();
        assert.deepEqual(errors, []);
        console.log("PASS browser desktop and mobile: confirmation, stale stock, removal, and historical transaction edit");
      } finally {
        await browser?.close();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
    console.log("PASS real MySQL: catalog removal, audit, historical reports and balances, stale quantities, and new product with the same name");
    console.log("PASS real MySQL: stock opening, automatic approval, concurrent accounts, edits, deletion, weighted cost, blocked purchase removal, count permissions, margins, PDF and rejected sale restoration");
    await db.closeDbPool();
  }
} finally {
  await db?.closeDbPool();
  for (const database of created) {
    assert.match(database, /^amcco_review_\d+_(?:[0-3]|restore)$/);
    assert.notEqual(database, decodeURIComponent(source.pathname.slice(1)));
    await admin.query(`DROP DATABASE \`${database}\``);
  }
  await admin.end();
  console.log("Isolated review databases removed; application databases were not used.");
}
