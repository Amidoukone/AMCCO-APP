import { randomUUID } from "node:crypto";
import { HttpError } from "../errors/http-error.js";
import { createRoleTargetedAlerts } from "./alerts.service.js";
import {
  createMembershipIfMissing,
  listAllUsers
} from "../repositories/admin-users.repository.js";
import {
  createCompany,
  deactivateCompany,
  findCompanyByCode,
  findUserCompanyMembership,
  listCompaniesForUser
  ,
  permanentlyDeleteCompany,
  updateCompanyProfile
} from "../repositories/companies.repository.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import type { AuthContext } from "../types/auth.js";

function normalizeOptional(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeCompanyCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listAccessibleCompanies(actor: AuthContext) {
  return listCompaniesForUser(actor.userId);
}

function assertCompanyManagementGovernance(role: AuthContext["role"]): void {
  if (role !== "OWNER" && role !== "SYS_ADMIN") {
    throw new HttpError(403, "Permissions insuffisantes pour modifier cette entreprise.");
  }
}

async function getManagedCompanyForActor(actor: AuthContext, companyId: string) {
  const membership = await findUserCompanyMembership({
    userId: actor.userId,
    companyId
  });

  if (!membership) {
    throw new HttpError(404, "Entreprise introuvable ou inaccessible.");
  }

  assertCompanyManagementGovernance(actor.role);

  return membership;
}

export async function createCompanyForActor(
  actor: AuthContext,
  input: {
    name: string;
    code?: string;
    legalName?: string;
    registrationNumber?: string;
    taxId?: string;
    email?: string;
    phone?: string;
    website?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateRegion?: string;
    postalCode?: string;
    country?: string;
    businessSector?: string;
    contactFullName?: string;
    contactJobTitle?: string;
  }
) {
  if (actor.role !== "OWNER" && actor.role !== "SYS_ADMIN") {
    throw new HttpError(403, "Permissions insuffisantes pour creer une entreprise.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Le nom de l'entreprise est obligatoire.");
  }

  const code = normalizeCompanyCode(input.code || input.name);
  if (!code || code.length < 2) {
    throw new HttpError(400, "Le code entreprise est invalide.");
  }

  const existingCompany = await findCompanyByCode(code);
  if (existingCompany) {
    throw new HttpError(409, "Une entreprise avec ce code existe deja.");
  }

  const companyId = randomUUID();
  await createCompany({
    id: companyId,
    name,
    code,
    legalName: normalizeOptional(input.legalName),
    registrationNumber: normalizeOptional(input.registrationNumber),
    taxId: normalizeOptional(input.taxId),
    email: normalizeOptional(input.email),
    phone: normalizeOptional(input.phone),
    website: normalizeOptional(input.website),
    addressLine1: normalizeOptional(input.addressLine1),
    addressLine2: normalizeOptional(input.addressLine2),
    city: normalizeOptional(input.city),
    stateRegion: normalizeOptional(input.stateRegion),
    postalCode: normalizeOptional(input.postalCode),
    country: normalizeOptional(input.country),
    businessSector: normalizeOptional(input.businessSector),
    contactFullName: normalizeOptional(input.contactFullName),
    contactJobTitle: normalizeOptional(input.contactJobTitle)
  });

  const users = await listAllUsers();
  for (const item of users) {
    await createMembershipIfMissing({
      membershipId: randomUUID(),
      companyId,
      userId: item.userId,
      role: item.userId === actor.userId ? actor.role : "EMPLOYEE"
    });
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId,
    actorId: actor.userId,
    action: "COMPANY_CREATED",
    entityType: "COMPANY",
    entityId: companyId,
    metadataJson: JSON.stringify({
      code,
      name,
      inheritedUsersCount: users.length,
      legalName: normalizeOptional(input.legalName),
      registrationNumber: normalizeOptional(input.registrationNumber),
      taxId: normalizeOptional(input.taxId),
      email: normalizeOptional(input.email),
      phone: normalizeOptional(input.phone),
      website: normalizeOptional(input.website),
      addressLine1: normalizeOptional(input.addressLine1),
      addressLine2: normalizeOptional(input.addressLine2),
      city: normalizeOptional(input.city),
      stateRegion: normalizeOptional(input.stateRegion),
      postalCode: normalizeOptional(input.postalCode),
      country: normalizeOptional(input.country),
      businessSector: normalizeOptional(input.businessSector),
      contactFullName: normalizeOptional(input.contactFullName),
      contactJobTitle: normalizeOptional(input.contactJobTitle)
    })
  });

  const items = await listCompaniesForUser(actor.userId);
  const created = items.find((item) => item.company.id === companyId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger l'entreprise creee.");
  }

  return created;
}

