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

type ConstraintExistsRow = RowDataPacket & {
  constraintName: string;
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

async function constraintExists(tableName: string, constraintName: string): Promise<boolean> {
  const rows = await queryRows<ConstraintExistsRow[]>(
    `
      SELECT CONSTRAINT_NAME AS constraintName
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    [tableName, constraintName]
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

async function ensureSalaryConfirmationColumnsOnTransactions(): Promise<void> {
  if (!(await columnExists("transactions", "salary_confirmation_status"))) {
    await getDbPool().execute(
      `
        ALTER TABLE transactions
        ADD COLUMN salary_confirmation_status ENUM('NOT_REQUIRED', 'PENDING', 'CONFIRMED')
          NOT NULL DEFAULT 'NOT_REQUIRED' AFTER requires_proof
      `
    );
  }

  if (!(await columnExists("transactions", "salary_confirmed_by_id"))) {
    await getDbPool().execute(
      `
        ALTER TABLE transactions
        ADD COLUMN salary_confirmed_by_id VARCHAR(36) NULL AFTER salary_confirmation_status
      `
    );
  }

  if (!(await columnExists("transactions", "salary_confirmed_at"))) {
    await getDbPool().execute(
      `
        ALTER TABLE transactions
        ADD COLUMN salary_confirmed_at DATETIME NULL AFTER salary_confirmed_by_id
      `
    );
  }

  if (!(await indexExists("transactions", "idx_transaction_company_salary_confirmation"))) {
    await getDbPool().execute(
      `
        ALTER TABLE transactions
        ADD KEY idx_transaction_company_salary_confirmation
          (company_id, salary_confirmation_status, occurred_at)
      `
    );
  }

  if (!(await constraintExists("transactions", "fk_transaction_salary_confirmed_by"))) {
    await getDbPool().execute(
      `
        ALTER TABLE transactions
        ADD CONSTRAINT fk_transaction_salary_confirmed_by
          FOREIGN KEY (salary_confirmed_by_id) REFERENCES users(id) ON DELETE RESTRICT
      `
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

async function ensureCompanyProfileColumns(): Promise<void> {
  if (!(await columnExists("companies", "legal_name"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN legal_name VARCHAR(255) NULL AFTER code`
    );
  }
  if (!(await columnExists("companies", "registration_number"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN registration_number VARCHAR(128) NULL AFTER legal_name`
    );
  }
  if (!(await columnExists("companies", "tax_id"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN tax_id VARCHAR(128) NULL AFTER registration_number`
    );
  }
  if (!(await columnExists("companies", "email"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN email VARCHAR(255) NULL AFTER tax_id`
    );
  }
  if (!(await columnExists("companies", "phone"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN phone VARCHAR(64) NULL AFTER email`
    );
  }
  if (!(await columnExists("companies", "website"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN website VARCHAR(255) NULL AFTER phone`
    );
  }
  if (!(await columnExists("companies", "address_line_1"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN address_line_1 VARCHAR(255) NULL AFTER website`
    );
  }
  if (!(await columnExists("companies", "address_line_2"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN address_line_2 VARCHAR(255) NULL AFTER address_line_1`
    );
  }
  if (!(await columnExists("companies", "city"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN city VARCHAR(120) NULL AFTER address_line_2`
    );
  }
  if (!(await columnExists("companies", "state_region"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN state_region VARCHAR(120) NULL AFTER city`
    );
  }
  if (!(await columnExists("companies", "postal_code"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN postal_code VARCHAR(32) NULL AFTER state_region`
    );
  }
  if (!(await columnExists("companies", "country"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN country VARCHAR(120) NULL AFTER postal_code`
    );
  }
  if (!(await columnExists("companies", "business_sector"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN business_sector VARCHAR(120) NULL AFTER country`
    );
  }
  if (!(await columnExists("companies", "contact_full_name"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN contact_full_name VARCHAR(255) NULL AFTER business_sector`
    );
  }
  if (!(await columnExists("companies", "contact_job_title"))) {
    await getDbPool().execute(
      `ALTER TABLE companies ADD COLUMN contact_job_title VARCHAR(255) NULL AFTER contact_full_name`
    );
  }
}

async function ensureRefreshSessionsBootstrapSupport(): Promise<void> {
  const rows = await queryRows<(RowDataPacket & { Null: "YES" | "NO" })[]>(
    `SHOW COLUMNS FROM refresh_sessions LIKE 'company_id'`
  );

  if (rows.length === 0) {
    return;
  }

  if (rows[0].Null === "NO") {
    await getDbPool().execute(
      `ALTER TABLE refresh_sessions MODIFY company_id VARCHAR(36) NULL`
    );
  }
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
    await ensureRefreshSessionsBootstrapSupport();
    await ensureCompanyProfileColumns();
    await ensureActivityColumnOnTransactions();
    await ensureMetadataColumnOnTransactions();
    await ensureSalaryConfirmationColumnsOnTransactions();
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
