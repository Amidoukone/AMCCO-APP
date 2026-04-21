USE amcco_dev;

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED') NOT NULL DEFAULT 'TODO',
  created_by_id VARCHAR(36) NOT NULL,
  assigned_to_id VARCHAR(36) NULL,
  due_date DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task_company_status (company_id, status),
  KEY idx_task_assigned_status (assigned_to_id, status),
  CONSTRAINT fk_task_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_created_by FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
