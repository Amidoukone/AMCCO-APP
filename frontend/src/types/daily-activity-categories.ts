export type DailyActivityCategory = {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyActivityCategorySingleResponse = {
  item: DailyActivityCategory;
};

export type DailyActivityCategoryListResponse = {
  items: DailyActivityCategory[];
};
