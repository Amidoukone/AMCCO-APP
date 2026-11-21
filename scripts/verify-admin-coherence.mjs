// Real application screens; all API calls are synthetic and external calls blocked.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { getBusinessActivityProfile } from "../backend/dist/config/business-activity-profiles.js";

const base = "http://127.0.0.1:5175";
const browser = await chromium.launch({ headless: true });
const runtimeErrors = [];
const companies = ["a", "b"].map((code) => ({ id: `company-${code}`, code: code.toUpperCase(), name: `Entreprise ${code.toUpperCase()}`, isActive: true }));
const profiles = ["MINING", "SERVICES"].map(getBusinessActivityProfile);
function deferred(fail = false) { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve, fail }; }
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 25)); }
  assert.fail("Expected intercepted request did not arrive");
}
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function fixture(width = 1440, role = "SYS_ADMIN") {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const calls = [], gates = new Map(), members = new Map();
  const me = (company) => ({ user: { id: "admin-test", fullName: "Administrateur", email: "admin@example.invalid", role, companyId: company.id }, company, memberships: companies.map((company) => ({ companyId: company.id, companyCode: company.code, companyName: company.name, role, isActive: true })), bootstrapMode: false });
  for (const company of companies) members.set(company.id, [1, 2].map((id) => ({ membershipId: `${company.id}-${id}`, userId: `member-${id}`, fullName: `Membre ${id}`, email: `membre${id}@example.invalid`, role: "EMPLOYEE", isActive: true, membershipCreatedAt: "2026-01-01T00:00:00.000Z" })));
  await context.addInitScript(() => localStorage.setItem("amcco_session_v1", JSON.stringify({ accessToken: "token-company-a", refreshToken: "refresh-company-a" })));
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.startsWith("/api/v1/")) return route.abort();
    const path = url.pathname.slice("/api/v1".length), method = request.method(), body = request.postDataJSON();
    const sessionKey = request.headers().authorization ?? body?.refreshToken ?? "";
    const company = companies.find((company) => sessionKey.includes(company.id)) ?? companies[0];
    calls.push({ path, method, body, companyId: company.id });
    const gate = gates.get(`${method}:${path}:${company.id}`);
    if (gate) { await gate.promise; if (gate.fail) return route.fulfill({ status: 500, json: { error: { message: "Erreur simulée de l'action" } } }); }
    let data;
    if (path === "/me") data = me(company);
    else if (path === "/auth/switch-company") {
      const next = companies.find((company) => company.id === body.targetCompanyId);
      data = { accessToken: `token-${next.id}`, refreshToken: `refresh-${next.id}`, me: me(next) };
    } else if (path === "/activities") data = { profiles, items: profiles.map((profile) => ({ code: profile.activityCode, label: profile.label, isEnabled: true })) };
    else if (path === "/alerts/summary") data = { item: { unreadCount: 0 } };
    else if (path === "/admin/users" && method === "GET") data = { items: members.get(company.id) };
    else if (path === "/admin/users" && method === "POST") {
      const item = { membershipId: `created-${company.id}`, userId: `created-${company.id}`, email: body.email, fullName: body.fullName, role: body.role, isActive: true, membershipCreatedAt: "2026-01-01T00:00:00.000Z" };
      members.get(company.id).push(item); data = { item };
    } else if (path.startsWith("/admin/users/")) {
      const [, , , userId, action] = path.split("/");
      const item = members.get(company.id).find((item) => item.userId === userId);
      assert.ok(item, `Unknown synthetic member ${userId}`);
      if (method === "DELETE") { members.set(company.id, members.get(company.id).filter((candidate) => candidate !== item)); data = { status: "deleted" }; }
      else if (action === "password") data = { status: "password_reset" };
      else {
        // Names identify a global user; roles/status belong to its membership.
        if (body.fullName) for (const rows of members.values()) for (const member of rows) if (member.userId === userId) member.fullName = body.fullName;
        Object.assign(item, body); data = { item };
      }
    } else if (path === "/admin/activities") data = { items: profiles.map((profile) => ({ code: profile.activityCode, label: `Secteur ${company.code} ${profile.activityCode}`, isEnabled: true })) };
    else if (path.startsWith("/admin/activities/")) data = { item: { code: path.split("/").at(-1), label: `Secteur ${company.code} ${path.split("/").at(-1)}`, isEnabled: body.isEnabled } };
    else if (path === "/me/password") data = { status: "password_changed" };
    else if (path === "/auth/logout") data = { status: "ok" };
    else { runtimeErrors.push(`Unexpected ${method} ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } }); }
    return route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  async function switchTo(companyId, expectChange = true) {
    if (width >= 640) await page.locator("#active-company").selectOption(companyId);
    else {
      await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
      const section = page.locator(".mobile-menu-section").filter({ has: page.locator('[aria-label="Choisir une entreprise"]') });
      if (await section.getAttribute("open") === null) await section.locator("summary").click();
      await page.getByRole("group", { name: "Choisir une entreprise" }).getByRole("button", { name: companyId === "company-a" ? /Entreprise A/ : /Entreprise B/ }).click();
      if (expectChange) await page.waitForFunction(() => document.querySelector("#mobile-app-menu")?.getAttribute("aria-hidden") === "true");
    }
  }
  return { context, page, calls, gates, members, switchTo };
}
const row = (page, id = 1) => page.locator(".admin-users-table-wrap tbody tr").filter({ hasText: `membre${id}@example.invalid` });
async function openCreate(page, name) {
  const form = page.locator(".admin-users-create-form");
  if (!await form.isVisible()) await page.locator(".admin-users-create-panel summary").click();
  await form.getByPlaceholder("Nom complet", { exact: true }).fill(name);
  await form.getByPlaceholder("Email", { exact: true }).fill(`${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll(" ", "")}@example.invalid`);
  await form.getByPlaceholder("Mot de passe", { exact: true }).fill("SyntheticPass42!");
  return form;
}
async function openPassword(page, id = 1) {
  const target = row(page, id);
  if (!await target.getByPlaceholder("Nouveau mot de passe", { exact: true }).isVisible()) await target.locator("summary").click();
  return target.getByPlaceholder("Nouveau mot de passe", { exact: true });
}
async function switchUsers(f, companyId) {
  const before = f.calls.filter((call) => call.method === "GET" && call.path === "/admin/users" && call.companyId === companyId).length;
  await f.switchTo(companyId);
  await until(() => f.calls.filter((call) => call.method === "GET" && call.path === "/admin/users" && call.companyId === companyId).length > before);
  await row(f.page).waitFor();
}
async function fillSecurity(page, password) {
  const form = page.locator(".security-password-form");
  await form.getByPlaceholder("Mot de passe actuel", { exact: true }).fill("SyntheticCurrent42!");
  await form.getByPlaceholder("Nouveau mot de passe", { exact: true }).fill(password);
  await form.getByPlaceholder("Confirmer le mot de passe", { exact: true }).fill(password);
  return form;
}
async function release(page, gate, path, companyId) {
  const done = page.waitForResponse((response) => response.url().endsWith(path) && response.request().method() !== "GET" && (response.request().headers().authorization ?? response.request().postDataJSON()?.refreshToken ?? "").includes(companyId));
  gate.resolve(); await done; await frame(page);
}
try {
  if (!process.argv.includes("--drafts-only") && !process.argv.includes("--lists-only")) {
  for (const width of [1440, 390]) {
    const f = await fixture(width);
    const { context, page, calls, gates } = f;
    await page.goto(`${base}/admin/users`);
    await row(page).locator('input[type="text"]').fill("Profil A modifié");
    await row(page).locator("select").selectOption("SUPERVISOR");
    const gate = deferred(); gates.set("PATCH:/admin/users/member-1:company-a", gate);
    await row(page).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await until(() => calls.some((call) => call.method === "PATCH"));
    await switchUsers(f, "company-b");
    await row(page).locator('input[type="text"]').fill("Brouillon B");
    const done = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/admin/users/member-1"));
    gate.resolve(); await done; await frame(page);
    assert.equal(calls.filter((call) => call.path.endsWith("/role")).length, 0, "A profile response must not continue with a role mutation after leaving its company");
    assert.equal(await row(page).locator('input[type="text"]').inputValue(), "Brouillon B");
    await context.close(); console.log(`PASS users ${width}: multi-step update stops before a role change in a different company`);
  }
  for (const width of [1440, 390]) {
    const { context, page, calls, gates, switchTo } = await fixture(width);
    await page.goto(`${base}/admin/users`);
    await row(page).locator("select").selectOption("SUPERVISOR");
    const source = deferred(), switching = deferred();
    gates.set("PATCH:/admin/users/member-1:company-a", source);
    gates.set("POST:/auth/switch-company:company-a", switching);
    await row(page).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await until(() => calls.some((call) => call.method === "PATCH"));
    await switchTo("company-b", false);
    await until(() => calls.some((call) => call.path === "/auth/switch-company"));
    await release(page, source, "/admin/users/member-1", "company-a");
    assert.equal(calls.filter((call) => call.path.endsWith("/role")).length, 0, "The second mutation stops as soon as switching starts, before React changes the rendered company");
    await release(page, switching, "/auth/switch-company", "company-a");
    await context.close(); console.log(`PASS users ${width}: pending company switch stops the next role mutation before destination rendering`);
  }
  for (const width of [1440, 390]) {
    const { context, page, calls, gates } = await fixture(width);
    await page.goto(`${base}/admin/users`);
    const first = deferred(), second = deferred();
    gates.set("PATCH:/admin/users/member-1:company-a", first); gates.set("PATCH:/admin/users/member-2:company-a", second);
    for (const id of [1, 2]) {
      await row(page, id).locator('input[type="text"]').fill(`Profil modifié ${id}`);
      await row(page, id).getByRole("button", { name: "Enregistrer", exact: true }).click();
    }
    await until(() => calls.filter((call) => call.method === "PATCH").length === 2);
    assert.equal(await row(page, 1).getByRole("button", { name: "Enregistrer", exact: true }).isDisabled(), true, "Starting a second member action must leave the first busy");
    await release(page, first, "/admin/users/member-1", "company-a");
    assert.equal(await row(page, 2).getByRole("button", { name: "Enregistrer", exact: true }).isDisabled(), true, "Finishing one member must leave another pending member busy");
    await release(page, second, "/admin/users/member-2", "company-a");
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0);
    await context.close(); console.log(`PASS users ${width}: independent member actions retain their own busy state`);
  }
  for (const width of [1440, 390]) for (const fail of [false, true]) {
    const f = await fixture(width), { context, page, calls, gates, members } = f;
    await page.goto(`${base}/admin/users`); await row(page).waitFor();
    const formA = await openCreate(page, "Creation A"), source = deferred(fail);
    gates.set("POST:/admin/users:company-a", source);
    await formA.getByRole("button", { name: "Ajouter l'utilisateur", exact: true }).click();
    await until(() => calls.some((call) => call.method === "POST"));
    await switchUsers(f, "company-b");
    const formB = await openCreate(page, "Creation B"), destination = deferred();
    gates.set("POST:/admin/users:company-b", destination);
    await formB.getByRole("button", { name: "Ajouter l'utilisateur", exact: true }).click();
    await until(() => calls.some((call) => call.method === "POST" && call.companyId === "company-b"));
    await release(page, source, "/admin/users", "company-a");
    assert.equal(await formB.getByPlaceholder("Nom complet", { exact: true }).inputValue(), "Creation B");
    assert.equal(await formB.locator('button[type="submit"]').isDisabled(), true);
    assert.equal(await page.getByRole("alert").filter({ hasText: "Erreur simulée de l'action" }).count(), 0);
    assert.equal(await page.locator(".admin-users-table-wrap").getByText("creationa@example.invalid", { exact: true }).count(), 0);
    await release(page, destination, "/admin/users", "company-b");
    assert.ok(members.get("company-b").some((member) => member.email === "creationb@example.invalid"));
    assert.equal(members.get("company-a").some((member) => member.email === "creationa@example.invalid"), !fail);
    await context.close(); console.log(`PASS users ${width} late creation ${fail ? "error" : "success"}: company list, draft and pending creation isolated`);
  }
  for (const kind of ["delete", "password"]) for (const width of [1440, 390]) for (const fail of [false, true]) {
    const f = await fixture(width), { context, page, calls, gates } = f;
    await page.goto(`${base}/admin/users`); await row(page).waitFor();
    const sourcePath = `/admin/users/member-1${kind === "password" ? "/password" : ""}`;
    const source = deferred(fail); gates.set(`${kind === "delete" ? "DELETE" : "PATCH"}:${sourcePath}:company-a`, source);
    if (kind === "password") {
      await (await openPassword(page)).fill("SyntheticSource42!");
      await row(page).getByRole("button", { name: "Réinitialiser le mot de passe", exact: true }).click();
    } else await row(page).getByRole("button", { name: "Supprimer", exact: true }).click();
    await until(() => calls.some((call) => call.method !== "GET" && call.path === sourcePath));
    await switchUsers(f, "company-b");
    const destination = deferred(); gates.set("PATCH:/admin/users/member-1:company-b", destination);
    await row(page).locator('input[type="text"]').fill("Profil B en cours");
    await (await openPassword(page)).fill("SyntheticDraftB42!");
    await row(page).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await until(() => calls.some((call) => call.method === "PATCH" && call.path === "/admin/users/member-1" && call.companyId === "company-b"));
    await release(page, source, sourcePath, "company-a");
    assert.equal(await row(page).locator('input[type="text"]').inputValue(), "Profil B en cours");
    assert.equal(await row(page).getByPlaceholder("Nouveau mot de passe", { exact: true }).inputValue(), "SyntheticDraftB42!");
    assert.equal(await row(page).getByRole("button", { name: "Enregistrer", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("alert").filter({ hasText: "Erreur simulée de l'action" }).count(), 0);
    await release(page, destination, "/admin/users/member-1", "company-b");
    await context.close(); console.log(`PASS users ${width} late ${kind} ${fail ? "error" : "success"}: destination member, password draft and busy state preserved`);
  }
  for (const width of [1440, 390]) {
    const { context, page, calls, gates, members } = await fixture(width);
    await page.goto(`${base}/admin/users`);
    await row(page).locator('input[type="text"]').fill("Profil enregistré");
    await row(page).locator("select").selectOption("SUPERVISOR");
    const roleFailure = deferred(true); gates.set("PATCH:/admin/users/member-1/role:company-a", roleFailure);
    await row(page).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await until(() => calls.some((call) => call.path.endsWith("/role")));
    await release(page, roleFailure, "/admin/users/member-1/role", "company-a");
    await page.getByRole("alert").filter({ hasText: "Profil enregistré, mais le rôle n'a pas pu être modifié." }).waitFor();
    assert.equal(members.get("company-a")[0].role, "EMPLOYEE");
    assert.equal(await row(page).locator("select").inputValue(), "SUPERVISOR");
    gates.delete("PATCH:/admin/users/member-1/role:company-a");
    await row(page).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await until(() => members.get("company-a")[0].role === "SUPERVISOR"); await frame(page);
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0);
    await context.close(); console.log(`PASS users ${width}: partial profile success explained, role draft preserved and retry succeeds`);
  }
  for (const width of [1440, 390]) {
    const { context, page, calls, gates, switchTo } = await fixture(width);
    await page.goto(`${base}/admin/activities`);
    const card = (code, company = "A") => page.locator(".activity-admin-card").filter({ hasText: `Secteur ${company} ${code}` });
    await card("MINING").waitFor();
    const first = deferred(), second = deferred();
    gates.set("PATCH:/admin/activities/MINING:company-a", first); gates.set("PATCH:/admin/activities/SERVICES:company-a", second);
    await card("MINING").getByRole("button").click(); await card("SERVICES").getByRole("button").click();
    await until(() => calls.filter((call) => call.method === "PATCH").length === 2);
    assert.equal(await card("MINING").getByRole("button").isDisabled(), true);
    await release(page, first, "/admin/activities/MINING", "company-a");
    assert.equal(await card("SERVICES").getByRole("button").isDisabled(), true);
    await release(page, second, "/admin/activities/SERVICES", "company-a");
    const old = deferred(); gates.set("PATCH:/admin/activities/MINING:company-a", old);
    await card("MINING").getByRole("button").click();
    await until(() => calls.filter((call) => call.method === "PATCH" && call.path.endsWith("/MINING")).length === 2);
    await switchTo("company-b"); await card("MINING", "B").waitFor();
    await switchTo("company-a"); await card("MINING").waitFor();
    const current = deferred(); gates.set("PATCH:/admin/activities/MINING:company-a", current);
    await card("MINING").getByRole("button").click();
    await until(() => calls.filter((call) => call.method === "PATCH" && call.path.endsWith("/MINING")).length === 3);
    await release(page, old, "/admin/activities/MINING", "company-a");
    assert.equal(await card("MINING").getByRole("button").isDisabled(), true, "Returning to A must not reactivate an old action from A");
    await release(page, current, "/admin/activities/MINING", "company-a");
    await context.close(); console.log(`PASS sectors ${width}: independent actions and A-B-A return cannot release another pending action`);
  }
  for (const width of [1440, 390]) for (const fail of [false, true]) {
    const { context, page, calls, gates, switchTo } = await fixture(width);
    await page.goto(`${base}/settings/security`);
    const sourceForm = await fillSecurity(page, "SyntheticSource42!"), source = deferred(fail);
    gates.set("PATCH:/me/password:company-a", source); await sourceForm.locator('button[type="submit"]').click();
    await until(() => calls.some((call) => call.path === "/me/password"));
    await switchTo("company-b");
    await until(() => calls.some((call) => call.path === "/auth/switch-company")); await frame(page);
    await page.waitForFunction(() => document.querySelector('.security-password-form input')?.value === "");
    const destinationForm = await fillSecurity(page, "SyntheticDestination42!"), destination = deferred();
    gates.set("PATCH:/me/password:company-b", destination); await destinationForm.locator('button[type="submit"]').click();
    await until(() => calls.some((call) => call.path === "/me/password" && call.companyId === "company-b"));
    await release(page, source, "/me/password", "company-a");
    assert.equal(await destinationForm.getByPlaceholder("Nouveau mot de passe", { exact: true }).inputValue(), "SyntheticDestination42!");
    assert.equal(await destinationForm.locator('button[type="submit"]').isDisabled(), true);
    assert.equal(await page.getByRole("alert").filter({ hasText: "Erreur simulée de l'action" }).count(), 0);
    await release(page, destination, "/me/password", "company-b");
    assert.equal(await destinationForm.getByPlaceholder("Nouveau mot de passe", { exact: true }).inputValue(), "");
    await context.close(); console.log(`PASS security ${width} late ${fail ? "error" : "success"}: new password form and pending request isolated`);
  }
  }
  if (!process.argv.includes("--lists-only")) {
  for (const width of [1440, 390]) {
    const { context, page, calls, switchTo } = await fixture(width);
    await page.goto(`${base}/admin/users`); await row(page).waitFor();
    const form = await openCreate(page, "Brouillon protégé");
    page.removeAllListeners("dialog"); page.on("dialog", (dialog) => dialog.dismiss());
    await switchTo("company-b", false);
    assert.equal(calls.filter((call) => call.path === "/auth/switch-company").length, 0);
    assert.equal(await form.getByPlaceholder("Nom complet", { exact: true }).inputValue(), "Brouillon protégé");
    if (width < 640) {
      await page.locator("#mobile-app-menu .mobile-menu-close").click();
      await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
      const section = page.locator(".mobile-nav-section").filter({ has: page.locator('a[href="/settings/security"]') });
      if (await section.getAttribute("open") === null) await section.locator("summary").click();
      await section.locator('a[href="/settings/security"]').click();
    } else await page.locator('.sidebar-nav a[href="/settings/security"]').click();
    const dialog = page.getByRole("dialog", { name: "Quitter la saisie en cours ?", exact: true });
    await dialog.getByRole("button", { name: "Continuer la saisie", exact: true }).click();
    assert.equal(await form.getByPlaceholder("Nom complet", { exact: true }).inputValue(), "Brouillon protégé");
    await form.locator('button[type="submit"]').click();
    await page.getByRole("status").filter({ hasText: "Utilisateur créé avec succès." }).waitFor();
    assert.equal(await page.locator('[data-unsaved-sector-form="true"]').count(), 0);
    await context.close(); console.log(`PASS users ${width}: cancelled company/page changes preserve drafts, successful creation clears the guard`);
  }
  for (const width of [1440, 390]) {
    const { context, page, calls } = await fixture(width);
    await page.goto(`${base}/settings/security`);
    const form = await fillSecurity(page, "SyntheticDraft42!");
    page.removeAllListeners("dialog"); let confirmations = 0;
    page.on("dialog", (dialog) => { confirmations += 1; return dialog.dismiss(); });
    if (width < 640) await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
    const logout = width < 640 ? page.locator("#mobile-app-menu .mobile-menu-logout") : page.locator(".security-session-actions").getByRole("button", { name: "Se déconnecter", exact: true });
    await logout.click();
    assert.equal(calls.filter((call) => call.path === "/auth/logout").length, 0);
    assert.equal(await form.getByPlaceholder("Nouveau mot de passe", { exact: true }).inputValue(), "SyntheticDraft42!");
    assert.equal(confirmations, 1);
    page.removeAllListeners("dialog"); page.on("dialog", (dialog) => { confirmations += 1; return dialog.accept(); });
    await logout.click();
    await page.waitForURL("**/login");
    assert.equal(calls.filter((call) => call.path === "/auth/logout").length, 1);
    assert.equal(confirmations, 2, "Confirmed logout must not prompt twice");
    await context.close(); console.log(`PASS security ${width}: cancelled logout preserves the password draft, confirmed logout prompts once`);
  }
  }
  for (const path of ["/admin/users", "/admin/activities"]) {
    const { context, page, gates } = await fixture(390);
    const failure = deferred(true); failure.resolve(); gates.set(`GET:${path}:company-a`, failure);
    await page.goto(`${base}${path}`);
    const empty = page.getByRole("region", { name: "Liste indisponible", exact: true });
    await empty.waitFor(); gates.delete(`GET:${path}:company-a`);
    await empty.getByRole("button", { name: "Actualiser", exact: true }).click();
    if (path === "/admin/users") await row(page).waitFor(); else await page.locator(".activity-admin-card").first().waitFor();
    await context.close(); console.log(`PASS ${path}: failed list is distinguished from empty data and explicit retry succeeds`);
  }
  {
    const { context, page, gates, members } = await fixture(390);
    members.set("company-a", []);
    await page.goto(`${base}/admin/users`);
    await page.getByRole("region", { name: "Aucun utilisateur", exact: true }).waitFor();
    const form = await openCreate(page, "Creation refusée"), failure = deferred(true); failure.resolve();
    gates.set("POST:/admin/users:company-a", failure);
    await form.locator('button[type="submit"]').click();
    await page.getByRole("alert").filter({ hasText: "Erreur simulée de l'action" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Aucun utilisateur", exact: true }).count(), 1, "A failed creation must not turn a successfully read empty list into a read failure");
    assert.equal(await form.getByPlaceholder("Nom complet", { exact: true }).inputValue(), "Creation refusée");
    await context.close(); console.log("PASS users: a failed creation preserves its draft and the known empty-list state");
  }
  {
    const { context, page, gates, calls } = await fixture(390);
    const loading = deferred(); gates.set("GET:/admin/users:company-a", loading);
    await page.goto(`${base}/admin/users`);
    const form = await openCreate(page, "Creation après lecture");
    assert.equal(await form.locator('button[type="submit"]').isDisabled(), true, "A pending initial list must not overwrite a newly created member");
    assert.equal(calls.filter((call) => call.method === "POST").length, 0);
    const done = page.waitForResponse((response) => response.url().endsWith("/admin/users") && response.request().method() === "GET");
    loading.resolve(); await done;
    await page.waitForFunction(() => document.querySelector('.admin-users-create-form button[type="submit"]')?.disabled === false);
    assert.equal(await form.getByPlaceholder("Nom complet", { exact: true }).inputValue(), "Creation après lecture");
    await form.locator('button[type="submit"]').click();
    await page.getByRole("status").filter({ hasText: "Utilisateur créé avec succès." }).waitFor();
    await context.close(); console.log("PASS users: pending initial read delays creation, preserves the draft, then permits saving");
  }
  assert.deepEqual(runtimeErrors, []);
} finally { await browser.close(); }
