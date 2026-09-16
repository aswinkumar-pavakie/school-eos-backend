-- Lets an Academic Coordinator formally review a class's real published exam
-- results (the same computation Performance already shows -- class average,
-- pass rate, grade distribution, per-student marks) and record a real
-- decision: Verified, or Sent back with a comment for the class's teachers
-- to follow up on. This is a genuinely new concept -- the real `mark` table
-- only has ENTERED/PUBLISHED states; there was no coordinator-level review
-- step before this. Deliberately one row per (section, exam) -- matching
-- what the coordinator actually reviews as one unit (Performance's own
-- per-section, per-exam view) -- not one row per individual subject-paper,
-- which would need touching the teacher's own per-subject publish flow
-- (a separate, larger, real workflow change not made here).
--
-- Purely additive: one new table, no existing row touched, no existing
-- teacher-facing publish behaviour changed. NOT executed automatically --
-- run this against Supabase yourself.

CREATE TABLE exam_verification (
  section_id uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status = ANY (ARRAY['PENDING', 'VERIFIED', 'SENT_BACK'])),
  comment text,
  decided_by uuid REFERENCES person(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, exam_id)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_exam_verification_updated BEFORE UPDATE ON exam_verification
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE exam_verification IS
  'An Academic Coordinator''s real review decision on one section''s real published results for one exam (Verified, or Sent back with a comment) -- does not itself alter the underlying mark rows or the teacher''s own publish state.';
