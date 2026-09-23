-- Line items for a canteen sale -- what a student actually bought, per
-- product/quantity, instead of canteen_transaction's own single flat
-- amount_paise. product_name/unit_price_paise are SNAPSHOTS at sale time
-- (never re-joined live against canteen_product), so a later price change
-- or product deletion never rewrites history -- exactly the same snapshot
-- convention as every other financial line-item table in this codebase
-- (e.g. fee_demand_line). product_id is nullable + ON DELETE SET NULL so a
-- hard-deleted product still leaves its sale history intact under its
-- snapshotted name.
--
-- NOT executed automatically -- run this against Supabase yourself.

CREATE TABLE canteen_transaction_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES canteen_transaction(id) ON DELETE CASCADE,
  product_id UUID REFERENCES canteen_product(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
  line_total_paise BIGINT NOT NULL CHECK (line_total_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX canteen_transaction_item_tx_idx ON canteen_transaction_item(transaction_id);

-- The charged total (canteen_transaction.amount_paise) can now legitimately
-- differ from the sum of these line totals -- the counter vendor is allowed
-- to manually adjust the final charge (a discount, a rounding correction)
-- while the line items always keep the real, unadjusted sale record used
-- for inventory deduction and reporting. Both figures are kept, deliberately
-- never collapsed into one.
ALTER TABLE canteen_transaction
  ADD COLUMN items_total_paise BIGINT;
