import { randomUUID } from "node:crypto";
import {
  assertTaskInputMatchesActivityProfile,
  assertTaskStatusMatchesActivityProfile,
  getBusinessActivityProfile,
  getTaskBlockedAlertSeverity,
  normalizeActivityMetadata
} from "../config/business-activity-profiles.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord, listAuditLogsByEntity } from "../repositories/audit.repository.js";
import {
  createOperationTask,
  deleteOperationTask,
  findCompanyTaskAssigneeByUserId,
  findOperationTaskById,
  findOperationTaskMinimalById,
  findOperationTasksMinimalByIds,
  listCompanyTaskAssignees,
  listOperationsTasks,
  type TaskStatus,
  updateOperationTask,
  updateOperationTaskAssignment,
  updateOperationTaskStatus
} from "../repositories/tasks.repository.js";
import {
  createTaskComment,
  findTaskCommentById,
  listTaskCommentsByTask
} from "../repositories/task-comments.repository.js";
import type { BusinessActivityCode } from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

type ActorContext = {
  actorId: string;
  companyId: string;
  role: RoleCode;
};

type TaskScope = "ALL" | "ASSIGNED_TO_ME" | "CREATED_BY_ME" | "MINE";

const OPERATIONS_ACCESS_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "SUPERVISOR", "EMPLOYEE"];
const TASK_MANAGEMENT_ROLES: RoleCode[] = ["OWNER", "SYS_ADMIN", "SUPERVISOR"];
const TASK_TIMELINE_ACTIONS = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_ASSIGNED",
  "TASK_UNASSIGNED",
  "TASK_STATUS_CHANGED"
];

function ensureOperationsAccess(role: RoleCode): void {
  if (!OPERATIONS_ACCESS_ROLES.includes(role)) {
    throw new HttpError(403, "Permissions insuffisantes pour acceder au module operations.");
  }
}

function canManageTasks(role: RoleCode): boolean {
  return TASK_MANAGEMENT_ROLES.includes(role);
}

function canCreateTasks(role: RoleCode): boolean {
  return OPERATIONS_ACCESS_ROLES.includes(role);
}

function canEditTask(actor: ActorContext, task: { createdById: string }): boolean {
  if (canManageTasks(actor.role)) {
    return true;
  }
  return actor.role === "EMPLOYEE" && task.createdById === actor.actorId;
}

function canViewTask(actor: ActorContext, task: { createdById: string; assignedToId: string | null }): boolean {
  if (canManageTasks(actor.role)) {
    return true;
  }
  return task.createdById === actor.actorId || task.assignedToId === actor.actorId;
}

function computeListFilters(actor: ActorContext, scope: TaskScope | undefined): {
  scopeUserId?: string;
  createdById?: string;
  assignedToId?: string;
} {
  if (actor.role === "EMPLOYEE") {
    return { assignedToId: actor.actorId };
  }

  if (scope === "ASSIGNED_TO_ME") {
    return { assignedToId: actor.actorId };
  }

  if (scope === "CREATED_BY_ME") {
    return { createdById: actor.actorId };
  }

  if (scope === "MINE") {
    return { scopeUserId: actor.actorId };
  }

  return {};
}

export async function listCompanyTasks(
  actor: ActorContext,
  input: {
    limit?: number;
    offset?: number;
    status?: TaskStatus;
    activityCode?: BusinessActivityCode;
    scope?: TaskScope;
    unassignedOnly?: boolean;
  }
) {
  ensureOperationsAccess(actor.role);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const filters = computeListFilters(actor, input.scope);

  return listOperationsTasks({
    companyId: actor.companyId,
    limit,
    offset,
    status: input.status,
    activityCode: input.activityCode,
    unassignedOnly: input.unassignedOnly,
    ...filters
  });
}

