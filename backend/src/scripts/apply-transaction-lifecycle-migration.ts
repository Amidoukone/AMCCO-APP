import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { closeDbPool, getDbPool, queryRows } from "../lib/db.js";

type PendingCountRow = RowDataPacket & {
  activityCode: string | null;
  status: "DRAFT" | "SUBMITTED";
  count: number;
};

async function loadPendingCounts(): Promise<PendingCountRow[]> {
  return queryRows<PendingCountRow[]>(
    `
      SELECT activity_code AS activityCode, status, COUNT(*) AS count
      FROM transactions
      WHERE status IN ('DRAFT', 'SUBMITTED')
      GROUP BY activity_code, status
      ORDER BY activity_code ASC, status ASC
    `
  );
}

async function applyMigration(): Promise<number> {
  const [result] = await getDbPool().execute<ResultSetHeader>(
    `
      UPDATE transactions
      SET status = 'APPROVED',
          validated_by_id = NULL
      WHERE status IN ('DRAFT', 'SUBMITTED')
    `
  );

  await getDbPool().execute(`ALTER TABLE transactions ALTER status SET DEFAULT 'APPROVED'`);

  return result.affectedRows;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const pendingBefore = await loadPendingCounts();

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        pendingByActivityAndStatus: pendingBefore
      },
      null,
      2
    )
  );

  if (!apply) {
    return;
  }

  const affectedRows = await applyMigration();
  const pendingAfter = await loadPendingCounts();

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        affectedRows,
        pendingByActivityAndStatus: pendingAfter
      },
      null,
      2
    )
  );
}

main()
  .catch((error: unknown) => {
    console.error("Transaction lifecycle migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
