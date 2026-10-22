// Run against the local frontend, with every API call intercepted in the browser.
// Requires Playwright (or AMCCO_PLAYWRIGHT_PATH pointing to playwright-core/index.mjs).
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
const profiles = ["HARDWARE", "SERVICES"].map(getBusinessActivityProfile);
const activities = profiles.map((p) => ({ code: p.activityCode, label: p.label, description: p.description, isEnabled: true }));
const article = { id: "article-test", companyId: company.id, activityCode: "HARDWARE", name: "Ciment test", defaultMargin: "1500", defaultPurchaseUnitPrice: "5000" };
const account = { id: "account-test", companyId: company.id, name: "Caisse test", accountRef: null, scopeType: "DEDICATED", primaryActivityCode: "HARDWARE", allowedActivityCodes: ["HARDWARE"], balance: "100000", transactionsCount: 0 };
const transaction = {
  id: "transaction-test", companyId: company.id, accountId: account.id, accountName: account.name,
  accountRef: null, accountScopeType: "DEDICATED", accountPrimaryActivityCode: "HARDWARE", accountAllowedActivityCodes: ["HARDWARE"],
  activityCode: "HARDWARE", type: "CASH_OUT", amount: "10000", currency: "XOF", description: "Achat initial",
  metadata: { hardwareOperationKind: "ITEM_ENTRY", itemName: article.name, quantity: "2", purchaseUnitPrice: "5000", marginAmount: "1500", recipientRef: "Point test", historicalNote: "Historique à conserver", archiveReference: "ARCHIVE-2025" },
  status: "SUBMITTED", requiresProof: false, proofsCount: 0, createdById: "user-test", createdByEmail: "test@example.invalid",
  occurredAt: "2026-10-01T12:00:00.000Z", createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z"
};
const errors = [];