export async function listCompanyTaskMembers(
  actor: ActorContext,
  input: {
    activityCode?: BusinessActivityCode;
  } = {}
) {
  if (!canManageTasks(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter les membres assignables.");
  }
  return listCompanyTaskAssignees(actor.companyId, input.activityCode);
}

export async function getCompanyTaskById(
  actor: ActorContext,
  input: {
    taskId: string;
  }
) {
  ensureOperationsAccess(actor.role);
  const task = await findOperationTaskById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canViewTask(actor, task)) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter cette tache.");
  }
  return task;
}

export async function createCompanyTask(
  actor: ActorContext,
  input: {
    title: string;
    description?: string;
    activityCode: BusinessActivityCode;
    assignedToId?: string;
    metadata?: Record<string, string>;
    dueDate?: string;
  }
) {
  if (!canCreateTasks(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour creer une tache.");
  }

  await ensureCompanyActivityEnabledOrThrow(actor.companyId, input.activityCode);
  const metadata = normalizeActivityMetadata(input.metadata);
  const requestedAssignedToId = actor.role === "EMPLOYEE" ? actor.actorId : input.assignedToId;
  try {
    assertTaskInputMatchesActivityProfile(input.activityCode, {
      description: input.description,
      assignedToId: requestedAssignedToId,
      dueDate: input.dueDate,
      metadata
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
  }
  const profile = getBusinessActivityProfile(input.activityCode);

  let assignedToId: string | null = null;
  if (actor.role === "EMPLOYEE") {
    assignedToId = actor.actorId;
  } else if (input.assignedToId) {
    const assignee = await findCompanyTaskAssigneeByUserId(actor.companyId, input.assignedToId);
    if (!assignee) {
      throw new HttpError(400, "Utilisateur assigne invalide ou inactif.");
    }
    assignedToId = assignee.userId;
  }

  const taskId = randomUUID();
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const initialStatus: TaskStatus = assignedToId ? "IN_PROGRESS" : "TODO";

  await createOperationTask({
    id: taskId,
    companyId: actor.companyId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    activityCode: input.activityCode,
    metadata,
    status: initialStatus,
    createdById: actor.actorId,
    assignedToId,
    dueDate
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "TASK_CREATED",
    entityType: "TASK",
    entityId: taskId,
    metadataJson: JSON.stringify({
      title: input.title.trim(),
      activityCode: input.activityCode,
      metadata,
      assignedToId,
      initialStatus,
      dueDate: dueDate ? dueDate.toISOString() : null,
      taskWorkflow: profile.tasks.workflow.map((step) => step.code)
    })
  });

  if (assignedToId) {
    await createAuditLogRecord({
      auditId: randomUUID(),
      companyId: actor.companyId,
      actorId: actor.actorId,
      action: "TASK_ASSIGNED",
      entityType: "TASK",
      entityId: taskId,
      metadataJson: JSON.stringify({
        previousAssignedToId: null,
        nextAssignedToId: assignedToId,
        note: null,
        previousStatus: "TODO",
        nextStatus: initialStatus
      })
    });
  }

  const created = await findOperationTaskById(actor.companyId, taskId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger la tache creee.");
  }

  if (assignedToId && assignedToId !== actor.actorId) {
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds: [assignedToId],
      code: "TASK_ASSIGNED",
      message: `Une nouvelle tache ${profile.label} vous a ete assignee: ${created.title}`,
      severity: "INFO",
      entityType: "TASK",
      entityId: created.id,
      metadata: {
        taskId: created.id,
        title: created.title
      }
    });
  }

  if (actor.role === "EMPLOYEE") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["SUPERVISOR"],
      excludeUserIds: [actor.actorId],
      code: "TASK_CREATED_BY_EMPLOYEE",
      message: `Une nouvelle tache a ete creee par ${created.createdByFullName}: ${created.title}`,
      severity: "INFO",
      entityType: "TASK",
      entityId: created.id,
      metadata: {
        taskId: created.id,
        title: created.title,
        createdById: created.createdById
      }
    });
  }

  return created;
}

