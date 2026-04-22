ALTER TABLE transactions
  ADD COLUMN salary_confirmation_status ENUM('NOT_REQUIRED', 'PENDING', 'CONFIRMED') NOT NULL DEFAULT 'NOT_REQUIRED' AFTER requires_proof,
  ADD COLUMN salary_confirmed_by_id VARCHAR(36) NULL AFTER salary_confirmation_status,
  ADD COLUMN salary_confirmed_at DATETIME NULL AFTER salary_confirmed_by_id,
  ADD KEY idx_transaction_company_salary_confirmation (company_id, salary_confirmation_status, occurred_at),
  ADD CONSTRAINT fk_transaction_salary_confirmed_by
    FOREIGN KEY (salary_confirmed_by_id) REFERENCES users(id) ON DELETE RESTRICT;
