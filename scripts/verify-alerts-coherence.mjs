// Local browser contract checks. All API calls are simulated; external traffic is blocked.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { getBusinessActivityProfile } from "../backend/dist/config/business-activity-profiles.js";
const { chromium } = process.env.AMCCO_PLAYWRIGHT_PATH
  ? await import(pathToFileURL(process.env.AMCCO_PLAYWRIGHT_PATH).href)
  : await import("playwright-core");
const base = "http://127.0.0.1:5175";
const browser = await chromium.launch({ headless: true });
const companies = ["a", "b"].map((code) => ({ id: `company-${code}`, code, name: `Entreprise ${code.toUpperCase()}`, isActive: true }));
const errors = [];
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function fixture(width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const calls = [], gates = new Map();
  const alerts = new Map(companies.map((company, index) => [company.id, Array.from({ length: index + 1 }, (_, i) => ({
    id: `alert-${company.code}-${i}`, companyId: company.id, targetUserId: "user-test",
    code: "TASK_ASSIGNED", message: `ACTION ${company.code.toUpperCase()} ${i}`,
    severity: "INFO", entityType: null, entityId: null, metadata: null,
    readAt: null, createdAt: "2026-01-01T00:00:00.000Z"
  }))]));
  const unread = (companyId) => alerts.get(companyId).filter((item) => !item.readAt).length;
  const me = (company) => ({
    user: { id: "user-test", email: "test@example.invalid", fullName: "Test", role: "SYS_ADMIN", companyId: company.id },
    company, bootstrapMode: false,
    memberships: companies.map((row) => ({ companyId: row.id, companyCode: row.code, companyName: row.name, role: "SYS_ADMIN", isActive: true }))
  });
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "token-company-a", refreshToken: "refresh-company-a" })));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    const path = url.pathname.split("/api/v1")[1], method = request.method();
    const company = companies.find((row) => request.headers().authorization?.includes(row.id)) ?? companies[0];
    calls.push({ path, method, companyId: company.id });
    const gate = gates.get(`${method}:${path}:${company.id}`);
    const listData = path === "/alerts" && method === "GET" ? structuredClone({
      items: alerts.get(company.id).filter((item) => url.searchParams.get("unreadOnly") !== "true" || !item.readAt),
      unreadCount: unread(company.id)
    }) : null;
    if (gate) {
      await gate.promise;
      if (gate.fail) return route.fulfill({ status: 500, json: { error: { message: "Erreur tardive source" } } });
    }
    let data;
    if (path === "/me") data = me(company);
    else if (path === "/auth/switch-company") {
      const target = companies.find((row) => row.id === request.postDataJSON().targetCompanyId);
      assert.ok(target);
      data = { accessToken: `token-${target.id}`, refreshToken: `refresh-${target.id}`, me: me(target) };
    } else if (path === "/activities") data = { profiles: [getBusinessActivityProfile("SERVICES")], items: [{ code: "SERVICES", label: "Services", isEnabled: true }] };
    else if (path === "/alerts/summary") data = { item: { unreadCount: unread(company.id) } };
    else if (path === "/alerts" && method === "GET") data = listData;
    else if (path.startsWith("/alerts/") && method !== "GET") {
      const items = alerts.get(company.id);
      if (path === "/alerts/read-all") items.forEach((item) => { item.readAt = "2026-02-01T00:00:00.000Z"; });
      else if (path.endsWith("/read")) items.find((item) => path.includes(item.id)).readAt = "2026-02-01T00:00:00.000Z";
      else if (path === "/alerts/delete-many") alerts.set(company.id, items.filter((item) => !request.postDataJSON().alertIds.includes(item.id)));
      else alerts.set(company.id, items.filter((item) => !path.includes(item.id)));
      data = { status: "ok" };
    } else {
      errors.push(`Unexpected ${method} ${path}`);
      return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } });
    }
    await route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, calls, gates };
}
const count = (page) => page.locator(".alerts-summary-pill").filter({ hasText: "Non lues" }).locator("strong");
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function switchCompany(page, width) {
  if (width === 390) {
    await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
    await page.locator(".mobile-menu-section").filter({ has: page.locator('[aria-label="Choisir une entreprise"]') }).locator("summary").click();
    await page.getByRole("group", { name: "Choisir une entreprise" }).getByRole("button", { name: /Entreprise B/ }).click();
  } else await page.locator("#active-company").selectOption("company-b");
}
const scenarios = [
  { action: "read", method: "PATCH", path: "/alerts/alert-a-0/read", button: "Marquer comme lu" },
  { action: "read-all", method: "PATCH", path: "/alerts/read-all", button: "Tout marquer comme lu" },
  { action: "delete", method: "DELETE", path: "/alerts/alert-a-0", button: "Supprimer" },
  { action: "delete-many", method: "POST", path: "/alerts/delete-many", button: "Supprimer la sélection (1)" }
];
try {
  for (const width of [1440, 390]) {
    for (const scenario of scenarios) for (const fail of [false, true]) {
      const { context, page, gates } = await fixture(width);
      await page.goto(`${base}/alerts`);
      await page.getByText("ACTION A 0", { exact: true }).waitFor();
      const gate = { ...deferred(), fail };
      gates.set(`${scenario.method}:${scenario.path}:company-a`, gate);
      if (scenario.action === "delete-many") await page.getByRole("checkbox", { name: "Sélectionner", exact: true }).check();
      const sent = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith(scenario.path) && request.method() === scenario.method);
      await page.getByRole("button", { name: scenario.button, exact: true }).click();
      await sent;
      await switchCompany(page, width);
      await page.getByText("ACTION B 0", { exact: true }).waitFor();
      assert.equal(await count(page).innerText(), "2");
      const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(scenario.path) && response.request().method() === scenario.method);
      gate.resolve();
      await lateResponse;
      await frame(page);
      assert.equal(await count(page).innerText(), "2", "An old mutation must not change the new company's unread count");
      assert.equal(await page.getByText("ACTION A 0", { exact: true }).count(), 0);
      assert.equal(await page.locator(".error-box, .success-box, .feedback-banner-error, .feedback-banner-success").count(), 0, "Late messages must not appear in the destination company");
      assert.equal(await page.locator('.sidebar-nav a[href="/alerts"] .nav-badge').innerText(), "2");
      await context.close();
      console.log(`PASS alerts ${width} ${scenario.action} ${fail ? "late-error" : "late-success"}: company context and counters preserved`);
    }
    const { context, page } = await fixture(width);
    await page.goto(`${base}/alerts`);
    await page.getByText("ACTION A 0", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Marquer comme lu", exact: true }).click();
    await page.getByText("Alerte marquée comme lue.", { exact: true }).waitFor();
    assert.equal(await count(page).innerText(), "0");
    assert.equal(await page.locator('.sidebar-nav a[href="/alerts"] .nav-badge').count(), 0);
    await context.close();
    console.log(`PASS alerts ${width}: normal read action still updates its own counter`);
    const lateList = await fixture(width);
    const gate = deferred();
    lateList.gates.set("GET:/alerts:company-a", gate);
    const started = lateList.page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/api/v1/alerts") && request.method() === "GET");
    await lateList.page.goto(`${base}/alerts`);
    await started;
    await switchCompany(lateList.page, width);
    await lateList.page.getByText("ACTION B 0", { exact: true }).waitFor();
    const response = lateList.page.waitForResponse((item) => new URL(item.url()).pathname.endsWith("/alerts") && item.request().headers().authorization?.includes("company-a"));
    gate.resolve();
    await response;
    await frame(lateList.page);
    assert.equal(await count(lateList.page).innerText(), "2");
    assert.equal(await lateList.page.getByText("ACTION A 0", { exact: true }).count(), 0);
    assert.equal(await lateList.page.locator('.sidebar-nav a[href="/alerts"] .nav-badge').innerText(), "2");
    await lateList.context.close();
    console.log(`PASS alerts ${width}: delayed source list cannot overwrite destination alerts`);
    for (const scenario of scenarios) for (const fail of [false, true]) {
      const concurrent = await fixture(width);
      const { page, gates, calls } = concurrent;
      await page.goto(`${base}/alerts`);
      await page.getByText("ACTION A 0", { exact: true }).waitFor();
      const oldListGate = deferred(), mutationGate = { ...deferred(), fail };
      gates.set("GET:/alerts:company-a", oldListGate);
      gates.set(`${scenario.method}:${scenario.path}:company-a`, mutationGate);
      const oldRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/api/v1/alerts") && new URL(request.url()).searchParams.get("unreadOnly") === "true");
      await page.getByRole("checkbox", { name: "Non lues uniquement", exact: true }).check();
      const oldListRequest = await oldRequest;
      if (scenario.action === "delete-many") await page.getByRole("checkbox", { name: "Sélectionner", exact: true }).check();
      const sent = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith(scenario.path) && request.method() === scenario.method);
      await page.getByRole("button", { name: scenario.button, exact: true }).click();
      await sent;
      assert.equal(await page.getByRole("button", { name: "Tout marquer comme lu", exact: true }).isEnabled(), false, "Overlapping alert writes must be disabled");
      gates.delete("GET:/alerts:company-a");
      const freshList = page.waitForResponse((response) => response.request() !== oldListRequest && new URL(response.url()).pathname.endsWith("/api/v1/alerts"));
      mutationGate.resolve();
      await freshList;
      await frame(page);
      assert.equal(await count(page).innerText(), fail ? "1" : "0");
      const lateResponse = page.waitForResponse((response) => response.request() === oldListRequest);
      oldListGate.resolve();
      await lateResponse;
      await frame(page);
      assert.equal(await count(page).innerText(), fail ? "1" : "0", "A stale read must not resurrect unread alerts after a mutation");
      assert.equal(await page.getByText("ACTION A 0", { exact: true }).count(), fail ? 1 : 0);
      const badge = page.locator('.sidebar-nav a[href="/alerts"] .nav-badge');
      if (fail) {
        assert.equal(await badge.innerText(), "1");
        assert.ok((await page.getByRole("alert").innerText()).includes("Erreur tardive source"), "A silent refresh must not hide the mutation error");
        assert.equal(await page.getByRole("button", { name: "Tout marquer comme lu", exact: true }).isEnabled(), true);
      } else assert.equal(await badge.count(), 0);
      assert.equal(calls.filter((call) => call.path === "/alerts" && call.method === "GET").length, 3, "Only one fresh read is required after the overlap");
      await concurrent.context.close();
      console.log(`PASS alerts ${width} ${scenario.action} ${fail ? "error" : "success"}: stale same-company reads ignored and writes serialized`);
    }
  }
  assert.deepEqual(errors, [], "No browser errors or unexpected API calls");
} finally { await browser.close(); }
