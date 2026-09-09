-- Academic Coordinator (Faculty-side academic operations, scoped by real
-- role_assignment rows -- role_code='ACADEMIC_COORDINATOR' already exists in
-- the `role` table and is already in real, active use today; scope_type
-- STAGE/GRADE/SCHOOL + scope_stage/scope_id are already fully supported by
-- role_assignment's own existing CHECK constraints). No new scope model, no
-- new role model -- this migration is a SINGLE additive column, needed only
-- for the Coordinator's own draft-then-publish timetable workflow.
--
-- Run this yourself against the real database, exactly like every prior
-- migration this session, then confirm back so the backend build can
-- proceed against it.

-- Existing 1666 real timetable_slot rows all get DEFAULT false (published),
-- so the already-shipped Faculty Timetable screen's behavior is completely
-- unchanged for every row that exists today. A Coordinator's own new/edited
-- slot starts true (draft, invisible to faculty) until they explicitly
-- publish it -- see faculty-academic-coordinator.service.ts.
ALTER TABLE timetable_slot ADD COLUMN is_draft boolean NOT NULL DEFAULT false;

CREATE INDEX idx_timetable_slot_draft ON timetable_slot (is_draft) WHERE is_draft;
