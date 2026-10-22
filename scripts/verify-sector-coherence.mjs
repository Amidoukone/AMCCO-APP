// Integrated local journeys. APIs are simulated; external requests are blocked.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { getBusinessActivityProfile, assertTaskInputMatchesActivityProfile } from "../backend/dist/config/business-activity-profiles.js";
const { chromium } = process.env.AMCCO_PLAYWRIGHT_PATH ? await import(pathToFileURL(process.env.AMCCO_PLAYWRIGHT_PATH).href) : await import("playwright-core");
const base = "http://127.0.0.1:5175";
const artifacts = new URL("../artifacts/sector-coherence/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const codes = ["HARDWARE", "GENERAL_STORE", "RENTAL", "AGRICULTURE", "BTP", "FISH_FARMING", "TRANSPORT", "SERVICES", "MINING", "WATER", "BEVERAGE_DEPOT", "HYDROCARBON", "GENERAL_EXPENSES", "DAILY_ACTIVITIES"];
const profiles = codes.map(getBusinessActivityProfile);
const companies = [{ id: "company-a", name: "Entreprise A", code: "A", isActive: true }, { id: "company-b", name: "Entreprise B", code: "B", isActive: true }];
const refMetadata = {
  HARDWARE: { itemName: "Article historique", quantity: "3" },
  GENERAL_STORE: { shopRef: "Boutique historique", remainingStockValue: "5000" },
  RENTAL: { rentalTaskKind: "FOLLOW_UP", tenantRef: "Locataire historique", unitLabel: "Logement 1" },
  AGRICULTURE: { agricultureTaskKind: "SOWING", campaignRef: "CAMP-01", parcelRef: "PAR-01", fieldType: "Riz" },
  BTP: { btpTaskKind: "SITE_PREPARATION", projectRef: "Chantier historique" },
  FISH_FARMING: { fishTaskKind: "WATER_CONTROL", pondRef: "BASSIN-01", cycleRef: "CYCLE-01", mortalityCount: "2" },
  TRANSPORT: { transportCategory: "Camion benne", assetType: "Camion benne", transportService: "Historique", vehicleRef: "TR-01" },
  SERVICES: { serviceType: "Conseil", clientRef: "Client historique" }, MINING: { siteRef: "SITE-01", equipmentRef: "ENGIN-01" },
  WATER: {}, BEVERAGE_DEPOT: { beverageTaskKind: "SUIVI_GENERAL", productName: "Boisson historique" },
  HYDROCARBON: { hydrocarbonCategory: "Citerne", hydrocarbonTaskKind: "CONTROLE", hydrocarbonAssetRef: "CT-01" },
  GENERAL_EXPENSES: { generalExpenseKind: "PDG_OVERHEAD" }, DAILY_ACTIVITIES: { dailyActivityKind: "Rendez-vous" }
};
const reportDirectory = new URL("../artifacts/sector-reports/", import.meta.url);
const reportManifest = JSON.parse(await readFile(new URL("manifest.json", reportDirectory), "utf8"));
const overviews = Object.fromEntries(await Promise.all(reportManifest.map(async (row) => [row.code, JSON.parse(await readFile(new URL(row.overview, reportDirectory), "utf8"))])));
const browser = await chromium.launch({ headless: true });
const errors = [];
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function fixture(width, role = "SYS_ADMIN") {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
  const calls = [], downloads = [], dialogs = [];
  const gates = new Map();
  const user = (company) => ({ id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id });
  const me = (company) => ({ user: user(company), company, memberships: companies.map((row) => ({ companyId: row.id, companyCode: row.code, companyName: row.name, role, isActive: true })), bootstrapMode: false });
  const tasks = new Map();
  for (const company of companies) for (const code of codes) tasks.set(`${company.id}-${code}`, {
    id: `task-${code}`, companyId: company.id, activityCode: code, title: `Intervention ${company.code} ${code}`,
    description: "Description historique", dueDate: "2026-12-01T09:00:00.000Z", status: "BLOCKED",
    createdById: "user-test", createdByEmail: "test@example.invalid", createdByFullName: "Utilisateur de recette",
    assignedToId: "user-test", assignedToEmail: "test@example.invalid", assignedToFullName: "Utilisateur de recette",
    metadata: { ...refMetadata[code], archiveReference: "ARCHIVE-2025", historicalNote: "Historique à conserver" }, createdAt: "2025-01-01T12:00:00.000Z", updatedAt: "2025-01-01T12:00:00.000Z"
  });
  await context.addInitScript(() => {
    localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "token-company-a", refreshToken: "refresh-company-a" }));
    localStorage.setItem("amcco:selected-activity:company-a", "SERVICES");
    localStorage.setItem("amcco:selected-activity:company-b", "MINING");
  });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    const path = url.pathname.split("/api/v1")[1], method = request.method(), body = request.postDataJSON();
    const company = companies.find((row) => request.headers().authorization?.includes(row.id)) ?? companies[0];
    const code = url.searchParams.get("activityCode") || "SERVICES";
    calls.push({ path, method, body, code, companyId: company.id, query: Object.fromEntries(url.searchParams) });
    const gate = gates.get(`${path}:${company.id}:${code}`) || gates.get(`${path}:${company.id}`);
    if (gate) await gate.promise;
    let data;
    if (path === "/me") data = me(company);
    else if (path === "/auth/switch-company") {
      const target = companies.find((row) => row.id === body.targetCompanyId); assert.ok(target);
      data = { accessToken: `token-${target.id}`, refreshToken: `refresh-${target.id}`, me: me(target) };
    } else if (path === "/activities") data = { profiles, items: profiles.map((profile) => ({ code: profile.activityCode, label: profile.label, isEnabled: true })) };
    else if (path === "/admin/activities") data = { items: profiles.map((profile) => ({ code: profile.activityCode, label: `SECTOR ${company.code} ${profile.activityCode}`, isEnabled: true })) };
    else if (path.startsWith("/admin/activities/") && method === "PATCH") data = { item: { code: path.split("/").at(-1), label: `SECTOR ${company.code} ${path.split("/").at(-1)}`, isEnabled: body.isEnabled } };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path === "/dashboard/summary") data = { item: {
      generatedAt: new Date().toISOString(), sectorRulesVersion: "local-test", company: { companyId: company.id, companyName: company.name, companyCode: company.code, activeUsersCount: 1, totalMembershipsCount: 1, financialAccountsCount: 1, unreadAlertsCount: 0, auditEventsLast7Days: 0 },
      finance: { totalTransactionsCount: 1, draftCount: 0, submittedCount: 1, approvedCount: 0, rejectedCount: 0, totalsByCurrency: [], accountsSummary: { totalCount: 1, globalCount: 1, dedicatedCount: 0, restrictedCount: 0, compatibleCount: 1, incompatibleCount: 0 } },
      operations: { totalTasksCount: 1, todoCount: 0, inProgressCount: 0, doneCount: 0, blockedCount: 1, overdueCount: 0, dueSoonCount: 0, unassignedCount: 0, myOpenTasksCount: 1 },
      activitySummary: [], operationalPerformance: [], recentTransactions: [], workload: [], recentTasks: [{ ...tasks.get(`${company.id}-${code}`), title: `SYNTHÈSE ${company.code} ${code}` }]
    } };
    else if (path === "/finance/accounts") data = { items: [{ id: "account-test", companyId: company.id, name: "Caisse de recette", scopeType: "GLOBAL", primaryActivityCode: null, allowedActivityCodes: [], balance: "100000", transactionsCount: 0 }] };
    else if (path === "/finance/transactions" || path === "/finance/dump-trucks/summary") data = { items: [] };
    else if (path === "/finance/beverage-products" && method === "GET") data = { items: [] };
    else if (path === "/operations/members") data = { items: [{ userId: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, openTasksCount: 1 }] };
    else if (path === "/operations/tasks") data = { items: [tasks.get(`${company.id}-${code}`)].filter((task) => !url.searchParams.get("status") || task.status === url.searchParams.get("status")) };
    else if (/^\/operations\/tasks\/task-[A-Z_]+$/.test(path)) {
      const taskCode = path.slice("/operations/tasks/task-".length);
      const task = tasks.get(`${company.id}-${taskCode}`); assert.ok(task);
      if (method === "PATCH") {
        assertTaskInputMatchesActivityProfile(taskCode, { ...task, ...body });
        Object.assign(task, body);
      }
      data = { item: task };
    } else if (path.startsWith("/operations/tasks/")) data = { items: [] };
    else if (path === "/daily-activities/categories") data = { items: ["Rendez-vous", "Protocole d'accord"].map((name, index) => ({ id: `category-${index}`, companyId: company.id, name, isActive: true })) };
    else if (path === "/general-store/shops") data = { items: [{ id: "shop-test", companyId: company.id, name: "Boutique historique", isActive: true }] };
    else if (path === "/reports/general-store/ledger") data = { shops: [{ id: "shop-test", companyId: company.id, name: "Boutique historique", isActive: true }], rows: [] };
    else if (path === "/btp/projects") data = { items: [{ id: "project-test", companyId: company.id, name: "Chantier historique", clientRef: "Client", contractRef: "Marché", location: "Bamako", isActive: true }] };
    else if (/hardware|rental|ledger/.test(path)) data = { items: [] };
    else if (path === "/reports/overview") {
      const overview = structuredClone(overviews[code]);
      overview.filters = { activityCode: code, dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo") };
      if (overview.fieldOperationsReport) overview.fieldOperationsReport = { tasks: [], transactions: [{ activityCode: code, type: "CASH_IN", status: "APPROVED", currency: "XOF", amount: "1000", occurredAt: "2026-10-01T09:00:00.000Z", description: `RAPPORT ${company.code} ${code}`, metadata: refMetadata[code] }] };
      data = { item: overview };
    } else if (path === "/reports/exports/overview.pdf") return route.fulfill({ status: 200, contentType: "application/pdf", body: await readFile(new URL(`${code}-review.pdf`, reportDirectory)) });
    else { errors.push(`Unexpected ${method} ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } }); }
    await route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", (download) => downloads.push(download));
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  return { context, page, calls, tasks, gates, downloads, dialogs };
}
const nav = (page, pathname, code) => page.getByRole("navigation", { name: "Pages du secteur" }).locator(`a[href="${pathname}?activityCode=${code}"]`);
async function waitFor(predicate) { for (let index = 0; index < 200; index++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 25)); } assert.fail("Expected local API call did not arrive"); }
try {
  if (!process.argv.includes("--context-only")) for (const code of codes) for (const width of [1440, 390]) {
    const { context, page, calls } = await fixture(width);
    await page.goto(`${base}/dashboard?activityCode=${code}`);
    await page.getByText(`SYNTHÈSE A ${code}`, { exact: true }).first().waitFor();
    await nav(page, "/finance/transactions", code).click(); await page.locator("#transactions-list").waitFor();
    await nav(page, "/operations/tasks", code).click();
    const card = page.locator(".operations-task-card").filter({ hasText: `Intervention A ${code}` });
    try { await card.waitFor(); } catch (error) {
      console.error(JSON.stringify({ code, width, calls, errors, text: await page.locator("body").innerText() }, null, 2));
      await page.screenshot({ path: fileURLToPath(new URL("failure.png", artifacts)), fullPage: true });
      throw error;
    }
    await card.locator(".operations-task-title").click();
    await page.getByRole("link", { name: "Modifier cette tâche", exact: true }).click();
    const form = page.locator(".operations-task-form");
    await form.locator('input[type="text"]').first().fill(`Modifiée A ${code}`);
    await form.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
    await waitFor(() => calls.some((call) => call.method === "PATCH"));
    await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
    const patch = calls.findLast((call) => call.method === "PATCH");
    assert.equal(patch.path, `/operations/tasks/task-${code}`);
    assert.equal(patch.body.metadata.archiveReference, "ARCHIVE-2025");
    assert.equal(patch.body.metadata.historicalNote, "Historique à conserver");
    assert.equal(patch.body.dueDate, "2026-12-01T09:00:00.000Z");
    await nav(page, "/reports", code).click();
    await page.getByRole("region", { name: "Périmètre du rapport affiché", exact: true }).waitFor();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Télécharger PDF", exact: true }).click(); await download;
    assert.equal(calls.findLast((call) => call.path === "/reports/exports/overview.pdf").code, code);
    assert.equal(calls.filter((call) => call.method !== "GET").length, 1, "Only the requested task update may write");
    await context.close(); console.log(`PASS ${code} ${width}: dashboard, transactions, tasks, detail, edit, historical metadata, report and PDF`);
  }
  {
    const { context, page, calls, gates, downloads, tasks } = await fixture(1440);
    await page.goto(`${base}/reports?activityCode=SERVICES`);
    await page.getByText("RAPPORT A SERVICES", { exact: true }).waitFor();
    const exportGate = deferred(), activitiesGate = deferred();
    gates.set("/reports/exports/overview.pdf:company-a", exportGate);
    gates.set("/activities:company-b", activitiesGate);
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).click();
    await waitFor(() => calls.some((call) => call.path === "/reports/exports/overview.pdf"));
    await page.locator("#active-company").selectOption("company-b");
    await waitFor(() => calls.some((call) => call.path === "/activities" && call.companyId === "company-b"));
    assert.equal(await page.getByText("RAPPORT A SERVICES", { exact: true }).count(), 0, "Old company report must not appear under the new company");
    activitiesGate.resolve();
    await page.getByText("RAPPORT B MINING", { exact: true }).waitFor();
    assert.equal(await page.locator(".sidebar-sector-select").inputValue(), "MINING", "Restore the destination company's saved sector");
    exportGate.resolve();
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((button) => button.textContent.includes("Préparation...")));
    assert.equal(downloads.length, 0, "An export from a departed context must not download");
    await page.locator("#active-company").selectOption("company-a");
    await page.getByText("RAPPORT A SERVICES", { exact: true }).waitFor();
    assert.equal(await page.locator(".sidebar-sector-select").inputValue(), "SERVICES");
    await nav(page, "/dashboard", "SERVICES").click();
    await page.getByText("SYNTHÈSE A SERVICES", { exact: true }).first().waitFor();
    const dashboardGate = deferred(); gates.set("/dashboard/summary:company-a:MINING", dashboardGate);
    await page.locator(".sidebar-sector-select").selectOption("MINING");
    await waitFor(() => calls.some((call) => call.path === "/dashboard/summary" && call.code === "MINING"));
    assert.equal(await page.getByText("SYNTHÈSE A SERVICES", { exact: true }).count(), 0, "Old sector indicators must be hidden while new indicators load");
    dashboardGate.resolve(); await page.getByText("SYNTHÈSE A MINING", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: /Voir les blocages/ }).click();
    await page.locator("#tasks-list").waitFor();
    assert.equal(await page.locator(".operations-filter-form select").inputValue(), "BLOCKED");
    assert.ok(calls.some((call) => call.path === "/operations/tasks" && call.query.status === "BLOCKED" && call.code === "MINING"));
    const card = page.locator(".operations-task-card").filter({ hasText: "Intervention A MINING" });
    const edit = card.getByRole("button", { name: "Modifier", exact: true });
    if (!await edit.isVisible()) await card.locator("summary").click();
    await edit.click();
    const title = page.locator('.operations-task-form input[type="text"]').first();
    await title.fill("Brouillon protégé");
    const switches = calls.filter((call) => call.path === "/auth/switch-company").length;
    await page.locator("#active-company").selectOption("company-b");
    assert.equal(await title.inputValue(), "Brouillon protégé");
    assert.equal(await page.locator("#active-company").inputValue(), "company-a");
    assert.equal(calls.filter((call) => call.path === "/auth/switch-company").length, switches);
    page.removeAllListeners("dialog"); page.on("dialog", (dialog) => dialog.accept());
    await page.locator("#active-company").selectOption("company-b");
    await page.locator(".operations-task-card").filter({ hasText: "Intervention B MINING" }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Quitter la saisie en cours ?", exact: true }).count(), 0, "A confirmed company switch must not prompt twice");
    assert.equal(tasks.get("company-a-MINING").title, "Intervention A MINING", "Discarding a draft never changes the historical task");
    await page.screenshot({ path: fileURLToPath(new URL("blocked-tasks.png", artifacts)), fullPage: true });
    await context.close(); console.log("PASS context: company preferences, old data hidden, obsolete PDF ignored, sector dashboard loading and blocked-task shortcut");
  }
  for (const width of [1440, 390]) {
    const { context, page, calls, gates } = await fixture(width);
    await page.goto(`${base}/admin/activities`);
    const source = page.locator(".activity-admin-card").filter({ hasText: "SECTOR A SERVICES" });
    await source.waitFor();
    const mutationGate = deferred(); gates.set("/admin/activities/SERVICES:company-a", mutationGate);
    await source.getByRole("button", { name: "Désactiver", exact: true }).click();
    await waitFor(() => calls.some((call) => call.method === "PATCH" && call.path === "/admin/activities/SERVICES"));
    const listGate = deferred(); gates.set("/admin/activities:company-b", listGate);
    if (width < 640) {
      await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
      await page.locator(".mobile-menu-section").filter({ has: page.locator('[aria-label="Choisir une entreprise"]') }).locator("summary").click();
      await page.getByRole("button", { name: "Entreprise B Basculer", exact: true }).click();
    } else await page.locator("#active-company").selectOption("company-b");
    await waitFor(() => calls.some((call) => call.path === "/activities" && call.companyId === "company-b"));
    assert.equal(await page.getByText("SECTOR A SERVICES", { exact: true }).count(), 0, "Source company's configuration is hidden immediately");
    listGate.resolve();
    const destination = page.locator(".activity-admin-card").filter({ hasText: "SECTOR B SERVICES" });
    await destination.waitFor();
    const lateResponse = page.waitForResponse((response) => response.url().endsWith("/admin/activities/SERVICES") && response.request().method() === "PATCH");
    mutationGate.resolve(); await lateResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await destination.getByRole("button", { name: "Désactiver", exact: true }).count(), 1, "Late source mutation does not disable the destination's sector");
    assert.equal(await page.getByText("SECTOR A SERVICES", { exact: true }).count(), 0);
    const destinationServices = page.locator('.sidebar-sector-select option[value="SERVICES"]');
    assert.equal(await destinationServices.count(), 1, "Destination's activity context retains its enabled sector");
    assert.ok(!(await destinationServices.textContent()).includes("SECTOR A"), "Late mutation cannot overwrite the destination context");
    assert.equal(await page.locator(".sidebar-sector-select").inputValue(), "MINING");
    await context.close();
    console.log(`PASS admin sectors ${width}: company-scoped loading and late toggle response ignored`);
  }
  assert.deepEqual(errors, [], "No runtime errors or unexpected API calls");
} finally { await browser.close(); }
