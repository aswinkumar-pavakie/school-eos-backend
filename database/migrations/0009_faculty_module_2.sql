-- Faculty module, part 2: Current Term (LMS), Parent Meetings (real
-- scheduling + booking), and Payslip's own request category. Everything
-- here is additive only (new tables, or one new CHECK-constraint value on
-- an existing table) -- nothing existing is altered or dropped.
--
-- Run this yourself against the real database, exactly like every prior
-- migration this session, then confirm back so the backend build can
-- proceed against it.

-- ============================================================
-- Current Term (LMS) -- Google-Classroom-style per (faculty, subject).
-- The top-level "subject folder" itself is NOT a physical row: it's derived
-- at read time by grouping the faculty's own real subject_offering rows by
-- subject_id (one faculty + one subject = one folder, regardless of how many
-- sections/classes they teach it to -- exactly the point: multiple classes
-- share the same folder, only lms_folder_share below controls which classes
-- can see any one specific materials sub-folder inside it).
-- ============================================================

-- A named sub-folder inside "Materials" (e.g. "Unit 1"), owned by one
-- specific staff member for one specific subject.
CREATE TABLE lms_folder (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff (id),
  subject_id   uuid NOT NULL REFERENCES subject (id),
  title        text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Which of the faculty's own classes (subject_offering rows for this same
-- staff+subject) can currently see this folder's files. Editable any time --
-- add/remove a row here and visibility changes immediately, matching "edit
-- the folder later and change which class it's shared with".
CREATE TABLE lms_folder_share (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id            uuid NOT NULL REFERENCES lms_folder (id) ON DELETE CASCADE,
  subject_offering_id  uuid NOT NULL REFERENCES subject_offering (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lms_folder_share UNIQUE (folder_id, subject_offering_id)
);

-- The actual uploaded files inside one folder.
CREATE TABLE lms_file (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    uuid NOT NULL REFERENCES lms_folder (id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  object_key   text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  uploaded_by  uuid NOT NULL REFERENCES person (id),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

-- Classwork/task -- scoped to one real class (subject_offering) at a time;
-- the same subject+faculty teaching two different sections gets two
-- genuinely separate task lists, one per subject_offering (never shared
-- across classes, unlike Materials' own folder-level share list).
CREATE TABLE lms_task (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_offering_id    uuid NOT NULL REFERENCES subject_offering (id),
  created_by             uuid NOT NULL REFERENCES person (id),
  title                  text NOT NULL,
  description            text,
  due_date               date,
  attachment_object_key  text,
  attachment_file_name   text,
  status                 text NOT NULL DEFAULT 'OPEN',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_lms_task_status CHECK (status IN ('OPEN', 'CLOSED'))
);

-- Lesson plan -- same per-class scoping as Task above.
CREATE TABLE lms_lesson_plan (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_offering_id    uuid NOT NULL REFERENCES subject_offering (id),
  created_by             uuid NOT NULL REFERENCES person (id),
  title                  text NOT NULL,
  content                text NOT NULL,
  week_start             date,
  attachment_object_key  text,
  attachment_file_name   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lms_folder_staff_subject ON lms_folder (staff_id, subject_id);
CREATE INDEX idx_lms_task_offering ON lms_task (subject_offering_id);
CREATE INDEX idx_lms_lesson_plan_offering ON lms_lesson_plan (subject_offering_id);

-- ============================================================
-- Parent Meetings -- faculty creates real bookable time slots; a parent
-- (out of scope here -- only a minimal creation path exists, same
-- "not polished, just enough to be real" convention as student_leave_request's
-- own Parent-side creation) books one; the owning faculty approves/rejects.
-- No generic-approvals routing here -- there is no role-chain to resolve,
-- just "the slot's own creator decides", so this is a plain ownership check,
-- not a policy-driven approval.
-- ============================================================

CREATE TABLE staff_meeting_slot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff (id),
  meeting_date  date NOT NULL,
  from_time     time NOT NULL,
  to_time       time NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_meeting_slot_time CHECK (to_time > from_time)
);

CREATE TABLE staff_meeting_booking (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id       uuid NOT NULL REFERENCES staff_meeting_slot (id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES student (id),
  requested_by  uuid NOT NULL REFERENCES person (id),
  notes         text,
  state         text NOT NULL DEFAULT 'PENDING',
  decided_by    uuid REFERENCES person (id),
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_meeting_booking_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- At most one active (still-pending-or-approved) booking per slot at a time.
CREATE UNIQUE INDEX uq_staff_meeting_booking_active
  ON staff_meeting_booking (slot_id)
  WHERE state IN ('PENDING', 'APPROVED');

CREATE INDEX idx_staff_meeting_slot_staff ON staff_meeting_slot (staff_id, meeting_date);
CREATE INDEX idx_staff_meeting_booking_slot ON staff_meeting_booking (slot_id);

-- ============================================================
-- Payslip request -- reuses staff_hr_request's own existing two-step
-- Principal -> Finance approval_policy exactly as-is (already seeded in
-- 0008_faculty_module.sql); this is just one more real category value on
-- the same real table, so "request a payslip" behaves identically to every
-- other HR request already built, no new policy/table needed.
-- ============================================================

ALTER TABLE staff_hr_request DROP CONSTRAINT chk_staff_hr_request_category;
ALTER TABLE staff_hr_request ADD CONSTRAINT chk_staff_hr_request_category CHECK (category IN
  ('SALARY_QUERY', 'PF_ESI', 'INCOME_TAX_DECLARATION', 'INCREMENT_ARREARS', 'BANK_ACCOUNT_CHANGE', 'SERVICE_CERTIFICATE', 'PAYSLIP_REQUEST'));
