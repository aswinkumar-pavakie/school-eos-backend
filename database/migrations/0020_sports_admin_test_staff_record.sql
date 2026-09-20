-- Data-only fix, not a schema migration: the seeded SPORTS_ADMIN test login
-- (sathishpsportsadmin1@sms.in, person_id 9bdd57ec-b87c-4897-aab3-4ec8c06704f3)
-- has a role_assignment but no matching `staff` row. GET /staff/me (used by
-- the Sports mobile app's own Profile screen, and already real/broadened for
-- SPORTS_ADMIN alongside VICE_PRINCIPAL) 404s for this account as a result
-- ("No staff record is associated with this account") -- confirmed live via
-- a direct API call during this build's own testing pass. This is a test-
-- data gap, not a code defect: a real Sports Admin onboarded through normal
-- HR would already have a staff row, the same as Principal/VP.
--
-- Purely additive, one row, this one test person only. NOT executed
-- automatically -- run this against Supabase yourself.

INSERT INTO staff (person_id, employee_no, designation, is_teaching, date_of_joining, status)
VALUES ('9bdd57ec-b87c-4897-aab3-4ec8c06704f3', 'SPT-ADM-001', 'Sports Administrator', false, CURRENT_DATE, 'ACTIVE')
ON CONFLICT DO NOTHING;
