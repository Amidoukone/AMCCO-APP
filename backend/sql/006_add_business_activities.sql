USE amcco_dev;

ALTER TABLE transactions
  ADD COLUMN activity_code VARCHAR(32) NULL AFTER currency;

ALTER TABLE transactions
  ADD KEY idx_transaction_company_activity_occurred (company_id, activity_code, occurred_at);

ALTER TABLE tasks
  ADD COLUMN activity_code VARCHAR(32) NULL AFTER description;

ALTER TABLE tasks
  ADD KEY idx_task_company_activity_status (company_id, activity_code, status);
