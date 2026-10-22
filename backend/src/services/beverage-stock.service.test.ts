import { beforeEach, describe, expect, it, vi } from "vitest";
import { countBeverageProduct, createBeverageProduct, listBeverageProducts } from "../repositories/beverage-stock.repository.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import { addCompanyBeverageProduct, countCompanyBeverageStock, getCompanyBeverageStock } from "./beverage-stock.service.js";
vi.mock("../repositories/beverage-stock.repository.js", () => ({ countBeverageProduct: vi.fn(), createBeverageProduct: vi.fn(), listBeverageProducts: vi.fn() }));
vi.mock("./company-activities.service.js", () => ({ ensureCompanyActivityEnabledOrThrow: vi.fn() }));
const operator = { companyId: "company-a", actorId: "operator-a", role: "BEVERAGE_DEPOT_OPERATOR" as const };
const product = { name: "Coca 50 cl", unit: "casier", openingQuantity: "10", openingUnitCost: "100" };
const count = { productId: "coca", expectedQuantity: "10", countedQuantity: "8", unitCost: "0", reason: "Casier cassé" };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(ensureCompanyActivityEnabledOrThrow).mockResolvedValue(undefined); });
describe("beverage stock access", () => {
  it("exposes shared company stock to its depot operator without restricting it to their own sales", async () => {
    await getCompanyBeverageStock(operator);
    expect(listBeverageProducts).toHaveBeenCalledWith(operator.companyId);
  });
  it("allows the operator to create a distinct product and its physical opening count", async () => {
    await addCompanyBeverageProduct(operator, product);
    expect(createBeverageProduct).toHaveBeenCalledWith({ ...product, companyId: operator.companyId, actorId: operator.actorId });
  });
  it("denies another sector operator access", async () => {
    await expect(getCompanyBeverageStock({ ...operator, role: "HYDROCARBON_OPERATOR" })).rejects.toMatchObject({ statusCode: 403 });
    expect(listBeverageProducts).not.toHaveBeenCalled();
  });
  it("does not allow a read-only owner or supervisor to create stock", async () => {
    for (const role of ["OWNER", "SUPERVISOR"] as const) await expect(addCompanyBeverageProduct({ ...operator, role }, product)).rejects.toMatchObject({ statusCode: 403 });
    expect(createBeverageProduct).not.toHaveBeenCalled();
  });
  it("reserves corrections of existing stock to accounting and administration", async () => {
    await expect(countCompanyBeverageStock(operator, count)).rejects.toMatchObject({ statusCode: 403 });
    await countCompanyBeverageStock({ ...operator, role: "ACCOUNTANT" }, count);
    expect(countBeverageProduct).toHaveBeenCalledWith({ ...count, companyId: operator.companyId, actorId: operator.actorId });
  });
  it("does not read or change stock when the sector is disabled", async () => {
    vi.mocked(ensureCompanyActivityEnabledOrThrow).mockRejectedValue(new Error("Secteur désactivé"));
    await expect(getCompanyBeverageStock(operator)).rejects.toThrow("désactivé");
    await expect(addCompanyBeverageProduct(operator, product)).rejects.toThrow("désactivé");
    expect(listBeverageProducts).not.toHaveBeenCalled(); expect(createBeverageProduct).not.toHaveBeenCalled();
  });
});
