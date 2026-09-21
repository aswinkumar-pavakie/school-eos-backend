-- Equipment catalog items had no status/active flag at all -- no soft-delete
-- path existed anywhere for this table (confirmed live: id/name/sport_id/
-- quantity_total/quantity_available/condition only). Adds a real status
-- column so the Sports Admin console's own Equipment screen can offer a
-- genuine Delete (soft, via status='RETIRED') instead of no delete
-- capability at all or a fabricated one.

ALTER TABLE equipment
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RETIRED'));
