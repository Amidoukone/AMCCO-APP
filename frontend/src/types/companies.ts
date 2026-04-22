import type { RoleCode } from "./role";

export type CompanyProfile = {
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanyMembershipSummary = {
  companyId: string;
  companyCode: string;
  companyName: string;
  role: RoleCode;
  isActive: boolean;
};

export type AdminCompanyItem = {
  company: CompanyProfile;
  role: RoleCode;
};

export type AdminCompaniesListResponse = {
  items: AdminCompanyItem[];
};

export type AdminCompanySingleResponse = {
  item: AdminCompanyItem;
};

export type CreateCompanyInput = {
  name: string;
  code: string;
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
};

export type UpdateCompanyInput = {
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
};
