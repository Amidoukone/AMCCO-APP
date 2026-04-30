import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.get("x-request-id")?.trim();
  const requestId = incomingRequestId || randomUUID();

  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
