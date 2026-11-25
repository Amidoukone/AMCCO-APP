export type BeverageProduct = {
  id: string; name: string; unit: string; quantity: string; stockValue: string;
  averageUnitCost: string; openingQuantity: string; initializedAt: string;
  purchasedQuantity?: string; soldQuantity?: string; lostQuantity?: string; lostValue?: string;
};

export type BeverageStockLoss = {
  id: string; date: string; productId: string; productName: string; unit: string;
  quantity: string; value: string; reason: string;
};
