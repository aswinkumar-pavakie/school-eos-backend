-- New dedicated login role: SPORTS_ADMIN -- a real, separate login for the
-- Sports Admin School dashboard rebuild (brain/Copy of Sports admin school
-- dashboard design/Sports Admin School.dc.html), distinct from the existing
-- SPORTS_FACULTY scope tag (which is not a login role at all -- it's a
-- role_assignment(scope_type='SPORT') layered on top of a FACULTY login,
-- authorizing only that one person's own assigned sport(s); see
-- sports-faculty.repository.ts's own header comment).
--
-- SPORTS_ADMIN is school-wide oversight across every sport, the same
-- relationship MEDIA_ROOM has to the whole Media module -- same precedent,
-- see 0006_media_room.sql.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

INSERT INTO role (code, name, is_core_login, description)
VALUES ('SPORTS_ADMIN', 'Sports Admin', true, 'School-wide sports department oversight: teams, training, tournaments, achievements, equipment, coaches, indents and OD requests across every sport.')
ON CONFLICT (code) DO NOTHING;
