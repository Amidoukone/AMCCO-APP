import { Router } from "express";
import { checkDatabaseConnection } from "../lib/db.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "amcco-backend",
    timestamp: new Date().toISOString()
  });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    await checkDatabaseConnection();
    res.status(200).json({
      status: "ready",
      service: "amcco-backend",
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      service: "amcco-backend",
      timestamp: new Date().toISOString()
    });
  }
});
