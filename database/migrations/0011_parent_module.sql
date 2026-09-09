-- Parent module: only two genuinely new tables needed. Every other Parent
-- feature (Attendance, Results, Homework+submission, Exams, Subjects,
-- Library, Health, Bus, Meetings) reuses real, already-existing tables
-- as-is -- confirmed via read-only introspection before writing this file,
-- not assumed. Both tables below are purely additive; nothing existing is
-- altered or dropped.
--
-- Run this yourself against the real database, exactly like every prior
-- migration this session, then confirm back so the backend build can
-- proceed against it.

-- ============================================================
-- Feedback -- one anonymous 1-5 rating per (student, subject_offering).
-- subject_offering is already scoped to one academic year, so a new offering
-- row each year is what naturally lets a parent rate the same teacher again
-- next term/year -- no separate term column needed.
-- ============================================================

CREATE TABLE staff_feedback_response (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_offering_id   uuid NOT NULL REFERENCES subject_offering (id),
  student_id            uuid NOT NULL REFERENCES student (id),
  rating                smallint NOT NULL,
  submitted_by          uuid NOT NULL REFERENCES person (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT uq_staff_feedback UNIQUE (subject_offering_id, student_id)
);

CREATE INDEX idx_staff_feedback_offering ON staff_feedback_response (subject_offering_id);

-- ============================================================
-- Document Request -- parent requests an official certificate with a reason;
-- Admin approves/rejects and, once approved, uploads the actual file into
-- the REAL existing person_document table (keyed to the student's own
-- person_id) -- reusing that real storage/retention model rather than
-- inventing a second one. This table is only the request/decision workflow
-- on top of it. Admin's own approve+upload screen is a separate, later
-- piece of work (explicitly out of scope for this build) -- this migration
-- only adds what the Parent-side request/view needs to exist at all.
-- ============================================================

CREATE TABLE document_request (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid NOT NULL REFERENCES student (id),
  requested_by         uuid NOT NULL REFERENCES person (id),
  doc_type             text NOT NULL,
  reason               text NOT NULL,
  state                text NOT NULL DEFAULT 'PENDING',
  decided_by           uuid REFERENCES person (id),
  decided_at           timestamptz,
  decision_note        text,
  person_document_id   uuid REFERENCES person_document (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_document_request_doc_type CHECK (doc_type IN (
    'BONAFIDE_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'CHARACTER_CERTIFICATE',
    'STUDY_CERTIFICATE', 'FEE_STRUCTURE_CERTIFICATE', 'MIGRATION_CERTIFICATE',
    'DUPLICATE_MARKSHEET', 'CONDUCT_CERTIFICATE'
  )),
  CONSTRAINT chk_document_request_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_document_request_student ON document_request (student_id);
CREATE INDEX idx_document_request_state ON document_request (state);
