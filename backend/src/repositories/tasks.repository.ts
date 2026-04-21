import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { RoleCode } from "../types/role.js";
import { getDbPool, queryRows } from "../lib/db.js";
import type { BusinessActivityCode } from "../types/business-activity.js";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";

type OperationTaskRow = RowDataPacket & {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  activityCode: BusinessActivityCode | null;
  metadataJson: unknown;
  status: TaskStatus;
  createdById: string;
  createdByEmail: string;
  createdByFullName: string;
  assignedToId: string | null;
  assignedToEmail: string | null;
  assignedToFullName: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type OperationTaskMinimalRow = RowDataPacket & {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode | null;
  status: TaskStatus;
  createdById: string;
  assignedToId: string | null;
};

type TaskAssigneeRow = RowDataPacket & {
  userId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  todoTasksCount: number;
  doneTasksCount: number;
  totalAssignedTasksCount: number;
};

export type OperationTask = {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  activityCode: BusinessActivityCode | null;
  metadata: Record<string, string>;
  status: TaskStatus;
  createdById: string;
  createdByEmail: string;
  createdByFullName: string;
  assignedToId: string | null;
  assignedToEmail: string | null;
  assignedToFullName: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationTaskMinimal = {
  id: string;
  companyId: string;
  activityCode: BusinessActivityCode | null;
  status: TaskStatus;
  createdById: string;
  assignedToId: string | null;
};

export type TaskAssignee = {
  userId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  todoTasksCount: number;
  doneTasksCount: number;
  totalAssignedTasksCount: number;
};

function toMetadataMap(value: unknown): Record<string, string> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return toMetadataMap(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string")
      .map(([key, item]) => [key, item as string])
  );
}

function toOperationTask(row: OperationTaskRow): OperationTask {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    activityCode: row.activityCode,
    metadata: toMetadataMap(row.metadataJson),
    status: row.status,
    createdById: row.createdById,
    createdByEmail: row.createdByEmail,
    createdByFullName: row.createdByFullName,
    assignedToId: row.assignedToId,
    assignedToEmail: row.assignedToEmail,
    assignedToFullName: row.assignedToFullName,
    dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

function toOperationTaskMinimal(row: OperationTaskMinimalRow): OperationTaskMinimal {
  return {
    id: row.id,
    companyId: row.companyId,
    activityCode: row.activityCode,
    status: row.status,
    createdById: row.createdById,
    assignedToId: row.assignedToId
  };
}

function toTaskAssignee(row: TaskAssigneeRow): TaskAssignee {
  return {
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    openTasksCount: row.openTasksCount ?? 0,
    inProgressTasksCount: row.inProgressTasksCount ?? 0,
    blockedTasksCount: row.blockedTasksCount ?? 0,
    todoTasksCount: row.todoTasksCount ?? 0,
    doneTasksCount: row.doneTasksCount ?? 0,
    totalAssignedTasksCount: row.totalAssignedTasksCount ?? 0
  };
}

export async function listOperationsTasks(input: {
  companyId: string;
  limit: number;
  offset: number;
  status?: TaskStatus;
  activityCode?: BusinessActivityCode;
  createdById?: string;
  assignedToId?: string;
  scopeUserId?: string;
  unassignedOnly?: boolean;
}): Promise<OperationTask[]> {
  const filters: string[] = ["t.company_id = ?", "t.activity_code IS NOT NULL"];
  const values: Array<string | number> = [input.companyId];

  if (input.status) {
    filters.push("t.status = ?");
    values.push(input.status);
  }
  if (input.activityCode) {
    filters.push("t.activity_code = ?");
    values.push(input.activityCode);
  }

  if (input.createdById) {
    filters.push("t.created_by_id = ?");
    values.push(input.createdById);
  }

  if (input.assignedToId) {
    filters.push("t.assigned_to_id = ?");
    values.push(input.assignedToId);
  }

  if (input.scopeUserId) {
    filters.push("(t.created_by_id = ? OR t.assigned_to_id = ?)");
    values.push(input.scopeUserId, input.scopeUserId);
  }

  if (input.unassignedOnly) {
    filters.push("t.assigned_to_id IS NULL");
  }

  values.push(input.limit, input.offset);

  const rows = await queryRows<OperationTaskRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.title AS title,
        t.description AS description,
        t.activity_code AS activityCode,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        cu.full_name AS createdByFullName,
        t.assigned_to_id AS assignedToId,
        au.email AS assignedToEmail,
        au.full_name AS assignedToFullName,
        t.due_date AS dueDate,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM tasks t
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users au ON au.id = t.assigned_to_id
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE t.status
          WHEN 'BLOCKED' THEN 0
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'TODO' THEN 2
          ELSE 3
        END ASC,
        COALESCE(t.due_date, '9999-12-31') ASC,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `,
    values
  );

  return rows.map(toOperationTask);
}

export async function createOperationTask(input: {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  activityCode: BusinessActivityCode;
  metadata: Record<string, string>;
  status: TaskStatus;
  createdById: string;
  assignedToId: string | null;
  dueDate: Date | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      INSERT INTO tasks (
        id, company_id, title, description, activity_code, metadata_json, status, created_by_id, assigned_to_id, due_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.id,
      input.companyId,
      input.title,
      input.description,
      input.activityCode,
      JSON.stringify(input.metadata),
      input.status,
      input.createdById,
      input.assignedToId,
      input.dueDate
    ]
  );
}

export async function findOperationTaskById(
  companyId: string,
  taskId: string
): Promise<OperationTask | null> {
  const rows = await queryRows<OperationTaskRow[]>(
    `
      SELECT
        t.id AS id,
        t.company_id AS companyId,
        t.title AS title,
        t.description AS description,
        t.activity_code AS activityCode,
        t.metadata_json AS metadataJson,
        t.status AS status,
        t.created_by_id AS createdById,
        cu.email AS createdByEmail,
        cu.full_name AS createdByFullName,
        t.assigned_to_id AS assignedToId,
        au.email AS assignedToEmail,
        au.full_name AS assignedToFullName,
        t.due_date AS dueDate,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt
      FROM tasks t
      INNER JOIN users cu ON cu.id = t.created_by_id
      LEFT JOIN users au ON au.id = t.assigned_to_id
      WHERE t.company_id = ?
        AND t.id = ?
      LIMIT 1
    `,
    [companyId, taskId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toOperationTask(rows[0]);
}

export async function findOperationTaskMinimalById(
  companyId: string,
  taskId: string
): Promise<OperationTaskMinimal | null> {
  const rows = await queryRows<OperationTaskMinimalRow[]>(
    `
      SELECT
        id AS id,
        company_id AS companyId,
        activity_code AS activityCode,
        status AS status,
        created_by_id AS createdById,
        assigned_to_id AS assignedToId
      FROM tasks
      WHERE company_id = ?
        AND id = ?
      LIMIT 1
    `,
    [companyId, taskId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toOperationTaskMinimal(rows[0]);
}

export async function updateOperationTaskAssignment(input: {
  companyId: string;
  taskId: string;
  assignedToId: string | null;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE tasks
      SET assigned_to_id = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [input.assignedToId, input.companyId, input.taskId]
  );
}

export async function updateOperationTaskStatus(input: {
  companyId: string;
  taskId: string;
  status: TaskStatus;
}): Promise<void> {
  await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE tasks
      SET status = ?
      WHERE company_id = ?
        AND id = ?
    `,
    [input.status, input.companyId, input.taskId]
  );
}

export async function listCompanyTaskAssignees(
  companyId: string,
  activityCode?: BusinessActivityCode
): Promise<TaskAssignee[]> {
  const joinFilters: string[] = ["t.company_id = m.company_id", "t.assigned_to_id = u.id"];
  const values: Array<string | number> = [];

  if (activityCode) {
    joinFilters.push("t.activity_code = ?");
    values.push(activityCode);
  }

  values.push(companyId);

  const rows = await queryRows<TaskAssigneeRow[]>(
    `
      SELECT
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        m.role AS role,
        COALESCE(SUM(CASE WHEN t.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS openTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgressTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'TODO' THEN 1 ELSE 0 END), 0) AS todoTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END), 0) AS doneTasksCount,
        COUNT(t.id) AS totalAssignedTasksCount
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN tasks t ON ${joinFilters.join(" AND ")}
      WHERE m.company_id = ?
        AND u.is_active = 1
        AND m.role IN ('SUPERVISOR', 'EMPLOYEE')
      GROUP BY u.id, u.email, u.full_name, m.role
      ORDER BY openTasksCount ASC, inProgressTasksCount ASC, u.full_name ASC, u.email ASC
    `,
    values
  );
  return rows.map(toTaskAssignee);
}

export async function findCompanyTaskAssigneeByUserId(
  companyId: string,
  userId: string
): Promise<TaskAssignee | null> {
  const rows = await queryRows<TaskAssigneeRow[]>(
    `
      SELECT
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        m.role AS role,
        COALESCE(SUM(CASE WHEN t.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END), 0) AS openTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS inProgressTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blockedTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'TODO' THEN 1 ELSE 0 END), 0) AS todoTasksCount,
        COALESCE(SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END), 0) AS doneTasksCount,
        COUNT(t.id) AS totalAssignedTasksCount
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN tasks t ON t.company_id = m.company_id AND t.assigned_to_id = u.id
      WHERE m.company_id = ?
        AND m.user_id = ?
        AND u.is_active = 1
        AND m.role IN ('SUPERVISOR', 'EMPLOYEE')
      GROUP BY u.id, u.email, u.full_name, m.role
      LIMIT 1
    `,
    [companyId, userId]
  );

  if (rows.length === 0) {
    return null;
  }
  return toTaskAssignee(rows[0]);
}

export async function findOperationTasksMinimalByIds(
  companyId: string,
  taskIds: string[]
): Promise<OperationTaskMinimal[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const placeholders = taskIds.map(() => "?").join(", ");
  const rows = await queryRows<OperationTaskMinimalRow[]>(
    `
      SELECT
        id AS id,
        company_id AS companyId,
        activity_code AS activityCode,
        status AS status,
        created_by_id AS createdById,
        assigned_to_id AS assignedToId
      FROM tasks
      WHERE company_id = ?
        AND id IN (${placeholders})
    `,
    [companyId, ...taskIds]
  );
  return rows.map(toOperationTaskMinimal);
}
