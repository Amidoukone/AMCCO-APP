// Local recipe. Every API request is intercepted; external requests are blocked.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { getBusinessActivityProfile, assertTaskInputMatchesActivityProfile } from "../backend/dist/config/business-activity-profiles.js";
const { chromium } = process.env.AMCCO_PLAYWRIGHT_PATH ? await import(pathToFileURL(process.env.AMCCO_PLAYWRIGHT_PATH).href) : await import("playwright-core");
const base = "http://127.0.0.1:5175";
const artifacts = new URL("../artifacts/sector-ux/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const definitions = [
  { code: "AGRICULTURE", metadata: { campaignRef: "CAMP-01", parcelRef: "PAR-01", fieldType: "Riz", agricultureTaskKind: "SOWING" } },
  { code: "FISH_FARMING", metadata: { pondRef: "BASSIN-01", cycleRef: "CYCLE-01", fishTaskKind: "WATER_CONTROL", mortalityCount: "2", waterQuality: "pH historique" } },
  { code: "TRANSPORT", metadata: { transportCategory: "Camion benne", vehicleRef: "TR-01", routeRef: "Trajet historique", assetType: "Camion benne", transportService: "Service historique" } },
  { code: "MINING", metadata: { siteRef: "SITE-01", equipmentRef: "ENGIN-01" } },
  { code: "DAILY_ACTIVITIES", metadata: { dailyActivityKind: "Protocole d'accord", agreementRef: "ACCORD-01", partnerName: "Partenaire historique", agreementType: "Financier", agreementCapitalAmount: "90000", agreementProfitAmount: "5000" } }
];
const profiles = definitions.map(({ code }) => getBusinessActivityProfile(code));
const company = { id: "company-test", name: "Entreprise de recette", code: "TEST", isActive: true };
const browser = await chromium.launch({ headless: true });
const errors = [];
async function fixture(definition, width, role = "SYS_ADMIN", failRead = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const user = { id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id };
  const original = { id: "task-existing", companyId: company.id, activityCode: definition.code, title: "Intervention historique", description: "Description historique", dueDate: "2026-12-01T09:00:00.000Z", status: "BLOCKED", createdById: user.id, createdByEmail: user.email, createdByFullName: user.fullName, assignedToId: user.id, assignedToEmail: user.email, assignedToFullName: user.fullName, metadata: { ...definition.metadata, historicalNote: "À conserver", archiveReference: "ARCHIVE-2025" }, createdAt: "2025-01-01T12:00:00.000Z", updatedAt: "2025-01-01T12:00:00.000Z" };
  const tasks = [structuredClone(original)];
  const categories = ["Protocole d'accord", "Rendez-vous"].map((name, index) => ({ id: `category-${index}`, companyId: company.id, name, isActive: true }));
  const calls = [];
  let rejectWrite = false;
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "local-test", refreshToken: "local-refresh" })));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    const path = url.pathname.split("/api/v1")[1], method = request.method(), body = request.postDataJSON();
    calls.push({ path, method, body, query: Object.fromEntries(url.searchParams) });
    let data;
    if (path === "/me") data = { user, company, memberships: [{ companyId: company.id, companyCode: company.code, companyName: company.name, role, isActive: true }], bootstrapMode: false };
    else if (path === "/activities") data = { profiles, items: profiles.map((profile) => ({ code: profile.activityCode, label: profile.label, isEnabled: true })) };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path === "/operations/members") data = { items: [{ userId: user.id, email: user.email, fullName: user.fullName, role, openTasksCount: 1 }] };
    else if (path === "/operations/tasks" && method === "GET") data = { items: tasks.filter((task) => (!url.searchParams.get("status") || task.status === url.searchParams.get("status")) && (!url.searchParams.get("search") || JSON.stringify(task).includes(url.searchParams.get("search")))) };
    else if ((path === "/operations/tasks" && method === "POST") || (path === "/operations/tasks/task-existing" && method === "PATCH")) {
      if (rejectWrite) { rejectWrite = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de sauvegarde simulée" } } }); }
      try { assertTaskInputMatchesActivityProfile(definition.code, { ...original, ...body }); }
      catch (error) { errors.push(error.message); return route.fulfill({ status: 422, json: { error: { message: error.message } } }); }
      if (method === "POST") { const item = { ...original, ...body, id: "task-created", status: "TODO" }; tasks.push(item); data = { item }; }
      else { Object.assign(tasks[0], body); data = { item: tasks[0] }; }
    } else if (path.startsWith("/daily-activities/categories")) {
      if (method === "GET") {
        if (failRead) { failRead = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de lecture simulée" } } }); }
        data = { items: [...categories, { id: "foreign", companyId: "another-company", name: "Autre entreprise", isActive: true }] };
      } else {
        if (rejectWrite) { rejectWrite = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de sauvegarde simulée" } } }); }
        if (method === "POST") { const item = { ...body, id: "category-created", companyId: company.id, isActive: true }; categories.push(item); data = { item }; }
        else if (method === "PATCH") { const item = categories.find((item) => item.id === path.split("/").at(-1)); assert.ok(item); Object.assign(item, body); data = { item }; }
        else throw new Error("Unexpected category deletion");
      }
    } else { errors.push(`Unexpected request ${method} ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } }); }
    await route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  return { context, page, tasks, categories, calls, original, fail: () => { rejectWrite = true; } };
}
try {
  for (const definition of definitions) for (const width of [1440, 390]) {
    const { context, page, calls, original, tasks, fail } = await fixture(definition, width);
    await page.goto(`${base}/operations/tasks?activityCode=${definition.code}`);
    const card = page.locator(".operations-task-card").filter({ hasText: "Intervention historique" });
    await card.waitFor();
    assert.equal(await page.locator("#task-create").getAttribute("open"), null);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector("#tasks-list").compareDocumentPosition(document.querySelector("#task-create")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    // Modify a real historical ID through the same form used before this batch.
    const edit = card.getByRole("button", { name: "Modifier", exact: true });
    if (!await edit.isVisible()) await card.locator("summary").click();
    await edit.click();
    const form = page.locator(".operations-task-form");
    await form.locator('input[type="text"]').first().fill("Intervention mise à jour");
    assert.equal(await form.locator("textarea").getAttribute("required") !== null, profiles.find((item) => item.activityCode === definition.code).tasks.requiresDescription);
    fail();
    await form.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Erreur de sauvegarde simulée" }).waitFor();
    assert.equal(await form.locator('input[type="text"]').first().inputValue(), "Intervention mise à jour");
    await form.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
    const patch = calls.findLast((call) => call.method === "PATCH");
    assert.equal(patch.path, "/operations/tasks/task-existing");
    assert.equal(tasks[0].dueDate, original.dueDate);
    assert.equal(tasks[0].assignedToId, original.assignedToId);
    for (const [key, value] of Object.entries(original.metadata)) assert.equal(tasks[0].metadata[key], value, `Historical ${key} must survive editing`);
    // Lists still use server search and status filters without dropping a draft.
    await page.getByRole("button", { name: definition.code === "DAILY_ACTIVITIES" ? "Créer une activité" : "Créer une tâche", exact: true }).click();
    await form.locator('input[type="text"]').first().fill("Brouillon conservé");
    await page.locator('.operations-filter-form input[type="search"]').fill(Object.values(definition.metadata)[0]);
    await page.waitForTimeout(500);
    assert.equal(await form.locator('input[type="text"]').first().inputValue(), "Brouillon conservé");
    await page.getByRole("navigation", { name: "Pages du secteur" }).getByRole("link", { name: "Rapports", exact: true }).click();
    await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    assert.equal(await form.locator('input[type="text"]').first().inputValue(), "Brouillon conservé");
    assert.ok(calls.some((call) => call.path === "/operations/tasks" && call.query.search));
    if (definition.code === "DAILY_ACTIVITIES") {
      await page.getByRole("button", { name: "Créer une fiche d’accord", exact: true }).click();
      assert.equal(await form.locator('input[type="text"]').first().inputValue(), "Brouillon conservé", "Cancelling retains the activity draft");
      page.removeAllListeners("dialog"); page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Créer une fiche d’accord", exact: true }).click();
      await form.locator('input[type="text"]').first().fill("Accord de recette");
      await form.getByLabel(/^Nature de l'accord/).selectOption("Financier");
      await form.getByPlaceholder("Référence de l'accord", { exact: true }).fill("ACCORD-02");
      await form.getByPlaceholder("Partenaire", { exact: true }).fill("Partenaire recette");
      await form.getByLabel(/^Capital d'investissement convenu/).fill("100000");
      await form.getByRole("button", { name: "Enregistrer l’activité", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      assert.equal(tasks.length, 2);
      assert.equal(tasks[1].metadata.agreementCapitalAmount, "100000");
      assert.equal(calls.some((call) => call.path.startsWith("/finance/") && call.method !== "GET"), false, "An agreement must never create an income");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
    await page.screenshot({ path: fileURLToPath(new URL(`${definition.code.toLowerCase()}-tasks-${width}.png`, artifacts)), fullPage: true });
    await context.close();
    console.log(`PASS ${definition.code} tasks ${width}: list order, historical references, failed save, draft protection`);
  }
  const daily = definitions.at(-1);
  for (const width of [1440, 390]) {
    const { context, page, calls, categories, fail } = await fixture(daily, width, "ACCOUNTANT", true);
    await page.goto(`${base}/operations/tasks?activityCode=DAILY_ACTIVITIES&view=categories`);
    await page.getByRole("button", { name: "Réessayer", exact: true }).click();
    await page.getByRole("heading", { name: "Rendez-vous", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Autre entreprise", exact: true }).count(), 0);
    assert.equal(await page.locator("#tasks-list").count(), 0);
    assert.equal(await page.locator("#task-create").count(), 0);
    await page.getByLabel("Rechercher une catégorie", { exact: true }).fill("Rendez-vous");
    const record = page.locator(".operations-member-card").filter({ hasText: "Rendez-vous" });
    await record.getByRole("button", { name: "Modifier", exact: true }).click();
    const name = page.getByLabel("Nom de la catégorie", { exact: true });
    await name.fill("Rendez-vous modifié");
    await page.getByRole("navigation", { name: "Pages du secteur" }).getByRole("link", { name: "Activités et accords", exact: true }).click();
    await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    assert.equal(await name.inputValue(), "Rendez-vous modifié");
    fail();
    await page.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Erreur de sauvegarde simulée" }).waitFor();
    await page.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
    await page.getByRole("heading", { name: "Rendez-vous modifié", exact: true }).waitFor();
    assert.ok(calls.some((call) => call.path === "/daily-activities/categories/category-1" && call.method === "PATCH"));
    await page.getByRole("button", { name: "Ajouter une catégorie", exact: true }).click();
    await name.fill("Suivi de dossier");
    await page.locator("#daily-activity-categories").getByRole("button", { name: "Ajouter la catégorie", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
    assert.equal(categories.length, 3);
    await page.screenshot({ path: fileURLToPath(new URL(`daily-categories-${width}.png`, artifacts)), fullPage: true });
    await page.getByRole("navigation", { name: "Pages du secteur" }).getByRole("link", { name: "Activités et accords", exact: true }).click();
    await page.locator("#tasks-list").waitFor();
    assert.equal(await page.locator("#daily-activity-categories").count(), 0);
    await context.close();
    console.log(`PASS daily categories ${width}: separate view, retry, company scope, search, drafts, update ID and creation`);
  }
  for (const role of ["OWNER", "EMPLOYEE", "SUPERVISOR"]) {
    const { context, page } = await fixture(daily, 390, role);
    await page.goto(`${base}/operations/tasks?activityCode=DAILY_ACTIVITIES&view=categories`);
    await page.getByRole("navigation", { name: "Pages du secteur" }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Pages du secteur" }).getByRole("link", { name: "Catégories", exact: true }).count(), role === "SUPERVISOR" ? 1 : 0);
    if (role === "SUPERVISOR") await page.getByRole("heading", { name: "Rendez-vous", exact: true }).waitFor();
    else { await page.locator("#tasks-list").waitFor(); assert.equal(await page.locator("#daily-activity-categories").count(), 0); }
    await context.close();
  }
  const legacy = await fixture(daily, 390);
  await legacy.page.goto(`${base}/operations/tasks?activityCode=DAILY_ACTIVITIES#daily-activity-categories`);
  await legacy.page.locator("#daily-activity-categories[open]").waitFor();
  await legacy.context.close();
  assert.deepEqual(errors, [], "No runtime errors or unexpected API calls");
} finally { await browser.close(); }
