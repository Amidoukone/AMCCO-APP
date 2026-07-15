USE amcco_dev;

INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
SELECT c.id, 'LIVESTOCK', 1
FROM companies c;
