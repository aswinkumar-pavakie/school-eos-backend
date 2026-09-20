-- Sports Admin mobile audit (this build) confirmed four genuine backend
-- gaps -- no table/route for any of these existed anywhere in the schema
-- before this migration. Purely additive: no existing columns/rows touched,
-- no existing role's access narrowed. NOT executed automatically -- run
-- this against Supabase yourself.

-- 1) Practice Plan -- a real weekly training plan for a squad, genuinely
-- separate from sports_training_session (which is real day-of scheduling +
-- attendance, not a forward-looking weekly structure). weekly_focus is
-- JSONB keyed by weekday name ("MONDAY".."SUNDAY") -> free-text focus,
-- since a rigid per-day column set would force every plan into a fixed
-- weekly shape.
CREATE TABLE sports_practice_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES team(id),
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekly_focus JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id),
  CHECK (end_date >= start_date)
);
CREATE INDEX sports_practice_plan_team_id_idx ON sports_practice_plan(team_id);
CREATE INDEX sports_practice_plan_status_idx ON sports_practice_plan(status);

-- 2) Sports Result Entry -- covers both the design's "Entry results" (create
-- + list) and "Result verification" (the same rows, filtered to PENDING,
-- with a verify/reject action) as one state machine rather than two
-- disconnected tables: DRAFT (entered, not submitted) -> PENDING (submitted
-- for verification) -> VERIFIED or REJECTED. Deliberately separate from
-- fixture_result, which is team-level (win/loss/score for a fixture) --
-- this is per-athlete, per-event (e.g. one sprinter's 100m time at a meet),
-- a genuinely different real concept. event_name/result_value stay free
-- text for the same reason sports_trial.score does: events across sports
-- are scored in incompatible units (seconds, points, goals, subjective
-- placement).
CREATE TABLE sports_result_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id),
  sport_id UUID NOT NULL REFERENCES sport(id),
  tournament_id UUID REFERENCES tournament(id),
  event_name TEXT NOT NULL,
  result_value TEXT NOT NULL,
  position TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'VERIFIED', 'REJECTED')),
  verified_by UUID REFERENCES person(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id)
);
CREATE INDEX sports_result_entry_student_id_idx ON sports_result_entry(student_id);
CREATE INDEX sports_result_entry_sport_id_idx ON sports_result_entry(sport_id);
CREATE INDEX sports_result_entry_status_idx ON sports_result_entry(status);

-- 3) Selection Window -- a time-boxed period during which a sport's squad
-- selection is open, genuinely distinct from sports_trial (an individual
-- candidate's trial record) -- this is the surrounding administrative
-- window, not a candidate-level row.
CREATE TABLE sports_selection_window (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID NOT NULL REFERENCES sport(id),
  title TEXT NOT NULL,
  opens_on DATE NOT NULL,
  closes_on DATE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id),
  CHECK (closes_on >= opens_on)
);
CREATE INDEX sports_selection_window_sport_id_idx ON sports_selection_window(sport_id);
CREATE INDEX sports_selection_window_status_idx ON sports_selection_window(status);

-- 4) Substitute Coach -- a time-boxed coverage assignment for a squad,
-- genuinely distinct from team.coach_id (a single overwritable "current
-- coach" field with no history/time-box concept at all).
CREATE TABLE sports_substitute_coach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES team(id),
  original_coach_id UUID REFERENCES coach(id),
  substitute_coach_id UUID NOT NULL REFERENCES coach(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id),
  CHECK (end_date >= start_date)
);
CREATE INDEX sports_substitute_coach_team_id_idx ON sports_substitute_coach(team_id);
CREATE INDEX sports_substitute_coach_status_idx ON sports_substitute_coach(status);