export async function assignCompanyTask(
  actor: ActorContext,
  input: {
    taskId: string;
    assignedToId: string | null;
    note?: string;
  }
) {
  if (!canManageTasks(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour assigner une tache.");
  }

  const task = await findOperationTaskMinimalById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }

  let nextAssignedToId: string | null = null;
  if (input.assignedToId) {
    const assignee = await findCompanyTaskAssigneeByUserId(actor.companyId, input.assignedToId);
    if (!assignee) {
      throw new HttpError(400, "Utilisateur assigne invalide ou inactif.");
    }
    nextAssignedToId = assignee.userId;
  }

  if (task.activityCode) {
    const profile = getBusinessActivityProfile(task.activityCode);
    if (profile.tasks.requiresAssignee && !nextAssignedToId) {
      throw new HttpError(
        400,
        `Le secteur ${profile.label} impose qu'une tache conserve un responsable assigne.`
      );
    }
  }

  if (task.status === "DONE" && task.assignedToId !== nextAssignedToId) {
    throw new HttpError(400, "Une tache terminee ne peut pas etre re-assignee.");
  }

  if (task.assignedToId === nextAssignedToId) {
    const current = await findOperationTaskById(actor.companyId, task.id);
    if (!current) {
      throw new HttpError(500, "Impossible de recharger la tache.");
    }
    return current;
  }

  await updateOperationTaskAssignment({
    companyId: actor.companyId,
    taskId: task.id,
    assignedToId: nextAssignedToId
  });

  let previousStatus = task.status;
  let nextStatus = task.status;

  if (task.status === "TODO" && nextAssignedToId) {
    nextStatus = "IN_PROGRESS";
    await updateOperationTaskStatus({
      companyId: actor.companyId,
      taskId: task.id,
      status: nextStatus
    });
  } else if (task.status === "IN_PROGRESS" && !nextAssignedToId) {
    nextStatus = "TODO";
    await updateOperationTaskStatus({
      companyId: actor.companyId,
      taskId: task.id,
      status: nextStatus
    });
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: nextAssignedToId ? "TASK_ASSIGNED" : "TASK_UNASSIGNED",
    entityType: "TASK",
    entityId: task.id,
    metadataJson: JSON.stringify({
      previousAssignedToId: task.assignedToId,
      nextAssignedToId,
      note: input.note?.trim() || null,
      previousStatus,
      nextStatus
    })
  });

  const updated = await findOperationTaskById(actor.companyId, task.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la tache mise a jour.");
  }

  if (nextAssignedToId && nextAssignedToId !== actor.actorId) {
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds: [nextAssignedToId],
      code: "TASK_ASSIGNED",
      message: `Une tache vous a ete assignee: ${updated.title}`,
      severity: "INFO",
      entityType: "TASK",
      entityId: updated.id,
      metadata: {
        taskId: updated.id,
        title: updated.title,
        note: input.note?.trim() || null
      }
    });
  }

  return updated;
}