export async function updateCompanyForActor(
  actor: AuthContext,
  input: {
    companyId: string;
    name?: string;
    legalName?: string;
    registrationNumber?: string;
    taxId?: string;
    email?: string;
    phone?: string;
    website?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateRegion?: string;
    postalCode?: string;
    country?: string;
    businessSector?: string;
    contactFullName?: string;
    contactJobTitle?: string;
  }
) {
  const managedCompany = await getManagedCompanyForActor(actor, input.companyId);
  const existing = managedCompany.company;

  if (!existing.isActive) {
    throw new HttpError(400, "Cette entreprise est inactive et ne peut pas etre modifiee.");
  }

  const nextName = input.name?.trim() || existing.name;
  if (!nextName) {
    throw new HttpError(400, "Le nom de l'entreprise est obligatoire.");
  }

  await updateCompanyProfile({
    companyId: existing.id,
    name: nextName,
    legalName:
      input.legalName !== undefined ? normalizeOptional(input.legalName) : existing.legalName,
    registrationNumber:
      input.registrationNumber !== undefined
        ? normalizeOptional(input.registrationNumber)
        : existing.registrationNumber,
    taxId: input.taxId !== undefined ? normalizeOptional(input.taxId) : existing.taxId,
    email: input.email !== undefined ? normalizeOptional(input.email) : existing.email,
    phone: input.phone !== undefined ? normalizeOptional(input.phone) : existing.phone,
    website: input.website !== undefined ? normalizeOptional(input.website) : existing.website,
    addressLine1:
      input.addressLine1 !== undefined ? normalizeOptional(input.addressLine1) : existing.addressLine1,
    addressLine2:
      input.addressLine2 !== undefined ? normalizeOptional(input.addressLine2) : existing.addressLine2,
    city: input.city !== undefined ? normalizeOptional(input.city) : existing.city,
    stateRegion:
      input.stateRegion !== undefined ? normalizeOptional(input.stateRegion) : existing.stateRegion,
    postalCode:
      input.postalCode !== undefined ? normalizeOptional(input.postalCode) : existing.postalCode,
    country: input.country !== undefined ? normalizeOptional(input.country) : existing.country,
    businessSector:
      input.businessSector !== undefined
        ? normalizeOptional(input.businessSector)
        : existing.businessSector,
    contactFullName:
      input.contactFullName !== undefined
        ? normalizeOptional(input.contactFullName)
        : existing.contactFullName,
    contactJobTitle:
      input.contactJobTitle !== undefined
        ? normalizeOptional(input.contactJobTitle)
        : existing.contactJobTitle
  });

  const updated = await findUserCompanyMembership({
    userId: actor.userId,
    companyId: existing.id
  });

  if (!updated) {
    throw new HttpError(500, "Impossible de recharger l'entreprise modifiee.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: updated.company.id,
    actorId: actor.userId,
    action: "COMPANY_UPDATED",
    entityType: "COMPANY",
    entityId: updated.company.id,
    metadataJson: JSON.stringify({
      previousName: existing.name,
      previousLegalName: existing.legalName,
      previousRegistrationNumber: existing.registrationNumber,
      previousTaxId: existing.taxId,
      previousEmail: existing.email,
      previousPhone: existing.phone,
      previousWebsite: existing.website,
      previousAddressLine1: existing.addressLine1,
      previousAddressLine2: existing.addressLine2,
      previousCity: existing.city,
      previousStateRegion: existing.stateRegion,
      previousPostalCode: existing.postalCode,
      previousCountry: existing.country,
      previousBusinessSector: existing.businessSector,
      previousContactFullName: existing.contactFullName,
      previousContactJobTitle: existing.contactJobTitle,
      name: updated.company.name,
      code: updated.company.code,
      legalName: updated.company.legalName,
      registrationNumber: updated.company.registrationNumber,
      taxId: updated.company.taxId,
      email: updated.company.email,
      phone: updated.company.phone,
      website: updated.company.website,
      addressLine1: updated.company.addressLine1,
      addressLine2: updated.company.addressLine2,
      city: updated.company.city,
      stateRegion: updated.company.stateRegion,
      postalCode: updated.company.postalCode,
      country: updated.company.country,
      businessSector: updated.company.businessSector,
      contactFullName: updated.company.contactFullName,
      contactJobTitle: updated.company.contactJobTitle
    })
  });

  if (actor.role === "SYS_ADMIN") {
    await createRoleTargetedAlerts({
      companyId: updated.company.id,
      recipientRoles: ["OWNER"],
      excludeUserIds: [actor.userId],
      code: "COMPANY_UPDATED",
      message: `L'entreprise ${updated.company.name} a ete modifiee par l'admin systeme.`,
      severity: "WARNING",
      entityType: "COMPANY",
      entityId: updated.company.id,
      metadata: {
        companyId: updated.company.id,
        companyName: updated.company.name,
        companyCode: updated.company.code,
        actorRole: actor.role
      }
    });
  }

  return updated;
}

