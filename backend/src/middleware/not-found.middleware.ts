import type { Request, Response } from "express";

export function notFoundMiddleware(req: Request, res: Response): void {
  const requestId = req.headers["x-request-id"] ?? "unknown";

  res.status(404).json({
    requestId,
    error: {
      message: `Route introuvable: ${req.method} ${req.originalUrl}`
    }
  });
}
