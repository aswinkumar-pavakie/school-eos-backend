-- Adds the Online Classes module: Faculty schedules a Google Meet session,
-- School EOS owns scheduling/authorization/lifecycle/recording-association,
-- Google Calendar/Meet is used only as the external live-meeting provider.
--
-- Purely additive: three new tables, no existing tables touched, no data
-- migrated or backfilled.
-- NOT executed automatically — run this against Supabase yourself.
--
-- Conventions followed (verified against the live-introspected
-- prisma/schema.prisma, not assumed):
--   * lowercase unquoted snake_case identifiers throughout.
--   * gen_random_uuid() used bare — built into Postgres 13+/Supabase,
--     no CREATE EXTENSION needed (no existing migration declares one).
--   * text + named CHECK constraint for every status-like column, never a
--     native Postgres ENUM type (matches every status column in the schema).
--   * ON DELETE is explicit on every FK, matching how Prisma reflects every
--     relation in the introspected schema.
--   * There is no @updatedAt anywhere in the introspected schema (checked:
--     zero matches across ~130 models) — this project has no DB trigger
--     that maintains updated_at. Application/service code MUST set
--     updated_at = now() on every UPDATE to online_class, exactly as it
--     must for every other table here.
--
-- 0001 (the only prior migration) is a single ALTER TABLE statement, so it
-- never needed an explicit transaction. This migration is 3 tables / ~20
-- statements, so it's wrapped in BEGIN/COMMIT for atomicity: Postgres DDL is
-- fully transactional, and without this wrapper a mid-script failure would
-- leave a partially-created, hard-to-rerun state.

BEGIN;

-- 1. Per-faculty Google OAuth connection. Only the long-lived refresh token
--    is persisted — access tokens are short-lived and always re-derivable
--    from it, so they belong in Redis (already part of the stack) with a
--    TTL, never in Postgres. refresh_token_encrypted must hold ciphertext
--    only, produced by an application-managed key (e.g. KMS-backed);
--    encryption_key_id records which key/version encrypted the row so keys
--    can be rotated later without assuming one static key forever. No key
--    material is or can be stored in this migration.
CREATE TABLE google_account_connection (
  staff_id                 uuid PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  google_account_email     text NOT NULL,
  google_user_id           text,
  refresh_token_encrypted  text NOT NULL,
  encryption_key_id        text,
  token_scope              text NOT NULL,
  status                   text NOT NULL DEFAULT 'ACTIVE',
  connected_at             timestamptz NOT NULL DEFAULT now(),
  disconnected_by          uuid REFERENCES person(id) ON DELETE NO ACTION,
  disconnected_at          timestamptz,
  last_used_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_google_connection_status
    CHECK (status IN ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED'))
);

COMMENT ON COLUMN google_account_connection.refresh_token_encrypted IS
  'Ciphertext only. Never store plaintext. Decrypted backend-side only; never sent to mobile.';
COMMENT ON COLUMN google_account_connection.encryption_key_id IS
  'Identifies which application-managed key/version encrypted this row, to support key rotation without a permanent hard-coded key.';

CREATE UNIQUE INDEX uq_google_connection_google_user
  ON google_account_connection (google_user_id)
  WHERE google_user_id IS NOT NULL;

CREATE INDEX idx_google_connection_status
  ON google_account_connection (status)
  WHERE status <> 'ACTIVE';

CREATE INDEX idx_google_connection_disconnected_by
  ON google_account_connection (disconnected_by);

-- 2. The Online Class record. subject_offering_id gives subject + class +
--    section + academic year via join (same pattern as homework/lesson_plan/
--    lms_material) — nothing about class/section is duplicated here.
CREATE TABLE online_class (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_offering_id       uuid NOT NULL REFERENCES subject_offering(id) ON DELETE NO ACTION,
  faculty_staff_id          uuid NOT NULL REFERENCES staff(id) ON DELETE NO ACTION,
  topic                     text NOT NULL,
  description               text,
  scheduled_date            date NOT NULL,
  start_time                time NOT NULL,
  end_time                  time NOT NULL,

  status                    text NOT NULL DEFAULT 'DRAFT',
  meeting_provider          text NOT NULL DEFAULT 'GOOGLE_MEET',
  meeting_creation_status   text NOT NULL DEFAULT 'PENDING',
  meeting_creation_error    text,

  google_calendar_event_id  text,
  google_meet_id            text,
  meeting_url               text,

  recording_url             text,
  recording_added_by        uuid REFERENCES person(id) ON DELETE NO ACTION,
  recording_added_at        timestamptz,

  cancelled_by              uuid REFERENCES person(id) ON DELETE NO ACTION,
  cancelled_at              timestamptz,
  cancellation_reason       text,

  idempotency_key           text NOT NULL,

  created_by                uuid REFERENCES person(id) ON DELETE NO ACTION,
  updated_by                uuid REFERENCES person(id) ON DELETE NO ACTION,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  version                   integer NOT NULL DEFAULT 1,

  CONSTRAINT chk_online_class_time_range CHECK (end_time > start_time),
  CONSTRAINT chk_online_class_status
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_online_class_meeting_status
    CHECK (meeting_creation_status IN ('PENDING', 'CREATING', 'SUCCEEDED', 'FAILED'))
);

-- Faculty-scoped idempotency key: the mobile app sends an Idempotency-Key
-- header per schedule attempt; scoping by the acting faculty (not global)
-- mirrors the device-scoped precedent in card_tap_event/staff_attendance_event
-- rather than payment's single globally-unique key.
CREATE UNIQUE INDEX uq_online_class_idempotency
  ON online_class (faculty_staff_id, idempotency_key);

CREATE UNIQUE INDEX uq_online_class_google_event
  ON online_class (google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

CREATE INDEX idx_online_class_offering
  ON online_class (subject_offering_id, scheduled_date);

CREATE INDEX idx_online_class_faculty_date
  ON online_class (faculty_staff_id, scheduled_date);

CREATE INDEX idx_online_class_upcoming
  ON online_class (scheduled_date, start_time)
  WHERE status = 'SCHEDULED';

-- Retry/timeout queue for the Google Calendar+Meet creation worker —
-- same shape as notification_delivery's idx_delivery_pending.
CREATE INDEX idx_online_class_meeting_pending
  ON online_class (meeting_creation_status, created_at)
  WHERE meeting_creation_status IN ('CREATING', 'FAILED');

CREATE INDEX idx_online_class_created_by ON online_class (created_by);
CREATE INDEX idx_online_class_updated_by ON online_class (updated_by);
CREATE INDEX idx_online_class_recording_added_by ON online_class (recording_added_by);
CREATE INDEX idx_online_class_cancelled_by ON online_class (cancelled_by);

-- 3. Reschedule history. online_class itself is mutated in place on
--    reschedule; this table keeps the before/after trail so the old
--    schedule is never silently lost (mirrors attendance_correction).
CREATE TABLE online_class_reschedule (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  online_class_id           uuid NOT NULL REFERENCES online_class(id) ON DELETE CASCADE,
  previous_scheduled_date   date NOT NULL,
  previous_start_time       time NOT NULL,
  previous_end_time         time NOT NULL,
  new_scheduled_date        date NOT NULL,
  new_start_time            time NOT NULL,
  new_end_time              time NOT NULL,
  reason                    text,
  rescheduled_by            uuid NOT NULL REFERENCES person(id) ON DELETE NO ACTION,
  rescheduled_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_online_class_reschedule_class
  ON online_class_reschedule (online_class_id, rescheduled_at DESC);

CREATE INDEX idx_online_class_reschedule_by
  ON online_class_reschedule (rescheduled_by);

COMMIT;
