import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import type { CompanyMembershipSummary, CompanyProfile } from "../types/company.js";
import type { RoleCode } from "../types/role.js";

type CompanyRow = RowDataPacket & {
  id: string;
  name: string;
  code: string;
  legalName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  businessSector: string | null;
  contactFullName: string | null;
  contactJobTitle: string | null;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

type CompanyMembershipRow = RowDataPacket & {
  companyId: string;
  companyCode: string;
  companyName: string;
  role: RoleCode;
  isActive: number;
};

function toCompanyProfile(row: CompanyRow): CompanyProfile {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    legalName: row.legalName,
    registrationNumber: row.registrationNumber,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    website: row.website,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateRegion: row.stateRegion,
    postalCode: row.postalCode,
    country: row.country,
    businessSector: row.businessSector,
    contactFullName: row.contactFullName,
    contactJobTitle: row.contactJobTitle,
    isActive: row.isActive === 1,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export async function listAllCompanyIds(): Promise<string[]> {
  const rows = await queryRows<(RowDataPacket & { id: string })[]>(
    `
      SELECT id
      FROM companies
      ORDER BY name ASC, code ASC
    `
  );

  return rows.map((row) => row.id);
}

export async function findCompanyById(companyId: string): Promise<CompanyProfile | null> {
  const rows = await queryRows<CompanyRow[]>(
    `
      SELECT
        id,
        name,
        code,
        legal_name AS legalName,
        registration_number AS registrationNumber,
        tax_id AS taxId,
        email,
        phone,
        website,
        address_line_1 AS addressLine1,
        address_line_2 AS addressLine2,
        city,
        state_region AS stateRegion,
        postal_code AS postalCode,
        country,
        business_sector AS businessSector,
        contact_full_name AS contactFullName,
        contact_job_title AS contactJobTitle,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM companies
      WHERE id = ?
      LIMIT 1
    `,
    [companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return toCompanyProfile(rows[0]);
}

export async function findCompanyByCode(companyCode: string): Promise<CompanyProfile | null> {
  const rows = await queryRows<CompanyRow[]>(
    `
      SELECT
        id,
        name,
        code,
        legal_name AS legalName,
        registration_number AS registrationNumber,
        tax_id AS taxId,
        email,
        phone,
        website,
        address_line_1 AS addressLine1,
        address_line_2 AS addressLine2,
        city,
        state_region AS stateRegion,
        postal_code AS postalCode,
        country,
        business_sector AS businessSector,
        contact_full_name AS contactFullName,
        contact_job_title AS contactJobTitle,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM companies
      WHERE code = ?
      LIMIT 1
    `,
    [companyCode]
  );

  if (rows.length === 0) {
    return null;
  }

  return toCompanyProfile(rows[0]);
}

export async function listUserCompanyMemberships(
  userId: string
): Promise<CompanyMembershipSummary[]> {
  const rows = await queryRows<CompanyMembershipRow[]>(
    `
      SELECT
        c.id AS companyId,
        c.code AS companyCode,
        c.name AS companyName,
        m.role AS role,
        c.is_active AS isActive
      FROM memberships m
      INNER JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ?
      ORDER BY c.name ASC, c.code ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    companyId: row.companyId,
    companyCode: row.companyCode,
    companyName: row.companyName,
    role: row.role,
    isActive: row.isActive === 1
  }));
}

export async function listCompaniesForUser(userId: string): Promise<
  Array<{
    company: CompanyProfile;
    role: RoleCode;
  }>
> {
  const rows = await queryRows<(CompanyRow & { role: RoleCode })[]>(
    `
      SELECT
        c.id,
        c.name,
        c.code,
        c.legal_name AS legalName,
        c.registration_number AS registrationNumber,
        c.tax_id AS taxId,
        c.email,
        c.phone,
        c.website,
        c.address_line_1 AS addressLine1,
        c.address_line_2 AS addressLine2,
        c.city,
        c.state_region AS stateRegion,
        c.postal_code AS postalCode,
        c.country,
        c.business_sector AS businessSector,
        c.contact_full_name AS contactFullName,
        c.contact_job_title AS contactJobTitle,
        c.is_active AS isActive,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        m.role AS role
      FROM memberships m
      INNER JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ?
      ORDER BY c.name ASC, c.code ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    company: toCompanyProfile(row),
    role: row.role
  }));
}

export async function findUserCompanyMembership(input: {
  userId: string;
  companyId: string;
}): Promise<{
  company: CompanyProfile;
  role: RoleCode;
} | null> {
  const rows = await queryRows<(CompanyRow & { role: RoleCode })[]>(
    `
      SELECT
        c.id,
        c.name,
        c.code,
        c.legal_name AS legalName,
        c.registration_number AS registrationNumber,
        c.tax_id AS taxId,
        c.email,
        c.phone,
        c.website,
        c.address_line_1 AS addressLine1,
        c.address_line_2 AS addressLine2,
        c.city,
        c.state_region AS stateRegion,
        c.postal_code AS postalCode,
        c.country,
        c.business_sector AS businessSector,
        c.contact_full_name AS contactFullName,
        c.contact_job_title AS contactJobTitle,
        c.is_active AS isActive,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        m.role AS role
      FROM memberships m
      INNER JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ?
        AND c.id = ?
      LIMIT 1
    `,
    [input.userId, input.companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    company: toCompanyProfile(rows[0]),
    role: rows[0].role
  };
}

export async function createCompany(input: {
  id: string;
  name: string;
  code: string;
  legalName?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  businessSector?: string | null;
  contactFullName?: string | null;
  contactJobTitle?: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO companies (
        id, name, code, legal_name, registration_number, tax_id, email, phone, website,
        address_line_1, address_line_2, city, state_region, postal_code, country,
        business_sector, contact_full_name, contact_job_title, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    [
      input.id,
      input.name,
      input.code,
      input.legalName ?? null,
      input.registrationNumber ?? null,
      input.taxId ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      input.city ?? null,
      input.stateRegion ?? null,
      input.postalCode ?? null,
      input.country ?? null,
      input.businessSector ?? null,
      input.contactFullName ?? null,
      input.contactJobTitle ?? null
    ]
  );
}

export async function updateCompanyProfile(input: {
  companyId: string;
  name: string;
  legalName?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  businessSector?: string | null;
  contactFullName?: string | null;
  contactJobTitle?: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE companies
      SET
        name = ?,
        legal_name = ?,
        registration_number = ?,
        tax_id = ?,
        email = ?,
        phone = ?,
        website = ?,
        address_line_1 = ?,
        address_line_2 = ?,
        city = ?,
        state_region = ?,
        postal_code = ?,
        country = ?,
        business_sector = ?,
        contact_full_name = ?,
        contact_job_title = ?
      WHERE id = ?
    `,
    [
      input.name,
      input.legalName ?? null,
      input.registrationNumber ?? null,
      input.taxId ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      input.city ?? null,
      input.stateRegion ?? null,
      input.postalCode ?? null,
      input.country ?? null,
      input.businessSector ?? null,
      input.contactFullName ?? null,
      input.contactJobTitle ?? null,
      input.companyId
    ]
  );
}

export async function deactivateCompany(companyId: string): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE companies
      SET is_active = 0
      WHERE id = ?
    `,
    [companyId]
  );
}
