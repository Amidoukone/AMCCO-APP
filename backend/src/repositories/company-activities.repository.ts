import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import {
  BUSINESS_ACTIVITIES,
  type BusinessActivityCode,
  type BusinessActivityDefinition
} from "../types/business-activity.js";

type CompanyActivityRow = RowDataPacket & {
  activityCode: BusinessActivityCode;
  isEnabled: number;
};

export type CompanyActivityItem = BusinessActivityDefinition & {
  isEnabled: boolean;
};

type LegacyCountsRow = RowDataPacket & {
  unclassifiedTransactionsCount: number;
  unclassifiedTasksCount: number;
};

async function ensureCompanyActivitiesStorageReady(): Promise<void> {
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

async function ensureCompanyActivitiesSeeded(companyId: string): Promise<void> {
  await ensureCompanyActivitiesStorageReady();

  const valuesSql = BUSINESS_ACTIVITIES.map(() => "(?, ?, 1)").join(", ");
  const values: Array<string | number> = [];

  for (const activity of BUSINESS_ACTIVITIES) {
    values.push(companyId, activity.code);
  }

  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
      VALUES ${valuesSql}
    `,
    values
  );
}

function toCompanyActivityItems(rows: CompanyActivityRow[]): CompanyActivityItem[] {
  const rowMap = new Map(rows.map((row) => [row.activityCode, row.isEnabled === 1]));
  return BUSINESS_ACTIVITIES.map((activity) => ({
    ...activity,
    isEnabled: rowMap.get(activity.code) ?? true
  }));
}

export async function listCompanyActivities(companyId: string): Promise<CompanyActivityItem[]> {
  await ensureCompanyActivitiesSeeded(companyId);

  const rows = await queryRows<CompanyActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        is_enabled AS isEnabled
      FROM company_activities
      WHERE company_id = ?
    `,
    [companyId]
  );

  return toCompanyActivityItems(rows);
}

export async function isCompanyActivityEnabled(
  companyId: string,
  activityCode: BusinessActivityCode
): Promise<boolean> {
  await ensureCompanyActivitiesSeeded(companyId);

  const rows = await queryRows<CompanyActivityRow[]>(
    `
      SELECT
        activity_code AS activityCode,
        is_enabled AS isEnabled
      FROM company_activities
      WHERE company_id = ?
        AND activity_code = ?
      LIMIT 1
    `,
    [companyId, activityCode]
  );

  if (rows.length === 0) {
    return true;
  }

  return rows[0].isEnabled === 1;
}

export async function upsertCompanyActivity(input: {
  companyId: string;
  activityCode: BusinessActivityCode;
  isEnabled: boolean;
}): Promise<void> {
  await ensureCompanyActivitiesSeeded(input.companyId);

  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO company_activities (company_id, activity_code, is_enabled)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = VALUES(is_enabled)
    `,
    [input.companyId, input.activityCode, input.isEnabled ? 1 : 0]
  );
}

export async function getCompanyLegacyActivitySummary(companyId: string): Promise<{
  unclassifiedTransactionsCount: number;
  unclassifiedTasksCount: number;
}> {
  const rows = await queryRows<LegacyCountsRow[]>(
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM transactions t
          WHERE t.company_id = ?
            AND t.activity_code IS NULL
        ) AS unclassifiedTransactionsCount,
        (
          SELECT COUNT(*)
          FROM tasks k
          WHERE k.company_id = ?
            AND k.activity_code IS NULL
        ) AS unclassifiedTasksCount
    `,
    [companyId, companyId]
  );

  return {
    unclassifiedTransactionsCount: rows[0]?.unclassifiedTransactionsCount ?? 0,
    unclassifiedTasksCount: rows[0]?.unclassifiedTasksCount ?? 0
  };
}

export async function reclassifyLegacyTransactions(
  companyId: string,
  activityCode: BusinessActivityCode
): Promise<number> {
  const [result] = await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE transactions
      SET activity_code = ?
      WHERE company_id = ?
        AND activity_code IS NULL
    `,
    [activityCode, companyId]
  );

  return result.affectedRows ?? 0;
}

export async function reclassifyLegacyTasks(
  companyId: string,
  activityCode: BusinessActivityCode
): Promise<number> {
  const [result] = await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE tasks
      SET activity_code = ?
      WHERE company_id = ?
        AND activity_code IS NULL
    `,
    [activityCode, companyId]
  );

  return result.affectedRows ?? 0;
}
