-- Phase 13 (Community Initiative Planning & Scheduling): the one genuinely
-- missing planning field. community_initiative already has planned_date
-- (Phase 6) -- this adds venue, the same "where" field the sibling
-- Admin-owned community_activity table already uses for its own scheduling
-- (see 0010_community_initiatives.sql's own comment on that table: id,
-- community_id, title, description, scheduled_at, venue, status, created_by).
-- Reusing that exact field name/type is "genuinely required by the actual
-- product design" (there's a direct precedent in this same schema), not an
-- invented event-system field.
--
-- No new start/end-time fields: planned_date (a plain date, Phase 6) already
-- covers "when", and the sibling table itself only ever paired one timestamp
-- with one venue -- not separate start/end fields -- so matching that
-- precedent means adding venue alone, nothing more.
--
-- Purely additive: one nullable column, no existing rows touched.
-- NOT executed automatically — run this against Supabase yourself.



