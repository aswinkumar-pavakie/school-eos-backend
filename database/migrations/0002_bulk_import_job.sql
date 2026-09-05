-- Adds the generic bulk-import-job table the Finance module's
-- "Financial Obligation Bulk Import" feature depends on
-- (POST /finance/obligation-imports, .../validate, .../confirm, .../cancel).
--
-- No table anywhere in the schema backs this workflow today (verified by a
-- case-insensitive grep for "bulk"/"import_job"/"batch" across the full
-- schema.prisma — zero matches). This is a genuinely new table, not a
-- rename/relation-fix on something that already exists.
--
-- Design notes:
--   - `state` is a plain string + CHECK constraint, matching every other
--     lifecycle field in this schema (no enums are used anywhere).
--   - Validate (DRAFT -> VALIDATED/VALIDATION_FAILED) never writes real
--     fee_demand rows; row_errors carries the structured per-row error list
--     from that dry run so Finance can fix a spreadsheet and re-upload.
--   - Confirm is only reachable from VALIDATED (enforced in application code
--     as a state-machine rule, same as the API doc's own "Commit only
--     proceeds on a job that's already been validated clean").
--   - fee_demand.bulk_import_job_id is a nullable, purely-additive FK so a
--     committed obligation can always be traced back to the import job that
--     created it, without touching any existing fee_demand row.
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE bulk_import_job (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type            text NOT NULL DEFAULT 'FEE_OBLIGATION',
  source_object_key   text NOT NULL,
  file_name           text NOT NULL,
  total_rows          integer,
  valid_rows          integer,
  error_rows          integer,
  row_errors          jsonb,
  state               text NOT NULL DEFAULT 'DRAFT',
  created_by          uuid NOT NULL REFERENCES person (id),
  validated_at        timestamptz,
  committed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bulk_import_job_state
    CHECK (state IN ('DRAFT', 'VALIDATED', 'VALIDATION_FAILED', 'COMMITTED', 'CANCELLED'))
);

CREATE INDEX idx_bulk_import_job_created_by ON bulk_import_job (created_by);
CREATE INDEX idx_bulk_import_job_state ON bulk_import_job (state);

ALTER TABLE fee_demand
  ADD COLUMN bulk_import_job_id uuid REFERENCES bulk_import_job (id);

CREATE INDEX idx_fee_demand_bulk_import_job_id ON fee_demand (bulk_import_job_id);
