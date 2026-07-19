import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDbPool, getDbPool } from "../lib/db.js";

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement: string[] = [];

  for (const line of sql.split(/\r?\n/)) {
    currentStatement.push(line);

    if (!line.trim().endsWith(";")) {
      continue;
    }

    const statement = currentStatement.join("\n").trim().replace(/;$/, "").trim();
    currentStatement = [];

    if (!statement) {
      continue;
    }

    if (/^CREATE\s+DATABASE\b/i.test(statement) || /^USE\s+/i.test(statement)) {
      continue;
    }

    statements.push(statement);
  }

  return statements;
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(scriptDir, "../../sql/001_init_schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  const statements = splitSqlStatements(schema);
  const pool = getDbPool();

  for (const statement of statements) {
    await pool.execute(statement);
  }

  console.info(`Schema initialization completed (${statements.length} statements).`);
}

main()
  .catch((error: unknown) => {
    console.error("Schema initialization failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
