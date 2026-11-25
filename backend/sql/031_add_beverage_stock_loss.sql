-- Additive migration: allow dedicated stock loss movements (breakage, spoilage, expiration).
-- Existing products, transactions, and inventory count adjustments are untouched.
ALTER TABLE beverage_stock_movements
  MODIFY kind ENUM('ACHAT_STOCK', 'VENTE', 'INVENTORY_IN', 'INVENTORY_OUT', 'LOSS') NOT NULL;
