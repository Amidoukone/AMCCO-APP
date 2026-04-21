import type { Request, Response } from "express";

export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route introuvable: ${req.method} ${req.originalUrl}`
    }
  });
}
