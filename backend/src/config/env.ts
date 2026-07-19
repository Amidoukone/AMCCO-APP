import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const escapedNewlinesToNewlines = (value: unknown) => {
  const normalized = emptyStringToUndefined(value);
  if (typeof normalized === "string") {
    return normalized.replace(/\\n/g, "\n");
  }
  return normalized;
};

const booleanLike = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return value;
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  DATABASE_URL: z.string().startsWith("mysql://"),
  DB_POOL_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL: z.preprocess(booleanLike, z.boolean()).default(false),
  DB_SSL_REJECT_UNAUTHORIZED: z.preprocess(booleanLike, z.boolean()).default(true),
  DB_SSL_CA: z.preprocess(escapedNewlinesToNewlines, z.string().optional()),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60000).default(900000),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1000).default(10),
  IMAGEKIT_PUBLIC_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  IMAGEKIT_PRIVATE_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  IMAGEKIT_URL_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url().optional())
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuration d'environnement invalide", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
