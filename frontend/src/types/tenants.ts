export type RentalTenant = {
  id: string;
  companyId: string;
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string | null;
  tenancyStart: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RentalTenantSingleResponse = {
  item: RentalTenant;
};

export type RentalTenantListResponse = {
  items: RentalTenant[];
};