async function fixture(viewport, role = "ACCOUNTANT", seedTransaction = false) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const calls = [];
  const user = { id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id };
  await context.addInitScript(() => {
    localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "local-test", refreshToken: "local-refresh" }));
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseURL && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: request.method(), body: request.postDataJSON() });
    const path = url.pathname.split("/api/v1")[1];
    let data;
    if (path === "/me") data = { user, company, memberships: [{ companyId: company.id, companyCode: company.code, companyName: company.name, role, isActive: true }], bootstrapMode: false };
    else if (path === "/activities") data = { items: activities, profiles };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path.includes("articles")) data = request.method() === "GET" ? { items: [article] } : { item: { ...article, ...request.postDataJSON() } };
    else if (path === "/finance/accounts") data = { items: [account] };
    else if (path === "/finance/transactions") data = { items: seedTransaction && !url.searchParams.get("search") ? [transaction] : [] };
    else if (path === "/finance/transactions/transaction-test") data = { item: { ...transaction, ...(request.postDataJSON() ?? {}) } };
    else if (path === "/operations/tasks" || path === "/operations/members") data = { items: [] };
    else if (path === "/reports/overview") data = { item: {
      generatedAt: new Date().toISOString(), filters: { activityCode: url.searchParams.get("activityCode"), dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo") },
      activityProfile: profiles[0], activityHighlights: [], operationalPerformance: [], financeByType: [], financeByStatus: [], financeByActivity: [],
      financeAccountsSummary: { totalCount: 0, globalCount: 0, dedicatedCount: 0, restrictedCount: 0, compatibleCount: 0, incompatibleCount: 0 },
      financeAccounts: [], taskByStatus: [], taskByActivity: [], roleDistribution: [], topAssignees: []
    } };
    else if (path === "/reports/exports/overview.pdf") return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\nlocal mock" });
    else { errors.push(`Unexpected API call: ${request.method()} ${path}`); return route.fulfill({ status: 500, json: { message: "Unexpected test request" } }); }
    return route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  page.setDefaultTimeout(10000);
  return { context, page, calls };
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { context, page, calls } = await fixture(viewport);
    const suffix = viewport.width === 390 ? "mobile" : "desktop";
    await page.goto(`${baseURL}/finance/transactions?activityCode=HARDWARE`);
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Articles", exact: true }).click();
    await page.getByRole("heading", { name: article.name, exact: true }).waitFor();
    assert.equal(await page.locator("#transaction-create").count(), 0, "Articles must have a separate view");
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0, "Opening an edit is not a change");
    await page.getByLabel("Nom de l'article", { exact: true }).fill("Article modifié");
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 1);
    await page.getByLabel("Nom de l'article", { exact: true }).fill(article.name);
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0, "Reverting changes restores a clean form");
    await page.getByRole("button", { name: "Annuler la modification", exact: true }).click();
    await page.getByLabel("Nom de l'article", { exact: true }).fill("Nouveau brouillon");
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true, "Reload/close protection must be registered");
    if (viewport.width === 390) {
      await page.getByRole("navigation", { name: "Navigation mobile principale", exact: true }).getByRole("link", { name: "Tâches", exact: true }).click();
    } else {
      await page.locator(".quick-actions").getByRole("link", { name: /^Rapports:/ }).click();
    }
    await page.getByRole("dialog", { name: "Quitter la saisie en cours ?" }).waitFor();
    await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Transactions", exact: true }).click();
    await page.getByRole("dialog", { name: "Quitter la saisie en cours ?" }).waitFor();
    await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    assert.equal(await page.getByLabel("Nom de l'article", { exact: true }).inputValue(), "Nouveau brouillon");
    // Browser back is guarded as well as links.
    await page.evaluate(() => history.back());
    await page.getByRole("dialog", { name: "Quitter la saisie en cours ?" }).waitFor();
    await page.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    assert.equal(await page.getByLabel("Nom de l'article", { exact: true }).inputValue(), "Nouveau brouillon");
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Transactions", exact: true }).click();
    await page.getByRole("button", { name: "Quitter la page", exact: true }).click();
    await page.locator("#transaction-create").waitFor();
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Articles", exact: true }).click();
    await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Ajouter un article", exact: true }).click();
    await page.getByLabel("Nom de l'article", { exact: true }).fill("Sauvegarde test");
    await page.getByRole("button", { name: "Ajouter l'article", exact: true }).click();
    await waitFor(() => calls.some((call) => call.method === "POST" && call.path.includes("articles")), "Article creation must use the existing API");
    await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false, "Saving must clear reload protection");
    await page.getByLabel("Rechercher un article", { exact: true }).fill("absent");
    await page.getByText("Aucun article ne correspond à votre recherche.", { exact: true }).waitFor();
    await page.getByLabel("Rechercher un article", { exact: true }).fill("");
    await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
    await page.screenshot({ path: fileURLToPath(new URL(`articles-${suffix}.png`, artifacts)), fullPage: true });
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Transactions", exact: true }).click();
    const search = page.locator('input[type="search"].quick-search-input');
    await search.fill("ancien ciment");
    await waitFor(() => calls.some((call) => call.path.endsWith("/finance/transactions") && call.query.search === "ancien ciment"), "Transaction search must reach the API");
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Tâches", exact: true }).click();
    await page.locator('input[type="search"].quick-search-input').fill("ancien chantier");
    await waitFor(() => calls.some((call) => call.path.endsWith("/operations/tasks") && call.query.search === "ancien chantier"), "Task search must reach the API");
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Rapports", exact: true }).click();
    await page.locator("#reports-date-from").waitFor({ state: "attached" });
    if (!await page.locator("#reports-date-from").isVisible()) await page.locator(".reports-filter-disclosure > summary").click();
    await page.locator("#reports-date-from").fill("2026-10-01");
    await page.locator("#reports-date-to").fill("2026-10-10");
    await page.getByRole("button", { name: "Mettre à jour", exact: true }).click();
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).waitFor();
    if (!await page.locator("#reports-date-from").isVisible()) await page.locator(".reports-filter-disclosure > summary").click();
    await page.locator("#reports-date-from").fill("2026-10-05");
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).click();
    await waitFor(() => calls.some((call) => call.path.endsWith("overview.pdf")), "PDF request expected");
    const exported = calls.findLast((call) => call.path.endsWith("overview.pdf"));
    assert.ok(exported.query.dateFrom.startsWith("2026-10-01"), "PDF must use the applied period");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal page overflow");
    await context.close();
    console.log(`PASS ${suffix}: catalogue, draft protection, search and applied PDF period`);
  }
  {
    const { context, page } = await fixture({ width: 1440, height: 1000 });
    await page.goto(`${baseURL}/finance/transactions?activityCode=HARDWARE&view=articles`);
    await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Articles", exact: true }).waitFor();
    await page.locator(".sector-page-shortcuts-actions").getByRole("button", { name: "Ajouter un article", exact: true }).click();
    await page.getByLabel("Nom de l'article", { exact: true }).fill("Brouillon secteur");
    await page.getByLabel("Sélectionner le secteur actif", { exact: true }).selectOption("SERVICES");
    assert.equal(new URL(page.url()).searchParams.get("activityCode"), "HARDWARE", "Cancelling sector change keeps the draft context");
    assert.equal(await page.getByLabel("Nom de l'article", { exact: true }).inputValue(), "Brouillon secteur");
    page.removeAllListeners("dialog");
    let confirmations = 0;
    page.on("dialog", async (dialog) => { confirmations++; await dialog.accept(); });
    await page.getByLabel("Sélectionner le secteur actif", { exact: true }).selectOption("SERVICES");
    await page.waitForURL("**/finance/transactions?activityCode=SERVICES");
    assert.equal(confirmations, 1, "Sector changes must require a single confirmation");
    assert.equal(await page.getByRole("dialog", { name: "Quitter la saisie en cours ?" }).count(), 0);
    assert.equal(await page.locator("#article-management").count(), 0);
    await context.close();
    console.log("PASS sector change: cancelling preserves draft, confirming changes context once");
  }
  {
    const { context, page, calls } = await fixture({ width: 1440, height: 1000 }, "ACCOUNTANT", true);
    await page.goto(`${baseURL}/finance/transactions?activityCode=HARDWARE`);
    await page.locator("#transactions-list").getByRole("button", { name: "Modifier", exact: true }).click();
    await page.locator('.finance-transaction-form input[placeholder="Optionnelle"]').fill("Modification conservée après recherche");
    await page.locator('input[type="search"].quick-search-input').fill("absent");
    await page.getByRole("heading", { name: "Aucun résultat", exact: true }).waitFor();
    assert.equal(await page.locator("#transaction-create > summary").innerText().then((value) => value.includes("Modifier une transaction")), true);
    assert.equal(await page.locator('.finance-transaction-form input[placeholder="Optionnelle"]').inputValue(), "Modification conservée après recherche");
    await page.locator(".finance-transaction-form").getByRole("button", { name: /Enregistrer les modifications/ }).click();
    await waitFor(() => calls.some((call) => call.method === "PATCH" && call.path.endsWith("/transaction-test")), "Searching must preserve the edited record ID and send PATCH");
    assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/finance/transactions")).length, 0, "Editing must never become a new transaction");
    assert.equal(calls.findLast((call) => call.method === "PATCH").body.activityCode, "HARDWARE");
    assert.equal(calls.findLast((call) => call.method === "PATCH").body.metadata.archiveReference, transaction.metadata.archiveReference, "Editing must preserve metadata absent from the current profile");
    await context.close();
    console.log("PASS transaction editing: history search preserves draft and record identity");
  }
  for (const role of ["OWNER", "HARDWARE_OPERATOR"]) {
    const { context, page } = await fixture({ width: 1280, height: 900 }, role);
    await page.goto(`${baseURL}/finance/transactions?activityCode=HARDWARE&view=articles`);
    await page.locator("#transaction-create").waitFor();
    assert.equal(await page.locator("#article-management").count(), 0, `${role} must not gain catalogue management`);
    assert.equal(await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Articles", exact: true }).count(), 0);
    await context.close();
    console.log(`PASS ${role}: existing article permissions preserved`);
  }
  assert.deepEqual(errors, [], "No runtime errors or unexpected API calls");
} finally {
  await browser.close();
}
