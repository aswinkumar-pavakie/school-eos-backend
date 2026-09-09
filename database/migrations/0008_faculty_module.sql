-- Faculty mobile app module: class-leader/duty assignment, faculty's own
-- leave/on-duty requests, HR payroll queries, and appraisal. Everything else
-- the Faculty module needs (attendance, student leave, marks/exams,
-- announcements, homework, staff attendance, payroll/payslip, library) already
-- exists in the schema untouched -- only these four things are genuinely new.
--
-- Purely additive: no existing columns touched except one CHECK constraint
-- widened (staff_attendance_event.event_type gains 'ON_DUTY').
-- NOT executed automatically — run this against Supabase yourself.

-- Class leader / student duty assignment -- greenfield, no precedent anywhere
-- else in the schema (student_house/house are for the unrelated house system).
CREATE TABLE student_duty_assignment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES student (id),
  section_id        uuid NOT NULL REFERENCES section (id),
  academic_year_id  uuid NOT NULL REFERENCES academic_year (id),
  title             text NOT NULL,       -- e.g. "Class Leader", "Assistant Leader"
  duties            text,
  status            text NOT NULL DEFAULT 'ACTIVE',
  assigned_by       uuid NOT NULL REFERENCES person (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_student_duty_assignment_status CHECK (status IN ('ACTIVE', 'ENDED'))
);

CREATE INDEX idx_student_duty_assignment_section ON student_duty_assignment (section_id, status);
CREATE INDEX idx_student_duty_assignment_student ON student_duty_assignment (student_id);

-- Faculty's own leave/on-duty request -- mirrors student_leave_request's real
-- shape. Reuses the already-seeded STAFF_LEAVE_REQUEST approval_policy row
-- (-> PRINCIPAL, single step). OD is modeled as leave_type='ON_DUTY' on this
-- same table -- only one staff-leave-shaped policy exists, so a second table
-- for OD isn't warranted.
CREATE TABLE staff_leave_request (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               uuid NOT NULL REFERENCES staff (id),
  leave_type             text NOT NULL,
  from_date              date NOT NULL,
  to_date                date NOT NULL,
  reason                 text NOT NULL,
  attachment_object_key  text,
  attachment_file_name   text,
  state                  text NOT NULL DEFAULT 'PENDING',
  decided_by             uuid REFERENCES person (id),
  decided_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_leave_request_type CHECK (leave_type IN ('CASUAL', 'MEDICAL', 'EARNED', 'ON_DUTY')),
  CONSTRAINT chk_staff_leave_request_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_staff_leave_request_dates CHECK (to_date >= from_date)
);

CREATE INDEX idx_staff_leave_request_staff ON staff_leave_request (staff_id, state);

-- HR query/request (payroll correction, service certificate, etc.) -- real
-- two-step approval (Principal, then Finance) -- multi-step chains already
-- work the same way Concessions' own Finance -> Principal chain does.
CREATE TABLE staff_hr_request (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               uuid NOT NULL REFERENCES staff (id),
  category               text NOT NULL,
  subject                text NOT NULL,
  description            text,
  attachment_object_key  text,
  attachment_file_name   text,
  state                  text NOT NULL DEFAULT 'PENDING',
  approval_request_id    uuid REFERENCES approval_request (id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_hr_request_category CHECK (category IN
    ('SALARY_QUERY', 'PF_ESI', 'INCOME_TAX_DECLARATION', 'INCREMENT_ARREARS', 'BANK_ACCOUNT_CHANGE', 'SERVICE_CERTIFICATE')),
  CONSTRAINT chk_staff_hr_request_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_staff_hr_request_staff ON staff_hr_request (staff_id, state);

-- Appraisal -- fully greenfield (no precedent anywhere in the schema or brain
-- docs). Single approval step: Principal reviews/signs off.
CREATE TABLE staff_appraisal (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               uuid NOT NULL REFERENCES staff (id),
  cycle                  text NOT NULL,          -- e.g. "2026-2027"
  self_assessment        text NOT NULL,
  attachment_object_key  text,
  attachment_file_name   text,
  score                  numeric(5, 2),
  principal_remark       text,
  state                  text NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by            uuid REFERENCES person (id),
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_appraisal_state CHECK (state IN ('SUBMITTED', 'REVIEWED'))
);

CREATE INDEX idx_staff_appraisal_staff ON staff_appraisal (staff_id);

-- New approval_policy rows (STAFF_LEAVE_REQUEST -> PRINCIPAL already exists
-- from an earlier migration -- confirmed live, not duplicated here).
INSERT INTO approval_policy (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('STAFF_HR_REQUEST', '{}'::jsonb, 1, 'PRINCIPAL', false, 72, false, 'ACTIVE'),
  ('STAFF_HR_REQUEST', '{}'::jsonb, 2, 'FINANCE',   true,  72, false, 'ACTIVE'),
  ('STAFF_APPRAISAL',  '{}'::jsonb, 1, 'PRINCIPAL', true,  120, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;

-- Widen staff_attendance_event.event_type so an approved OD request has a real,
-- distinguishable event type instead of being conflated with a genuine ABSENT.
ALTER TABLE staff_attendance_event DROP CONSTRAINT staff_attendance_event_event_type_check;
ALTER TABLE staff_attendance_event ADD CONSTRAINT staff_attendance_event_event_type_check
  CHECK (event_type IN ('CHECK_IN', 'CHECK_OUT', 'ABSENT', 'ON_DUTY'));
