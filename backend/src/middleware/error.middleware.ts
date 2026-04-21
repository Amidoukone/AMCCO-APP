import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors/http-error.js";

type ApiErrorPayload = {
  message: string;
  details?: unknown;
};

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers["x-request-id"] ?? "unknown";

  if (err instanceof ZodError) {
    const payload: ApiErrorPayload = {
      message: "Erreur de validation",
      details: err.issues
    };
    res.status(400).json({ requestId, error: payload });
    return;
  }

  if (err instanceof HttpError) {
    const payload: ApiErrorPayload = {
      message: err.message,
      details: err.details
    };
    res.status(err.statusCode).json({ requestId, error: payload });
    return;
  }

  const payload: ApiErrorPayload = {
    message: "Erreur interne du serveur"
  };

  res.status(500).json({ requestId, error: payload });
}
