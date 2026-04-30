import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = {
  maxAttempts: number;
  windowMs: number;
  message?: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? req.get("x-forwarded-for") ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > options.maxAttempts) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: {
          message:
            options.message ??
            "Trop de tentatives. Réessayez dans quelques minutes."
        }
      });
      return;
    }

    next();
  };
}
