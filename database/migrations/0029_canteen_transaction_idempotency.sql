-- Idempotency for canteen wallet charges -- a real money-mutating endpoint
-- reachable from a physical counter device, where a network retry after a
-- timeout (the request actually succeeded server-side, but the client
-- never saw the response) is a genuine risk, not a theoretical one. The
-- client now sends a UUID `idempotencyKey` per charge ATTEMPT (generated
-- once when the staff picks the student, reused on any client-side retry
-- of that exact same attempt); CanteenRepository.chargeWallet checks this
-- column first and returns the original result instead of debiting twice
-- if the same key is replayed. The partial unique index (only enforced
-- when the key is present) means existing rows from before this migration
-- -- which have no key -- are completely unaffected.
--
-- Purely additive: no existing columns/rows touched, nothing narrowed.
-- NOT executed automatically -- run this against Supabase yourself.

ALTER TABLE canteen_transaction ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS canteen_transaction_idempotency_key_idx
  ON canteen_transaction (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
