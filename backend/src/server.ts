import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeDbPool } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { ensureBusinessActivitySchemaReady } from "./lib/schema-bootstrap.js";

let server: ReturnType<typeof app.listen>;

async function main(): Promise<void> {
  await ensureBusinessActivitySchemaReady();

  server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        apiPrefix: env.API_PREFIX
      },
      "Backend API started"
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Graceful shutdown started");
  if (!server) {
    await closeDbPool();
    process.exit(0);
    return;
  }

  server.close(async () => {
    await closeDbPool();
    logger.info("HTTP server stopped");
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

main().catch(async (error: unknown) => {
  logger.error({ error }, "Backend bootstrap failed");
  await closeDbPool();
  process.exit(1);
});
