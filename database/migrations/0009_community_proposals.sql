-- Community Proposals/Requests (Phase 5 of the standalone Community application).
-- A Community user (an authorized representative of one specific community/PTA
-- group) submits a proposal; it routes through the EXISTING generic approvals
-- engine to a single PRINCIPAL step -- same shape as MEDIA_INDENT in
-- 0006_media_room.sql. No new approval system, no duplicate audit system.
--
-- Purely additive: one new table, one new approval_policy row, and one UPDATE
-- to the existing Community test account's own role_assignment row (correcting
-- its scope from school-wide to one specific community, per the approved
-- product decision that a Community login represents ONE community, not all
-- of them -- see the "Resolve authorized Community" requirement).
--
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE community_proposal (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        uuid NOT NULL REFERENCES community (id),
  requested_by        uuid NOT NULL REFERENCES person (id),
  title               text NOT NULL,
  description         text NOT NULL,
  status              text NOT NULL DEFAULT 'PENDING',
  approval_request_id uuid REFERENCES approval_request (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_community_proposal_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK'))
);

CREATE INDEX idx_community_proposal_community_id ON community_proposal (community_id);
CREATE INDEX idx_community_proposal_requested_by ON community_proposal (requested_by);

-- Community proposes; Principal reviews, single step, final -- matches the
-- approved Phase 5 decision (Principal as reviewer, same pattern precedent as
-- MEDIA_INDENT's Principal-only routing).
INSERT INTO approval_policy
  (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('COMMUNITY_PROPOSAL', '{}'::jsonb, 1, 'PRINCIPAL', true, 72, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;

-- Scope the existing Community test account (created in 0008_community_login.sql)
-- to one specific real community -- "Eco Club" -- so server-side resolution of
-- "this Community user's authorized community" has a real row to resolve to.
-- role_assignment.scope_type already allows 'COMMUNITY' (pre-existing, used for
-- the unrelated Faculty-side COMMUNITY_INCHARGE assignment) -- this reuses that
-- exact mechanism for the new COMMUNITY login role instead of inventing a new
-- identity/profile table. Safe: a plain UPDATE on one existing test row, no
-- data deleted, no other row touched.
UPDATE role_assignment
SET scope_type = 'COMMUNITY', scope_id = 'abe811ce-4963-4068-bddc-155a933c2445' -- Eco Club
WHERE person_id = '4737a078-086a-4438-b1ee-164e91b05959' -- community1@schooleos.test
  AND role_code = 'COMMUNITY'
  AND status = 'ACTIVE';
