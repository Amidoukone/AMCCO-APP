USE amcco_dev;

CREATE TABLE IF NOT EXISTS company_activities (
  company_id VARCHAR(36) NOT NULL,
  activity_code VARCHAR(32) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, activity_code),
  KEY idx_company_activities_company_enabled (company_id, is_enabled),
  CONSTRAINT fk_company_activities_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO company_activities (company_id, activity_code, is_enabled)
SELECT c.id, a.activity_code, 1
FROM companies c
CROSS JOIN (
  SELECT 'HARDWARE' AS activity_code
  UNION ALL SELECT 'GENERAL_STORE'
  UNION ALL SELECT 'FOOD'
  UNION ALL SELECT 'RENTAL'
  UNION ALL SELECT 'AGRICULTURE'
  UNION ALL SELECT 'SERVICES'
  UNION ALL SELECT 'MINING'
  UNION ALL SELECT 'WATER'
  UNION ALL SELECT 'REAL_ESTATE_AGENCY'
) a;
