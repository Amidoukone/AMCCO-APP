import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "./db.js";

export type IdColumn = RowDataPacket & {
  tableName: string; columnType: string; characterSet: string | null; collation: string | null;
};

export function stringColumnDefinition(column: IdColumn): string {
  if (!/^(?:var)?char\([1-9]\d{0,3}\)$/i.test(column.columnType) ||
      !column.characterSet || !/^[a-z0-9_]+$/i.test(column.characterSet) ||
      !column.collation || !/^[a-z0-9_]+$/i.test(column.collation)) {
    throw new Error(`Unsupported identifier definition for ${column.tableName}.id; no existing table has been modified.`);
  }
  return `${column.columnType} CHARACTER SET ${column.characterSet} COLLATE ${column.collation}`;
}

// Only new columns are adapted. Existing company identifiers are never converted.
export async function createCompanyOwnedTable(statement: string): Promise<void> {
  const columns = await queryRows<IdColumn[]>(`SELECT TABLE_NAME AS tableName, COLUMN_TYPE AS columnType,
    CHARACTER_SET_NAME AS characterSet, COLLATION_NAME AS collation FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'id'`);
  const company = columns.find((column) => column.tableName === "companies");
  if (!company) throw new Error("companies.id is missing; initialize the base schema first.");
  await getDbPool().execute(statement.replace(/\bcompany_id VARCHAR\(36\) NOT NULL/g, `company_id ${stringColumnDefinition(company)} NOT NULL`));
}
