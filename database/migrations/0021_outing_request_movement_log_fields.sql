-- Hostel Warden mobile/website "Movement log" rebuild: the design's own
-- Movement log screen has the Warden author an exit entry directly while
-- the parent is on the phone (not approve a parent-app-submitted request),
-- capturing who called, their phone, a purpose category, and later
-- recording the actual return. None of that exists on outing_request today
-- -- requested_by/approval_request_id/decided_by are already nullable
-- (confirmed via information_schema), so a warden-authored row can leave
-- them null/self-referential without a schema conflict; these four columns
-- are the only genuinely new storage needed.
--
-- Purely additive: no existing columns/rows touched, no existing role's
-- access narrowed. NOT executed automatically -- run this against Supabase
-- yourself.

ALTER TABLE outing_request
  ADD COLUMN IF NOT EXISTS called_by_name TEXT,
  ADD COLUMN IF NOT EXISTS called_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS purpose_category TEXT,
  ADD COLUMN IF NOT EXISTS actual_return_at TIMESTAMPTZ;

ALTER TABLE outing_request
  ADD CONSTRAINT outing_request_purpose_category_check
  CHECK (purpose_category IS NULL OR purpose_category IN ('HOME_LEAVE', 'LOCAL_OUTING', 'MEDICAL', 'SCHOOL_EVENT', 'OTHER'));
