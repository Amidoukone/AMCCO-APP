import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

export type GeneralStoreShop = {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type GeneralStoreShopRow = RowDataPacket & {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  phone: string | null;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

function toGeneralStoreShop(row: GeneralStoreShopRow): GeneralStoreShop {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    location: row.location,
    phone: row.phone,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const SELECT_COLUMNS = `
  id AS id,
  company_id AS companyId,
  name AS name,
  location AS location,
  phone AS phone,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function listGeneralStoreShops(input: {
  companyId: string;
  activeOnly?: boolean;
}): Promise<GeneralStoreShop[]> {
  const filters = ["company_id = ?"];
  const values: Array<string> = [input.companyId];
  if (input.activeOnly) {
    filters.push("is_active = 1");
  }

  const rows = await queryRows<GeneralStoreShopRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM general_store_shops
      WHERE ${filters.join(" AND ")}
      ORDER BY name ASC
    `,
    values
  );
  return rows.map(toGeneralStoreShop);
}

export async function findGeneralStoreShopById(
  companyId: string,
  shopId: string
): Promise<GeneralStoreShop | null> {
  const rows = await queryRows<GeneralStoreShopRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM general_store_shops
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, shopId]
  );
  return rows[0] ? toGeneralStoreShop(rows[0]) : null;
}

export async function createGeneralStoreShop(input: {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  phone: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO general_store_shops (id, company_id, name, location, phone, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [input.id, input.companyId, input.name, input.location, input.phone]
  );
}

export async function updateGeneralStoreShop(input: {
  companyId: string;
  shopId: string;
  name: string;
  location: string | null;
  phone: string | null;
  isActive: boolean;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE general_store_shops
      SET
        name = ?,
        location = ?,
        phone = ?,
        is_active = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [input.name, input.location, input.phone, input.isActive ? 1 : 0, input.companyId, input.shopId]
  );
}

export async function deleteGeneralStoreShop(input: {
  companyId: string;
  shopId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM general_store_shops
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.shopId]
  );
}
