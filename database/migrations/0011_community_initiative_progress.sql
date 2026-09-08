-- Community Activity Progress & Outcome Tracking (Phase 7). Extends the
-- existing community_initiative table (Phase 6) -- deliberately NOT a new
-- entity/history table. No documented requirement calls for a full progress
-- timeline, and the existing AuditService already records a before/after
-- snapshot on every progress update and on completion, which already gives a
-- real historical record without a second mechanism (see
-- CommunityInitiativesService's audit calls). progress_notes is a single
-- overwritable field, same as the codebase's existing convention for this
-- shape of thing (e.g. repair_request.completion_notes) -- not a log table.
--
-- Purely additive: two new nullable columns, no existing rows touched, no
-- other table altered.
--
-- NOT executed automatically — run this against Supabase yourself.

ALTER TABLE community_initiative
  ADD COLUMN progress_notes text,
  ADD COLUMN outcome text;
