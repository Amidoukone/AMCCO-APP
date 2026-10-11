import mysql, { type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const SLOW_QUERY_THRESHOLD_MS = 500;
let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (pool) {
    return pool;
  }

  const poolOptions: PoolOptions = {
    uri: env.DATABASE_URL,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: env.DB_POOL_LIMIT,
    queueLimit: 0
  };

  if (env.DB_SSL) {
    poolOptions.ssl = {
      rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
      ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {})
    };
  }

  pool = mysql.createPool(poolOptions);

  return pool;
}

export async function queryRows<T extends RowDataPacket[]>(
  sql: string,
  values: unknown[] = []
): Promise<T> {
  const startedAt = performance.now();
  try {
    const [rows] = await getDbPool().query<T>(sql, values);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      logger.warn({
        durationMs,
        rowCount: rows.length,
        statement: sql.replace(/\s+/g, " ").trim().slice(0, 180)
      }, "Slow database query");
    }
    return rows;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      logger.warn({
        durationMs,
        statement: sql.replace(/\s+/g, " ").trim().slice(0, 180)
      }, "Database query failed after a long wait");
    }
    throw error;
  }
}

export async function checkDatabaseConnection(): Promise<void> {
  const connection = await getDbPool().getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closeDbPool(): Promise<void> {
  if (!pool) {
    return;
  }

  try {
    await pool.end();
  } catch (error) {
    logger.error({ error }, "Error while closing MySQL pool");
  } finally {
    pool = null;
  }
}
