import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

export type RentalTenant = {
  id: string;
  companyId: string;
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string | null;
  tenancyStart: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RentalTenantRow = RowDataPacket & {
  id: string;
  companyId: string;
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string | null;
  tenancyStart: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

function toRentalTenant(row: RentalTenantRow): RentalTenant {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    unitLabel: row.unitLabel,
    monthlyRent: row.monthlyRent,
    phone: row.phone,
    tenancyStart: row.tenancyStart,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const SELECT_COLUMNS = `
  id AS id,
  company_id AS companyId,
  name AS name,
  unit_label AS unitLabel,
  CAST(monthly_rent AS CHAR) AS monthlyRent,
  phone AS phone,
  tenancy_start AS tenancyStart,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function listRentalTenants(input: {
  companyId: string;
  activeOnly?: boolean;
}): Promise<RentalTenant[]> {
  const filters = ["company_id = ?"];
  const values: Array<string> = [input.companyId];
  if (input.activeOnly) {
    filters.push("is_active = 1");
  }

  const rows = await queryRows<RentalTenantRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM rental_tenants
      WHERE ${filters.join(" AND ")}
      ORDER BY name ASC
    `,
    values
  );
  return rows.map(toRentalTenant);
}

export async function findRentalTenantById(
  companyId: string,
  tenantId: string
): Promise<RentalTenant | null> {
  const rows = await queryRows<RentalTenantRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM rental_tenants
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, tenantId]
  );
  return rows[0] ? toRentalTenant(rows[0]) : null;
}

export async function createRentalTenant(input: {
  id: string;
  companyId: string;
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string | null;
  tenancyStart: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO rental_tenants (id, company_id, name, unit_label, monthly_rent, phone, tenancy_start, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      input.id,
      input.companyId,
      input.name,
      input.unitLabel,
      input.monthlyRent,
      input.phone,
      input.tenancyStart
    ]
  );
}

export async function updateRentalTenant(input: {
  companyId: string;
  tenantId: string;
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string | null;
  tenancyStart: string;
  isActive: boolean;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE rental_tenants
      SET
        name = ?,
        unit_label = ?,
        monthly_rent = ?,
        phone = ?,
        tenancy_start = ?,
        is_active = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [
      input.name,
      input.unitLabel,
      input.monthlyRent,
      input.phone,
      input.tenancyStart,
      input.isActive ? 1 : 0,
      input.companyId,
      input.tenantId
    ]
  );
}

export async function deleteRentalTenant(input: {
  companyId: string;
  tenantId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM rental_tenants
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.tenantId]
  );
}
