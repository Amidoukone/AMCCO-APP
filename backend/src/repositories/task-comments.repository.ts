import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, queryRows } from "../lib/db.js";

type TaskCommentRow = RowDataPacket & {
  id: string;
  companyId: string;
  taskId: string;
  authorId: string;
  authorEmail: string;
  authorFullName: string;
  body: string;
  createdAt: Date;
};

export type TaskComment = {
  id: string;
  companyId: string;
  taskId: string;
  authorId: string;
  authorEmail: string;
  authorFullName: string;
  body: string;
  createdAt: string;
};

function toTaskComment(row: TaskCommentRow): TaskComment {
  return {
    id: row.id,
    companyId: row.companyId,
    taskId: row.taskId,
    authorId: row.authorId,
    authorEmail: row.authorEmail,
    authorFullName: row.authorFullName,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString()
  };
}

export async function listTaskCommentsByTask(input: {
  companyId: string;
  taskId: string;
  limit: number;
  offset: number;
}): Promise<TaskComment[]> {
  const rows = await queryRows<TaskCommentRow[]>(
    `
      SELECT
        tc.id AS id,
        tc.company_id AS companyId,
        tc.task_id AS taskId,
        tc.author_id AS authorId,
        u.email AS authorEmail,
        u.full_name AS authorFullName,
        tc.body AS body,
        tc.created_at AS createdAt
      FROM task_comments tc
      INNER JOIN users u ON u.id = tc.author_id
      WHERE tc.company_id = ?
        AND tc.task_id = ?
      ORDER BY tc.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [input.companyId, input.taskId, input.limit, input.offset]
  );
  return rows.map(toTaskComment);
}

export async function createTaskComment(input: {
  id: string;
  companyId: string;
  taskId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO task_comments (id, company_id, task_id, author_id, body)
      VALUES (?, ?, ?, ?, ?)
    `,
    [input.id, input.companyId, input.taskId, input.authorId, input.body]
  );
}

export async function findTaskCommentById(
  companyId: string,
  commentId: string
): Promise<TaskComment | null> {
  const rows = await queryRows<TaskCommentRow[]>(
    `
      SELECT
        tc.id AS id,
        tc.company_id AS companyId,
        tc.task_id AS taskId,
        tc.author_id AS authorId,
        u.email AS authorEmail,
        u.full_name AS authorFullName,
        tc.body AS body,
        tc.created_at AS createdAt
      FROM task_comments tc
      INNER JOIN users u ON u.id = tc.author_id
      WHERE tc.company_id = ?
        AND tc.id = ?
      LIMIT 1
    `,
    [companyId, commentId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toTaskComment(rows[0]);
}
