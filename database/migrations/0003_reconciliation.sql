-- Adds the reconciliation tables the Finance module's "Reconciliation"
-- feature depends on (GET/POST /finance/reconciliations, .../run,
-- .../resolve, .../close).
--
-- No table anywhere in the schema backs this today (verified by a
-- case-insensitive grep for "reconcil" across the full schema.prisma —
-- the only hit is the scalar field `payment.reconciled_at`). This is a
-- genuinely new pair of tables, not a rename of something existing.
--
-- Design notes:
--   - `reconciliation` is the batch/job (one gateway settlement file for one
--     period); `reconciliation_entry` is the per-payment match line the
--     "Run" step produces and "Resolve discrepancy" acts on.
--   - match_state distinguishes an entry the system matched automatically
--     from one that needs a human decision, per the API doc's own
--     description of the queue ("unmatched gateway settlements").
--   - `payment_id` on reconciliation_entry is nullable: a settlement row the
--     gateway reports but that has no corresponding local `payment` at all
--     is exactly the discrepancy case Finance needs to see and resolve.
--   - Closing a reconciliation is a one-way lifecycle step (DRAFT -> RUNNING
--     -> NEEDS_REVIEW -> CLOSED), enforced in application code; this
--     migration only adds the CHECK constraint on the allowed values.
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE reconciliation (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway               text NOT NULL,
  period_from           date NOT NULL,
  period_to             date NOT NULL,
  settlement_object_key text,
  state                 text NOT NULL DEFAULT 'DRAFT',
  matched_count         integer NOT NULL DEFAULT 0,
  unmatched_count       integer NOT NULL DEFAULT 0,
  discrepancy_count     integer NOT NULL DEFAULT 0,
  created_by            uuid NOT NULL REFERENCES person (id),
  run_at                timestamptz,
  closed_by             uuid REFERENCES person (id),
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_reconciliation_state
    CHECK (state IN ('DRAFT', 'RUNNING', 'NEEDS_REVIEW', 'CLOSED')),
  CONSTRAINT chk_reconciliation_period CHECK (period_to >= period_from)
);

CREATE INDEX idx_reconciliation_state ON reconciliation (state);
CREATE INDEX idx_reconciliation_created_by ON reconciliation (created_by);

CREATE TABLE reconciliation_entry (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id    uuid NOT NULL REFERENCES reconciliation (id) ON DELETE CASCADE,
  payment_id           uuid REFERENCES payment (id),
  gateway_ref          text NOT NULL,
  gateway_amount_paise bigint NOT NULL,
  match_state          text NOT NULL DEFAULT 'UNMATCHED',
  discrepancy_reason   text,
  resolution_note      text,
  resolved_by          uuid REFERENCES person (id),
  resolved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_reconciliation_entry_match_state
    CHECK (match_state IN ('MATCHED', 'UNMATCHED', 'DISCREPANCY', 'RESOLVED')),
  CONSTRAINT chk_reconciliation_entry_amount CHECK (gateway_amount_paise > 0),
  CONSTRAINT uq_reconciliation_entry_gateway_ref UNIQUE (reconciliation_id, gateway_ref)
);

CREATE INDEX idx_reconciliation_entry_reconciliation_id ON reconciliation_entry (reconciliation_id);
CREATE INDEX idx_reconciliation_entry_payment_id ON reconciliation_entry (payment_id);
