import type { BusinessActivityCode } from "../config/businessActivities";
import type { RoleCode } from "./role";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
export type TaskScope = "ALL" | "ASSIGNED_TO_ME" | "CREATED_BY_ME" | "MINE";

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

export type OperationTaskMember = {
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

export type OperationTaskSingleResponse = {
  item: OperationTask;
};

export type OperationTaskListResponse = {
  items: OperationTask[];
};

export type OperationTaskMembersResponse = {
  items: OperationTaskMember[];
};

export type OperationTaskTimelineEvent = {
  id: string;
  companyId: string;
  actorId: string;
  actorEmail: string;
  actorFullName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
};

export type OperationTaskTimelineResponse = {
  items: OperationTaskTimelineEvent[];
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

export type TaskCommentSingleResponse = {
  item: TaskComment;
};

export type TaskCommentListResponse = {
  items: TaskComment[];
};
