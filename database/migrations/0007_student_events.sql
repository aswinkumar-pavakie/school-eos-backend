-- Event Permission (digital consent) feature: Faculty create an event (a trip /
-- excursion / activity) and attach specific students to it; each attached
-- student's parent must digitally accept (sign as guardian) or reject on the
-- mobile app. An accepted request produces a downloadable, professionally
-- formatted PDF permission letter carrying the parent's real digital signature.
--
-- Named student_event / student_event_participant (not "event"/"event_*") to
-- avoid any collision with the existing, unrelated calendar_event table (the
-- academic calendar) -- this is a student-attendance-consent workflow, not a
-- calendar entry.
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

-- Faculty-created event. monitoring_teacher_person_id references a real staff
-- member (picked via search in the app, not typed free text) so "their details"
-- (designation, phone, email) is always real, joined at read time from
-- staff/person -- never duplicated into this table.
CREATE TABLE student_event (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                           text NOT NULL,
  location                       text NOT NULL,
  purpose                        text NOT NULL,
  starts_at                      timestamptz NOT NULL,
  ends_at                        timestamptz NOT NULL,
  monitoring_teacher_person_id   uuid NOT NULL REFERENCES person (id),
  created_by                     uuid NOT NULL REFERENCES person (id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_student_event_time CHECK (ends_at > starts_at)
);

CREATE INDEX idx_student_event_created_by ON student_event (created_by);
CREATE INDEX idx_student_event_starts_at ON student_event (starts_at);

-- One row per student added to an event = one permission request. Multiple
-- active guardians of the same student can each see this same row; whichever
-- guardian decides first sets it (the backend row-locks the decision to prevent
-- a race between two parents). signature_object_key is set only once APPROVED,
-- pointing at a real PNG in the private "event-signatures" Supabase Storage
-- bucket -- never a base64 blob stored inline here, same real-storage-object-key
-- convention documents.ts/media_post_asset already use.
CREATE TABLE student_event_participant (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 uuid NOT NULL REFERENCES student_event (id) ON DELETE CASCADE,
  student_id               uuid NOT NULL REFERENCES student (id),
  state                    text NOT NULL DEFAULT 'PENDING',
  decided_by_person_id     uuid REFERENCES person (id),
  decided_at               timestamptz,
  signature_object_key     text,
  added_by                 uuid NOT NULL REFERENCES person (id),
  added_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_student_event_participant_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_student_event_participant_decision CHECK (
    (state = 'PENDING' AND decided_by_person_id IS NULL AND decided_at IS NULL AND signature_object_key IS NULL)
    OR (state = 'REJECTED' AND decided_by_person_id IS NOT NULL AND decided_at IS NOT NULL AND signature_object_key IS NULL)
    OR (state = 'APPROVED' AND decided_by_person_id IS NOT NULL AND decided_at IS NOT NULL AND signature_object_key IS NOT NULL)
  ),
  CONSTRAINT uq_student_event_participant UNIQUE (event_id, student_id)
);

CREATE INDEX idx_student_event_participant_student ON student_event_participant (student_id);
CREATE INDEX idx_student_event_participant_event_state ON student_event_participant (event_id, state);
