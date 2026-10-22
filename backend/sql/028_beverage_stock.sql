-- Additive migration. Run against the intended company database after backup.
-- Existing transactions are deliberately not replayed into stock.
-- Use db:init or the normal backend startup: they adapt identifier columns to
-- the actual parent type/charset/collation before executing these statements.
CREATE TABLE IF NOT EXISTS beverage_products (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  product_key VARCHAR(190) NOT NULL,
  opening_quantity DECIMAL(18,3) NOT NULL DEFAULT 0,
  opening_value DECIMAL(30,9) NOT NULL DEFAULT 0,
  created_by_id VARCHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_beverage_product (company_id, product_key),
  CONSTRAINT fk_beverage_product_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS beverage_stock_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(36) NOT NULL,
  kind ENUM('ACHAT_STOCK', 'VENTE', 'INVENTORY_IN', 'INVENTORY_OUT') NOT NULL,
  quantity DECIMAL(18,3) NOT NULL,
  cost_value DECIMAL(30,9) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  reason VARCHAR(500) NULL,
  created_by_id VARCHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_beverage_movement_transaction (transaction_id),
  KEY idx_beverage_movements_product (company_id, product_id, active, id),
  CONSTRAINT fk_beverage_movement_product FOREIGN KEY (product_id) REFERENCES beverage_products(id) ON DELETE CASCADE,
  CONSTRAINT fk_beverage_movement_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
