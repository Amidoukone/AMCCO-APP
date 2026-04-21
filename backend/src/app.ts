import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import { adminAuditRouter } from "./routes/admin-audit.route.js";
import { adminUsersRouter } from "./routes/admin-users.route.js";
import { alertsRouter } from "./routes/alerts.route.js";
import { companyActivitiesRouter } from "./routes/company-activities.route.js";
import { authRouter } from "./routes/auth.route.js";
import { financeRouter } from "./routes/finance.route.js";
import { healthRouter } from "./routes/health.route.js";
import { meRouter } from "./routes/me.route.js";
import { reportingRouter } from "./routes/reporting.route.js";
import { tasksRouter } from "./routes/tasks.route.js";

export const app = express();

app.use(
  pinoHttp({
    logger
  })
);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "AMCCO API",
    version: "0.1.0",
    apiPrefix: env.API_PREFIX
  });
});

app.use(env.API_PREFIX, healthRouter);
app.use(env.API_PREFIX, authRouter);
app.use(env.API_PREFIX, meRouter);
app.use(env.API_PREFIX, alertsRouter);
app.use(env.API_PREFIX, companyActivitiesRouter);
app.use(env.API_PREFIX, reportingRouter);
app.use(env.API_PREFIX, adminUsersRouter);
app.use(env.API_PREFIX, adminAuditRouter);
app.use(env.API_PREFIX, financeRouter);
app.use(env.API_PREFIX, tasksRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
