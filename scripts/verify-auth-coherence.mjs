// Real auth provider/hooks, synthetic network only. No backend is contacted.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5175";
const fixture = `/@fs/${fileURLToPath(new URL("fixtures/auth-coherence.tsx", import.meta.url)).replaceAll("\\", "/")}`;
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
  const passed = await page.evaluate(async (fixturePath) => {
    const harness = await import(fixturePath), { ApiError } = await import("/src/lib/api.ts");
    const container = document.createElement("div"); document.body.append(container);
    let unmount = harness.mount(container);
    const originalFetch = window.fetch;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await frame();
    const probe = () => harness.getProbe();
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
    const response = (companyId = "company-a", suffix = "initial") => {
      const company = { id: companyId, code: companyId, name: companyId, isActive: true };
      const user = { id: "user-test", email: "test@example.invalid", fullName: "Test", role: "SYS_ADMIN", companyId };
      const me = { user, company, memberships: ["company-a", "company-b"].map((id) => ({ companyId: id, companyCode: id, companyName: id, role: "SYS_ADMIN", isActive: true })), bootstrapMode: false };
      return { user, me, accessToken: `access-${companyId}-${suffix}`, refreshToken: `refresh-${companyId}-${suffix}` };
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
    let calls = [], handler;
    function fallback(call) {
      if (call.path === "/auth/login") return json(response(call.body.email.includes("company-b") ? "company-b" : "company-a"));
      if (call.path === "/auth/switch-company") return json(response(call.body.targetCompanyId));
      if (call.path === "/auth/refresh") return json(response(call.body.refreshToken.includes("company-b") ? "company-b" : "company-a", "renewed"));
      if (call.path === "/auth/logout") return json({ status: "ok" });
      if (call.path === "/me") return json(response(call.token.includes("company-b") ? "company-b" : "company-a").me);
      throw new Error(`Unexpected auth test request ${call.path}`);
    }
    window.fetch = async (url, options = {}) => {
      const call = { path: new URL(url).pathname.replace("/api/v1", ""), body: options.body ? JSON.parse(options.body) : {}, token: options.headers?.Authorization ?? "" };
      calls.push(call); return (handler ? await handler(call) : fallback(call)).clone();
    };
    const login = async (companyId = "company-a") => { await probe().auth.login({ email: `test@${companyId}.invalid`, password: "synthetic" }); await frame(); };
    const switchCompany = async () => { await probe().auth.switchCompany("company-b"); await frame(); };
    const active = () => probe().auth.activeCompany?.id;
    const results = [];
    async function scenario(name, run) {
      handler = undefined; await probe().auth.logout(); await frame(); calls = [];
      await run(); results.push(name);
    }
    try {
      await scenario("ordinary 401 renews once and retries in the same company", async () => {
        await login(); const attempts = [];
        const result = await probe().authorized(async (token) => { attempts.push(token); if (!token.endsWith("renewed")) throw new ApiError(401, "expired"); return "ok"; });
        check(result === "ok" && attempts.length === 2, "Normal renewal broken");
        check(calls.filter((call) => call.path === "/auth/refresh").length === 1, "Duplicate normal renewal");
      });
      await scenario("concurrent 401 responses share renewal", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/auth/refresh" ? gate.promise : fallback(call);
        const action = (token) => token.endsWith("renewed") ? Promise.resolve("ok") : Promise.reject(new ApiError(401, "expired"));
        const first = probe().authorized(action), second = probe().authorized(action); await frame();
        check(calls.filter((call) => call.path === "/auth/refresh").length === 1, "Parallel refresh duplicated");
        gate.resolve(json(response("company-a", "renewed"))); check((await Promise.all([first, second])).every((value) => value === "ok"), "Renewed actions failed");
      });
      await scenario("late 401 cannot replay an old action in the new company", async () => {
        await login(); const gate = deferred(), attempts = [];
        const pending = probe().authorized(async (token) => { attempts.push(token); if (attempts.length === 1) { await gate.promise; throw new ApiError(401, "expired"); } return "wrong-context"; }).catch((error) => error);
        await switchCompany(); gate.resolve(); const error = await pending;
        check(error instanceof ApiError && error.statusCode === 409, "Old request not rejected after company switch");
        check(attempts.length === 1 && active() === "company-b", "Old action replayed across companies");
        check(!calls.some((call) => call.path === "/auth/refresh"), "Old 401 renewed the new session");
      });
      await scenario("late successful renewal cannot restore the old company", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/auth/refresh" ? gate.promise : fallback(call);
        const pending = probe().auth.refreshSession(); await switchCompany();
        gate.resolve(json(response("company-a", "renewed"))); check(await pending === null, "Stale renewal token returned"); await frame();
        check(active() === "company-b", "Old renewal restored the old company");
      });
      await scenario("late failed renewal cannot log out the new company", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/auth/refresh" ? gate.promise : fallback(call);
        const pending = probe().auth.refreshSession(); await switchCompany();
        gate.resolve(json({ message: "expired" }, 401)); await pending; await frame();
        check(active() === "company-b" && probe().auth.isAuthenticated, "Old renewal failure cleared the new session");
      });
      await scenario("renewals are shared only by their own session", async () => {
        await login(); const gateA = deferred(), gateB = deferred();
        handler = (call) => call.path === "/auth/refresh" ? (call.body.refreshToken.includes("company-b") ? gateB.promise : gateA.promise) : fallback(call);
        const old = probe().auth.refreshSession(); await switchCompany();
        const next = probe().auth.refreshSession(), shared = probe().auth.refreshSession(); await frame();
        check(calls.filter((call) => call.path === "/auth/refresh").length === 2, "New session reused old renewal");
        gateA.resolve(json(response("company-a", "renewed"))); await old;
        gateB.resolve(json(response("company-b", "renewed"))); const values = await Promise.all([next, shared]); await frame();
        check(values.every((value) => value === "access-company-b-renewed") && active() === "company-b", "Independent renewal corrupted state");
      });
      await scenario("a profile response cannot restore an old company", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/me" ? gate.promise : fallback(call);
        const pending = probe().auth.reloadProfile(); await switchCompany();
        gate.resolve(json(response("company-a").me)); await pending; await frame();
        check(active() === "company-b", "Late profile restored old company");
      });
      await scenario("late logout cannot clear a newer login", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/auth/logout" ? gate.promise : fallback(call);
        const pending = probe().auth.logout(); await login("company-b");
        gate.resolve(json({ status: "ok" })); await pending; await frame();
        check(active() === "company-b", "Late logout cleared new login");
      });
      await scenario("only the latest explicit login can apply", async () => {
        const gate = deferred();
        handler = (call) => call.path === "/auth/login" && call.body.email.includes("company-a") ? gate.promise : fallback(call);
        const pending = login().catch((error) => error); await login("company-b");
        gate.resolve(json(response("company-a"))); const error = await pending; await frame();
        check(error instanceof ApiError && error.statusCode === 409 && active() === "company-b", "Older login overwrote newer login");
      });
      await scenario("a failed switch preserves valid renewal of the active session", async () => {
        await login(); const gate = deferred();
        handler = (call) => call.path === "/auth/refresh" ? gate.promise : call.path === "/auth/switch-company" ? json({ message: "test" }, 403) : fallback(call);
        const pending = probe().auth.refreshSession(); await probe().auth.switchCompany("company-b").catch(() => {});
        gate.resolve(json(response("company-a", "renewed"))); const token = await pending; await frame();
        check(active() === "company-a" && token === "access-company-a-renewed", "Failed switch discarded active token rotation");
      });
      for (const status of [200, 401]) {
        await scenario(`late initial profile (${status}) cannot affect a newer login`, async () => {
          unmount();
          localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "restored-company-a", refreshToken: "restored-refresh-a" }));
          const gate = deferred();
          handler = (call) => call.path === "/me" && call.token.includes("restored-company-a") ? gate.promise : fallback(call);
          unmount = harness.mount(container); await frame();
          check(calls.some((call) => call.path === "/me" && call.token.includes("restored-company-a")), "Initial profile restoration did not start");
          await login("company-b");
          gate.resolve(status === 200 ? json(response("company-a").me) : json({ message: "expired" }, 401));
          await frame();
          check(active() === "company-b" && probe().auth.isAuthenticated, "Initial restoration overwrote the newer login");
          check(!calls.some((call) => call.path === "/auth/refresh"), "Obsolete restoration unnecessarily refreshed the old session");
          check(JSON.parse(localStorage.getItem("amcco_session_v1")).accessToken.includes("company-b"), "Initial restoration overwrote the persisted session");
        });
      }
      return results;
    } finally { handler = undefined; window.fetch = originalFetch; unmount(); container.remove(); }
  }, fixture);
  assert.equal(passed.length, 12);
  for (const name of passed) console.log(`PASS ${name}`);
  await context.close();
} finally { await browser.close(); }
