USE amcco_dev;

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS scope_type ENUM('GLOBAL', 'DEDICATED', 'RESTRICTED') NOT NULL DEFAULT 'GLOBAL' AFTER balance;

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS primary_activity_code VARCHAR(32) NULL AFTER scope_type;

ALTER TABLE financial_accounts
  ADD KEY idx_financial_account_company_scope (company_id, scope_type, primary_activity_code);

CREATE TABLE IF NOT EXISTS financial_account_activities (
  account_id VARCHAR(36) NOT NULL,
  activity_code VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, activity_code),
  KEY idx_financial_account_activities_activity (activity_code),
  CONSTRAINT fk_financial_account_activities_account FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
