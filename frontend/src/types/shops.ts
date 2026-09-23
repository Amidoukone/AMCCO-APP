export type GeneralStoreShop = {
  id: string;
  companyId: string;
  name: string;
  location: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GeneralStoreShopSingleResponse = {
  item: GeneralStoreShop;
};

export type GeneralStoreShopListResponse = {
  items: GeneralStoreShop[];
};
