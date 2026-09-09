-- Hostel Gate Pass / Emergency Exit / Call Request.
--
-- IMPORTANT CORRECTION vs. the original draft of this file: outing_request
-- already exists as a real table (confirmed via prisma/schema.prisma, which
-- reflects the actual live schema) -- it just has no column yet to tell a
-- Gate Pass request apart from an Emergency Exit request, and no columns for
-- this feature's own direct approve/reject decision (the real table's
-- approval_request_id FK points at the generic approvals engine, which this
-- feature deliberately does NOT use -- the mobile app's own Warden screens
-- call bespoke /hostel/<kind>/:id/approve|reject routes, not the generic
-- /approvals/:id ones). So this migration ALTERs outing_request additively
-- instead of creating it, and only CREATEs the genuinely-new call_request
-- table. Nothing existing is dropped or altered destructively; every new
-- column is nullable so any pre-existing outing_request rows stay valid.
--
-- Run this yourself against the real database, exactly like every prior
-- migration this session, then confirm back so the backend build can
-- proceed against it.

-- ============================================================
-- Outing Request -- add what Gate Pass/Emergency Exit need on top of the
-- real, already-existing table (student_id, requested_by, requested_at,
-- out_from, expected_return, is_overnight, reason, destination,
-- approval_request_id, state already exist and are reused as-is).
-- ============================================================

ALTER TABLE outing_request
  ADD COLUMN request_type   text,
  ADD COLUMN decided_by     uuid REFERENCES person (id),
  ADD COLUMN decided_at     timestamptz,
  ADD COLUMN decision_note  text;

ALTER TABLE outing_request
  ADD CONSTRAINT chk_outing_request_type CHECK (request_type IS NULL OR request_type IN ('GATE_PASS', 'EMERGENCY_EXIT'));

CREATE INDEX idx_outing_request_type_state ON outing_request (request_type, state);

-- ============================================================
-- Call Request -- genuinely new (confirmed absent from prisma/schema.prisma).
-- A parent asking to speak with their hostel-boarding child at a scheduled
-- time; the warden approves with a real window (may differ from what was
-- requested) or rejects outright. hostel_id resolved from the student's own
-- ACTIVE hostel_allocation chain at creation time (not trusted from the
-- client), matching every other Parent feature's own "resolve scope
-- server-side" rule.
-- ============================================================

CREATE TABLE call_request (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid NOT NULL REFERENCES student (id),
  parent_person_id      uuid NOT NULL REFERENCES person (id),
  hostel_id             uuid NOT NULL REFERENCES hostel (id),
  requested_from        timestamptz NOT NULL,
  requested_to          timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'PENDING',
  approved_from         timestamptz,
  approved_to           timestamptz,
  decided_by_person_id  uuid REFERENCES person (id),
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_call_request_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_call_request_times CHECK (requested_to >= requested_from)
);

CREATE INDEX idx_call_request_student ON call_request (student_id);
CREATE INDEX idx_call_request_hostel_status ON call_request (hostel_id, status);
