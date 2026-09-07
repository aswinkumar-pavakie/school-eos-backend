-- One Community login PER community, each identifiable by an email named
-- after its own community -- keeps the "one login = one community" model
-- (every proposal/activity/membership-request write already resolves
-- ownership from this exact login->community link, unchanged) while making
-- the logins themselves easy to tell apart.
--
-- 1) Renames the EXISTING Eco Club test login's email to match the new
--    convention (community1@schooleos.test -> ecoclubcommunity@gmail.com).
--    Same password, same role_assignment, same person -- only the identifier
--    changes. Use ecoclubcommunity@gmail.com to log in after this runs.
-- 2) Creates two NEW Community logins, one each for the other two real
--    communities (Literary & Debate Society, NCC / NSS Unit), same shape as
--    the original Eco Club seed in 0008_community_login.sql: a plain person +
--    login_identifier + user_credential + one role_assignment row scoped to
--    that one community. Same test password as every other seeded login in
--    this project (SMS@test123) -- same argon2id hash already used for the
--    Eco Club account, reused here rather than generating a new one, since
--    it's the identical password.
--
-- Purely additive/renaming: no existing person/community row deleted, no
-- destructive operation. NOT executed automatically — run this against
-- Supabase yourself.

-- 1) Rename Eco Club's existing login email
UPDATE person
SET email = 'ecoclubcommunity@gmail.com', updated_at = now()
WHERE id = '4737a078-086a-4438-b1ee-164e91b05959';

UPDATE login_identifier
SET value = 'ecoclubcommunity@gmail.com'
WHERE person_id = '4737a078-086a-4438-b1ee-164e91b05959'
  AND identifier_type = 'EMAIL';

-- 2) Literary & Debate Society login
DO $$
DECLARE
  v_person_id uuid;
  v_admin_person_id uuid := '5ec7d99f-8cb9-42af-845e-87d9b428e7f4'; -- Anand Krishnan (ADMIN)
  v_community_id uuid := '3894d171-d19d-48c9-8073-3403682be931'; -- Literary & Debate Society
BEGIN
  IF NOT EXISTS (SELECT 1 FROM login_identifier WHERE identifier_type = 'EMAIL' AND value = 'literarydebatesocietycommunity@gmail.com') THEN
    INSERT INTO person (first_name, last_name, email, status, created_by, updated_by)
    VALUES ('Literary & Debate Society', 'Coordinator', 'literarydebatesocietycommunity@gmail.com', 'ACTIVE', v_admin_person_id, v_admin_person_id)
    RETURNING id INTO v_person_id;

    INSERT INTO login_identifier (person_id, identifier_type, value, is_verified, verified_at)
    VALUES (v_person_id, 'EMAIL', 'literarydebatesocietycommunity@gmail.com', true, now());

    INSERT INTO user_credential (person_id, password_hash, must_change_password)
    VALUES (
      v_person_id,
      '$argon2id$v=19$m=19456,t=2,p=1$ShEmY68tROpbU6IFsYx0Wg$0/l20QBTxKPKNinB2rkOSNtrW/2yJNDqtWopQXdb7yU', -- SMS@test123
      false
    );

    INSERT INTO role_assignment (person_id, role_code, scope_type, scope_id, valid_from, status, assigned_by)
    VALUES (v_person_id, 'COMMUNITY', 'COMMUNITY', v_community_id, now(), 'ACTIVE', v_admin_person_id);
  END IF;
END $$;

-- 3) NCC / NSS Unit login
DO $$
DECLARE
  v_person_id uuid;
  v_admin_person_id uuid := '5ec7d99f-8cb9-42af-845e-87d9b428e7f4'; -- Anand Krishnan (ADMIN)
  v_community_id uuid := 'bc10afe5-5776-4443-a682-552ca90d5051'; -- NCC / NSS Unit
BEGIN
  IF NOT EXISTS (SELECT 1 FROM login_identifier WHERE identifier_type = 'EMAIL' AND value = 'nccnssunitcommunity@gmail.com') THEN
    INSERT INTO person (first_name, last_name, email, status, created_by, updated_by)
    VALUES ('NCC / NSS Unit', 'Coordinator', 'nccnssunitcommunity@gmail.com', 'ACTIVE', v_admin_person_id, v_admin_person_id)
    RETURNING id INTO v_person_id;

    INSERT INTO login_identifier (person_id, identifier_type, value, is_verified, verified_at)
    VALUES (v_person_id, 'EMAIL', 'nccnssunitcommunity@gmail.com', true, now());

    INSERT INTO user_credential (person_id, password_hash, must_change_password)
    VALUES (
      v_person_id,
      '$argon2id$v=19$m=19456,t=2,p=1$ShEmY68tROpbU6IFsYx0Wg$0/l20QBTxKPKNinB2rkOSNtrW/2yJNDqtWopQXdb7yU', -- SMS@test123
      false
    );

    INSERT INTO role_assignment (person_id, role_code, scope_type, scope_id, valid_from, status, assigned_by)
    VALUES (v_person_id, 'COMMUNITY', 'COMMUNITY', v_community_id, now(), 'ACTIVE', v_admin_person_id);
  END IF;
END $$;
