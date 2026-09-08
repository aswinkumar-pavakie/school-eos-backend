-- Adds the Purchase/Service Request workflow: Principal raises a request for goods
-- (GOODS) or a service (SERVICE), it routes through the existing approvals engine to
-- Finance (approve/reject), and once approved Finance tracks its physical fulfillment
-- (Ordered -> Dispatched -> In Transit -> Delivered/Part Delivered/Cancelled).
--
-- Not the same thing as brain's own "SOP / POP" (school-eos-frontend-workflow-by-
-- login-v2.txt, W2.4 "POLICY DOCUMENTS (SOP / POP)") — that's Principal publishing
-- policy documents with a staff-acknowledgement requirement, entirely unrelated to
-- purchasing. Named "Purchase Request" / "Service Request" here deliberately, to avoid
-- colliding with that already-documented, different feature. "Purchase requests,
-- vendor records" is real brain vocabulary though (same file, W1.9, item 4 — Admin's
-- own inventory/vendor CRUD) — this table is the backing for that concept, scoped to
-- the request+approval+fulfillment workflow specifically.
--
-- No existing table fits: equipment/equipment_issue is sports-gear issuance to
-- students/teams, not procurement; vendor is Wallet/Canteen-only (a concessionaire,
-- not a general supplier). department is real (academic departments, HOD-linked) and
-- is reused here as an optional "which department asked for this" tag.
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE purchase_request (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no           text NOT NULL UNIQUE,
  request_type           text NOT NULL DEFAULT 'GOODS',
  item_name              text NOT NULL,
  description            text,
  quantity               integer,
  vendor_name            text,
  estimated_amount_paise bigint,
  needed_by              date,
  department_id          uuid REFERENCES department (id),
  requested_by           uuid NOT NULL REFERENCES person (id),
  approval_request_id    uuid REFERENCES approval_request (id),
  state                  text NOT NULL DEFAULT 'PENDING',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_purchase_request_type CHECK (request_type IN ('GOODS', 'SERVICE')),
  CONSTRAINT chk_purchase_request_state CHECK (state IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT chk_purchase_request_quantity CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT chk_purchase_request_amount CHECK (estimated_amount_paise IS NULL OR estimated_amount_paise > 0)
);

CREATE INDEX idx_purchase_request_state ON purchase_request (state);
CREATE INDEX idx_purchase_request_requested_by ON purchase_request (requested_by);
CREATE INDEX idx_purchase_request_department_id ON purchase_request (department_id);
CREATE INDEX idx_purchase_request_approval_request_id ON purchase_request (approval_request_id);

-- One purchase_order per approved purchase_request — created the moment Finance
-- approves it, never before (an unapproved request has nothing to track yet).
CREATE TABLE purchase_order (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL UNIQUE REFERENCES purchase_request (id),
  order_no            text NOT NULL UNIQUE,
  quantity_ordered    integer NOT NULL,
  quantity_delivered  integer NOT NULL DEFAULT 0,
  quantity_allotted   integer NOT NULL DEFAULT 0,
  stage               text NOT NULL DEFAULT 'ORDERED',
  placed_on           date NOT NULL DEFAULT CURRENT_DATE,
  expected_on         date,
  created_by          uuid NOT NULL REFERENCES person (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_purchase_order_stage
    CHECK (stage IN ('ORDERED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PART_DELIVERED', 'CANCELLED')),
  CONSTRAINT chk_purchase_order_quantity_ordered CHECK (quantity_ordered > 0),
  -- "Allotment can never exceed this — the database enforces it" — delivered can
  -- never exceed ordered, and allotted (handed to the requesting department/faculty)
  -- can never exceed what was actually delivered.
  CONSTRAINT chk_purchase_order_quantity_delivered CHECK (quantity_delivered BETWEEN 0 AND quantity_ordered),
  CONSTRAINT chk_purchase_order_quantity_allotted CHECK (quantity_allotted BETWEEN 0 AND quantity_delivered)
);

CREATE INDEX idx_purchase_order_stage ON purchase_order (stage);

-- History trail behind each "Update stage" action (stage + quantity + a note), so the
-- order's detail view can show a real timeline, not just its current snapshot.
CREATE TABLE purchase_order_event (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  uuid NOT NULL REFERENCES purchase_order (id) ON DELETE CASCADE,
  stage              text NOT NULL,
  quantity_delivered integer,
  note               text,
  recorded_by        uuid NOT NULL REFERENCES person (id),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_purchase_order_event_stage
    CHECK (stage IN ('ORDERED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PART_DELIVERED', 'CANCELLED'))
);

CREATE INDEX idx_purchase_order_event_purchase_order_id ON purchase_order_event (purchase_order_id);

-- Seeds the approval routing this feature depends on immediately — a single
-- FINANCE step, per "the request should go directly, securely, to Finance".
INSERT INTO approval_policy
  (request_type, condition, sequence_no, approver_role_code, is_final, sla_hours, is_retrospective, status)
VALUES
  ('PURCHASE_REQUEST', '{}'::jsonb, 1, 'FINANCE', true, 72, false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_policy_step DO NOTHING;
