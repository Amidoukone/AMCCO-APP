// Local recipe: API requests are intercepted, and writes are checked against real sector profiles.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { getBusinessActivityProfile, assertTransactionInputMatchesActivityProfile } from "../backend/dist/config/business-activity-profiles.js";

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
  { code: "AGRICULTURE", original: { agricultureOperationKind: "HARVEST_SALE", campaignRef: "CAMP-2025", parcelRef: "PAR-01", fieldType: "Riz", quantity: "4", unitPrice: "250", buyerRef: "Acheteur historique" }, presets: [
    { button: "Acheter des intrants", type: "CASH_OUT", metadata: { agricultureOperationKind: "INPUT_PURCHASE" }, fields: { "Référence campagne": "CAMP-2026", "Référence parcelle": "PAR-02", "Type de champ": "Riz", "Intrant ou matériel": "Semences", Quantité: "10", Unité: "kg", "Prix unitaire": "250" }, amount: "2500" },
    { button: "Payer des travaux", type: "CASH_OUT", metadata: { agricultureOperationKind: "FIELD_EXPENSE" }, fields: { "Référence campagne": "CAMP-2026", "Référence parcelle": "PAR-02", "Type de champ": "Riz", "Travaux agricoles": "Labour" }, amount: "4500" },
    { button: "Vendre une récolte", type: "CASH_IN", metadata: { agricultureOperationKind: "HARVEST_SALE" }, fields: { "Référence campagne": "CAMP-2026", "Référence parcelle": "PAR-02", "Type de champ": "Riz", Quantité: "5", "Prix unitaire": "600", Acheteur: "Client recette" }, amount: "3000" },
    { button: "Recevoir un appui", type: "CASH_IN", metadata: { agricultureOperationKind: "SUPPORT_INCOME" }, fields: { "Référence campagne": "CAMP-2026", "Référence parcelle": "PAR-02", "Type de champ": "Riz", "Source d'appui": "Partenaire recette" }, amount: "10000" }
  ] },
  { code: "FISH_FARMING", original: { fishOperationKind: "FISH_SALE", pondRef: "BASSIN-01", cycleRef: "CYCLE-2025", species: "Tilapia", quantity: "4", unitPrice: "250", buyerRef: "Acheteur historique" }, presets: [
    { button: "Acheter des alevins", type: "CASH_OUT", metadata: { fishOperationKind: "FINGERLING_PURCHASE" }, fields: { "Référence bassin": "BASSIN-02", "Référence cycle": "CYCLE-2026", "Lot d'alevins": "LOT-01", Quantité: "20", Unité: "pièce", "Prix unitaire": "100" }, amount: "2000" },
    { button: "Acheter de l’aliment", type: "CASH_OUT", metadata: { fishOperationKind: "FEED_PURCHASE" }, fields: { "Référence bassin": "BASSIN-02", "Référence cycle": "CYCLE-2026", "Aliment ou intrant": "Granulés", Quantité: "10", "Prix unitaire": "250" }, amount: "2500" },
    { button: "Enregistrer une charge", type: "CASH_OUT", metadata: { fishOperationKind: "POND_EXPENSE" }, fields: { "Référence bassin": "BASSIN-02", "Référence cycle": "CYCLE-2026", Mortalité: "2", "Qualité eau": "Contrôle pH" }, amount: "800" },
    { button: "Vendre du poisson", type: "CASH_IN", metadata: { fishOperationKind: "FISH_SALE" }, fields: { "Référence bassin": "BASSIN-02", "Référence cycle": "CYCLE-2026", Quantité: "5", "Prix unitaire": "600" }, amount: "3000" },
    { button: "Recevoir un appui", type: "CASH_IN", metadata: { fishOperationKind: "SUPPORT_INCOME" }, fields: { "Référence bassin": "BASSIN-02", "Référence cycle": "CYCLE-2026", "Source d'appui": "Partenaire recette" }, amount: "10000" }
  ] },
  { code: "TRANSPORT", original: { transportCategory: "Camion benne", dumpTruckOperationKind: "TRAVAUX", vehicleRef: "TR-01", routeRef: "Trajet historique", quantity: "2", purchaseUnitPrice: "500", assetType: "Camion benne", transportService: "Historique" }, presets: [
    { button: "Enregistrer une recette", type: "CASH_IN", fields: { "Type de véhicule": "Camion benne", "Opération camion benne": "TRAVAUX", "Véhicule / immatriculation": "TR-02", "Trajet / lieu": "Chantier recette", "Nombre de voyages": "3", "Prix par voyage": "2000" }, amount: "6000" },
    { button: "Enregistrer une dépense", type: "CASH_OUT", fields: { "Type de véhicule": "Camion benne", "Opération camion benne": "DEPENSE", "Véhicule / immatriculation": "TR-02", "Nature de la dépense": "Pneus" }, amount: "5000" }
  ] },
  { code: "MINING", original: { siteRef: "SITE-01", equipmentRef: "ENGIN-01" }, presets: [
    { button: "Enregistrer une recette", type: "CASH_IN", fields: { "Référence site": "SITE-02", "Référence équipement": "ENGIN-02" }, amount: "12000" },
    { button: "Enregistrer une dépense", type: "CASH_OUT", fields: { "Référence site": "SITE-02" }, amount: "3000" }
  ] },
  { code: "DAILY_ACTIVITIES", original: { dailyActivityKind: "Protocole d'accord", financialOperationKind: "PARTNER_PAYMENT", agreementRef: "ACCORD-01", partnerName: "Partenaire historique", agreementCapitalAmount: "90000" }, presets: [
    { button: "Versement du partenaire", type: "CASH_IN", metadata: { financialOperationKind: "PARTNER_PAYMENT" }, fields: { "Référence de l'accord": "ACCORD-02", Partenaire: "Partenaire recette" }, amount: "20000" },
    { button: "Bénéfice reçu", type: "CASH_IN", metadata: { financialOperationKind: "AGREEMENT_PROFIT" }, fields: { "Référence de l'accord": "ACCORD-02", Partenaire: "Partenaire recette" }, amount: "3000" },
    { button: "Retour de capital", type: "CASH_OUT", metadata: { financialOperationKind: "CAPITAL_RETURN" }, fields: { "Référence de l'accord": "ACCORD-02", Partenaire: "Partenaire recette" }, amount: "5000" },
    { button: "Dépense liée à l’accord", type: "CASH_OUT", metadata: { financialOperationKind: "AGREEMENT_EXPENSE" }, fields: { "Référence de l'accord": "ACCORD-02", Partenaire: "Partenaire recette" }, amount: "800" }
  ] },
  { code: "WATER", original: { waterOperationKind: "WATER_BILLING", quantity: "4", unitPrice: "250" }, presets: [
    { button: "Vendre des paquets d’eau", type: "CASH_IN", metadata: { waterOperationKind: "WATER_SALE" }, fields: { Quantité: "10", "Prix unitaire": "250" }, amount: "2500" },
    { button: "Enregistrer une dépense", type: "CASH_OUT", metadata: { waterOperationKind: "WATER_EXPENSE_OTHER" }, amount: "550" },
    { button: "Autre recette", type: "CASH_IN", metadata: { waterOperationKind: "WATER_OTHER_INCOME" }, amount: "650" }
  ] },
  { code: "BEVERAGE_DEPOT", original: { beverageOperationKind: "VENTE", productName: "Produit ancien", quantity: "2", purchaseUnitPrice: "300", saleUnitPrice: "500" }, presets: [
    { button: "Enregistrer une vente", type: "CASH_IN", metadata: { beverageOperationKind: "VENTE", beverageProductId: "beverage-a" }, fields: { Produit: "beverage-a", Quantité: "4", "Prix de vente unitaire": "500" }, amount: "2000" },
    { button: "Acheter du stock", type: "CASH_OUT", metadata: { beverageOperationKind: "ACHAT_STOCK", beverageProductId: "beverage-b" }, fields: { Produit: "beverage-b", Quantité: "6", "Prix d'achat unitaire": "300", Fournisseur: "Fournisseur recette" }, amount: "1800" },
    { button: "Enregistrer une dépense", type: "CASH_OUT", metadata: { beverageOperationKind: "DEPENSE" }, fields: { "Nature de dépense": "Autre" }, amount: "550" },
    { button: "Autre recette", type: "CASH_IN", metadata: { beverageOperationKind: "AUTRE_RECETTE" }, amount: "650" }
  ] },
  { code: "HYDROCARBON", original: { hydrocarbonCategory: "Citerne", hydrocarbonAssetRef: "CT-HISTORIQUE" }, presets: [
    { button: "Enregistrer une entrée", type: "CASH_IN", fields: { "Produit ou équipement": "Citerne", "Référence citerne / équipement": "CT-01" }, amount: "4500" },
    { button: "Enregistrer une sortie", type: "CASH_OUT", fields: { "Produit ou équipement": "Carburant", Quantité: "20", Unité: "Litre", Fournisseur: "Station recette" }, amount: "3000" }
  ] },
  { code: "SERVICES", original: { serviceType: "Conseil", serviceCategory: "Conseil", clientRef: "Client ancien" }, presets: [
    { button: "Encaisser une prestation", type: "CASH_IN", fields: { "Type de service": "Conseil", "Catégorie de service": "Conseil", Client: "Client recette" }, amount: "12000" },
    { button: "Enregistrer une dépense", type: "CASH_OUT", fields: { "Type de service": "Déplacement", Client: "Client recette" }, amount: "1500" }
  ] },
  { code: "GENERAL_EXPENSES", original: { generalExpenseKind: "PDG_OVERHEAD" }, presets: [
    { button: "Dépense PDG", type: "CASH_OUT", metadata: { generalExpenseKind: "PDG_OVERHEAD" }, amount: "2000" },
    { button: "Dépense employé", type: "CASH_OUT", metadata: { generalExpenseKind: "EMPLOYEE_OTHER" }, fields: { Quantité: "2", "Prix unitaire": "700" }, amount: "1400", calculator: true }
  ] }
];
const fieldCodes = ["AGRICULTURE", "FISH_FARMING", "TRANSPORT", "MINING", "DAILY_ACTIVITIES"];
const selectedDefinitions = definitions.filter((definition) => !process.argv.includes("--stock-states-only") && fieldCodes.includes(definition.code) === process.argv.includes("--field-sectors") && (!process.argv.includes("--beverage-only") || definition.code === "BEVERAGE_DEPOT"));
const profiles = definitions.map(({ code }) => getBusinessActivityProfile(code));
const activities = profiles.map((profile) => ({ code: profile.activityCode, label: profile.label, description: profile.description, isEnabled: true }));
const errors = [];

