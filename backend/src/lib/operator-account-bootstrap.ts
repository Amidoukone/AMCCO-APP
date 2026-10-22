import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "./db.js";
import { logger } from "./logger.js";

const OPERATOR_SECTORS = [
  { role: "HARDWARE_OPERATOR", code: "HARDWARE", name: "Caisse opérateur Quincaillerie" },
  { role: "HYDROCARBON_OPERATOR", code: "HYDROCARBON", name: "Caisse opérateur Hydrocarbure" },
  { role: "BEVERAGE_DEPOT_OPERATOR", code: "BEVERAGE_DEPOT", name: "Caisse opérateur Dépôt de boissons" }
] as const;

/** Provision missing working cash accounts; local database records are never deployed. */
export async function ensureOperatorFinancialAccountsReady(companyId?: string): Promise<void> {
  const connection = await getDbPool().getConnection();
  try {
    const [companies] = await connection.query<(RowDataPacket & { id: string })[]>(
      `SELECT DISTINCT c.id FROM companies c
       JOIN memberships m ON m.company_id = c.id
       JOIN users u ON u.id = m.user_id
       WHERE c.is_active = 1 AND u.is_active = 1
         AND m.role IN ('HARDWARE_OPERATOR', 'HYDROCARBON_OPERATOR', 'BEVERAGE_DEPOT_OPERATOR')
         ${companyId ? "AND c.id = ?" : ""}
       ORDER BY c.id`,
      companyId ? [companyId] : []
    );
    for (const company of companies) {
      await connection.beginTransaction();
      // Serialize simultaneous backend starts before checking and creating accounts.
      const [locked] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM companies WHERE id = ? AND is_active = 1 FOR UPDATE", [company.id]
      );
      if (!locked.length) {
        await connection.rollback();
        continue;
      }
      const created: Array<{ id: string; activityCode: string }> = [];
      for (const sector of OPERATOR_SECTORS) {
        const [operators] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT u.id FROM memberships m JOIN users u ON u.id = m.user_id
           JOIN company_activities ca ON ca.company_id = m.company_id AND ca.activity_code = ?
           WHERE m.company_id = ? AND m.role = ? AND u.is_active = 1 AND ca.is_enabled = 1
           ORDER BY u.id LIMIT 1`,
          [sector.code, company.id, sector.role]
        );
        if (!operators.length) continue;
        // Exactly the same visibility rules as the operator's GET /finance/accounts.
        const [existing] = await connection.query<RowDataPacket[]>(
          `SELECT fa.id FROM financial_accounts fa WHERE fa.company_id = ? AND (
             (fa.scope_type = 'DEDICATED' AND fa.primary_activity_code = ?)
             OR (fa.scope_type = 'RESTRICTED'
               AND EXISTS (SELECT 1 FROM financial_account_activities faa WHERE faa.account_id = fa.id AND faa.activity_code = ?)
               AND NOT EXISTS (SELECT 1 FROM financial_account_activities other_faa WHERE other_faa.account_id = fa.id AND other_faa.activity_code <> ?))
           ) LIMIT 1`,
          [company.id, sector.code, sector.code, sector.code]
        );
        if (existing.length) continue;
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO financial_accounts (id, company_id, name, balance, scope_type, primary_activity_code)
           VALUES (?, ?, ?, 0, 'DEDICATED', ?)`,
          [id, company.id, sector.name, sector.code]
        );
        await connection.execute(
          "INSERT INTO financial_account_activities (account_id, activity_code) VALUES (?, ?)",
          [id, sector.code]
        );
        // This is a system bootstrap event associated with an affected operator, not a user request.
        await connection.execute(
          `INSERT INTO audit_logs (id, company_id, actor_id, action, entity_type, entity_id, metadata)
           VALUES (?, ?, ?, 'FINANCE_OPERATOR_ACCOUNT_PROVISIONED', 'FINANCIAL_ACCOUNT', ?, ?)`,
          [randomUUID(), company.id, operators[0].id, id, JSON.stringify({
            source: "backend-bootstrap", scopeType: "DEDICATED", primaryActivityCode: sector.code,
            openingBalance: "0.00", systemGenerated: true
          })]
        );
        created.push({ id, activityCode: sector.code });
      }
      await connection.commit();
      if (created.length) logger.info({ companyId: company.id, accounts: created }, "Missing operator financial accounts provisioned");
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
