// Integration checks use only a generated, disposable database on local MySQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

assert.ok(process.argv.includes("--local"), "Explicit --local is required");
const settings = dotenv.parse(await readFile(new URL("../backend/.env", import.meta.url), "utf8"));
const source = new URL(process.env.AMCCO_REVIEW_MYSQL_URL ?? settings.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Remote databases are forbidden");
const database = `amcco_review_operators_${Date.now()}`;
assert.match(database, /^amcco_review_operators_\d+$/);
assert.notEqual(database, decodeURIComponent(source.pathname.slice(1)));
const adminURL = new URL(source); adminURL.pathname = "/";
const admin = await mysql.createConnection(adminURL.href);
let created = false;
let db;
try {
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  created = true;
  const target = new URL(source); target.pathname = `/${database}`;
  process.env.DATABASE_URL = target.href;
  process.env.DB_SSL = "false";
  process.env.NODE_ENV = "test";
  process.env.JWT_ACCESS_SECRET = "isolated-operator-review-access-12345";
  process.env.JWT_REFRESH_SECRET = "isolated-operator-review-refresh-12345";
  db = await import("../backend/dist/lib/db.js");
  const pool = db.getDbPool();
  const [[current]] = await pool.query("SELECT DATABASE() AS name");
  assert.equal(current.name, database);
  const schema = await readFile(new URL("../backend/sql/001_init_schema.sql", import.meta.url), "utf8");
  for (const sql of schema.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean)) {
    if (/^(?:CREATE\s+DATABASE|USE\s+)/i.test(sql)) continue;
    await pool.query(sql);
  }
  const sectors = ["HARDWARE", "HYDROCARBON", "BEVERAGE_DEPOT"];
  async function company(code, { active = true, usersActive = true, enabled = true } = {}) {
    const id = randomUUID();
    await pool.execute("INSERT INTO companies (id, name, code, is_active) VALUES (?, ?, ?, ?)", [id, code, code, Number(active)]);
    for (const sector of sectors) {
      const userId = randomUUID();
      await pool.execute("INSERT INTO users (id, email, password_hash, full_name, is_active) VALUES (?, ?, 'test-only', 'Test operator', ?)", [userId, `${userId}@example.invalid`, Number(usersActive)]);
      await pool.execute("INSERT INTO memberships (id, user_id, company_id, role) VALUES (?, ?, ?, ?)", [randomUUID(), userId, id, `${sector}_OPERATOR`]);
      await pool.execute("INSERT INTO company_activities (company_id, activity_code, is_enabled) VALUES (?, ?, ?)", [id, sector, Number(enabled)]);
    }
    return id;
  }
  const first = await company("FIRST"), second = await company("SECOND");
  const inactive = await company("INACTIVE", { active: false });
  const inactiveUsers = await company("INACTIVE-USERS", { usersActive: false });
  const disabled = await company("DISABLED-SECTORS", { enabled: false });
  const hardwareId = randomUUID(), restrictedId = randomUUID(), globalId = randomUUID();
  await pool.execute("INSERT INTO financial_accounts (id, company_id, name, balance, scope_type, primary_activity_code) VALUES (?, ?, 'Historical hardware cash', 54321, 'DEDICATED', 'HARDWARE')", [hardwareId, first]);
  await pool.execute("INSERT INTO financial_accounts (id, company_id, name, balance, scope_type) VALUES (?, ?, 'Existing beverage cash', 12345, 'RESTRICTED')", [restrictedId, first]);
  await pool.execute("INSERT INTO financial_account_activities (account_id, activity_code) VALUES (?, 'BEVERAGE_DEPOT')", [restrictedId]);
  await pool.execute("INSERT INTO financial_accounts (id, company_id, name, balance) VALUES (?, ?, 'Shared company bank', 98765)", [globalId, second]);
  const snapshot = async () => {
    const [rows] = await pool.query("SELECT * FROM financial_accounts WHERE id IN (?, ?, ?) ORDER BY id", [hardwareId, restrictedId, globalId]);
    return rows;
  };
  const before = await snapshot();
  const { ensureOperatorFinancialAccountsReady } = await import("../backend/dist/lib/operator-account-bootstrap.js");
  await Promise.all([ensureOperatorFinancialAccountsReady(), ensureOperatorFinancialAccountsReady()]);
  const [[counts]] = await pool.query("SELECT COUNT(*) AS total FROM financial_accounts");
  assert.equal(Number(counts.total), 7, "Concurrent startup creates only the four missing sector accounts");
  assert.deepEqual(await snapshot(), before, "Existing balances, scope and account metadata remain unchanged");
  const { listCompanyAccounts } = await import("../backend/dist/services/finance.service.js");
  for (const id of [first, second]) {
    for (const sector of sectors) {
      const accounts = await listCompanyAccounts({ companyId: id, role: `${sector}_OPERATOR` });
      assert.equal(accounts.length, 1, `${id} ${sector}: operator API returns one usable account`);
      assert.equal(accounts[0].companyId, id);
      assert.notEqual(accounts[0].id, globalId);
      if (![hardwareId, restrictedId].includes(accounts[0].id)) assert.equal(Number(accounts[0].balance), 0);
    }
  }
  for (const id of [inactive, inactiveUsers, disabled]) {
    const [[row]] = await pool.query("SELECT COUNT(*) AS total FROM financial_accounts WHERE company_id = ?", [id]);
    assert.equal(Number(row.total), 0, "Inactive companies/users and disabled sectors are skipped");
  }
  await ensureOperatorFinancialAccountsReady();
  const [[afterRestart]] = await pool.query("SELECT COUNT(*) AS total FROM financial_accounts");
  assert.equal(Number(afterRestart.total), 7, "Repeated deploy/restart is idempotent");
  const [[audits]] = await pool.query("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'FINANCE_OPERATOR_ACCOUNT_PROVISIONED'");
  assert.equal(Number(audits.total), 4, "Each created cash account has exactly one audit event");
  const failureCompany = await company("ROLLBACK");
  await pool.query(`CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated audit failure'`);
  await assert.rejects(ensureOperatorFinancialAccountsReady(failureCompany), /Simulated audit failure/);
  const [[rollback]] = await pool.query("SELECT COUNT(*) AS total FROM financial_accounts WHERE company_id = ?", [failureCompany]);
  assert.equal(Number(rollback.total), 0, "Failed audit rolls back account and sector link together");
  console.log("PASS operator accounts: all sectors visible, company isolation, existing balances preserved, concurrency, restarts, inactive/disabled scopes and transaction rollback");
} finally {
  if (db) await db.closeDbPool();
  if (created) {
    assert.match(database, /^amcco_review_operators_\d+$/);
    await admin.query(`DROP DATABASE \`${database}\``);
  }
  await admin.end();
}
