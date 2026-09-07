-- Community Login (Phase 1 of the Community module): a new real login (role
-- COMMUNITY), same shape as MEDIA_ROOM's own addition in 0006_media_room.sql --
-- a plain INSERT into the existing `role` table, no new authentication tables.
-- Its own explicit identity, not Admin's or Principal's: a separate role_code,
-- checked the exact same way RolesGuard already checks every other role.
--
-- role_assignment.scope_type already allows a 'COMMUNITY' value (used to scope
-- the existing, unrelated COMMUNITY_INCHARGE *assignment* -- a Faculty
-- responsibility, mobile-only, to one specific community) -- this migration
-- does not touch that. This is a distinct thing: a brand-new role_code for a
-- dedicated web login, assigned here with scope_type='SCHOOL' (school-wide),
-- same as every other non-scoped login (Admin, Principal, Finance, Library,
-- Media Room).
--
-- Purely additive: no existing columns or rows touched.
-- NOT executed automatically — run this against Supabase yourself.

INSERT INTO role (code, name, is_core_login, description)
VALUES ('COMMUNITY', 'Community', true, 'Community module (foundation phase): dedicated web login for community/PTA-style engagement management. Read-only identity only for now -- no module built yet.')
ON CONFLICT (code) DO NOTHING;

-- One real test account, same shape as the existing MEDIA_ROOM test account
-- (media.room@schooleos.test) -- no `staff` row, scope_type SCHOOL, password
-- SMS@test123 hashed with this backend's own ARGON2_OPTIONS
-- (argon2id, memoryCost 19456, timeCost 2, parallelism 1 -- see
-- src/modules/identity/identity.util.ts), so it authenticates through the
-- exact same login path as every other account, no special-casing.
DO $$
DECLARE
  v_person_id uuid;
  v_admin_person_id uuid := '5ec7d99f-8cb9-42af-845e-87d9b428e7f4'; -- Anand Krishnan (ADMIN)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM login_identifier WHERE identifier_type = 'EMAIL' AND value = 'community1@schooleos.test') THEN
    INSERT INTO person (first_name, last_name, email, status, created_by, updated_by)
    VALUES ('Community', 'Coordinator', 'community1@schooleos.test', 'ACTIVE', v_admin_person_id, v_admin_person_id)
    RETURNING id INTO v_person_id;

    INSERT INTO login_identifier (person_id, identifier_type, value, is_verified, verified_at)
    VALUES (v_person_id, 'EMAIL', 'community1@schooleos.test', true, now());

    INSERT INTO user_credential (person_id, password_hash, must_change_password)
    VALUES (
      v_person_id,
      '$argon2id$v=19$m=19456,t=2,p=1$ShEmY68tROpbU6IFsYx0Wg$0/l20QBTxKPKNinB2rkOSNtrW/2yJNDqtWopQXdb7yU', -- SMS@test123
      false
    );

    INSERT INTO role_assignment (person_id, role_code, scope_type, valid_from, status, assigned_by)
    VALUES (v_person_id, 'COMMUNITY', 'SCHOOL', now(), 'ACTIVE', v_admin_person_id);
  END IF;
END $$;
