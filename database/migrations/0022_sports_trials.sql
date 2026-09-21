-- Sports Admin "Trials & selection" -- confirmed genuine gap (no trial/
-- selection table anywhere in the schema before this). Real fields ported
-- from the design's own EDITABLE.trials config: candidate(student), sport,
-- round, trial date, score (kept as free text -- real events score in very
-- different units: seconds, points, goals, subjective notes -- a single
-- numeric column would misrepresent most sports), and a real selection
-- status.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

CREATE TABLE sports_trial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id),
  sport_id UUID NOT NULL REFERENCES sport(id),
  round TEXT NOT NULL CHECK (round IN ('ROUND_1', 'ROUND_2', 'FINAL_ROUND')),
  trial_date DATE NOT NULL,
  score TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'HOLD', 'SELECTED', 'NOT_SELECTED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id)
);

CREATE INDEX sports_trial_student_id_idx ON sports_trial(student_id);
CREATE INDEX sports_trial_sport_id_idx ON sports_trial(sport_id);
CREATE INDEX sports_trial_status_idx ON sports_trial(status);
