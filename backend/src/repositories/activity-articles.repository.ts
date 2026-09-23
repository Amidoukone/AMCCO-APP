import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";
import type { BusinessActivityCode } from "../types/business-activity.js";

export type ActivityArticle = {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode;
  name: string;
  defaultMargin: string | null;
  defaultPurchaseUnitPrice: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityArticleRow = RowDataPacket & {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode;
  name: string;
  defaultMargin: string | null;
  defaultPurchaseUnitPrice: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toActivityArticle(row: ActivityArticleRow): ActivityArticle {
  return {
    id: row.id,
    companyId: row.companyId,
    activityCode: row.activityCode,
    name: row.name,
    defaultMargin: row.defaultMargin,
    defaultPurchaseUnitPrice: row.defaultPurchaseUnitPrice,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const SELECT_COLUMNS = `
  id AS id,
  company_id AS companyId,
  activity_code AS activityCode,
  name AS name,
  CAST(default_margin AS CHAR) AS defaultMargin,
  CAST(default_purchase_unit_price AS CHAR) AS defaultPurchaseUnitPrice,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function listActivityArticles(input: {
  companyId: string;
  activityCode: BusinessActivityCode;
}): Promise<ActivityArticle[]> {
  const rows = await queryRows<ActivityArticleRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM activity_articles
      WHERE company_id = ?
        AND activity_code = ?
      ORDER BY name ASC
    `,
    [input.companyId, input.activityCode]
  );
  return rows.map(toActivityArticle);
}

export async function findActivityArticleById(
  companyId: string,
  articleId: string
): Promise<ActivityArticle | null> {
  const rows = await queryRows<ActivityArticleRow[]>(
    `
      SELECT ${SELECT_COLUMNS}
      FROM activity_articles
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, articleId]
  );
  return rows[0] ? toActivityArticle(rows[0]) : null;
}

export async function createActivityArticle(input: {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode;
  name: string;
  defaultMargin: string | null;
  defaultPurchaseUnitPrice: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO activity_articles (id, company_id, activity_code, name, default_margin, default_purchase_unit_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      input.id,
      input.companyId,
      input.activityCode,
      input.name,
      input.defaultMargin,
      input.defaultPurchaseUnitPrice
    ]
  );
}

export async function updateActivityArticle(input: {
  companyId: string;
  articleId: string;
  name: string;
  defaultMargin: string | null;
  defaultPurchaseUnitPrice: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE activity_articles
      SET
        name = ?,
        default_margin = ?,
        default_purchase_unit_price = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [
      input.name,
      input.defaultMargin,
      input.defaultPurchaseUnitPrice,
      input.companyId,
      input.articleId
    ]
  );
}

export async function deleteActivityArticle(input: {
  companyId: string;
  articleId: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      DELETE FROM activity_articles
      WHERE company_id = ?
        AND id = ?
    `,
    [input.companyId, input.articleId]
  );
}
