import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelBeverageStockLoss,
  countBeverageProduct,
  createBeverageProduct,
  listBeverageProducts,
  listBeverageStockLosses,
  recordBeverageStockLoss
} from "../repositories/beverage-stock.repository.js";
import { ensureCompanyActivityEnabledOrThrow } from "./company-activities.service.js";
import {
  addCompanyBeverageProduct,
  cancelCompanyBeverageLoss,
  countCompanyBeverageStock,
  getCompanyBeverageStock,
  getCompanyBeverageStockOverview,
  listCompanyBeverageLosses,
  recordCompanyBeverageLoss
} from "./beverage-stock.service.js";
vi.mock("../repositories/beverage-stock.repository.js", () => ({
  cancelBeverageStockLoss: vi.fn(),
  countBeverageProduct: vi.fn(),
  createBeverageProduct: vi.fn(),
  listBeverageProducts: vi.fn(),
  listBeverageStockLosses: vi.fn(),
  recordBeverageStockLoss: vi.fn()
}));
vi.mock("./company-activities.service.js", () => ({ ensureCompanyActivityEnabledOrThrow: vi.fn() }));
const operator = { companyId: "company-a", actorId: "operator-a", role: "BEVERAGE_DEPOT_OPERATOR" as const };
const product = { name: "Coca 50 cl", unit: "casier", openingQuantity: "10", openingUnitCost: "100" };
const count = { productId: "coca", expectedQuantity: "10", countedQuantity: "8", unitCost: "0", reason: "Casier cassé" };
const loss = { productId: "coca", quantity: "1", reason: "" };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(ensureCompanyActivityEnabledOrThrow).mockResolvedValue(undefined); });
describe("beverage stock access", () => {
  it("exposes shared company stock to its depot operator without restricting it to their own sales", async () => {
    await getCompanyBeverageStock(operator);
    expect(listBeverageProducts).toHaveBeenCalledWith(operator.companyId);
  });
  it("loads stock and recent losses together in one overview call", async () => {
    vi.mocked(listBeverageProducts).mockResolvedValueOnce([]);
    vi.mocked(listBeverageStockLosses).mockResolvedValueOnce([]);
    await expect(getCompanyBeverageStockOverview(operator)).resolves.toEqual({ items: [], losses: [] });
    expect(listBeverageProducts).toHaveBeenCalledWith(operator.companyId);
    expect(listBeverageStockLosses).toHaveBeenCalledWith(operator.companyId, { limit: 50 });
  });
  it("allows the operator to create a distinct product and its physical opening count", async () => {
    await addCompanyBeverageProduct(operator, product);
    expect(createBeverageProduct).toHaveBeenCalledWith({ ...product, companyId: operator.companyId, actorId: operator.actorId });
  });
  it("allows the operator, accountant and sys_admin to record and cancel stock losses", async () => {
    for (const role of ["BEVERAGE_DEPOT_OPERATOR", "ACCOUNTANT", "SYS_ADMIN"] as const) {
      await recordCompanyBeverageLoss({ ...operator, role }, loss);
      await cancelCompanyBeverageLoss({ ...operator, role }, "loss-1");
    }
    expect(recordBeverageStockLoss).toHaveBeenCalledTimes(3);
    expect(cancelBeverageStockLoss).toHaveBeenCalledTimes(3);
  });
  it("prevents read-only or unrelated roles from recording or cancelling stock losses", async () => {
    for (const role of ["OWNER", "SUPERVISOR", "EMPLOYEE", "HYDROCARBON_OPERATOR"] as const) {
      await expect(recordCompanyBeverageLoss({ ...operator, role }, loss)).rejects.toMatchObject({ statusCode: 403 });
      await expect(cancelCompanyBeverageLoss({ ...operator, role }, "loss-1")).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(recordBeverageStockLoss).not.toHaveBeenCalled();
    expect(cancelBeverageStockLoss).not.toHaveBeenCalled();
  });
  it("allows read-only owner to inspect stock losses", async () => {
    await listCompanyBeverageLosses({ ...operator, role: "OWNER" });
    expect(listBeverageStockLosses).toHaveBeenCalledWith(operator.companyId, {});
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
    await expect(recordCompanyBeverageLoss(operator, loss)).rejects.toThrow("désactivé");
    await expect(cancelCompanyBeverageLoss(operator, "loss-1")).rejects.toThrow("désactivé");
    expect(listBeverageProducts).not.toHaveBeenCalled();
    expect(createBeverageProduct).not.toHaveBeenCalled();
    expect(recordBeverageStockLoss).not.toHaveBeenCalled();
    expect(cancelBeverageStockLoss).not.toHaveBeenCalled();
  });
});
