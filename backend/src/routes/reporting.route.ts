import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { authenticateAccessToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";
import {
  exportCompanyReportsPdf,
  exportCompanyTasksCsv,
  exportCompanyTasksExcel,
  exportCompanyTransactionsCsv,
  exportCompanyTransactionsExcel,
  getCompanyDashboardSummary,
  getCompanyReportsOverview
} from "../services/reporting.service.js";

const reportsQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional()
});

export const reportingRouter = Router();

reportingRouter.use(authenticateAccessToken);

reportingRouter.get(
  "/dashboard/summary",
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = z
      .object({
        activityCode: z.enum(BUSINESS_ACTIVITY_CODES).optional()
      })
      .parse(req.query);

    const item = await getCompanyDashboardSummary(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        activityCode: query.activityCode
      }
    );

    res.status(200).json({ item });
  })
);

reportingRouter.get(
  "/reports/overview",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const item = await getCompanyReportsOverview({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    }, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      activityCode: query.activityCode
    });

    res.status(200).json({ item });
  })
);

reportingRouter.get(
  "/reports/exports/overview.pdf",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const pdf = await exportCompanyReportsPdf(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-report-overview-${req.auth.companyId}.pdf"`
    );
    res.status(200).send(pdf);
  })
);

reportingRouter.get(
  "/reports/exports/transactions.csv",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const csv = await exportCompanyTransactionsCsv({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    }, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      activityCode: query.activityCode
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-transactions-${req.auth.companyId}.csv"`
    );
    res.status(200).send(`\uFEFF${csv}`);
  })
);

reportingRouter.get(
  "/reports/exports/transactions.xlsx",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const workbook = await exportCompanyTransactionsExcel(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      }
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-transactions-${req.auth.companyId}.xlsx"`
    );
    res.status(200).send(workbook);
  })
);

reportingRouter.get(
  "/reports/exports/tasks.csv",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const csv = await exportCompanyTasksCsv({
      actorId: req.auth.userId,
      companyId: req.auth.companyId,
      role: req.auth.role
    }, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      activityCode: query.activityCode
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-tasks-${req.auth.companyId}.csv"`
    );
    res.status(200).send(`\uFEFF${csv}`);
  })
);

reportingRouter.get(
  "/reports/exports/tasks.xlsx",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR"),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new HttpError(401, "Authentification requise.");
    }
    const query = reportsQuerySchema.parse(req.query);

    const workbook = await exportCompanyTasksExcel(
      {
        actorId: req.auth.userId,
        companyId: req.auth.companyId,
        role: req.auth.role
      },
      {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      }
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="amcco-tasks-${req.auth.companyId}.xlsx"`
    );
    res.status(200).send(workbook);
  })
);
