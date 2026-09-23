-- Gives the Class Teacher (Advisor) role a persistent, section-scoped login,
-- separate from the faculty member's own faculty login -- mirrors the exact
-- proven pattern already used for Academic Coordinator logins (see
-- 0015_academic_coordinator_secondary_login.sql): a brand-new `person` row
-- with its own login_identifier + user_credential, not a second credential
-- bolted onto an existing person.
--
-- The difference from Academic Coordinator: a class-teacher login belongs to
-- the SECTION (e.g. "Grade 10 - A"), not to one faculty member for life.
-- `section` rows are recreated every academic year (see uq_section:
-- academic_year_id + grade_id + medium_id + name), so the stable identity
-- for "Grade 10 - A" across years is (grade_id, section_name) -- that's what
-- class_teacher_login keys on. class_teacher_login_assignment then records,
-- year by year, which real section_id and which real faculty_person_id
-- currently sits behind that login -- exactly one ACTIVE row at a time
-- (enforced below), with every past row kept as year-wise history.
--
-- The CLASS_ADVISOR role_assignment itself is granted to login_person_id,
-- never to faculty_person_id -- same deliberate separation as Coordinator.
--
-- Purely additive: two new tables, no existing row touched. NOT executed
-- automatically -- run this against Supabase yourself.

CREATE TABLE IF NOT EXISTS class_teacher_login (
  login_person_id uuid PRIMARY KEY REFERENCES person(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES grade(id),
  section_name text NOT NULL,
  created_by uuid REFERENCES person(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One class-teacher login per (grade, section label), forever -- when the
  -- advisor changes at year rollover, Admin reassigns the SAME login via a
  -- new class_teacher_login_assignment row, never creates a second login.
  UNIQUE (grade_id, section_name)
);

CREATE INDEX IF NOT EXISTS idx_class_teacher_login_grade ON class_teacher_login (grade_id);

COMMENT ON TABLE class_teacher_login IS
  'Persistent, section-scoped login identity for the Class Teacher (Advisor) seat of one (grade, section_name) -- reused across whichever faculty member holds it and across academic years. See class_teacher_login_assignment for the year-wise holder history.';

CREATE TABLE IF NOT EXISTS class_teacher_login_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_teacher_login_id uuid NOT NULL REFERENCES class_teacher_login(login_person_id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_year(id),
  section_id uuid NOT NULL REFERENCES section(id),
  faculty_person_id uuid NOT NULL REFERENCES person(id),
  assigned_by uuid REFERENCES person(id),
  assigned_on timestamptz NOT NULL DEFAULT now(),
  unassigned_on timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED'))
);

-- Single-holder invariant: a class-teacher login can only be "live" as one
-- (year, section, faculty) at a time -- matches this project's own
-- single-holder convention (current academic year, primary guardian, active
-- class advisor per section).
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_teacher_login_assignment_active
  ON class_teacher_login_assignment (class_teacher_login_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_class_teacher_login_assignment_faculty ON class_teacher_login_assignment (faculty_person_id);
CREATE INDEX IF NOT EXISTS idx_class_teacher_login_assignment_year ON class_teacher_login_assignment (academic_year_id);

COMMENT ON TABLE class_teacher_login_assignment IS
  'Year-wise history of which real faculty_person_id (and which real section_id, since section rows are recreated per year) has stood behind a class_teacher_login at any point. Exactly one ACTIVE row per class_teacher_login_id.';
