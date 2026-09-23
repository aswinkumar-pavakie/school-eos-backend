-- New, real backend for 4 of the 5 Faculty "Campus" tiles -- confirmed
-- first that none of these already exist as usable live tables (Food
-- Court's full canteen/wallet system is ERD-documented but not confirmed
-- live and is a much bigger subsystem than a faculty ordering flow needs;
-- Medical's real tables are a walk-in incident log, not bookable; Copy
-- Center/Stationery have no existing tables at all -- the closest thing,
-- purchase_request/purchase_order, is itself an unexecuted migration file,
-- not live data). "House" needs no new table -- `house` already exists
-- live with real data, just no Faculty-facing read endpoint yet.
--
-- Each of these 4 follows the same simple Apply/History shape as the
-- already-live staff_leave_request (own status field, no generic
-- approval_request hookup -- these are fulfillment queues, not
-- manager-approval flows). NOT executed automatically -- run against
-- Supabase yourself.

CREATE TABLE IF NOT EXISTS campus_food_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES person(id),
  items text NOT NULL,
  pickup_time text,
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','READY','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campus_food_order_requested_by ON campus_food_order (requested_by);

CREATE TABLE IF NOT EXISTS campus_medical_appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES person(id),
  preferred_date date NOT NULL,
  preferred_time text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campus_medical_appointment_requested_by ON campus_medical_appointment (requested_by);

CREATE TABLE IF NOT EXISTS campus_copy_center_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES person(id),
  description text NOT NULL,
  quantity integer,
  needed_by date,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','READY','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campus_copy_center_order_requested_by ON campus_copy_center_order (requested_by);

CREATE TABLE IF NOT EXISTS campus_stationery_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES person(id),
  items text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','READY','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campus_stationery_order_requested_by ON campus_stationery_order (requested_by);