async function fixture(definition, viewport, role = "ACCOUNTANT", options = {}) {
  const context = await browser.newContext({ viewport });
  const profile = profiles.find((item) => item.activityCode === definition.code);
  const calls = [];
  const user = { id: "user-test", email: "test@example.invalid", fullName: "Utilisateur de recette", role, companyId: company.id };
  const account = { id: "account-test", companyId: company.id, name: "Caisse recette", scopeType: "DEDICATED", primaryActivityCode: definition.code, allowedActivityCodes: [definition.code], balance: "100000", transactionsCount: 1 };
  const original = {
    id: "transaction-existing", companyId: company.id, accountId: account.id, accountName: account.name,
    accountScopeType: account.scopeType, accountPrimaryActivityCode: definition.code, accountAllowedActivityCodes: [definition.code],
    activityCode: definition.code, type: definition.code === "GENERAL_EXPENSES" ? "CASH_OUT" : "CASH_IN", amount: "1000", currency: "XOF", description: "Historique test",
    metadata: { ...definition.original, historicalNote: "À conserver", archiveReference: "ARCHIVE-2024" },
    status: "SUBMITTED", requiresProof: false, proofsCount: 0, createdById: user.id, createdByEmail: user.email,
    occurredAt: "2025-01-01T12:00:00.000Z", createdAt: "2025-01-01T12:00:00.000Z", updatedAt: "2025-01-01T12:00:00.000Z"
  };
  const records = [{ ...original, metadata: { ...original.metadata } }, ...["EUR", "USD"].filter((currency) => profile.finance.allowedCurrencies.includes(currency)).map((currency) => ({ ...original, id: `transaction-${currency}`, description: `Devise ${currency}`, currency, amount: currency === "EUR" ? "40" : "30" }))];
  let failNextWrite = false;
  const products = [
    { id: "beverage-a", name: "Boisson A", unit: "casier", quantity: "1000", stockValue: "300000", averageUnitCost: "300", openingQuantity: "1000", initializedAt: "2024-01-01T00:00:00Z" },
    { id: "beverage-b", name: "Boisson B", unit: "carton", quantity: "0", stockValue: "0", averageUnitCost: "0", openingQuantity: "0", initializedAt: "2024-01-01T00:00:00Z" }
  ];
  if (options.emptyStock) products.splice(0);
  let stockFailure = options.stockFailure ?? null;
  let stockCreateFailure = null;
  let stockGate = null;
  let releaseStock;
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
    else if (path === "/finance/dump-trucks/summary") data = { items: [] };
    else if (path === "/daily-activities/categories") data = { items: [{ id: "category-protocol", companyId: company.id, name: "Protocole d'accord", isActive: true }] };
    else if (path === "/finance/accounts") data = { items: [account] };
    else if (path === "/finance/beverage-products" && method === "GET") {
      if (stockGate) await stockGate;
      if (stockFailure) return route.fulfill({ status: stockFailure.status, json: { error: { message: stockFailure.message } } });
      data = { items: products };
    }
    else if (path === "/finance/beverage-products" && method === "POST") {
      if (stockCreateFailure) return route.fulfill({ status: stockCreateFailure.status, json: { error: { message: stockCreateFailure.message } } });
      const item = { ...body, id: `beverage-created-${products.length + 1}`, quantity: body.openingQuantity, averageUnitCost: body.openingUnitCost, stockValue: String(Number(body.openingQuantity) * Number(body.openingUnitCost)), initializedAt: "2026-10-22T00:00:00Z" };
      products.push(item); data = { item };
    }
    else if (path === "/finance/beverage-products/beverage-a/count" && method === "POST") {
      const product = products[0];
      assert.equal(body.expectedQuantity, product.quantity, "Physical corrections check the previously displayed quantity");
      product.quantity = body.countedQuantity;
      product.stockValue = String(Number(product.averageUnitCost) * Number(product.quantity));
      data = { status: "ok" };
    }
    else if (path === "/finance/transactions" && method === "GET") data = { items: records.filter((item) => !url.searchParams.get("type") || item.type === url.searchParams.get("type")) };
    else if (path === "/finance/transactions" && method === "POST" || path === "/finance/transactions/transaction-existing" && method === "PATCH") {
      if (failNextWrite) { failNextWrite = false; return route.fulfill({ status: 500, json: { error: { message: "Erreur de sauvegarde simulée" } } }); }
      try { assertTransactionInputMatchesActivityProfile(definition.code, body); }
      catch (error) { errors.push(`Invalid ${definition.code} write: ${error.message}`); return route.fulfill({ status: 422, json: { error: { message: error.message } } }); }
      if (method === "POST" && definition.code === "BEVERAGE_DEPOT" && ["VENTE", "ACHAT_STOCK"].includes(body.metadata.beverageOperationKind)) {
        const product = products.find((item) => item.id === body.metadata.beverageProductId);
        assert.ok(product, "New stock movements must reference a catalog product");
        const quantity = Number(body.metadata.quantity);
        const sale = body.metadata.beverageOperationKind === "VENTE";
        if (sale && quantity > Number(product.quantity)) return route.fulfill({ status: 409, json: { error: { message: "Stock insuffisant : stock modifié par un autre opérateur." } } });
        const cost = sale ? Number(product.averageUnitCost) : Number(body.metadata.purchaseUnitPrice);
        body.metadata.productName = product.name; body.metadata.beverageUnit = product.unit;
        body.metadata.beverageStockManaged = "1"; body.metadata.beverageStockCost = (cost * quantity).toFixed(9);
        body.metadata.purchaseUnitPrice = String(cost);
        product.quantity = String(Number(product.quantity) + (sale ? -quantity : quantity));
        product.stockValue = String(Number(product.stockValue) + (sale ? -cost * quantity : cost * quantity));
        product.averageUnitCost = Number(product.quantity) ? String(Number(product.stockValue) / Number(product.quantity)) : "0";
      }
      if (method === "POST") {
        const item = { ...original, ...body, description: body.description ?? null, id: `created-${records.length}`, metadata: { ...body.metadata } };
        records.push(item);
        data = { item };
      } else {
        const item = records.find((record) => record.id === original.id);
        Object.assign(item, body, { description: body.description ?? null });
        data = { item };
      }
    } else if (path.startsWith("/finance/transactions/") && method === "GET") data = { item: records.find((item) => item.id === path.split("/").at(-1)) };
    else { errors.push(`Unexpected request: ${method} ${path}`); return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } }); }
    return route.fulfill({ status: 200, json: data });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  return { context, page, calls, records, original, profile, products, fail: () => { failNextWrite = true; },
    setStockFailure: (failure) => { stockFailure = failure; }, setStockCreateFailure: (failure) => { stockCreateFailure = failure; },
    holdStock: () => { stockGate = new Promise((resolve) => { releaseStock = resolve; }); },
    releaseStock: () => { releaseStock?.(); stockGate = null; }
  };
}

