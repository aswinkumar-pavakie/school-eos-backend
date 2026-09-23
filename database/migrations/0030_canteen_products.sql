-- Canteen inventory -- the vendor's own product catalog (name, optional
-- image, quantity on hand, price per unit). This is the real source of
-- truth the reworked ledger (0031_canteen_transaction_items.sql) sells
-- against: charging a student now means picking real products/quantities
-- from THIS table, which is decremented atomically in the same transaction
-- as the wallet debit (see CanteenRepository.chargeWallet's own comment).
--
-- NOT executed automatically -- run this against Supabase yourself.

CREATE TABLE canteen_product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_object_key TEXT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  price_per_unit_paise BIGINT NOT NULL CHECK (price_per_unit_paise >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES person(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX canteen_product_active_idx ON canteen_product(is_active);

-- Also create the PUBLIC Supabase Storage bucket "canteen-products" yourself
-- (Storage tab -> New bucket -> name "canteen-products" -> Public bucket:
-- ON), the same way person-photos/media-posts/lms-materials were each
-- created for their own module -- product images are served the same
-- deterministic public-URL way as a person's profile photo.
