import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors/http-error.js";
import { createAuditLogRecord } from "../repositories/audit.repository.js";
import {
  createOperationTask,
  findCompanyTaskAssigneeByUserId,
  findOperationTaskById,
  findOperationTaskMinimalById,
  listCompanyTaskAssignees,
  updateOperationTaskAssignment,
  updateOperationTaskStatus
} from "../repositories/tasks.repository.js";
import { createRoleTargetedAlerts, createUserTargetedAlerts } from "./alerts.service.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import {
  assignCompanyTask,
  createCompanyTask,
  listCompanyTaskMembers,
  updateCompanyTaskStatus
} from "./tasks.service.js";

vi.mock("../repositories/tasks.repository.js", () => ({
  createOperationTask: vi.fn(),
  findCompanyTaskAssigneeByUserId: vi.fn(),
  findOperationTaskById: vi.fn(),
  findOperationTaskMinimalById: vi.fn(),
  findOperationTasksMinimalByIds: vi.fn(),
  listCompanyTaskAssignees: vi.fn(),
  listOperationsTasks: vi.fn(),
  updateOperationTaskAssignment: vi.fn(),
  updateOperationTaskStatus: vi.fn()
}));

vi.mock("../repositories/audit.repository.js", () => ({
  createAuditLogRecord: vi.fn(),
  listAuditLogsByEntity: vi.fn()
}));

vi.mock("../repositories/task-comments.repository.js", () => ({
  createTaskComment: vi.fn(),
  findTaskCommentById: vi.fn(),
  listTaskCommentsByTask: vi.fn()
}));

vi.mock("./alerts.service.js", () => ({
  createRoleTargetedAlerts: vi.fn(),
  createUserTargetedAlerts: vi.fn()
}));

vi.mock("./company-activities.service.js", () => ({
  ensureCompanyActivityEnabledOrThrow: vi.fn()
}));

