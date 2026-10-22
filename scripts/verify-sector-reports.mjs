// Browser recipe using overviews and real PDFs generated with mocked repositories.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { getBusinessActivityProfile } from "../backend/dist/config/business-activity-profiles.js";

const { chromium } = process.env.AMCCO_PLAYWRIGHT_PATH ? await import(pathToFileURL(process.env.AMCCO_PLAYWRIGHT_PATH).href) : await import("playwright-core");
const base = "http://127.0.0.1:5175";
const directory = new URL("../artifacts/sector-reports/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
const profiles = manifest.map((row) => getBusinessActivityProfile(row.code));
const company = { id: "company-test", code: "TEST", name: "Entreprise de recette", isActive: true };
const browser = await chromium.launch({ headless: true });
const errors = [];
async function fixture(entry, width, { role = "ACCOUNTANT", failRead = false, failExport = false } = {}) {
  const overview = JSON.parse(await readFile(new URL(entry.overview, directory), "utf8"));
  const pdf = await readFile(new URL(entry.pdf, directory));
  const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
  const calls = [];
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "local-test", refreshToken: "local-refresh" })));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/api/v1/")) return route.abort();
    const path = url.pathname.split("/api/v1")[1];
    calls.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams) });
    assert.equal(request.method(), "GET", "Reports never mutate company data");
    let data;
    if (path === "/me") data = { user: { id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id }, company, memberships: [{ companyId: company.id, companyCode: company.code, companyName: company.name, role, isActive: true }], bootstrapMode: false };
    else if (path === "/activities") data = { profiles, items: profiles.map((profile) => ({ code: profile.activityCode, label: profile.label, isEnabled: true })) };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path === "/reports/overview") {
      if (failRead) { failRead = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de lecture simulée" } } }); }
      assert.equal(url.searchParams.get("activityCode"), entry.code);
      data = { item: { ...overview, filters: { activityCode: entry.code, dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo") } } };
    } else if (path === "/reports/exports/overview.pdf") {
      if (failExport) { failExport = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur PDF simulée" } } }); }
      assert.equal(url.searchParams.get("activityCode"), entry.code);
      return route.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
    } else { errors.push(`Unexpected request ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } }); }
    await route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, calls, overview };
}
try {
  for (const entry of manifest.filter((row) => process.argv.length <= 2 || process.argv.slice(2).includes(row.code))) for (const width of [1440, 390]) {
    const { context, page, calls, overview } = await fixture(entry, width);
    await page.goto(`${base}/reports?activityCode=${entry.code}`);
    const scope = page.getByRole("region", { name: "Périmètre du rapport affiché", exact: true });
    await scope.waitFor();
    if (!await page.locator("#reports-date-from").isVisible()) await page.locator(".reports-filter-disclosure > summary").click();
    const from = overview.filters.dateFrom?.slice(0, 10) || "2026-05-01";
    const to = overview.filters.dateTo?.slice(0, 10) || "2026-05-31";
    await page.locator("#reports-date-from").fill(from);
    await page.locator("#reports-date-to").fill(to);
    await page.getByRole("button", { name: "Mettre à jour", exact: true }).click();
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).waitFor();
    await page.getByRole("button", { name: "Voir le rapport du secteur", exact: true }).click();
    await page.locator("#reports-sector-details[open]").waitFor();
    assert.ok(await page.locator("#reports-sector-details table").count() > 0, `Expected ${entry.code} business tables`);
    assert.ok((await scope.innerText()).includes("sans conversion"));
    const appliedQuery = calls.findLast((call) => call.path === "/reports/overview").query;
    assert.ok(appliedQuery.dateFrom.startsWith(from));
    if (!await page.locator("#reports-date-from").isVisible()) await page.locator(".reports-filter-disclosure > summary").click();
    await page.locator("#reports-date-from").fill("1999-01-01");
    await scope.getByText(/Des filtres ont été modifiés/).waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger PDF", exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^amcco-rapport-.+\.pdf$/);
    assert.equal(await download.failure(), null);
    const exportedQuery = { ...calls.findLast((call) => call.path === "/reports/exports/overview.pdf").query };
    // Export adds a format parameter on some API versions; date and sector must match.
    for (const key of ["activityCode", "dateFrom", "dateTo"]) assert.equal(exportedQuery[key], appliedQuery[key]);
    await page.getByRole("button", { name: "Mettre à jour", exact: true }).click();
    await scope.getByText(/Des filtres ont été modifiés/).waitFor({ state: "hidden" });
    assert.ok(calls.findLast((call) => call.path === "/reports/overview").query.dateFrom.startsWith("1999-01-01"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "The page must fit mobile and desktop widths");
    assert.equal(await page.locator(".reports-result-scroll").evaluate((element) => getComputedStyle(element).maxHeight), "none", "Report reading uses the main page scroll");
    await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
    await page.screenshot({ path: fileURLToPath(new URL(`${entry.code}-web-${width}.png`, directory)), fullPage: true });
    await context.close();
    console.log(`PASS ${entry.code} ${width}: business tables, scope, PDF download, applied dates, no data writes`);
  }
  for (const scenario of [{ failRead: true }, { failExport: true }, { role: "OWNER" }]) {
    const entry = manifest.find((row) => row.code === "SERVICES");
    const { context, page } = await fixture(entry, 390, scenario);
    await page.goto(`${base}/reports?activityCode=${entry.code}`);
    if (scenario.failRead) {
      await page.getByRole("alert").filter({ hasText: "Erreur de lecture simulée" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Télécharger PDF", exact: true }).count(), 0);
      await page.locator(".reports-filter-disclosure > summary").click();
      await page.getByRole("button", { name: "Mettre à jour", exact: true }).click();
    }
    await page.getByRole("region", { name: "Périmètre du rapport affiché", exact: true }).waitFor();
    if (scenario.failExport) {
      await page.getByRole("button", { name: "Télécharger PDF", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Erreur PDF simulée" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Télécharger PDF", exact: true }).isEnabled(), true);
    }
    await context.close();
  }
  assert.deepEqual(errors, [], "No runtime errors or unexpected API requests");
} finally { await browser.close(); }
