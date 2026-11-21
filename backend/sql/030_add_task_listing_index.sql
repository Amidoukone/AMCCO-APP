-- Optimization for operations tasks listing and sorting.
-- Eliminates filesort when querying tasks by company and activity ordered by created_at DESC, updated_at DESC.

ALTER TABLE tasks
  ADD KEY idx_task_company_activity_created (company_id, activity_code, created_at, updated_at);
