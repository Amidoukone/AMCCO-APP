// Dense, synthetic histories. All API traffic stays inside browser mocks.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { getBusinessActivityProfile } from "../backend/dist/config/business-activity-profiles.js";

const base = "http://127.0.0.1:5175";
const company = { id: "company-test", code: "TEST", name: "Entreprise de recette", isActive: true };
const user = { id: "user-test", companyId: company.id, role: "SYS_ADMIN", email: "test@example.invalid", fullName: "Test" };
const codes = ["HARDWARE", "GENERAL_STORE", "SERVICES", "MINING"];
const browser = await chromium.launch({ headless: true });
const errors = [];
async function fixture(width, { failFormLoadOnce = false } = {}) {
  const expectsModuleFailure = failFormLoadOnce;
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const calls = [], formModules = [], directoryModules = [];
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "local-test", refreshToken: "local-refresh" })));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (failFormLoadOnce && url.pathname.includes("/components/FinanceTransactionForm")) {
      failFormLoadOnce = false;
      return route.abort("failed");
    }
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.startsWith("/api/v1/")) return route.abort();
    const path = url.pathname.slice("/api/v1".length);
    assert.equal(request.method(), "GET", "This recipe must never mutate data");
    const query = Object.fromEntries(url.searchParams);
    calls.push({ path, query });
    const code = query.activityCode ?? "HARDWARE";
    let data;
    if (path === "/me") data = { user, company, bootstrapMode: false, memberships: [{ companyId: company.id, companyCode: company.code, companyName: company.name, role: user.role, isActive: true }] };
    else if (path === "/activities") data = { items: codes.map((code) => ({ code, label: getBusinessActivityProfile(code).label, isEnabled: true })), profiles: codes.map(getBusinessActivityProfile) };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path === "/finance/accounts") data = { items: [{ id: "account-test", companyId: company.id, name: "Caisse test", accountRef: null, balance: "100000", scopeType: "DEDICATED", primaryActivityCode: code, allowedActivityCodes: [code], transactionsCount: 135 }] };
    else if (path === "/finance/transactions" || path === "/operations/tasks") {
      const transactions = path === "/finance/transactions";
      const rows = Array.from({ length: 135 }, (_, index) => {
        const stamp = new Date(Date.UTC(2026, 10, 18, 12, 0, -index)).toISOString();
        const common = { id: `${transactions ? "transaction" : "task"}-${code}-${index}`, companyId: company.id, activityCode: code, createdById: user.id, createdByEmail: user.email, createdByFullName: user.fullName, createdAt: stamp, updatedAt: stamp };
        const metadata = { recipientRef: index === 80 ? "RECIPIENT_80" : "RECIPIENT_RECENT", serviceCategory: index === 80 ? "CATEGORY_80" : "CATEGORY_RECENT", serviceType: "Conseil", clientRef: "Client test", shopRef: "Boutique test" };
        return transactions ? { ...common, accountId: "account-test", accountName: "Caisse test", accountRef: null, accountScopeType: "DEDICATED", accountPrimaryActivityCode: code, accountAllowedActivityCodes: [code], type: "CASH_OUT", status: "APPROVED", amount: "100", currency: "XOF", occurredAt: stamp, description: `Operation ${index}`, metadata, requiresProof: false, proofsCount: 0, validatedById: null, validatedByEmail: null, salaryConfirmationStatus: "NOT_REQUIRED", salaryConfirmedById: null, salaryConfirmedByEmail: null, salaryConfirmedAt: null }
          : { ...common, title: `Intervention ${index}`, description: `Operation ${index}`, status: "TODO", assignedToId: user.id, assignedToEmail: user.email, assignedToFullName: user.fullName, dueDate: null, metadata };
      }).filter((row) => !query.search || `${row.description} ${row.title ?? ""}`.includes(query.search));
      data = { items: rows.slice(Number(query.offset ?? 0), Number(query.offset ?? 0) + Number(query.limit ?? 50)) };
    } else if (path === "/reports/general-store/ledger") data = { shops: [], rows: [] };
    else if (path === "/operations/members" || path === "/activities/HARDWARE/articles") data = { items: [] };
    else { errors.push(`Unexpected API ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected request" } } }); }
    return route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("request", (request) => { if (new URL(request.url()).pathname.includes("FinanceTransactionForm")) formModules.push(request.url()); });
  page.on("request", (request) => { if (/\/(HardwareArticlesPanel|RentalTenantsPanel|GeneralStoreShopsPanel|BtpProjectsPanel)/.test(new URL(request.url()).pathname)) directoryModules.push(request.url()); });
  page.on("pageerror", (error) => {
    if (expectsModuleFailure && /dynamically imported module/i.test(error.message)) return;
    errors.push(error.message);
  });
  return { context, page, calls, formModules, directoryModules };
}

async function waitForCount(page, id, expected) {
  await page.waitForFunction(({ id, expected }) => {
    const text = document.querySelector(`${id} .list-pagination-meta`)?.textContent;
    return text?.replace(/\s+/g, " ").includes(`sur ${expected} `);
  }, { id, expected }).catch(async (error) => {
    console.error(JSON.stringify({ id, expected, text: (await page.locator("body").innerText()).slice(-2500), errors }));
    throw error;
  });
}
try {
  if (!process.argv.includes("--suggestions-only")) for (const width of [1440, 390]) for (const kind of ["transactions", "tasks"]) {
    const { context, page, calls, formModules, directoryModules } = await fixture(width);
    const transactions = kind === "transactions";
    const path = transactions ? "/finance/transactions" : "/operations/tasks";
    const id = transactions ? "#transactions-list" : "#tasks-list";
    const rowSelector = transactions ? `${id} .finance-transaction-row` : `${id} .operations-task-card`;
    const limit = width === 1440 ? 50 : transactions ? 30 : 40;
    await page.goto(`${base}${path}?activityCode=GENERAL_STORE`);
    await waitForCount(page, id, limit);
    assert.equal(calls.find((call) => call.path === path).query.limit, String(limit));
    assert.equal(await page.locator(rowSelector).count(), 10);
    assert.equal(calls.filter((call) => call.path === path).length, 1, "No hidden history fetch on list arrival");
    if (transactions) {
      assert.equal(formModules.length, 0, "Closed transaction forms must not load their module");
      assert.equal(directoryModules.length, 0, "A transaction list must not load directory interfaces");
      assert.equal(await page.locator("#transaction-create form").count(), 0, "Closed forms must not build hidden controls before first use");
    }
    for (let loaded = limit; loaded < 135;) {
      const expected = Math.min(135, loaded + limit);
      await page.getByRole("button", { name: "Charger plus", exact: true }).click();
      await waitForCount(page, id, expected); loaded = expected;
    }
    assert.equal(await page.getByRole("button", { name: "Charger plus", exact: true }).count(), 0);
    const offsets = calls.filter((call) => call.path === path).map((call) => Number(call.query.offset));
    assert.deepEqual(offsets, Array.from({ length: Math.ceil(135 / limit) }, (_, index) => index * limit));
    const visiblePageSize = width === 1440 ? 50 : 10;
    if (width === 1440) await page.locator(".list-view-page-size select:visible, .finance-transactions-page-size select:visible").first().selectOption("50");
    const identities = [];
    const visiblePages = Math.ceil(135 / visiblePageSize);
    for (let index = 0; index < visiblePages; index++) {
      identities.push(...await page.locator(rowSelector).allTextContents());
      if (index < visiblePages - 1) await page.getByRole("button", { name: "Suivant", exact: true }).first().click();
    }
    assert.equal(identities.length, 135);
    assert.equal(new Set(identities).size, 135, "Records duplicated between visible pages");
    await page.getByPlaceholder(/^Rechercher :/).fill("Operation 134");
    await waitForCount(page, id, 1);
    assert.equal(await page.locator(rowSelector).count(), 1);
    assert.ok(calls.some((call) => call.path === path && call.query.search === "Operation 134" && call.query.offset === "0"));
    await context.close(); console.log(`PASS ${kind} ${width}: bounded first load, complete history, offsets, unique pages and server search`);
  }
  for (const code of ["HARDWARE", "SERVICES"]) {
    const { context, page, calls, formModules } = await fixture(1440);
    await page.goto(`${base}/finance/transactions?activityCode=${code}`);
    await waitForCount(page, "#transactions-list", 50);
    assert.equal(calls.filter((call) => call.path === "/finance/transactions").length, 1);
    assert.equal(formModules.length, 0);
    await page.locator("#transaction-create > summary").click();
    if (code === "HARDWARE") await page.getByLabel("Nature quincaillerie").selectOption("ITEM_ENTRY");
    const value = code === "HARDWARE" ? "RECIPIENT_80" : "CATEGORY_80";
    await page.locator(`datalist option[value="${value}"]`).waitFor({ state: "attached" });
    assert.ok(calls.some((call) => call.path === "/finance/transactions" && call.query.limit === "100"));
    assert.ok(formModules.length > 0, "Opening the form must request its deferred module");
    await waitForCount(page, "#transactions-list", 50);
    const description = page.locator('#transaction-create input[placeholder="Requise"], #transaction-create input[placeholder="Optionnelle"]');
    await description.fill("Brouillon conservé");
    await page.locator("#transaction-proof-file").setInputFiles({ name: "preuve-test.pdf", mimeType: "application/pdf", buffer: Buffer.from("test file") });
    await page.evaluate(() => { window.__transactionFormTest = document.querySelector("#transaction-create form"); });
    await page.locator("#transaction-create > summary").click();
    assert.equal(await page.evaluate(() => window.__transactionFormTest === document.querySelector("#transaction-create form")), true, "Folding a form must preserve its mounted controls");
    await page.locator("#transaction-create > summary").click();
    assert.equal(await description.inputValue(), "Brouillon conservé");
    await page.locator(".finance-proof-selected").getByText("preuve-test.pdf", { exact: true }).waitFor();
    await context.close(); console.log(`PASS ${code}: historical suggestions loaded on form opening without extending the displayed list`);
  }
  const { context, page, calls } = await fixture(1440);
  await page.goto(`${base}/operations/tasks?activityCode=SERVICES`);
  await waitForCount(page, "#tasks-list", 135);
  assert.equal(calls.find((call) => call.path === "/operations/tasks").query.limit, "200", "Preserve the existing service-category history");
  await context.close(); console.log("PASS service tasks: historical category source preserved");
  {
    const retry = await fixture(1440, { failFormLoadOnce: true });
    await retry.page.goto(`${base}/finance/transactions?activityCode=HARDWARE`);
    await waitForCount(retry.page, "#transactions-list", 50);
    await retry.page.locator("#transaction-create > summary").click();
    await retry.page.getByRole("button", { name: "Recharger la page", exact: true }).waitFor();
    await waitForCount(retry.page, "#transactions-list", 50);
    await Promise.all([
      retry.page.waitForEvent("load"),
      retry.page.getByRole("button", { name: "Recharger la page", exact: true }).click()
    ]);
    await waitForCount(retry.page, "#transactions-list", 50);
    await retry.page.locator("#transaction-create > summary").click();
    await retry.page.locator("#transaction-create form").waitFor();
    await retry.context.close(); console.log("PASS deferred form: failed module loading leaves the list usable and explicit reload restores the form");
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
