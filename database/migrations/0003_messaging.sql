-- Adds the Parent <-> Faculty messaging module: one shared conversation per
-- (guardian, ward, academic_year, section), participants derived from the ward's
-- CURRENT active subject_offering teachers + CLASS_ADVISOR role_assignment for that
-- section — never a client-supplied recipient.
--
-- Purely additive: three new tables + one cache table, no existing tables touched.
-- NOT executed automatically — run this against Supabase yourself.
--
-- Class-advisor source of truth (verified against the live database, not assumed):
-- role_assignment has a real, populated CLASS_ADVISOR role_code with
-- scope_type='SECTION', scope_id=<section.id>, status='ACTIVE'/'REVOKED'. Its own
-- academic_year_id column is unreliable (NULL on most real rows) — this migration's
-- application code derives the year from section.academic_year_id via scope_id
-- instead, since each academic year has its own distinct section rows.
--
-- Conventions followed (matching 0002_online_classes.sql, itself verified against
-- the live schema):
--   * lowercase unquoted snake_case identifiers throughout.
--   * gen_random_uuid() used bare for uuid PKs; bigserial for append-only child rows
--     (message, matching notification/complaint_update's id:bigint/nextval style).
--   * text + named CHECK constraint for every status-like column, never a native
--     Postgres ENUM.
--   * ON DELETE is explicit on every FK. Owned child rows (participant/message use
--     conversation_id) CASCADE; reference-only FKs (student/person/section/
--     academic_year) use NO ACTION, matching online_class's subject_offering_id/
--     faculty_staff_id.
--   * No DB trigger maintains updated_at anywhere in this schema — application code
--     sets it explicitly on every UPDATE.
--   * conversation.last_message_id is a plain bigint (matching message.id's own
--     bigserial type) with NO foreign key: message.id
--     -> conversation.id would make the two tables mutually referencing, so there is
--     no clean single-statement FK direction. The application sets it in the same
--     transaction as the message insert (see MessagingService), so referential
--     integrity is enforced by the transaction, not the DB, exactly as
--     online_class.google_calendar_event_id (an external reference) is a plain
--     column rather than an FK.

BEGIN;

-- 1. One conversation per (student, parent, academic_year, section) — never merged
--    across wards or years (see chk below / uq_conversation_context). A parent with
--    two wards gets two separate conversation rows; a ward moving to a new academic
--    year gets a new row once re-enrolled, the old one left alone (untouched
--    history, no longer reachable via the API once the enrolment it depended on is
--    no longer ACTIVE for that exact section+year — see MessagingService).
CREATE TABLE conversation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES student(id) ON DELETE NO ACTION,
  parent_person_id    uuid NOT NULL REFERENCES person(id) ON DELETE NO ACTION,
  academic_year_id    uuid NOT NULL REFERENCES academic_year(id) ON DELETE NO ACTION,
  section_id          uuid NOT NULL REFERENCES section(id) ON DELETE NO ACTION,

  status              text NOT NULL DEFAULT 'ACTIVE',
  last_message_id     bigint,
  last_message_at     timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_conversation_status CHECK (status IN ('ACTIVE', 'CLOSED'))
);

COMMENT ON COLUMN conversation.last_message_id IS
  'Denormalized pointer for the conversation-list preview, set transactionally alongside every message insert. Deliberately not an FK — see migration header.';

-- The uniqueness Step 23 requires: a concurrent double-create (e.g. parent's app
-- retrying a slow first load) resolves via ON CONFLICT DO NOTHING in the
-- repository, never a duplicate row.
CREATE UNIQUE INDEX uq_conversation_context
  ON conversation (student_id, parent_person_id, academic_year_id, section_id);

CREATE INDEX idx_conversation_parent ON conversation (parent_person_id, last_message_at DESC);
CREATE INDEX idx_conversation_section_year ON conversation (section_id, academic_year_id);
CREATE INDEX idx_conversation_student ON conversation (student_id);

-- 2. Who can currently see/send in a conversation, and each person's own read
--    state (never shared — Step 13 requires independent unread counts). This table
--    is a DISPLAY/read-state cache, not the authorization boundary: every request
--    re-derives current authorization live from guardian_link/student_enrolment/
--    subject_offering/role_assignment (see MessagingService's design comment) so a
--    stale row here can never outlive an actual reassignment. participant_role is
--    informational (drives the mobile "SUBJECT_TEACHER"/"CLASS_ADVISOR" label) —
--    when a faculty member is both, CLASS_ADVISOR is stored (see sync logic).
CREATE TABLE conversation_participant (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  person_id         uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  participant_role  text NOT NULL,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  last_read_at      timestamptz,

  CONSTRAINT chk_participant_role
    CHECK (participant_role IN ('PARENT', 'SUBJECT_TEACHER', 'CLASS_ADVISOR'))
);

CREATE UNIQUE INDEX uq_conversation_participant ON conversation_participant (conversation_id, person_id);
CREATE INDEX idx_conversation_participant_person ON conversation_participant (person_id);

-- 3. Messages. Immutable (no editing/deletion in this MVP — see README) and
--    faculty-scoped-idempotency-style per (conversation, sender, key), mirroring
--    online_class's uq_online_class_idempotency exactly, so a mobile network retry
--    of the same send attempt returns the original message rather than duplicating.
CREATE TABLE message (
  id                bigserial PRIMARY KEY,
  conversation_id   uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender_person_id  uuid NOT NULL REFERENCES person(id) ON DELETE NO ACTION,
  message_text      text NOT NULL,
  idempotency_key   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_message_idempotency
  ON message (conversation_id, sender_person_id, idempotency_key);

CREATE INDEX idx_message_conversation_created ON message (conversation_id, created_at);
CREATE INDEX idx_message_sender ON message (sender_person_id);

-- 4. Translation cache — keyed by the pair Step 14 specifies. Never mutates
--    message.message_text; a pure lookup-or-store side table.
CREATE TABLE message_translation (
  message_id        bigint NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  target_language   text NOT NULL,
  source_language   text NOT NULL,
  translated_text   text NOT NULL,
  provider          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (message_id, target_language)
);

COMMIT;