export async function assignCompanyTasksBulk(
  actor: ActorContext,
  input: {
    taskIds: string[];
    assignedToId: string | null;
    note?: string;
  }
) {
  if (!canManageTasks(actor.role)) {
    throw new HttpError(403, "Permissions insuffisantes pour assigner des taches.");
  }

  const uniqueTaskIds = Array.from(new Set(input.taskIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueTaskIds.length === 0) {
    throw new HttpError(400, "Aucune tache valide fournie.");
  }
  if (uniqueTaskIds.length > 100) {
    throw new HttpError(400, "Maximum 100 taches par assignation en lot.");
  }

  const tasks = await findOperationTasksMinimalByIds(actor.companyId, uniqueTaskIds);
  if (tasks.length !== uniqueTaskIds.length) {
    throw new HttpError(404, "Au moins une tache est introuvable.");
  }

  if (input.assignedToId) {
    const assignee = await findCompanyTaskAssigneeByUserId(actor.companyId, input.assignedToId);
    if (!assignee) {
      throw new HttpError(400, "Utilisateur assigne invalide ou inactif.");
    }
  }

  for (const task of tasks) {
    if (task.status === "DONE" && task.assignedToId !== input.assignedToId) {
      throw new HttpError(400, "Le lot contient une tache terminee qui ne peut pas etre re-assignee.");
    }
  }

  const items = [];
  for (const taskId of uniqueTaskIds) {
    const updated = await assignCompanyTask(actor, {
      taskId,
      assignedToId: input.assignedToId,
      note: input.note
    });
    items.push(updated);
  }
  return items;
}

export async function updateCompanyTask(
  actor: ActorContext,
  input: {
    taskId: string;
    title: string;
    description?: string;
    metadata?: Record<string, string>;
    dueDate?: string;
  }
) {
  ensureOperationsAccess(actor.role);

  const existing = await findOperationTaskById(actor.companyId, input.taskId);
  if (!existing) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canEditTask(actor, existing)) {
    throw new HttpError(403, "Permissions insuffisantes pour modifier cette tache.");
  }
  if (existing.status === "DONE") {
    throw new HttpError(400, "Une tache terminee ne peut plus etre modifiee.");
  }
  if (!existing.activityCode) {
    throw new HttpError(400, "L'activite de cette tache est introuvable.");
  }

  const title = input.title.trim();
  if (!title) {
    throw new HttpError(400, "Le titre de la tache est obligatoire.");
  }

  const metadata = normalizeActivityMetadata(input.metadata);
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;

  try {
    assertTaskInputMatchesActivityProfile(existing.activityCode, {
      description: input.description,
      assignedToId: existing.assignedToId ?? undefined,
      dueDate: input.dueDate,
      metadata
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
  }

  await updateOperationTask({
    companyId: actor.companyId,
    taskId: existing.id,
    title,
    description: input.description?.trim() || null,
    metadata,
    dueDate
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "TASK_UPDATED",
    entityType: "TASK",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      previousTitle: existing.title,
      nextTitle: title,
      previousDescription: existing.description,
      nextDescription: input.description?.trim() || null,
      previousDueDate: existing.dueDate,
      nextDueDate: dueDate ? dueDate.toISOString() : null,
      previousMetadata: existing.metadata,
      nextMetadata: metadata
    })
  });

  const updated = await findOperationTaskById(actor.companyId, existing.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la tache modifiee.");
  }

  return updated;
}

export async function deleteCompanyTask(
  actor: ActorContext,
  input: {
    taskId: string;
  }
): Promise<void> {
  ensureOperationsAccess(actor.role);

  const existing = await findOperationTaskById(actor.companyId, input.taskId);
  if (!existing) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canEditTask(actor, existing)) {
    throw new HttpError(403, "Permissions insuffisantes pour supprimer cette tache.");
  }
  if (existing.status === "DONE") {
    throw new HttpError(400, "Une tache terminee ne peut plus etre supprimee.");
  }

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "TASK_DELETED",
    entityType: "TASK",
    entityId: existing.id,
    metadataJson: JSON.stringify({
      title: existing.title,
      description: existing.description,
      status: existing.status,
      activityCode: existing.activityCode,
      assignedToId: existing.assignedToId,
      dueDate: existing.dueDate,
      metadata: existing.metadata
    })
  });

  await deleteOperationTask({
    companyId: actor.companyId,
    taskId: existing.id
  });
}

