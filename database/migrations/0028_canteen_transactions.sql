-- Real canteen sale ledger -- one row per wallet charge made at the
-- canteen counter. `wallet` (balance_paise/status/version) already existed
-- for freeze/unfreeze (see student-wallet.repository.ts's own header
-- comment: "enforced wherever the wallet is actually charged -- POS/mobile,
-- out of scope here") but nothing recorded an actual purchase/spend
-- anywhere -- this table is that missing spend record, and CanteenService
-- is the first real "wherever the wallet is actually charged" the old
-- comment was pointing at.
--
-- `card_uid` is nullable and unused for now -- there is no physical NFC
-- reader wired up yet, so every charge today is entered by the canteen
-- staff manually searching and selecting the student (see CanteenController
-- 'students/search'); the column exists so a real card-tap flow can be
-- plugged in later (matching id_card.card_uid) without another migration.
--
-- NOT executed automatically -- run this against Supabase yourself.

CREATE TABLE canteen_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student(id),
  wallet_id UUID NOT NULL REFERENCES wallet(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  balance_after_paise BIGINT NOT NULL,
  card_uid TEXT,
  performed_by UUID REFERENCES person(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX canteen_transaction_student_id_idx ON canteen_transaction(student_id);
CREATE INDEX canteen_transaction_created_at_idx ON canteen_transaction(created_at DESC);
