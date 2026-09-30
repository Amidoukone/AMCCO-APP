import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

export type DailyActivityCategory = {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DailyActivityCategoryRow = RowDataPacket & {
  id: string;
  companyId: string;
  name: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDailyActivityCategory(row: DailyActivityCategoryRow): DailyActivityCategory {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const SELECT_COLUMNS = `
  id AS id,
  company_id AS companyId,
  name AS name,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function listDailyActivityCategories(input: {
  companyId: string;
  activeOnly?: boolean;
}): Promise<DailyActivityCategory[]> {
  const filters = ["company_id = ?"];
  const values: Array<string> = [input.companyId];
  if (input.activeOnly) {
    filters.push("is_active = 1");
  }

  const rows = await queryRows<DailyActivityCategoryRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM daily_activity_categories
      WHERE ${filters.join(" AND ")}
      ORDER BY name ASC
    `,
    values
  );
  return rows.map(toDailyActivityCategory);
}

export async function findDailyActivityCategoryById(
  companyId: string,
  categoryId: string
): Promise<DailyActivityCategory | null> {
  const rows = await queryRows<DailyActivityCategoryRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM daily_activity_categories
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, categoryId]
  );
  return rows[0] ? toDailyActivityCategory(rows[0]) : null;
}

export async function createDailyActivityCategory(input: {
  id: string;
  companyId: string;
  name: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO daily_activity_categories (id, company_id, name, is_active)
      VALUES (?, ?, ?, 1)
    `,
    [input.id, input.companyId, input.name]
  );
}

export async function seedDefaultDailyActivityCategories(input: {
  companyId: string;
  categories: Array<{ id: string; name: string }>;
}): Promise<void> {
  if (input.categories.length === 0) {
    return;
  }
  const valuesSql = input.categories.map(() => "(?, ?, ?, 1)").join(", ");
  const values = input.categories.flatMap((category) => [category.id, input.companyId, category.name]);
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT IGNORE INTO daily_activity_categories (id, company_id, name, is_active)
      VALUES ${valuesSql}
    `,
    values
  );
}

export async function updateDailyActivityCategory(input: {
  companyId: string;
  categoryId: string;
  name: string;
  isActive: boolean;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE daily_activity_categories
      SET
        name = ?,
        is_active = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [input.name, input.isActive ? 1 : 0, input.companyId, input.categoryId]
  );
}

export async function deleteDailyActivityCategory(input: {
  companyId: string;
  categoryId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM daily_activity_categories
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.categoryId]
  );
}
