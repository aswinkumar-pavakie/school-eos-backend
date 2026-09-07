-- Community Membership Requests -- lets the standalone Community login
-- propose adding/removing a member of its OWN community, reviewed by
-- Principal through the EXISTING generic approvals engine (same shape as
-- 0009_community_proposals.sql's own COMMUNITY_PROPOSAL policy row). No new
-- approval system, no new audit system, no change to the existing
-- Admin-owned community_membership table's own direct-write path
-- (community-memberships.controller.ts) -- Admin can still add/remove
-- members directly; this is an ADDITIONAL, Community-initiated path into the
-- exact same community_membership table, gated by Principal approval instead
-- of Admin authority.
--
-- Deliberately simpler than community_proposal: no SENT_BACK/resubmission --
-- a rejected request is terminal; the Community can just submit a new one.
--
-- Purely additive: one new table, one new index, two new approval_policy rows.
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE community_membership_request (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        uuid NOT NULL REFERENCES community (id),
  action              text NOT NULL CHECK (action IN ('ADD', 'REMOVE')),
  -- ADD: the existing student to add (never a new person/student record).
  -- REMOVE: which existing membership row to deactivate.
  -- Exactly one of the two is set, matching the action -- enforced below.
  student_id          uuid REFERENCES student (id),
  membership_id       uuid REFERENCES community_membership (id),
  role_in_community    text CHECK (role_in_community IS NULL OR role_in_community IN ('MEMBER', 'LEAD')),
  status              text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approval_request_id uuid REFERENCES approval_request (id),
  requested_by        uuid NOT NULL REFERENCES person (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_community_membership_request_action_fields CHECK (
    (action = 'ADD' AND student_id IS NOT NULL AND membership_id IS NULL)
    OR (action = 'REMOVE' AND membership_id IS NOT NULL AND student_id IS NULL)
  )
);

CREATE INDEX idx_community_membership_request_community_id ON community_membership_request (community_id);

-- Community proposes; Principal reviews, single step, final -- same shape as
-- COMMUNITY_PROPOSAL's own policy row.
INSERT INTO approval_policy
  (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('COMMUNITY_MEMBERSHIP_ADD', '{}'::jsonb, 1, 'PRINCIPAL', true, 72, false, 'ACTIVE'),
  ('COMMUNITY_MEMBERSHIP_REMOVE', '{}'::jsonb, 1, 'PRINCIPAL', true, 72, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;
