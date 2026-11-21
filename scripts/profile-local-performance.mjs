// Read-only profiling on an existing local recipe. Never bootstraps a schema.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import dotenv from "dotenv";

const settings = dotenv.parse(await readFile(new URL("../backend/.env", import.meta.url)));
const target = new URL(settings.DATABASE_URL);
assert.equal(target.protocol, "mysql:");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Local MySQL required");
const recipeName = process.env.AMCCO_RECIPE_DATABASE ?? "amcco_recette_20261117";
assert.match(recipeName, /^amcco_recette_[a-z0-9_]+$/);
assert.notEqual(recipeName, target.pathname.slice(1), "Recipe must differ from the source database");
target.pathname = `/${recipeName}`;
Object.assign(process.env, settings, { DATABASE_URL: target.href, NODE_ENV: "development", DB_SSL: "false" });

const { getDbPool, closeDbPool } = await import("../backend/dist/lib/db.js");
const { getCompanyDashboardSummary, getCompanyReportsOverview } = await import("../backend/dist/services/reporting.service.js");
const { listFinancialTransactions } = await import("../backend/dist/repositories/finance.repository.js");
const { listOperationsTasks } = await import("../backend/dist/repositories/tasks.repository.js");
const pool = getDbPool();
const originalQuery = pool.query.bind(pool);
let current;
pool.query = async (...args) => {
  const sample = current;
  const result = await originalQuery(...args);
  if (sample) {
    sample.queries += 1;
    sample.rows += Array.isArray(result[0]) ? result[0].length : 0;
    sample.statements.push(args);
  }
  return result;
};

async function measure(action) {
  const sample = { queries: 0, rows: 0, statements: [] };
  current = sample;
  const start = performance.now();
  try {
    const data = await action();
    return { ...sample, ms: performance.now() - start, bytes: Buffer.byteLength(JSON.stringify(data)), data };
  } finally { current = undefined; }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summarize = (samples) => Object.fromEntries(["ms", "queries", "rows", "bytes"].map((key) => [key, Math.round(median(samples.map((sample) => sample[key])) * 100) / 100]));
function withoutOperationalDetails(summary) {
  const { generatedAt, operationalPerformance, ...rest } = summary;
  return rest;
}

try {
  const [[actor]] = await originalQuery(`SELECT m.user_id AS actorId, m.company_id AS companyId, m.role
    FROM memberships m JOIN users u ON u.id = m.user_id JOIN companies c ON c.id = m.company_id
    WHERE u.email = 'recette.admin@amcco.local' AND u.is_active = 1 AND c.is_active = 1 AND m.role = 'SYS_ADMIN'
    ORDER BY (SELECT COUNT(*) FROM transactions t WHERE t.company_id = m.company_id) DESC LIMIT 1`);
  assert.ok(actor, "Prepare the local recipe first");
  const [sectors] = await originalQuery(`SELECT activity_code AS code, COUNT(*) AS total FROM transactions
    WHERE company_id = ? AND activity_code IS NOT NULL AND activity_code <> 'REAL_ESTATE_AGENCY'
    GROUP BY activity_code ORDER BY total DESC LIMIT 3`, [actor.companyId]);
  const results = [];
  for (const activityCode of [undefined, ...sectors.map((sector) => sector.code)]) {
    const full = [], light = [];
    // Alternate modes to reduce cache warm-up bias; discard the first pair.
    for (let round = 0; round < 8; round += 1) {
      const samples = {};
      for (const details of round % 2 ? [false, true] : [true, false]) {
        samples[String(details)] = await measure(() => getCompanyDashboardSummary(actor, { activityCode, includeDetails: details }));
      }
      assert.ok(isDeepStrictEqual(withoutOperationalDetails(samples.true.data), withoutOperationalDetails(samples.false.data)), "Dashboard totals/recent records differ between modes");
      if (round) { full.push(samples.true); light.push(samples.false); }
    }
    results.push({ activityCode: activityCode ?? "ALL", full: summarize(full), light: summarize(light), displayedDataEqual: true });
  }
  const activityCode = sectors[0]?.code;
  const queries = [];
  for (const [name, action] of [
    ["transactions", () => listFinancialTransactions({ companyId: actor.companyId, activityCode, limit: 50, offset: 0 })],
    ["tasks", () => listOperationsTasks({ companyId: actor.companyId, activityCode, limit: 50, offset: 0 })],
    ...(activityCode ? [["reportsOverview", () => getCompanyReportsOverview(actor, { activityCode, includeDetails: false })]] : [])
  ]) {
    const samples = [];
    for (let round = 0; round < 8; round += 1) {
      const sample = await measure(action); if (round) samples.push(sample);
    }
    const plans = [];
    for (const [sql, values] of samples[0].statements) {
      const [[plan]] = await originalQuery(`EXPLAIN FORMAT=JSON ${sql}`, values);
      const tables = [];
      function inspect(value) {
        if (!value || typeof value !== "object") return;
        if (value.table_name) tables.push({ table: value.table_name, access: value.access_type, key: value.key ?? null, rowsExaminedPerScan: value.rows_examined_per_scan });
        for (const child of Object.values(value)) inspect(child);
      }
      const parsed = JSON.parse(plan.EXPLAIN); inspect(parsed);
      plans.push({ tables, filesort: /"using_filesort":\s*true/.test(plan.EXPLAIN) });
    }
    queries.push({ name, ...summarize(samples), plans });
  }
  const report = { generatedAt: new Date().toISOString(), localRecipe: recipeName, samplesPerMode: 7,
    scope: "Read-only local service/database timings; excludes network, authentication middleware and browser rendering", dashboards: results, listsAndReports: queries };
  const directory = new URL("../artifacts/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("local-performance.json", directory), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await closeDbPool(); }
