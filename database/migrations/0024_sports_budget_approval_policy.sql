-- Sports Admin "Budget & approvals" -- no new table needed at all: this
-- reuses the SAME real purchase_request/approval engine equipment indents
-- already run through (see sports-equipment-indents.controller.ts's own
-- header comment: "reuses Finance's own purchase_request/purchase_order
-- tables ... exactly the same reuse shape"), just requestType='SERVICE'
-- instead of 'GOODS' (a budget ask with no physical item), under its own
-- approval_request_type so it's tracked and reported on separately from
-- equipment. Same real 2-step Principal-then-Finance sequence already live
-- for SPORTS_EQUIPMENT_REQUEST (confirmed via a live, read-only query of
-- approval_policy), matching the design's own status vocabulary exactly:
-- Pending principal -> Awaiting finance -> Approved / Rejected.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

INSERT INTO approval_policy
  (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('SPORTS_BUDGET_REQUEST', '{}'::jsonb, 1, 'PRINCIPAL', false, 72, false, 'ACTIVE'),
  ('SPORTS_BUDGET_REQUEST', '{}'::jsonb, 2, 'FINANCE', true, 72, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;