function field(page, label) {
  return page.locator(".finance-transaction-form").getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}
async function fillField(page, label, value) {
  const input = field(page, label);
  if (await input.evaluate((element) => element.tagName === "SELECT")) await input.selectOption(value);
  else await input.fill(value);
}
async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}
const compactAmount = (value) => value.replace(/[\s\u00a0\u202f]/g, "");

try {
  if (process.argv.includes("--stock-states-only")) {
    const definition = definitions.find((item) => item.code === "BEVERAGE_DEPOT");
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const test = await fixture(definition, viewport, "BEVERAGE_DEPOT_OPERATOR", { emptyStock: true, stockFailure: { status: 500, message: "Erreur interne du serveur" } });
      const { page, context, calls, products } = test;
      await page.goto(`${baseURL}/finance/transactions?activityCode=BEVERAGE_DEPOT`);
      const panel = page.getByRole("region", { name: "Stock du dépôt", exact: true });
      await panel.getByRole("heading", { name: "Stock indisponible", exact: true }).waitFor();
      assert.equal(await panel.getByRole("table").count(), 0, "Failure is never represented by an empty stock table");
      assert.equal(await panel.getByText("Ajouter un produit", { exact: true }).count(), 0, "Stock creation is hidden on a read failure");
      assert.doesNotMatch(await panel.innerText(), /Erreur interne du serveur|Aucun produit enregistré/);
      await panel.screenshot({ path: fileURLToPath(new URL(`beverage-stock-unavailable-${viewport.width}.png`, artifacts)) });
      test.setStockFailure({ status: 503, message: "Le suivi de stock n'est pas encore disponible. Prévenez le comptable ou l'administrateur pour terminer sa mise en service." });
      await panel.getByRole("button", { name: "Réessayer le chargement", exact: true }).click();
      await panel.getByText(/Le suivi de stock n'est pas encore disponible/).waitFor();
      test.setStockFailure(null); test.holdStock();
      await panel.getByRole("button", { name: "Réessayer le chargement", exact: true }).click();
      await panel.getByRole("status").filter({ hasText: "Chargement du stock" }).waitFor();
      assert.equal(await panel.getByText("Ajouter un produit", { exact: true }).count(), 0, "Initial loading does not allow an unchecked stock write");
      test.releaseStock();
      await panel.getByRole("heading", { name: "Aucun produit enregistré", exact: true }).waitFor();
      assert.equal(await panel.getByRole("table").count(), 0);
      await panel.getByText("Ajouter un produit", { exact: true }).click();
      const name = panel.getByLabel(/^Nom du produit/);
      const openingChoice = panel.getByRole("checkbox", { name: "Ce produit est déjà présent dans le dépôt", exact: true });
      assert.equal(await openingChoice.isChecked(), false);
      assert.equal(await panel.getByLabel(/^Stock de départ compté/).count(), 0);
      assert.equal(await panel.getByLabel(/^Coût d'achat par/).count(), 0);
      await name.fill("Coca 50 cl"); await openingChoice.check();
      const save = panel.getByRole("button", { name: "Enregistrer le produit", exact: true });
      const beforeInvalid = calls.filter((call) => call.path === "/finance/beverage-products" && call.method === "POST").length;
      await save.click();
      assert.equal(calls.filter((call) => call.path === "/finance/beverage-products" && call.method === "POST").length, beforeInvalid, "Opening stock cannot save without its count and cost");
      await panel.getByLabel(/^Stock de départ compté/).fill("12");
      await panel.getByLabel(/^Coût d'achat par/).fill("4500");
      await panel.getByText(/Valeur du stock de départ/).waitFor();
      assert.ok((await panel.innerText()).replace(/[\s\u00a0\u202f]/g, "").includes("54000XOF"));
      await page.setViewportSize({ width: viewport.width, height: 2200 });
      await panel.screenshot({ path: fileURLToPath(new URL(`beverage-stock-create-${viewport.width}.png`, artifacts)) });
      await page.setViewportSize(viewport);
      test.setStockCreateFailure({ status: 409, message: "Ce produit existe déjà avec cette unité." });
      await save.click();
      await panel.getByRole("alert").filter({ hasText: "existe déjà" }).waitFor();
      assert.equal(await name.inputValue(), "Coca 50 cl");
      assert.equal(await panel.getByLabel(/^Stock de départ compté/).inputValue(), "12");
      assert.equal(products.length, 0);
      await panel.getByRole("button", { name: "Annuler", exact: true }).click();
      assert.equal(await name.inputValue(), "Coca 50 cl", "Cancelling the discard confirmation keeps the product draft");
      page.removeAllListeners("dialog"); page.on("dialog", (dialog) => dialog.accept());
      await panel.getByRole("button", { name: "Annuler", exact: true }).click();
      await panel.getByText("Ajouter un produit", { exact: true }).click();
      assert.equal(await name.inputValue(), "");
      assert.equal(await openingChoice.isChecked(), false);
      test.setStockCreateFailure(null);
      await name.fill("Nouvelle boisson"); await save.click();
      await panel.getByRole("row").filter({ hasText: "Nouvelle boisson" }).waitFor();
      const firstBody = calls.findLast((call) => call.path === "/finance/beverage-products" && call.method === "POST").body;
      assert.deepEqual(firstBody, { name: "Nouvelle boisson", unit: "casier", openingQuantity: "0", openingUnitCost: "0" });
      assert.equal(await panel.getByRole("row").filter({ hasText: "Nouvelle boisson" }).getByRole("button", { name: "Vendre", exact: true }).isDisabled(), true);
      await panel.getByText("Ajouter un produit", { exact: true }).click();
      await name.fill("Coca 50 cl"); await openingChoice.check();
      await panel.getByLabel(/^Stock de départ compté/).fill("12"); await panel.getByLabel(/^Coût d'achat par/).fill("4500");
      await save.click();
      await panel.getByRole("row").filter({ hasText: "Coca 50 cl" }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      assert.equal(products.length, 2);
      assert.equal(products[1].quantity, "12"); assert.equal(products[1].stockValue, "54000");
      assert.equal(await panel.getByRole("row").filter({ hasText: "Coca 50 cl" }).getByRole("button", { name: "Vendre", exact: true }).isEnabled(), true);
      await panel.getByRole("searchbox").fill("Introuvable");
      await panel.getByRole("status").filter({ hasText: "Aucun produit ne correspond" }).waitFor();
      assert.equal(await panel.getByRole("table").count(), 0);
      await panel.getByRole("searchbox").fill("");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.setViewportSize({ width: viewport.width, height: 2200 });
      await panel.screenshot({ path: fileURLToPath(new URL(`beverage-stock-ready-${viewport.width}.png`, artifacts)) });
      await context.close();
      console.log(`PASS stock states ${viewport.width}: 500, 503, retry, loading, empty, counted opening, zero opening, duplicate, draft cancellation, search and sale availability`);
    }
  }
  for (const definition of selectedDefinitions) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const { context, page, records, calls, original, profile, fail, products } = await fixture(definition, viewport);
      await page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}`);
      try {
        await page.locator("#transactions-list tbody tr").filter({ hasText: "Historique test" }).waitFor();
      } catch (error) {
        await page.screenshot({ path: fileURLToPath(new URL("cashflow-failure.png", artifacts)), fullPage: true });
        console.error(JSON.stringify({ sector: definition.code, viewport, errors, calls, text: await page.locator("body").innerText() }, null, 2));
        throw error;
      }
      assert.equal(await page.locator("#transaction-create").getAttribute("open"), null, "Form starts collapsed");
      assert.equal(await page.evaluate(() => Boolean(document.querySelector("#transactions-list").compareDocumentPosition(document.querySelector("#transaction-create")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
      await page.getByText("Synthèse par devise", { exact: true }).click();
      await page.getByRole("group", { name: "Totaux XOF", exact: true }).getByText("1 000 XOF", { exact: true }).first().waitFor();
      if (profile.finance.allowedCurrencies.includes("EUR")) {
        await page.getByRole("group", { name: "Totaux EUR", exact: true }).getByText("40 EUR", { exact: true }).first().waitFor();
      }
      if (profile.finance.allowedCurrencies.includes("USD")) await page.getByRole("group", { name: "Totaux USD", exact: true }).getByText("30 USD", { exact: true }).first().waitFor();
      await page.getByText("Synthèse par devise", { exact: true }).click();
      const actions = page.getByRole("region", { name: "Saisie rapide du secteur", exact: true });
      await actions.getByRole("button", { name: definition.presets[0].button, exact: true }).click();
      const draftField = definition.code === "BEVERAGE_DEPOT" ? "Quantité" : "Montant";
      await field(page, draftField).fill("123");
      await actions.getByRole("button", { name: definition.presets[1].button, exact: true }).click();
      assert.equal(compactAmount(await field(page, draftField).inputValue()), "123", "Cancelling a preset switch keeps the draft");
      page.removeAllListeners("dialog");
      page.on("dialog", (dialog) => dialog.accept());
      await actions.getByRole("button", { name: definition.presets[1].button, exact: true }).click();
      assert.equal(await field(page, draftField).inputValue(), "", "Accepted switch starts a fresh draft");
      page.removeAllListeners("dialog");
      page.on("dialog", (dialog) => dialog.dismiss());
      assert.equal(calls.some((call) => call.method === "POST"), false, "Shortcuts never save automatically");
      for (const [index, preset] of definition.presets.entries()) {
        await actions.getByRole("button", { name: preset.button, exact: true }).click();
        if (preset.calculator) await page.getByRole("button", { name: "Calculer le montant (quantité × prix unitaire)", exact: true }).click();
        for (const [label, value] of Object.entries(preset.fields ?? {})) {
          await fillField(page, label, value);
          if (definition.code === "TRANSPORT" && label === "Type de véhicule" && value === "Camion benne") {
            assert.equal(await field(page, "Opération camion benne").inputValue(), preset.type === "CASH_OUT" ? "DEPENSE" : "TRAVAUX", "Selecting a dump truck must preserve the requested flow direction");
          }
        }
        if (preset.fields?.Quantité && ["WATER", "BEVERAGE_DEPOT", "GENERAL_EXPENSES", "AGRICULTURE", "FISH_FARMING"].includes(definition.code) || preset.fields?.["Nombre de voyages"]) {
          assert.equal(compactAmount(await field(page, "Montant").inputValue()), preset.amount, "Existing quantity × unit-price calculation is preserved");
        } else await field(page, "Montant").fill(preset.amount);
        const descriptionLabel = profile.finance.fields.find((item) => item.key === "description").label;
        await page.locator(".finance-transaction-form").getByLabel(new RegExp(`^${descriptionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).fill(`Recette ${preset.button}`);
        await field(page, "Date et heure de l'opération").fill("2026-10-12T09:30");
        const details = page.locator(".finance-transaction-form details").filter({ has: page.getByText(/Détails de l'opération|Détails Hydrocarbure|Détails Transport/, { exact: true }) });
        assert.ok(await details.getAttribute("open") !== null, "Business fields are immediately accessible");
        assert.equal(await page.evaluate(() => Boolean(document.querySelector(".finance-transaction-form details:not(.finance-proof-callout)").compareDocumentPosition(document.querySelector(".finance-proof-callout")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
        const before = records.length;
        if (index === 0 && viewport.width === 1440) {
          fail();
          await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
          await page.getByRole("alert").filter({ hasText: "Erreur de sauvegarde simulée" }).waitFor();
          assert.equal(compactAmount(await field(page, "Montant").inputValue()), preset.amount);
          assert.equal(records.length, before);
        }
        await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
        await waitFor(() => records.length === before + 1, `Expected ${definition.code} ${preset.button} creation`);
        await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
        assert.equal(await page.getByRole("dialog", { name: "Quitter la saisie en cours ?" }).count(), 0, "A successful save must not trigger a leave-page prompt");
        const created = records.at(-1);
        if (definition.code === "BEVERAGE_DEPOT" && created.metadata.beverageStockCost) {
          assert.match(created.metadata.beverageStockCost, /^\d+\.\d{9}$/, "Stored stock cost retains its accounting precision");
          const businessContext = await page.locator("#transaction-detail .finance-detail-block").filter({ hasText: "Contexte métier" }).textContent();
          const costDisplay = Number(created.metadata.beverageStockCost).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, " ");
          const costLabel = created.metadata.beverageOperationKind === "ACHAT_STOCK" ? "Coût du stock acheté" : "Coût du stock vendu";
          assert.ok(businessContext.includes(`${costLabel}: ${costDisplay} XOF`), "Business context displays a readable stock cost with its currency");
          assert.ok(!businessContext.includes(created.metadata.beverageStockCost), "Internal nine-decimal precision is not exposed in the display");
        }
        assert.equal(created.type, preset.type);
        assert.equal(created.amount, preset.amount);
        assert.equal(created.currency, "XOF");
        assert.equal(created.activityCode, definition.code);
        assert.ok(created.occurredAt.startsWith("2026-10-12"));
        for (const [key, value] of Object.entries(preset.metadata ?? {})) assert.equal(created.metadata[key], value);
        assert.equal(created.metadata.historicalNote, undefined, "A new draft never inherits an old record's hidden fields");
      }
      if (viewport.width === 1440) {
        const row = page.locator("#transactions-list tbody tr").filter({ hasText: "Historique test" });
        await row.getByRole("button", { name: "Modifier", exact: true }).click();
        const descriptionLabel = profile.finance.fields.find((item) => item.key === "description").label;
        await page.locator(".finance-transaction-form").getByLabel(new RegExp(`^${descriptionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).fill("Historique conservé");
        await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
        await waitFor(() => calls.some((call) => call.method === "PATCH"), "Expected an update of the original ID");
        await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
        const patch = calls.findLast((call) => call.method === "PATCH");
        assert.equal(patch.path, `/finance/transactions/${original.id}`);
        assert.equal(patch.body.metadata.historicalNote, original.metadata.historicalNote);
        assert.equal(patch.body.metadata.archiveReference, original.metadata.archiveReference);
        assert.equal(patch.body.amount, original.amount);
        assert.equal(patch.body.occurredAt, original.occurredAt);
        if (definition.code === "BEVERAGE_DEPOT") {
          const stockPanel = page.getByRole("region", { name: "Stock du dépôt", exact: true });
          await stockPanel.getByText("Corriger un écart après comptage", { exact: true }).click();
          await stockPanel.getByLabel(/^Produit à compter/).selectOption("beverage-a");
          const physicalQuantity = String(Number(products[0].quantity) - 1);
          await stockPanel.getByLabel("Quantité physique comptée *", { exact: true }).fill(physicalQuantity);
          await stockPanel.getByLabel("Motif de l'écart *", { exact: true }).fill("Un casier cassé au rangement");
          const recordCount = records.length;
          await stockPanel.getByRole("button", { name: "Enregistrer le comptage et sa correction", exact: true }).click();
          await waitFor(() => calls.some((call) => call.path.endsWith("/count") && call.method === "POST"), "Accountant can record a physical shortage");
          await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
          assert.equal(products[0].quantity, physicalQuantity);
          assert.equal(records.length, recordCount, "Physical stock corrections must not create cash transactions");
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`${definition.code.toLowerCase()}-${viewport.width}.png`, artifacts)), fullPage: true });
      await context.close();
      console.log(`PASS ${definition.code} ${viewport.width}: presets, calculations, confirmation, failed writes, currency totals and original metadata`);
    }
    for (const role of ["OWNER", "SUPERVISOR"]) {
      const { context, page } = await fixture(definition, { width: 1280, height: 900 }, role);
      await page.goto(`${baseURL}/finance/transactions?activityCode=${definition.code}`);
      await page.locator("#transactions-list").waitFor();
      assert.equal(await page.getByRole("region", { name: "Saisie rapide du secteur", exact: true }).count(), 0);
      assert.equal(await page.locator("#transaction-create").count(), 0, "Consultation roles must not gain transaction creation");
      await context.close();
    }
  }
  for (const [code, role] of process.argv.includes("--field-sectors") || process.argv.includes("--stock-states-only") ? [] : [["HYDROCARBON", "HYDROCARBON_OPERATOR"], ["BEVERAGE_DEPOT", "BEVERAGE_DEPOT_OPERATOR"]].filter(([code]) => !process.argv.includes("--beverage-only") || code === "BEVERAGE_DEPOT")) {
    const definition = definitions.find((item) => item.code === code);
    for (const viewport of code === "BEVERAGE_DEPOT" ? [{ width: 1440, height: 1000 }, { width: 390, height: 844 }] : [{ width: 390, height: 844 }]) {
    const { context, page, calls, records, original, products } = await fixture(definition, viewport, role);
    await page.goto(`${baseURL}/finance/transactions?activityCode=${code}`);
    await page.getByRole("region", { name: "Saisie rapide du secteur", exact: true }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Rapports", exact: true }).count(), 0);
    assert.ok(calls.filter((call) => call.path === "/finance/transactions").every((call) => call.query.activityCode === code));
    if (code === "BEVERAGE_DEPOT") {
      assert.equal(await page.getByText("Corriger un écart après comptage", { exact: true }).count(), 0, "Operator cannot override existing stock");
      assert.equal(await page.getByRole("navigation", { name: "Pages du secteur", exact: true }).getByRole("link", { name: "Tâches", exact: true }).count(), 0);
      assert.doesNotMatch(await page.locator("body").textContent(), /tâches de rapprochement|Les versements et reliquats se suivent/);
      // Enter directly, then save again after reset: neither path changes the displayed operation.
      for (let index = 0; index < 2; index++) {
        if (await page.locator("#transaction-create").getAttribute("open") === null) await page.locator("#transaction-create summary").first().click();
        for (const [label, value] of Object.entries(definition.presets[0].fields)) await fillField(page, label, value);
        assert.equal(await field(page, "Précision").inputValue(), "");
        const before = records.length;
        await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
        await waitFor(() => records.length === before + 1, "Operator sale without Précision must save from the default form, including after reset");
        await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
        assert.equal(records.at(-1).metadata.beverageOperationKind, "VENTE");
        assert.equal(calls.findLast((call) => call.method === "POST").body.description, undefined);
      }
      for (const preset of definition.presets) {
        await page.getByRole("region", { name: "Saisie rapide du secteur", exact: true }).getByRole("button", { name: preset.button, exact: true }).click();
        for (const [label, value] of Object.entries(preset.fields ?? {})) await fillField(page, label, value);
        if (!["VENTE", "ACHAT_STOCK"].includes(preset.metadata.beverageOperationKind)) await field(page, "Montant").fill(preset.amount);
        assert.equal(await field(page, "Précision").inputValue(), "");
        const before = records.length;
        await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
        await waitFor(() => records.length === before + 1, `Operator ${preset.button} without Précision must save`);
        await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
        assert.equal(records.at(-1).metadata.beverageOperationKind, preset.metadata.beverageOperationKind);
        assert.equal(records.at(-1).amount, preset.amount);
      }
      await page.locator("#transactions-list tbody tr").filter({ hasText: "Historique test" }).getByRole("button", { name: "Voir le détail", exact: true }).click();
      await page.locator("#transaction-detail").getByRole("button", { name: "Modifier", exact: true }).click();
      await field(page, "Précision").fill("");
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
      await waitFor(() => calls.some((call) => call.method === "PATCH"), "Operator can clear optional Précision on an existing sale");
      const patch = calls.findLast((call) => call.method === "PATCH");
      assert.equal(patch.body.metadata.archiveReference, original.metadata.archiveReference);
      assert.equal(patch.body.occurredAt, original.occurredAt);
      assert.equal(patch.body.description, undefined);
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      await page.getByRole("region", { name: "Saisie rapide du secteur", exact: true }).getByRole("button", { name: "Enregistrer une vente", exact: true }).click();
      await field(page, "Opération").selectOption("DEPENSE");
      await fillField(page, "Nature de dépense", "Manutention");
      await field(page, "Montant").fill("750");
      const beforeSwitch = records.length;
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
      await waitFor(() => records.length === beforeSwitch + 1, "Changing operation directly must save the displayed category");
      assert.equal(records.at(-1).metadata.beverageOperationKind, "DEPENSE");
      assert.equal(records.at(-1).type, "CASH_OUT");
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      await page.getByRole("region", { name: "Saisie rapide du secteur", exact: true }).getByRole("button", { name: "Enregistrer une vente", exact: true }).click();
      assert.equal(await field(page, "Précision").getAttribute("required"), null);
      assert.ok(await field(page, "Produit").getAttribute("required") !== null);
      assert.equal(await field(page, "Prix d'achat unitaire").count(), 0, "Sale cost comes from stock, not from operator input");
      await fillField(page, "Produit", "beverage-a");
      await fillField(page, "Quantité", "2000");
      await fillField(page, "Prix de vente unitaire", "500");
      const writesBeforeOversale = calls.filter((call) => call.method === "POST").length;
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Stock insuffisant" }).waitFor();
      assert.equal(calls.filter((call) => call.method === "POST").length, writesBeforeOversale, "An oversized sale is blocked before sending");
      await page.waitForFunction(() => !document.querySelector('.beverage-stock-panel [role="status"]'));
      await fillField(page, "Quantité", "1");
      const storedQuantity = products[0].quantity;
      products[0].quantity = "0"; // A concurrent operator consumes the stock after the screen was loaded.
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "stock modifié par un autre opérateur" }).waitFor();
      assert.equal(await field(page, "Quantité").inputValue(), "1", "A server stock conflict keeps the operator's draft");
      products[0].quantity = storedQuantity;
      await page.getByRole("button", { name: "Actualiser le stock", exact: true }).click();
      const beforeRetry = records.length;
      await page.getByRole("button", { name: "Actualiser le stock", exact: true }).waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('.beverage-stock-panel [role="status"]'));
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
      await waitFor(() => records.length === beforeRetry + 1, "The sale can be retried after the stock conflict is resolved");
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      const stockPanel = page.getByRole("region", { name: "Stock du dépôt", exact: true });
      await stockPanel.getByText("Ajouter un produit", { exact: true }).click();
      await stockPanel.getByLabel(/^Nom du produit/).fill("Boisson sans stock");
      await stockPanel.getByRole("button", { name: "Enregistrer le produit", exact: true }).click();
      const zeroRow = stockPanel.getByRole("row").filter({ hasText: "Boisson sans stock" });
      await zeroRow.waitFor();
      assert.equal(await zeroRow.getByRole("button", { name: "Vendre", exact: true }).isDisabled(), true);
      await stockPanel.getByRole("row").filter({ hasText: "Boisson A" }).getByRole("button", { name: "Vendre", exact: true }).click();
      assert.equal(await field(page, "Produit").inputValue(), "beverage-a", "Selling from stock selects the correct catalog product");
      assert.ok(await field(page, "Montant").getAttribute("readonly") !== null, "Calculated sale totals cannot be overwritten");
      await fillField(page, "Quantité", "0.5");
      await fillField(page, "Prix de vente unitaire", "501");
      assert.equal(compactAmount(await field(page, "Montant").inputValue()), "251", "Fractional quantities use a whole-XOF sale total");
      const beforeFraction = records.length;
      await page.locator(".finance-transaction-form").getByRole("button", { name: "Enregistrer la transaction", exact: true }).click();
      await waitFor(() => records.length === beforeFraction + 1, "Fractional sale quantity must pass server profile validation");
      await page.waitForFunction(() => !document.querySelector('[data-unsaved-sector-form="true"]'));
      await stockPanel.getByRole("row").filter({ hasText: "Boisson A" }).getByRole("button", { name: "Vendre", exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const overflowingControls = await page.locator(".finance-transaction-form-quick label").evaluateAll((labels) => labels.filter((label) => {
        const control = label.querySelector("input, select");
        return control && control.getBoundingClientRect().right > label.getBoundingClientRect().right + 1;
      }).map((label) => label.textContent));
      assert.deepEqual(overflowingControls, [], "Account and operation controls must fit their columns");
      await page.setViewportSize({ width: viewport.width, height: 2200 });
      await stockPanel.screenshot({ path: fileURLToPath(new URL(`beverage-stock-${viewport.width}.png`, artifacts)) });
      await page.locator(".finance-transaction-form").screenshot({ path: fileURLToPath(new URL(`beverage-operator-${viewport.width}.png`, artifacts)) });
    }
    await context.close();
    console.log(`PASS ${role} ${viewport.width}: sector access${code === "BEVERAGE_DEPOT" ? ", catalog selection, all four operations, blank Précision, historical edit, insufficient stock, server conflict, retry, product creation and zero-stock sale disabled" : ""}`);
    }
  }
  assert.deepEqual(errors, [], "No runtime errors, invalid writes or unexpected API requests");
} finally {
  await browser.close();
}
