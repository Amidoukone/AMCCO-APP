-- Production-safe lifecycle simplification.
-- Run once, after a verified backup and before deploying the application code.
-- No transaction, proof, audit record, account, task or sector data is deleted.

-- Select the intended database explicitly in the migration session before running
-- this file. Deliberately do not hard-code a development or production schema.

-- New transactions are final as soon as they are created.  Historic drafts and
-- submissions represent recorded operations under the new workflow and must be
-- included in the same totals.  Historic rejections are deliberately preserved.
UPDATE transactions
SET status = 'APPROVED',
    validated_by_id = NULL
WHERE status IN ('DRAFT', 'SUBMITTED');

ALTER TABLE transactions
  ALTER status SET DEFAULT 'APPROVED';