export async function deleteCompanyForActor(
  actor: AuthContext,
  input: {
    companyId: string;
  }
): Promise<void> {
  const managedCompany = await getManagedCompanyForActor(actor, input.companyId);
  const existing = managedCompany.company;

  if (actor.role !== "OWNER" && actor.role !== "SYS_ADMIN") {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer cette entreprise.");
  }

  if (existing.id === actor.companyId) {
    throw new HttpError(400, "Change d'entreprise active avant de supprimer celle-ci.");
  }

  if (existing.code === "AMCCO") {
    throw new HttpError(400, "L'entreprise par defaut AMCCO ne peut pas etre supprimee.");
  }

  if (existing.isActive) {
    await deactivateCompany(existing.id);

    await createAuditLogRecord({
      auditId: randomUUID(),
      companyId: existing.id,
      actorId: actor.userId,
      action: "COMPANY_DELETED",
      entityType: "COMPANY",
      entityId: existing.id,
      metadataJson: JSON.stringify({
        name: existing.name,
        code: existing.code,
        legalName: existing.legalName,
        registrationNumber: existing.registrationNumber,
        taxId: existing.taxId,
        email: existing.email,
        phone: existing.phone,
        website: existing.website,
        addressLine1: existing.addressLine1,
        addressLine2: existing.addressLine2,
        city: existing.city,
        stateRegion: existing.stateRegion,
        postalCode: existing.postalCode,
        country: existing.country,
        businessSector: existing.businessSector,
        contactFullName: existing.contactFullName,
        contactJobTitle: existing.contactJobTitle,
        deletedByRole: actor.role,
        deletedAt: new Date().toISOString()
      })
    });

    return;
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.userId,
    action: "COMPANY_PURGED",
    entityType: "COMPANY",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      deletedCompanyId: existing.id,
      deletedCompanyName: existing.name,
      deletedCompanyCode: existing.code,
      deletedByRole: actor.role,
      purgedAt: new Date().toISOString()
    })
  });

  await permanentlyDeleteCompany(existing.id);
}
