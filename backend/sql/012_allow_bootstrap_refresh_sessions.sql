USE amcco_dev;

ALTER TABLE refresh_sessions
  MODIFY company_id VARCHAR(36) NULL;
