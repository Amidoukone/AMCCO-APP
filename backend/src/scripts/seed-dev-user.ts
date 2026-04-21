import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { hashPassword } from "../lib/password.js";
import { BUSINESS_ACTIVITY_CODES } from "../types/business-activity.js";

type IdRow = { id: string };

async function main(): Promise<void> {
  const companyCode = (process.env.DEV_COMPANY_CODE ?? "AMCCO").toUpperCase();
  const companyName = process.env.DEV_COMPANY_NAME ?? "AMCCO Demo";
  const adminEmail = (process.env.DEV_ADMIN_EMAIL ?? "bakayoko@amcco.local").toLowerCase();
  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Bakayoko1234!";
  const adminFullName = process.env.DEV_ADMIN_FULL_NAME ?? "Bakayoko Demo";

  const pool = getDbPool();

  const [companyRows] = await pool.query<(RowDataPacket & IdRow & { code: string })[]>(
    "SELECT id, code FROM companies WHERE code = ? LIMIT 1",
    [companyCode]
  );

  let companyId = companyRows[0]?.id;
  if (!companyId) {
    companyId = randomUUID();
    await pool.execute("INSERT INTO companies (id, name, code) VALUES (?, ?, ?)", [
      companyId,
      companyName,
      companyCode
    ]);
  }

  for (const activityCode of BUSINESS_ACTIVITY_CODES) {
    await pool.execute(
      `
        INSERT INTO company_activities (company_id, activity_code, is_enabled)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE is_enabled = is_enabled
      `,
      [companyId, activityCode]
    );
  }

  const [userRows] = await pool.query<(RowDataPacket & IdRow & { email: string })[]>(
    "SELECT id, email FROM users WHERE email = ? LIMIT 1",
    [adminEmail]
  );

  let userId = userRows[0]?.id;
  if (!userId) {
    userId = randomUUID();
    const passwordHash = await hashPassword(adminPassword);
    await pool.execute(
      "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
      [userId, adminEmail, passwordHash, adminFullName]
    );
  }

  await pool.execute(
    `
      INSERT INTO memberships (id, user_id, company_id, role)
      VALUES (?, ?, ?, 'OWNER')
      ON DUPLICATE KEY UPDATE role = VALUES(role)
    `,
    [randomUUID(), userId, companyId]
  );

  logger.info(
    {
      companyCode,
      adminEmail
    },
    "Dev owner user ready"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error({ error }, "Seed failed");
    process.exit(1);
  });
