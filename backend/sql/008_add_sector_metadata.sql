USE amcco_dev;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS metadata_json JSON NULL AFTER description;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS metadata_json JSON NULL AFTER activity_code;
