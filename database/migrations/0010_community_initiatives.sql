-- Community Activities/Initiatives (Phase 6 of the standalone Community
-- application). Named `community_initiative` in the database, deliberately
-- NOT `community_activity` -- that name is already taken by the existing,
-- unrelated Communities/PTA feature's own table (Admin-owned: id,
-- community_id, title, description, scheduled_at, venue, status[SCHEDULED/
-- COMPLETED/CANCELLED], created_by -- Phase 4's read-only view of it). Reusing
-- that name/table for this would mean Community writing into a table Admin
-- exclusively owns today, and its status lifecycle doesn't match what's
-- needed here anyway. This is a genuinely separate, Community-owned entity;
-- the user-facing route/label stays "Activities" per the approved frontend
-- naming, only the backend table name differs to avoid the collision.
--
-- Purely additive: one new table, no existing rows touched, no existing
-- tables altered.
--
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE community_initiative (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES community (id),
  -- One initiative per approved proposal -- UNIQUE prevents a Community user
  -- from initializing the same approved proposal twice.
  proposal_id    uuid NOT NULL UNIQUE REFERENCES community_proposal (id),
  title          text NOT NULL,
  description    text NOT NULL,
  status         text NOT NULL DEFAULT 'PLANNED',
  planned_date   date,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_by     uuid NOT NULL REFERENCES person (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_community_initiative_status CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED')),
  CONSTRAINT chk_community_initiative_completed_ts CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_community_initiative_community_id ON community_initiative (community_id);
