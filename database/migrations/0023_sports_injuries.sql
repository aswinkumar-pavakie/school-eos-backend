-- Sports Admin "Injuries & incidents" -- confirmed genuine gap (the only
-- "incident" tables in this schema are discipline-related, unrelated to
-- sports injuries -- see sports/injuries/page.tsx's own header comment
-- from the earlier build phase). Real fields ported from the design's own
-- EDITABLE.injuries config: title, student, incident date, whether the
-- guardian was informed (a real yes/no the Sports Admin genuinely knows),
-- and a real care status.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

CREATE TABLE sports_injury_incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id),
  sport_id UUID REFERENCES sport(id),
  title TEXT NOT NULL,
  description TEXT,
  incident_date DATE NOT NULL,
  guardian_informed BOOLEAN NOT NULL DEFAULT false,
  guardian_informed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'UNDER_CARE' CHECK (status IN ('UNDER_CARE', 'OBSERVATION', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES person(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES person(id)
);

CREATE INDEX sports_injury_incident_student_id_idx ON sports_injury_incident(student_id);
CREATE INDEX sports_injury_incident_status_idx ON sports_injury_incident(status);
