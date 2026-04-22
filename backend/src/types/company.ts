import type { RoleCode } from "./role.js";

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
