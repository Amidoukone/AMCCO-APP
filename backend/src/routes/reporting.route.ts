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
  activityCode: z.enum(BUSINESS_ACTIVITY_CODES)
});

export const reportingRouter = Router();

function toFileNamePart(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "non-renseigne";
}

function buildDownloadTimestamp(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  const milliseconds = String(value.getMilliseconds()).padStart(3, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function buildExportPeriodFilePart(query: {
  dateFrom?: string;
  dateTo?: string;
}): string {
  const from = query.dateFrom?.slice(0, 10) || "all";
  const to = query.dateTo?.slice(0, 10) || "all";
  return `dates-${from}-${to}`;
}

function buildReportExportFileName(
  kind: "rapport" | "transactions" | "taches",
  format: "pdf" | "csv" | "xlsx",
  input: {
    companyId: string;
    dateFrom?: string;
    dateTo?: string;
    activityCode?: string;
  }
): string {
  const companyPart = toFileNamePart(input.companyId);
  const activityPart = input.activityCode ? toFileNamePart(input.activityCode) : "tous-secteurs";
  const periodPart = buildExportPeriodFilePart(input);

  return `amcco-${kind}-${companyPart}-${activityPart}-${periodPart}-${buildDownloadTimestamp()}.${format}`;
}

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
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
      `attachment; filename="${buildReportExportFileName("rapport", "pdf", {
        companyId: req.auth.companyId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      })}"`
    );
    res.status(200).send(pdf);
  })
);

reportingRouter.get(
  "/reports/exports/transactions.csv",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
      `attachment; filename="${buildReportExportFileName("transactions", "csv", {
        companyId: req.auth.companyId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      })}"`
    );
    res.status(200).send(`\uFEFF${csv}`);
  })
);

reportingRouter.get(
  "/reports/exports/transactions.xlsx",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
      `attachment; filename="${buildReportExportFileName("transactions", "xlsx", {
        companyId: req.auth.companyId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      })}"`
    );
    res.status(200).send(workbook);
  })
);

reportingRouter.get(
  "/reports/exports/tasks.csv",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
      `attachment; filename="${buildReportExportFileName("taches", "csv", {
        companyId: req.auth.companyId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      })}"`
    );
    res.status(200).send(`\uFEFF${csv}`);
  })
);

reportingRouter.get(
  "/reports/exports/tasks.xlsx",
  authorizeRoles("OWNER", "SYS_ADMIN", "ACCOUNTANT", "SUPERVISOR", "EMPLOYEE"),
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
      `attachment; filename="${buildReportExportFileName("taches", "xlsx", {
        companyId: req.auth.companyId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        activityCode: query.activityCode
      })}"`
    );
    res.status(200).send(workbook);
  })
);
