USE amcco_dev;

ALTER TABLE alerts
  ADD COLUMN target_user_id VARCHAR(36) NULL AFTER company_id,
  ADD COLUMN entity_type VARCHAR(100) NULL AFTER severity,
  ADD COLUMN entity_id VARCHAR(36) NULL AFTER entity_type,
  ADD COLUMN metadata JSON NULL AFTER entity_id,
  ADD COLUMN read_at DATETIME NULL AFTER is_read;

ALTER TABLE alerts
  ADD KEY idx_alert_company_target_read_created (company_id, target_user_id, read_at, created_at),
  ADD KEY idx_alert_company_target_severity_created (company_id, target_user_id, severity, created_at),
  ADD CONSTRAINT fk_alert_target_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;

UPDATE alerts
SET read_at = CASE WHEN is_read = 1 THEN created_at ELSE NULL END
WHERE read_at IS NULL;
