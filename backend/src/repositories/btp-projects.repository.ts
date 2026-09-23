import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

export type BtpProject = {
  id: string;
  companyId: string;
  name: string;
  clientRef: string | null;
  contractRef: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BtpProjectRow = RowDataPacket & {
  id: string;
  companyId: string;
  name: string;
  clientRef: string | null;
  contractRef: string | null;
  location: string | null;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

function toBtpProject(row: BtpProjectRow): BtpProject {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    clientRef: row.clientRef,
    contractRef: row.contractRef,
    location: row.location,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const SELECT_COLUMNS = `
  id AS id,
  company_id AS companyId,
  name AS name,
  client_ref AS clientRef,
  contract_ref AS contractRef,
  location AS location,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function listBtpProjects(input: {
  companyId: string;
  activeOnly?: boolean;
}): Promise<BtpProject[]> {
  const filters = ["company_id = ?"];
  const values: Array<string> = [input.companyId];
  if (input.activeOnly) {
    filters.push("is_active = 1");
  }

  const rows = await queryRows<BtpProjectRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM btp_projects
      WHERE ${filters.join(" AND ")}
      ORDER BY name ASC
    `,
    values
  );
  return rows.map(toBtpProject);
}

export async function findBtpProjectById(
  companyId: string,
  projectId: string
): Promise<BtpProject | null> {
  const rows = await queryRows<BtpProjectRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM btp_projects
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, projectId]
  );
  return rows[0] ? toBtpProject(rows[0]) : null;
}

export async function createBtpProject(input: {
  id: string;
  companyId: string;
  name: string;
  clientRef: string | null;
  contractRef: string | null;
  location: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO btp_projects (id, company_id, name, client_ref, contract_ref, location, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
    [input.id, input.companyId, input.name, input.clientRef, input.contractRef, input.location]
  );
}

export async function updateBtpProject(input: {
  companyId: string;
  projectId: string;
  name: string;
  clientRef: string | null;
  contractRef: string | null;
  location: string | null;
  isActive: boolean;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE btp_projects
      SET
        name = ?,
        client_ref = ?,
        contract_ref = ?,
        location = ?,
        is_active = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [
      input.name,
      input.clientRef,
      input.contractRef,
      input.location,
      input.isActive ? 1 : 0,
      input.companyId,
      input.projectId
    ]
  );
}

export async function deleteBtpProject(input: {
  companyId: string;
  projectId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM btp_projects
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.projectId]
  );
}
