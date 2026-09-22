-- New dedicated login role: CANTEEN_VENDOR -- canteen staff who charge a
-- student's prepaid wallet (table `wallet`, already real -- see
-- student-wallet.repository.ts) for a purchase. This role code was already
-- referenced in role.repository.ts's ROLE_MODULE_ACCESS map (['Finance &
-- Fees (device, wallet sales only)']) but never actually seeded into the
-- `role` table -- this migration is that missing seed row, same pattern as
-- 0019_sports_admin_role.sql.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

INSERT INTO role (code, name, is_core_login, description)
VALUES ('CANTEEN_VENDOR', 'Canteen', true, 'Canteen counter staff: search a student, charge their prepaid wallet for a purchase, and view the canteen sale history.')
ON CONFLICT (code) DO NOTHING;
