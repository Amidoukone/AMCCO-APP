import type { BusinessActivityCode } from "../config/businessActivities";

export type ActivityArticle = {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode;
  name: string;
  defaultMargin: string | null;
  defaultPurchaseUnitPrice: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityArticleSingleResponse = {
  item: ActivityArticle;
};

export type ActivityArticleListResponse = {
  items: ActivityArticle[];
};
