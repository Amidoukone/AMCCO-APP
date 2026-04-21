import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "./db.js";
import { BUSINESS_ACTIVITIES } from "../types/business-activity.js";
import { logger } from "./logger.js";

type CompanyIdRow = RowDataPacket & {
  id: string;
};

type ColumnExistsRow = RowDataPacket & {
  Field: string;
};

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await queryRows<ColumnExistsRow[]>(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName]
  );
  return rows.length > 0;
}

async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const rows = await queryRows<RowDataPacket[]>(
    `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`,
    [indexName]
  );
  return rows.length > 0;
}

async function ensureActivityColumnOnTransactions(): Promise<void> {
  const hasActivityCode = await columnExists("transactions", "activity_code");
  if (!hasActivityCode) {
    await getDbPool().execute(
      `ALTER TABLE transactions ADD COLUMN activity_code VARCHAR(32) NULL AFTER currency`
    );
  }

  const hasIndex = await indexExists("transactions", "idx_transaction_company_activity_occurred");
  if (!hasIndex) {
    await getDbPool().execute(
      `ALTER TABLE transactions ADD KEY idx_transaction_company_activity_occurred (company_id, activity_code, occurred_at)`
    );
  }
}

async function ensureMetadataColumnOnTransactions(): Promise<void> {
  const hasMetadataJson = await columnExists("transactions", "metadata_json");
  if (!hasMetadataJson) {
    await getDbPool().execute(
      `ALTER TABLE transactions ADD COLUMN metadata_json JSON NULL AFTER description`
    );
  }
}

async function ensureActivityColumnOnTasks(): Promise<void> {
  const hasActivityCode = await columnExists("tasks", "activity_code");
  if (!hasActivityCode) {
    await getDbPool().execute(
      `ALTER TABLE tasks ADD COLUMN activity_code VARCHAR(32) NULL AFTER description`
    );
  }

  const hasIndex = await indexExists("tasks", "idx_task_company_activity_status");
  if (!hasIndex) {
    await getDbPool().execute(
      `ALTER TABLE tasks ADD KEY idx_task_company_activity_status (company_id, activity_code, status)`
    );
  }
}

async function ensureMetadataColumnOnTasks(): Promise<void> {
  const hasMetadataJson = await columnExists("tasks", "metadata_json");
  if (!hasMetadataJson) {
    await getDbPool().execute(
      `ALTER TABLE tasks ADD COLUMN metadata_json JSON NULL AFTER activity_code`
    );
  }
}

async function ensureCompanyActivitiesTable(): Promise<void> {
  await getDbPool().execute(
    `
      CREATE TABLE IF NOT EXISTS company_activities (
        company_id VARCHAR(36) NOT NULL,
        activity_code VARCHAR(32) NOT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (company_id, activity_code),
        KEY idx_company_activities_company_enabled (company_id, is_enabled),
        CONSTRAINT fk_company_activities_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureFinancialAccountScopeColumns(): Promise<void> {
  const hasScopeType = await columnExists("financial_accounts", "scope_type");
  if (!hasScopeType) {
    await getDbPool().execute(
      `ALTER TABLE financial_accounts ADD COLUMN scope_type ENUM('GLOBAL', 'DEDICATED', 'RESTRICTED') NOT NULL DEFAULT 'GLOBAL' AFTER balance`
    );
  }

  const hasPrimaryActivityCode = await columnExists("financial_accounts", "primary_activity_code");
  if (!hasPrimaryActivityCode) {
    await getDbPool().execute(
      `ALTER TABLE financial_accounts ADD COLUMN primary_activity_code VARCHAR(32) NULL AFTER scope_type`
    );
  }

  const hasIndex = await indexExists("financial_accounts", "idx_financial_account_company_scope");
  if (!hasIndex) {
    await getDbPool().execute(
      `ALTER TABLE financial_accounts ADD KEY idx_financial_account_company_scope (company_id, scope_type, primary_activity_code)`
    );
  }
}

async function ensureFinancialAccountActivitiesTable(): Promise<void> {
  await getDbPool().execute(
    `
      CREATE TABLE IF NOT EXISTS financial_account_activities (
        account_id VARCHAR(36) NOT NULL,
        activity_code VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, activity_code),
        KEY idx_financial_account_activities_activity (activity_code),
        CONSTRAINT fk_financial_account_activities_account FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureCompanyActivitiesSeeded(): Promise<void> {
  const companies = await queryRows<CompanyIdRow[]>(`SELECT id FROM companies`);
  if (companies.length === 0) {
    return;
  }

  const valuesSql = companies
    .flatMap(() => BUSINESS_ACTIVITIES.map(() => "(?, ?, 1)"))
    .join(", ");
  const values: Array<string | number> = [];

  for (const company of companies) {
    for (const activity of BUSINESS_ACTIVITIES) {
      values.push(company.id, activity.code);
    }
  }

  await getDbPool().execute(
    `
      INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
      VALUES ${valuesSql}
    `,
    values
  );
}

export async function ensureBusinessActivitySchemaReady(): Promise<void> {
  try {
    await ensureActivityColumnOnTransactions();
    await ensureMetadataColumnOnTransactions();
    await ensureActivityColumnOnTasks();
    await ensureMetadataColumnOnTasks();
    await ensureFinancialAccountScopeColumns();
    await ensureFinancialAccountActivitiesTable();
    await ensureCompanyActivitiesTable();
    await ensureCompanyActivitiesSeeded();
    logger.info("Business activity schema ready");
  } catch (error) {
    logger.error({ error }, "Failed to ensure business activity schema");
    throw error;
  }
}
