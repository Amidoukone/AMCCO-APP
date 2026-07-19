import mysql, { type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

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
  const [rows] = await getDbPool().query<T>(sql, values);
  return rows;
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
