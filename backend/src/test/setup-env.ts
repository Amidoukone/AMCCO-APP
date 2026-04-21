import { afterEach, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT ?? "4000";
process.env.API_PREFIX = process.env.API_PREFIX ?? "/api/v1";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-access-secret-12345";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-12345";
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "mysql://root:root@localhost:3306/amcco_test";
process.env.DB_POOL_LIMIT = process.env.DB_POOL_LIMIT ?? "2";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