export async function updateCompanyTaskStatus(
  actor: ActorContext,
  input: {
    taskId: string;
    status: TaskStatus;
  }
) {
  ensureOperationsAccess(actor.role);

  const task = await findOperationTaskMinimalById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }

  const canUpdate = canManageTasks(actor.role) || task.assignedToId === actor.actorId;
  if (!canUpdate) {
    throw new HttpError(403, "Permissions insuffisantes pour changer ce statut.");
  }

  try {
    assertTaskStatusMatchesActivityProfile(task.activityCode, task, input.status);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Regle metier invalide.");
  }

  const profile = task.activityCode ? getBusinessActivityProfile(task.activityCode) : null;

  if (task.status !== input.status) {
    await updateOperationTaskStatus({
      companyId: actor.companyId,
      taskId: task.id,
      status: input.status
    });

    await createAuditLogRecord({
      auditId: randomUUID(),
      companyId: actor.companyId,
      actorId: actor.actorId,
      action: "TASK_STATUS_CHANGED",
      entityType: "TASK",
      entityId: task.id,
      metadataJson: JSON.stringify({
        previousStatus: task.status,
        nextStatus: input.status,
        activityCode: task.activityCode,
        taskWorkflow: profile?.tasks.workflow.map((step) => step.code) ?? []
      })
    });
  }

  const updated = await findOperationTaskById(actor.companyId, task.id);
  if (!updated) {
    throw new HttpError(500, "Impossible de recharger la tache apres changement de statut.");
  }

  if (input.status === "BLOCKED") {
    await createRoleTargetedAlerts({
      companyId: actor.companyId,
      recipientRoles: ["OWNER", "SYS_ADMIN", "SUPERVISOR"],
      excludeUserIds: [actor.actorId],
      code: "TASK_BLOCKED",
      message: `Une tache ${profile ? profile.label : "operationnelle"} est bloquee et requiert une attention management: ${updated.title}`,
      severity: getTaskBlockedAlertSeverity(updated.activityCode),
      entityType: "TASK",
      entityId: updated.id,
      metadata: {
        taskId: updated.id,
        title: updated.title
      }
    });
  }

  if (input.status === "DONE" && updated.createdById !== actor.actorId) {
    await createUserTargetedAlerts({
      companyId: actor.companyId,
      recipientUserIds: [updated.createdById],
      code: "TASK_DONE",
      message: `Une tache que vous avez creee a ete terminee: ${updated.title}`,
      severity: "INFO",
      entityType: "TASK",
      entityId: updated.id,
      metadata: {
        taskId: updated.id,
        title: updated.title
      }
    });
  }

  return updated;
}

export async function listCompanyTaskTimeline(
  actor: ActorContext,
  input: {
    taskId: string;
    limit?: number;
    offset?: number;
  }
) {
  ensureOperationsAccess(actor.role);
  const task = await findOperationTaskMinimalById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canViewTask(actor, task)) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter l'historique de cette tache.");
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  return listAuditLogsByEntity({
    companyId: actor.companyId,
    entityType: "TASK",
    entityId: task.id,
    actions: TASK_TIMELINE_ACTIONS,
    limit,
    offset
  });
}

export async function listCompanyTaskComments(
  actor: ActorContext,
  input: {
    taskId: string;
    limit?: number;
    offset?: number;
  }
) {
  ensureOperationsAccess(actor.role);
  const task = await findOperationTaskMinimalById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canViewTask(actor, task)) {
    throw new HttpError(403, "Permissions insuffisantes pour consulter les commentaires de cette tache.");
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  return listTaskCommentsByTask({
    companyId: actor.companyId,
    taskId: task.id,
    limit,
    offset
  });
}

export async function addCompanyTaskComment(
  actor: ActorContext,
  input: {
    taskId: string;
    body: string;
  }
) {
  ensureOperationsAccess(actor.role);
  const task = await findOperationTaskMinimalById(actor.companyId, input.taskId);
  if (!task) {
    throw new HttpError(404, "Tache introuvable.");
  }
  if (!canViewTask(actor, task)) {
    throw new HttpError(403, "Permissions insuffisantes pour commenter cette tache.");
  }

  const commentId = randomUUID();
  const body = input.body.trim();

  await createTaskComment({
    id: commentId,
    companyId: actor.companyId,
    taskId: task.id,
    authorId: actor.actorId,
    body
  });

  await createAuditLogRecord({
    auditId: randomUUID(),
    companyId: actor.companyId,
    actorId: actor.actorId,
    action: "TASK_COMMENT_ADDED",
    entityType: "TASK_COMMENT",
    entityId: commentId,
    metadataJson: JSON.stringify({
      taskId: task.id,
      bodyPreview: body.slice(0, 200)
    })
  });

  const created = await findTaskCommentById(actor.companyId, commentId);
  if (!created) {
    throw new HttpError(500, "Impossible de recharger le commentaire cree.");
  }
  return created;
}
