// Local UI recipe. Every API call is simulated; no production access is needed.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { getBusinessActivityProfile } from "../backend/dist/config/business-activity-profiles.js";

const { chromium } = process.env.AMCCO_PLAYWRIGHT_PATH
  ? await import(pathToFileURL(process.env.AMCCO_PLAYWRIGHT_PATH).href)
  : await import("playwright-core");
const baseURL = process.env.AMCCO_UX_URL ?? "http://127.0.0.1:5175";
assert.equal(new URL(baseURL).hostname, "127.0.0.1", "Only a local frontend is permitted");
const browser = await chromium.launch({ headless: true });
const artifacts = new URL("../artifacts/sector-ux/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const company = { id: "company-test", code: "TEST", name: "Entreprise de recette", isActive: true };
const definitions = [
  { code: "GENERAL_STORE", view: "shops", label: "Boutiques", create: "Ajouter une boutique", submit: "Ajouter la boutique", nameLabel: "Nom de la boutique", search: "Rechercher une boutique", anchor: "shop-management", path: "/general-store/shops", values: { name: "Boutique ancienne", location: "Marché central", phone: "70000000" }, extra: { Emplacement: "Quartier Sud", Téléphone: "71000000" }, lookup: "-- Choisir une boutique --" },
  { code: "RENTAL", view: "tenants", label: "Locataires", create: "Ajouter un locataire", submit: "Ajouter le locataire", nameLabel: "Nom du locataire", search: "Rechercher un locataire", anchor: "tenant-management", path: "/rental/tenants", values: { name: "Locataire ancien", unitLabel: "Logement B12", monthlyRent: "30000", phone: "70000000", tenancyStart: "2024-01" }, extra: { "Logement occupé": "Logement C15", "Loyer mensuel": "31000", Téléphone: "71000000" }, lookup: "-- Choisir un locataire --" },
  { code: "BTP", view: "projects", label: "Chantiers", create: "Ajouter un chantier", submit: "Ajouter le chantier", nameLabel: "Nom du chantier", search: "Rechercher un chantier", anchor: "project-management", path: "/btp/projects", values: { name: "Chantier ancien", clientRef: "Client historique", contractRef: "DEV-2024-01", location: "Kalaban" }, extra: { "Client / maitre d'ouvrage": "Client recette", "Marché / devis": "DEV-2026-10", Localisation: "Quartier Sud" }, lookup: "-- Choisir un chantier --" }
];
const profiles = definitions.map(({ code }) => getBusinessActivityProfile(code));
const activities = profiles.map((p) => ({ code: p.activityCode, label: p.label, description: p.description, isEnabled: true }));
const errors = [];

async function fixture(definition, viewport, { role = "ACCOUNTANT", empty = false, failRead = false, foreignRecord = false } = {}) {
  const context = await browser.newContext({ viewport });
  const calls = [];
  const original = { ...definition.values, id: `${definition.view}-existing`, companyId: company.id, isActive: true };
  let records = empty ? [] : [{ ...original }];
  let rejectNextRead = failRead;
  let rejectNextWrite = false;
  const user = { id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id };
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "local-test", refreshToken: "local-refresh" })));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseURL && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    const path = url.pathname.split("/api/v1")[1];
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({ path, method, body, query: Object.fromEntries(url.searchParams) });
    let data;
    if (path === "/me") data = { user, company, memberships: [{ companyId: company.id, companyCode: company.code, companyName: company.name, role, isActive: true }], bootstrapMode: false };
    else if (path === "/activities") data = { items: activities, profiles };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path.startsWith(definition.path)) {
      if (method === "GET") {
        if (rejectNextRead) { rejectNextRead = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de recette sur la liste" } } }); }
        data = { items: [...records, ...(foreignRecord ? [{ ...original, id: "foreign-record", companyId: "another-company", name: "Fiche autre entreprise" }] : [])] };
      } else {
        if (rejectNextWrite) { rejectNextWrite = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de recette sur la sauvegarde" } } }); }
        if (method === "POST") {
          const item = { ...body, id: `${definition.view}-created`, companyId: company.id, isActive: true };
          records.push(item);
          data = { item };
        } else {
          const id = path.split("/").at(-1);
          const current = records.find((item) => item.id === id);
          assert.ok(current, "Updates must address an existing reference ID");
          if (method === "PATCH") { Object.assign(current, body); data = { item: current }; }
          else if (method === "DELETE") { records = records.filter((item) => item.id !== id); data = { status: "deleted" }; }
        }
      }
    } else if (path === "/finance/accounts") data = { items: [{ id: "account-test", companyId: company.id, name: "Caisse recette", scopeType: "DEDICATED", primaryActivityCode: definition.code, allowedActivityCodes: [definition.code], balance: "100000", transactionsCount: 0 }] };
    else if (path === "/finance/transactions" || path === "/operations/tasks" || path === "/operations/members") {
      assert.equal(method, "GET", "Directory actions must not write transactions or tasks");
      data = { items: [] };
    } else if (path === "/reports/general-store/ledger") data = { shops: records, rows: [] };
    else if (path === "/reports/overview") data = { item: { generalStoreOperationsReport: { rows: [] } } };
    else { errors.push(`Unexpected request: ${method} ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected request" } } }); }
    return route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  return { context, page, calls, original, records: () => records, failNextWrite: () => { rejectNextWrite = true; } };
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

try {
  for (const definition of definitions) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const { context, page, calls, original, records, failNextWrite } = await fixture(definition, viewport);
      const url = `${baseURL}/finance/transactions?activityCode=${definition.code}`;
      await page.goto(url);
      const nav = page.getByRole("navigation", { name: "Pages du secteur", exact: true });
      await nav.getByRole("link", { name: definition.label, exact: true }).click();
      const directory = page.getByRole("region", { name: definition.label, exact: true });
      await directory.getByRole("heading", { name: original.name, exact: true }).waitFor();
      assert.equal(await page.locator("#transaction-create").count(), 0);
      assert.equal(await page.locator(`#${definition.anchor}`).getAttribute("open"), null, "Creation form starts collapsed");
      await page.getByLabel(definition.search, { exact: true }).fill("sans résultat");
      await directory.getByText(/ne correspond/).waitFor();
      await page.getByLabel(definition.search, { exact: true }).fill(original.name);
      await directory.getByRole("button", { name: "Modifier", exact: true }).click();
      assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0, "Opening an edit is clean");
      const nameInput = page.getByLabel(definition.nameLabel, { exact: true });
      await nameInput.fill("Nom modifié");
      await nav.getByRole("link", { name: "Transactions", exact: true }).click();
      await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
      assert.equal(await nameInput.inputValue(), "Nom modifié");
      await nameInput.fill(original.name);
      assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0, "Reverting restores the baseline");
      await nameInput.fill("Nom modifié");
      failNextWrite();
      await page.locator(`#${definition.anchor}`).getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Erreur de recette sur la sauvegarde" }).waitFor();
      assert.equal(await nameInput.inputValue(), "Nom modifié", "A failed write keeps the draft");
      await page.locator(`#${definition.anchor}`).getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      const updated = records().find((item) => item.id === original.id);
      assert.deepEqual(updated, { ...original, name: "Nom modifié" }, "Only edited values change");
      assert.equal(calls.findLast((call) => call.method === "PATCH").path, `${definition.path}/${original.id}`);
      if (definition.code === "RENTAL") {
        const patch = calls.findLast((call) => call.method === "PATCH").body;
        assert.equal(patch.monthlyRent, "30000");
        assert.equal(patch.tenancyStart, "2024-01", "Historical tenancy month must be preserved");
      }
      await page.getByLabel(definition.search, { exact: true }).fill("");
      await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: definition.create, exact: true }).click();
      await page.getByLabel(definition.nameLabel, { exact: true }).fill("Nouvelle fiche");
      for (const [label, value] of Object.entries(definition.extra)) await page.getByLabel(label, { exact: true }).fill(value);
      if (definition.code === "RENTAL") await page.locator(`#${definition.anchor} input[type="month"]`).fill("2025-02");
      await page.locator(`#${definition.anchor}`).getByRole("button", { name: definition.submit, exact: true }).click();
      await waitFor(() => records().length === 2, "Creation adds a new reference without replacing the old one");
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      assert.ok(records().some((item) => item.id === original.id));
      await directory.getByRole("heading", { name: "Nouvelle fiche", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`${definition.view}-${viewport.width}.png`, artifacts)), fullPage: true });
      await nav.getByRole("link", { name: "Transactions", exact: true }).click();
      await page.locator("#transaction-create").waitFor();
      assert.equal(await page.locator(`#${definition.anchor}`).count(), 0);
      assert.ok(await page.evaluate(() => Boolean(document.querySelector("#transactions-list")?.compareDocumentPosition(document.querySelector("#transaction-create")) & Node.DOCUMENT_POSITION_FOLLOWING)));
      await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Enregistrer une transaction", exact: true }).click();
      await page.locator(`.finance-transaction-form option[value="${definition.view}-created"]`).waitFor({ state: "attached" });
      const select = page.locator(".finance-transaction-form select").filter({ has: page.locator(`option[value="${definition.view}-created"]`) });
      await select.selectOption(`${definition.view}-created`);
      if (definition.code === "GENERAL_STORE") {
        assert.equal(await page.locator('.finance-transaction-form option[value="INVENTAIRE"]').count(), 0);
        await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Préparer un inventaire", exact: true }).click();
        await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
        assert.equal(await select.inputValue(), `${definition.view}-created`, "Cancelling inventory navigation preserves the financial draft");
        await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Préparer un inventaire", exact: true }).click();
        await page.getByRole("button", { name: "Quitter la page", exact: true }).click();
        await page.waitForURL("**/operations/tasks?activityCode=GENERAL_STORE*");
        await page.locator("#task-create[open]").waitFor();
      }
      assert.equal(calls.filter((call) => ["POST", "PATCH", "DELETE"].includes(call.method) && !call.path.startsWith(definition.path)).length, 0);
      await context.close();
      console.log(`PASS ${definition.code} ${viewport.width}: dedicated view, search, drafts, failed writes, original IDs, creation and transaction selection`);
    }
    for (const role of ["OWNER", "EMPLOYEE"]) {
      const { context, page } = await fixture(definition, { width: 1280, height: 900 }, { role });
      await page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}&view=${definition.view}`);
      await page.locator("#transaction-create").waitFor();
      assert.equal(await page.locator(`#${definition.anchor}`).count(), 0, "Existing roles do not gain directory write access");
      assert.equal(await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: definition.label, exact: true }).count(), 0);
      await context.close();
    }
    const supervisor = await fixture(definition, { width: 1280, height: 900 }, { role: "SUPERVISOR" });
    await supervisor.page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}&view=${definition.view}`);
    await supervisor.page.getByRole("heading", { name: definition.values.name, exact: true }).waitFor();
    await supervisor.page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Transactions", exact: true }).click();
    assert.equal(await supervisor.page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Enregistrer une transaction", exact: true }).count(), 0);
    if (definition.code === "GENERAL_STORE") {
      await supervisor.page.getByRole("button", { name: "Préparer un inventaire", exact: true }).click();
      await supervisor.page.locator("#task-create[open]").waitFor();
    }
    await supervisor.context.close();
    const failed = await fixture(definition, { width: 1280, height: 900 }, { failRead: true, foreignRecord: true });
    await failed.page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}&view=${definition.view}`);
    await failed.page.getByRole("button", { name: "Réessayer", exact: true }).click();
    await failed.page.getByRole("heading", { name: definition.values.name, exact: true }).waitFor();
    assert.equal(await failed.page.getByRole("heading", { name: "Fiche autre entreprise", exact: true }).count(), 0);
    assert.equal(await failed.page.getByRole("alert").count(), 0, "Successful retry clears the failure message");
    await failed.context.close();
    const empty = await fixture(definition, { width: 390, height: 844 }, { empty: true });
    await empty.page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}&view=${definition.view}`);
    await empty.page.getByText(/enregistré[e]? pour le moment/).waitFor();
    assert.equal(await empty.page.getByRole("button", { name: "Réessayer", exact: true }).count(), 0, "An empty directory is not a load error");
    await empty.context.close();
    const legacy = await fixture(definition, { width: 1280, height: 900 });
    await legacy.page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}#${definition.anchor}`);
    await legacy.page.locator(`#${definition.anchor}[open]`).waitFor();
    assert.equal(new URL(legacy.page.url()).searchParams.get("view"), definition.view, "Existing form anchors remain usable");
    await legacy.context.close();
    console.log(`PASS ${definition.code}: permissions, read retry, company display scope, empty state and legacy anchor`);
  }
  assert.deepEqual(errors, [], "No runtime errors or unexpected API requests");
} finally {
  await browser.close();
}
