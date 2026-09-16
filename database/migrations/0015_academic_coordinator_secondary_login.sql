-- Lets Admin give an Academic Coordinator assignment its OWN separate login
-- (own email + own password), distinct from the faculty member's own faculty
-- login -- per product decision: the two must be genuinely separate
-- credentials, and Admin must be able to trace a coordinator login back to
-- the real faculty member it was created for.
--
-- Mirrors the exact, already-proven pattern this project uses for Community
-- logins (see 0008_community_login.sql / 0014_community_logins_named_per_
-- community.sql): a brand-new `person` row with its own login_identifier +
-- user_credential + role_assignment, NOT a second credential bolted onto an
-- existing person (this app's identity model is one login = one person,
-- kept as-is here rather than special-cased). The one addition beyond that
-- proven pattern is the link table below, which is what makes this
-- traceable back to the real teacher -- Community logins don't need that
-- (a community "person" row has no real individual behind it to trace to).
--
-- Nothing here is a schema change to `person`/`login_identifier`/
-- `user_credential`/`role_assignment` -- those are used exactly as they
-- already are for every other role. Purely additive: one new table, no
-- existing row touched. NOT executed automatically -- run this against
-- Supabase yourself.

CREATE TABLE academic_coordinator_login (
  coordinator_person_id uuid PRIMARY KEY REFERENCES person(id) ON DELETE CASCADE,
  faculty_person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  created_by uuid REFERENCES person(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One coordinator login per real faculty member -- if their coverage
  -- changes (different stage, more standards), Admin edits/adds
  -- role_assignment rows under the SAME coordinator_person_id, never
  -- creates a second coordinator login for the same teacher.
  UNIQUE (faculty_person_id)
);

CREATE INDEX idx_academic_coordinator_login_faculty ON academic_coordinator_login (faculty_person_id);

COMMENT ON TABLE academic_coordinator_login IS
  'Links a separate, coordinator-only login (person/login_identifier/user_credential/role_assignment rows created just like any other account) back to the real faculty member it was created for -- purely for Admin traceability ("which faculty has this coordinator email"). The coordinator role_assignment itself is owned by coordinator_person_id, not faculty_person_id -- the two are deliberately different accounts.';