describe("tasks.service", () => {
  const actor = {
    actorId: "manager-1",
    companyId: "company-1",
    role: "SUPERVISOR" as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureCompanyActivityEnabledOrThrow).mockResolvedValue(undefined);
  });

  describe("createCompanyTask", () => {
    it("rejects task creation for unauthorized roles", async () => {
      const promise = createCompanyTask(
        {
          ...actor,
          role: "EMPLOYEE"
        },
        {
          title: "Relancer client"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Permissions insuffisantes pour creer une tache."
      });
      expect(createOperationTask).not.toHaveBeenCalled();
    });

    it("creates an assigned task, audits it, and alerts the assignee", async () => {
      vi.mocked(findCompanyTaskAssigneeByUserId).mockResolvedValue({
        userId: "employee-1",
        email: "employee@example.com",
        fullName: "Employee One",
        role: "EMPLOYEE",
        openTasksCount: 2,
        inProgressTasksCount: 1,
        blockedTasksCount: 0,
        todoTasksCount: 1,
        doneTasksCount: 3,
        totalAssignedTasksCount: 5
      });
      vi.mocked(findOperationTaskById).mockResolvedValue({
        id: "task-1",
        companyId: actor.companyId,
        title: "Relancer client",
        description: "Avant la fin de semaine",
        activityCode: "GENERAL_STORE",
        status: "IN_PROGRESS",
        createdById: actor.actorId,
        createdByEmail: "manager@example.com",
        createdByFullName: "Manager One",
        assignedToId: "employee-1",
        assignedToEmail: "employee@example.com",
        assignedToFullName: "Employee One",
        dueDate: "2026-04-25T00:00:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      });

      const result = await createCompanyTask(actor, {
        title: " Relancer client ",
        description: " Avant la fin de semaine ",
        activityCode: "GENERAL_STORE",
        assignedToId: "employee-1",
        dueDate: "2026-04-25"
      });

      expect(createOperationTask).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: actor.companyId,
          createdById: actor.actorId,
          assignedToId: "employee-1",
          status: "IN_PROGRESS",
          title: "Relancer client",
          description: "Avant la fin de semaine"
        })
      );
      expect(createAuditLogRecord).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          actorId: actor.actorId,
          action: "TASK_CREATED",
          entityType: "TASK"
        })
      );
      expect(createAuditLogRecord).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          actorId: actor.actorId,
          action: "TASK_ASSIGNED",
          entityType: "TASK",
          entityId: expect.any(String)
        })
      );
      expect(createUserTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientUserIds: ["employee-1"],
        code: "TASK_ASSIGNED",
        message: "Une nouvelle tache Magasins (commerce general) vous a ete assignee: Relancer client",
        severity: "INFO",
        entityType: "TASK",
        entityId: "task-1",
        metadata: {
          taskId: "task-1",
          title: "Relancer client"
        }
      });
      expect(result.id).toBe("task-1");
      expect(result.status).toBe("IN_PROGRESS");
    });

    it("rejects mining task creation without assignee", async () => {
      const promise = createCompanyTask(actor, {
        title: "Controle site",
        description: "Zone Nord",
        activityCode: "MINING",
        dueDate: "2026-04-25T00:00:00.000Z"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Le secteur Exploitation miniere exige qu'une tache soit assignee des sa creation."
      });
      expect(createOperationTask).not.toHaveBeenCalled();
    });

    it("rejects agriculture task creation without parcel metadata", async () => {
      const promise = createCompanyTask(actor, {
        title: "Suivi campagne",
        description: "Controle intrants",
        activityCode: "AGRICULTURE",
        dueDate: "2026-04-25T00:00:00.000Z",
        metadata: {
          campaignRef: "CAMP-2026"
        }
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400
      });
      await expect(promise).rejects.toThrow("reference parcelle");
      expect(createOperationTask).not.toHaveBeenCalled();
    });
  });

  describe("assignCompanyTask", () => {
    it("reassigns a TODO task, moves it to IN_PROGRESS, audits, and alerts", async () => {
      vi.mocked(findOperationTaskMinimalById).mockResolvedValue({
        id: "task-2",
        companyId: actor.companyId,
        status: "TODO",
        activityCode: "AGRICULTURE",
        createdById: "manager-2",
        assignedToId: null
      });
      vi.mocked(findCompanyTaskAssigneeByUserId).mockResolvedValue({
        userId: "employee-2",
        email: "employee2@example.com",
        fullName: "Employee Two",
        role: "EMPLOYEE",
        openTasksCount: 0,
        inProgressTasksCount: 0,
        blockedTasksCount: 0,
        todoTasksCount: 0,
        doneTasksCount: 0,
        totalAssignedTasksCount: 0
      });
      vi.mocked(findOperationTaskById).mockResolvedValue({
        id: "task-2",
        companyId: actor.companyId,
        title: "Verifier dossier",
        description: null,
        activityCode: "AGRICULTURE",
        status: "IN_PROGRESS",
        createdById: "manager-2",
        createdByEmail: "manager2@example.com",
        createdByFullName: "Manager Two",
        assignedToId: "employee-2",
        assignedToEmail: "employee2@example.com",
        assignedToFullName: "Employee Two",
        dueDate: null,
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z"
      });

      const result = await assignCompanyTask(actor, {
        taskId: "task-2",
        assignedToId: "employee-2",
        note: "A traiter aujourd'hui"
      });

      expect(updateOperationTaskAssignment).toHaveBeenCalledWith({
        companyId: actor.companyId,
        taskId: "task-2",
        assignedToId: "employee-2"
      });
      expect(updateOperationTaskStatus).toHaveBeenCalledWith({
        companyId: actor.companyId,
        taskId: "task-2",
        status: "IN_PROGRESS"
      });
      expect(createAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TASK_ASSIGNED",
          entityId: "task-2"
        })
      );
      expect(createUserTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientUserIds: ["employee-2"],
        code: "TASK_ASSIGNED",
        message: "Une tache vous a ete assignee: Verifier dossier",
        severity: "INFO",
        entityType: "TASK",
        entityId: "task-2",
        metadata: {
          taskId: "task-2",
          title: "Verifier dossier",
          note: "A traiter aujourd'hui"
        }
      });
      expect(result.status).toBe("IN_PROGRESS");
    });
  });

  describe("listCompanyTaskMembers", () => {
    it("filters assignable members by the selected activity when requested", async () => {
      vi.mocked(listCompanyTaskAssignees).mockResolvedValue([]);

      await listCompanyTaskMembers(actor, {
        activityCode: "WATER"
      });

      expect(listCompanyTaskAssignees).toHaveBeenCalledWith(actor.companyId, "WATER");
    });
  });

  describe("updateCompanyTaskStatus", () => {
    it("rejects status changes from unauthorized users", async () => {
      vi.mocked(findOperationTaskMinimalById).mockResolvedValue({
        id: "task-3",
        companyId: actor.companyId,
        status: "TODO",
        activityCode: "SERVICES",
        createdById: "manager-2",
        assignedToId: "employee-1"
      });

      const promise = updateCompanyTaskStatus(
        {
          actorId: "employee-2",
          companyId: actor.companyId,
          role: "EMPLOYEE"
        },
        {
          taskId: "task-3",
          status: "DONE"
        }
      );

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 403,
        message: "Permissions insuffisantes pour changer ce statut."
      });
      expect(updateOperationTaskStatus).not.toHaveBeenCalled();
    });

    it("marks a task as blocked and alerts management", async () => {
      vi.mocked(findOperationTaskMinimalById).mockResolvedValue({
        id: "task-4",
        companyId: actor.companyId,
        status: "IN_PROGRESS",
        activityCode: "WATER",
        createdById: "manager-2",
        assignedToId: actor.actorId
      });
      vi.mocked(findOperationTaskById).mockResolvedValue({
        id: "task-4",
        companyId: actor.companyId,
        title: "Document manquant",
        description: null,
        activityCode: "WATER",
        status: "BLOCKED",
        createdById: "manager-2",
        createdByEmail: "manager2@example.com",
        createdByFullName: "Manager Two",
        assignedToId: actor.actorId,
        assignedToEmail: "manager@example.com",
        assignedToFullName: "Manager One",
        dueDate: null,
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z"
      });

      const result = await updateCompanyTaskStatus(actor, {
        taskId: "task-4",
        status: "BLOCKED"
      });

      expect(updateOperationTaskStatus).toHaveBeenCalledWith({
        companyId: actor.companyId,
        taskId: "task-4",
        status: "BLOCKED"
      });
      expect(createRoleTargetedAlerts).toHaveBeenCalledWith({
        companyId: actor.companyId,
        recipientRoles: ["OWNER", "SYS_ADMIN", "SUPERVISOR"],
        excludeUserIds: [actor.actorId],
        code: "TASK_BLOCKED",
        message: "Une tache Production d'eau potable est bloquee et requiert une attention management: Document manquant",
        severity: "CRITICAL",
        entityType: "TASK",
        entityId: "task-4",
        metadata: {
          taskId: "task-4",
          title: "Document manquant"
        }
      });
      expect(result.status).toBe("BLOCKED");
    });

    it("rejects completion of an unassigned rental task", async () => {
      vi.mocked(findOperationTaskMinimalById).mockResolvedValue({
        id: "task-5",
        companyId: actor.companyId,
        status: "IN_PROGRESS",
        activityCode: "RENTAL",
        createdById: actor.actorId,
        assignedToId: null
      });

      const promise = updateCompanyTaskStatus(actor, {
        taskId: "task-5",
        status: "DONE"
      });

      await expect(promise).rejects.toMatchObject<HttpError>({
        statusCode: 400,
        message: "Le secteur Location immobiliere interdit de terminer une tache non assignee."
      });
      expect(updateOperationTaskStatus).not.toHaveBeenCalled();
    });
  });
});
