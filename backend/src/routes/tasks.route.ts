import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  addCompanyTaskComment,
  assignCompanyTask,
  assignCompanyTasksBulk,
  createCompanyTask,
  deleteCompanyTask,
  getCompanyTaskById,
  listCompanyTaskComments,
  listCompanyTaskMembers,
  listCompanyTasks,
  listCompanyTaskTimeline,
  updateCompanyTask,
  updateCompanyTaskStatus
} from "../services/tasks.service.js";

const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]);
const taskScopeSchema = z.enum(["ALL", "ASSIGNED_TO_ME", "CREATED_BY_ME", "MINE"]);

const listTasksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: taskStatusSchema.optional(),
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional(),
  scope: taskScopeSchema.optional(),
  unassignedOnly: z.enum(["true", "false"]).optional()
});

const listTaskTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const listTaskCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const listTaskMembersQuerySchema = z.object({
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional()
});

const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(4000).optional(),
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES),
  assignedToId: z.string().trim().min(8).max(64).optional(),
  metadata: z.record(z.string().trim().min(1).max(64), z.string().trim().max(500)).optional(),
  dueDate: z.string().datetime().optional()
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(4000).optional(),
  metadata: z.record(z.string().trim().min(1).max(64), z.string().trim().max(500)).optional(),
  dueDate: z.string().datetime().optional().or(z.literal(""))
});

const taskIdParamSchema = z.object({
  taskId: z.string().trim().min(8).max(64)
});

const assignTaskSchema = z.object({
  assignedToId: z.string().trim().min(8).max(64).nullable(),
  note: z.string().trim().max(500).optional()
});

const assignBulkTasksSchema = z.object({
  taskIds: z.array(z.string().trim().min(8).max(64)).min(1).max(100),
  assignedToId: z.string().trim().min(8).max(64).nullable(),
  note: z.string().trim().max(500).optional()
});

const changeStatusSchema = z.object({
  status: taskStatusSchema
});

const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000)
});

export const tasksRouter = Router();

tasksRouter.use(authenticateAccessToken);

tasksRouter.get(
  "/operations/tasks",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = listTasksQuerySchema.parse(req.query);
    const items = await listCompanyTasks(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        limit: query.limit,
        offset: query.offset,
        status: query.status,
        activityCode: query.activityCode,
        scope: query.scope,
        unassignedOnly: query.unassignedOnly === "true"
      }
    );
    res.status(200).json({ items });
  })
);

tasksRouter.get(
  "/operations/tasks/:taskId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const item = await getCompanyTaskById(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId
      }
    );
    res.status(200).json({ item });
  })
);

tasksRouter.get(
  "/operations/tasks/:taskId/timeline",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const query = listTaskTimelineQuerySchema.parse(req.query);
    const items = await listCompanyTaskTimeline(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        limit: query.limit,
        offset: query.offset
      }
    );
    res.status(200).json({ items });
  })
);

tasksRouter.get(
  "/operations/tasks/:taskId/comments",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const query = listTaskCommentsQuerySchema.parse(req.query);
    const items = await listCompanyTaskComments(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        limit: query.limit,
        offset: query.offset
      }
    );
    res.status(200).json({ items });
  })
);

tasksRouter.get(
  "/operations/members",
  authorizeRoles("OWNER", "SYS_ADMIN", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = listTaskMembersQuerySchema.parse(req.query);
    const items = await listCompanyTaskMembers({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    }, {
      activityCode: query.activityCode
    });
    res.status(200).json({ items });
  })
);

tasksRouter.post(
  "/operations/tasks/:taskId/comments",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const body = createTaskCommentSchema.parse(req.body);
    const item = await addCompanyTaskComment(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        body: body.body
      }
    );
    res.status(201).json({ item });
  })
);

tasksRouter.post(
  "/operations/tasks",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const body = createTaskSchema.parse(req.body);
    const item = await createCompanyTask(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        title: body.title,
        description: body.description,
        activityCode: body.activityCode,
        assignedToId: body.assignedToId,
        metadata: body.metadata,
        dueDate: body.dueDate
      }
    );
    res.status(201).json({ item });
  })
);

tasksRouter.patch(
  "/operations/tasks/:taskId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const body = updateTaskSchema.parse(req.body);
    const item = await updateCompanyTask(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        title: body.title,
        description: body.description,
        metadata: body.metadata,
        dueDate: body.dueDate || undefined
      }
    );
    res.status(200).json({ item });
  })
);

tasksRouter.delete(
  "/operations/tasks/:taskId",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    await deleteCompanyTask(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId
      }
    );
    res.status(200).json({ status: "deleted" });
  })
);

tasksRouter.patch(
  "/operations/tasks/:taskId/assign",
  authorizeRoles("OWNER", "SYS_ADMIN", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const body = assignTaskSchema.parse(req.body);
    const item = await assignCompanyTask(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        assignedToId: body.assignedToId,
        note: body.note
      }
    );
    res.status(200).json({ item });
  })
);

tasksRouter.patch(
  "/operations/tasks/assign-bulk",
  authorizeRoles("OWNER", "SYS_ADMIN", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const body = assignBulkTasksSchema.parse(req.body);
    const items = await assignCompanyTasksBulk(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskIds: body.taskIds,
        assignedToId: body.assignedToId,
        note: body.note
      }
    );
    res.status(200).json({ items });
  })
);

tasksRouter.patch(
  "/operations/tasks/:taskId/status",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const params = taskIdParamSchema.parse(req.params);
    const body = changeStatusSchema.parse(req.body);
    const item = await updateCompanyTaskStatus(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        taskId: params.taskId,
        status: body.status
      }
    );
    res.status(200).json({ item });
  })
);
