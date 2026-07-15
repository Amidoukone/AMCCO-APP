USE amcco_dev;

INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
SELECT c.id, a.activity_code, 1
FROM companies c
CROSS JOIN (
  SELECT 'BTP' AS activity_code
  UNION ALL SELECT 'FISH_FARMING'
  UNION ALL SELECT 'LIVESTOCK'
  UNION ALL SELECT 'TRANSPORT'
  UNION ALL SELECT 'MONEY_TRANSFER'
  UNION ALL SELECT 'HOTEL_LODGING'
) a;
