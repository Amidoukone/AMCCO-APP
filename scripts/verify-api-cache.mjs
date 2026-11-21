// Browser-level cache regressions. Every API response is synthetic.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = "http://127.0.0.1:5175";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  const results = await page.evaluate(async () => {
    const api = await import("/src/lib/api.ts");
    const originalFetch = window.fetch;
    const originalNow = Date.now;
    const passed = [];
    let calls = [];
    let handler;
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return { promise, resolve };
    };
    const ok = (value = {}) => new Response(JSON.stringify(value), { status: 200 });
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const count = (path) => calls.filter((call) => call.path === path && call.method === "GET").length;
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      const call = { path: parsed.pathname.replace("/api/v1", ""), search: parsed.search, method: options.method ?? "GET", token: options.headers?.Authorization };
      calls.push(call);
      const response = handler ? await handler(call) : ok({ marker: calls.length });
      return response.clone();
    };
    async function scenario(name, action) {
      api.clearCachedGetResponses(); calls = []; handler = undefined;
      await action(); passed.push(name);
    }
    const dashboard = () => api.getDashboardSummaryRequest("token-a", { activityCode: "SERVICES", includeDetails: false });
    const finance = () => api.listFinanceTransactionsRequest("token-a", { activityCode: "SERVICES" });
    const tasks = () => api.listOperationsTasksRequest("token-a", { activityCode: "SERVICES" });
    const references = () => api.listCompanyActivitiesRequest("token-a");
    const reports = () => api.getReportsOverviewRequest("token-a", { activityCode: "SERVICES" });
    const alerts = () => api.getAlertsSummaryRequest("token-a");
    async function prime() { await Promise.all([dashboard(), finance(), tasks(), references(), reports(), alerts()]); }
    try {
      await scenario("parallel GETs share one request and reuse its result", async () => {
        const gate = deferred(); handler = () => gate.promise;
        const first = references(), second = references();
        check(count("/activities") === 1, "Duplicate parallel GET");
        gate.resolve(ok({ marker: "shared" }));
        check((await first).marker === "shared" && (await second).marker === "shared", "Lost shared result");
        await references(); check(count("/activities") === 1, "Completed result not reused");
      });
      await scenario("tokens, sectors and detail modes have separate cache entries", async () => {
        await references(); await api.listCompanyActivitiesRequest("token-b");
        check(count("/activities") === 2, "Company tokens share cached data");
        await dashboard();
        await api.getDashboardSummaryRequest("token-a", { activityCode: "MINING", includeDetails: false });
        await api.getDashboardSummaryRequest("token-a", { activityCode: "SERVICES", includeDetails: true });
        check(count("/dashboard/summary") === 3, "Sector/detail cache key collision");
        check(calls.some((call) => call.search.includes("details=false")), "Light dashboard mode not sent");
      });
      await scenario("reading an alert preserves finance, tasks, reports and catalogues", async () => {
        await prime(); await api.markAlertReadRequest("token-a", "alert-test"); await prime();
        for (const path of ["/activities", "/finance/transactions", "/operations/tasks", "/reports/overview"]) {
          check(count(path) === 1, `Unrelated cache invalidated: ${path}`);
        }
        check(count("/alerts/summary") === 2 && count("/dashboard/summary") === 2, "Alert counters not invalidated");
      });
      await scenario("finance writes refresh balances, reports and alerts but preserve tasks/catalogues", async () => {
        await prime(); await api.deleteFinanceTransactionRequest("token-a", "transaction-test"); await prime();
        check(count("/activities") === 1 && count("/operations/tasks") === 1, "Finance cleared unrelated data");
        for (const path of ["/finance/transactions", "/reports/overview", "/dashboard/summary", "/alerts/summary"]) {
          check(count(path) === 2, `Finance dependency stale: ${path}`);
        }
      });
      await scenario("task writes refresh task metrics without reloading finance/catalogues", async () => {
        await prime(); await api.updateOperationsTaskStatusRequest("token-a", "task-test", "DONE"); await prime();
        check(count("/activities") === 1 && count("/finance/transactions") === 1, "Task cleared unrelated data");
        for (const path of ["/operations/tasks", "/reports/overview", "/dashboard/summary", "/alerts/summary"]) {
          check(count(path) === 2, `Task dependency stale: ${path}`);
        }
      });
      await scenario("administration changes clear all scopes", async () => {
        await prime(); await api.updateAdminCompanyActivityRequest("token-a", "SERVICES", false); await prime();
        for (const path of ["/activities", "/finance/transactions", "/operations/tasks", "/reports/overview", "/dashboard/summary", "/alerts/summary"]) {
          check(count(path) === 2, `Administration left stale data: ${path}`);
        }
      });
      await scenario("reads before and during a write cannot seed the cache after it finishes", async () => {
        const beforeGate = deferred(), writeGate = deferred(), duringGate = deferred();
        handler = (call) => call.method !== "GET" ? writeGate.promise
          : count("/finance/transactions") === 1 ? beforeGate.promise
          : count("/finance/transactions") === 2 ? duringGate.promise : ok({ marker: "current" });
        const before = finance();
        const write = api.deleteFinanceTransactionRequest("token-a", "transaction-test");
        const during = finance();
        check(count("/finance/transactions") === 2, "Write reused a pre-write GET");
        writeGate.resolve(ok()); await write;
        beforeGate.resolve(ok({ marker: "old" })); duringGate.resolve(ok({ marker: "during" }));
        await Promise.all([before, during]);
        check((await finance()).marker === "current", "Stale GET populated cache after write");
      });
      await scenario("unrelated in-flight GET survives an alert write", async () => {
        const gate = deferred(); handler = (call) => call.method === "GET" ? gate.promise : ok();
        const first = references(); await api.markAllAlertsReadRequest("token-a"); const second = references();
        check(count("/activities") === 1, "Unrelated pending GET was duplicated");
        gate.resolve(ok()); await Promise.all([first, second]); await references();
        check(count("/activities") === 1, "Unrelated pending result was discarded");
      });
      await scenario("failed writes also invalidate affected reads", async () => {
        await finance();
        handler = (call) => call.method === "GET" ? ok() : new Response('{"message":"test"}', { status: 500 });
        await api.deleteFinanceTransactionRequest("token-a", "transaction-test").then(() => { throw new Error("Expected failure"); }, () => {});
        await finance(); check(count("/finance/transactions") === 2, "Failed write left cached finance data");
      });
      await scenario("failed GETs are retried and expired entries refetch", async () => {
        handler = () => new Response('{"message":"test"}', { status: 500 });
        await references().catch(() => {}); handler = undefined;
        let now = originalNow(); Date.now = () => now;
        await references(); await references(); check(count("/activities") === 2, "Failed GET cached or success not reused");
        now += 30_001; await references(); check(count("/activities") === 3, "Expired entry reused");
        Date.now = originalNow;
      });
      await scenario("logout/context reset prevents reuse of pending requests", async () => {
        const gate = deferred(); handler = () => count("/activities") === 1 ? gate.promise : ok({ marker: "new-session" });
        const previous = references(); api.clearCachedGetResponses();
        check((await references()).marker === "new-session", "Session reused old pending GET");
        gate.resolve(ok({ marker: "old-session" })); await previous;
        check((await references()).marker === "new-session", "Old session overwrote cache");
      });
      await scenario("obsolete completions cannot evict fresh cache entries", async () => {
        const gate = deferred();
        handler = () => gate.promise;
        const old = Array.from({ length: 65 }, (_, offset) => api.listFinanceTransactionsRequest("token-a", { offset }));
        api.clearCachedGetResponses(); handler = undefined;
        await references(); gate.resolve(ok()); await Promise.all(old); await references();
        check(count("/activities") === 1, "Obsolete completions evicted current catalogue");
      });
      return passed;
    } finally { window.fetch = originalFetch; Date.now = originalNow; api.clearCachedGetResponses(); }
  });
  assert.equal(results.length, 12);
  for (const name of results) console.log(`PASS ${name}`);
  await context.close();
} finally { await browser.close(); }
