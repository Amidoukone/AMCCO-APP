// DOM and hook regressions. Uses no company data or backend requests.
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
    return url.origin === base && !url.pathname.startsWith("/api/") ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => { if (!error.message.includes("Simulated optional view failure")) errors.push(error.message); });
  await page.goto(`${base}/login`);
  await page.evaluate(async (path) => {
    const harness = await import(path);
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const element = document.createElement("div"); element.id = "scope-probe"; document.body.append(element);
    const scope = harness.mountScopeProbe(element);
    scope.show("company-a:SERVICES"); await frame(); const first = scope.capture();
    check(first(), "Current action rejected"); scope.show("company-a:SERVICES"); await frame();
    check(first(), "Ordinary render invalidated action");
    scope.show("company-b:MINING"); await frame(); const second = scope.capture();
    check(!first() && second(), "Old company action survived context change");
    scope.show("company-a:SERVICES"); await frame();
    check(!first() && !second(), "Returning to an old context revived an obsolete action");
    const last = scope.capture(); scope.unmount(); check(!last(), "Unmounted action remained valid"); element.remove();
    const broken = document.createElement("div"); broken.id = "broken-view-probe"; document.body.append(broken);
    window.__viewHarness = harness; window.__brokenViewCleanup = harness.mountBrokenView(broken, true);
  }, fixture);
  await page.locator("#broken-view-probe [role=alert]").waitFor();
  assert.equal(await page.evaluate(async () => (await import("/src/lib/useUnsavedChangesGuard.tsx")).hasUnsavedForms()), true, "Fallback must retain global draft protection");
  const dialogPromise = page.waitForEvent("dialog");
  const click = page.locator("#broken-view-probe").getByRole("button", { name: "Recharger la page", exact: true }).click();
  const dialog = await dialogPromise; assert.equal(dialog.type(), "beforeunload"); await dialog.dismiss(); await click;
  assert.equal(await page.locator("#broken-view-probe [role=alert]").count(), 1, "Cancelling reload must preserve the failed view and its draft marker");
  await page.evaluate(() => {
    window.__brokenViewCleanup();
    window.__brokenViewCleanup = window.__viewHarness.mountBrokenView(document.getElementById("broken-view-probe"), false);
  });
  await page.locator("#broken-view-probe [role=alert]").waitFor();
  assert.equal(await page.evaluate(async () => (await import("/src/lib/useUnsavedChangesGuard.tsx")).hasUnsavedForms()), false, "Clean fallback must not block navigation");
  assert.deepEqual(errors, []);
  console.log("PASS action scopes: same-context renders, company/sector changes, return to former context and unmount");
  console.log("PASS failed views: global draft guard preserved, reload cancellation respected, clean views unblocked");
  await context.close();
} finally { await browser.close(); }
