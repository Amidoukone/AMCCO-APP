import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createRateLimitMiddleware } from "./rate-limit.middleware.js";

describe("createRateLimitMiddleware", () => {
  it("returns 429 after the configured number of attempts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const app = express();
    app.get(
      "/limited",
      createRateLimitMiddleware({
        maxAttempts: 2,
        windowMs: 60_000
      }),
      (_req, res) => res.status(200).json({ status: "ok" })
    );

    const first = await request(app).get("/limited");
    const second = await request(app).get("/limited");
    const third = await request(app).get("/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers["retry-after"]).toBe("60");

    vi.useRealTimers();
  });
});
