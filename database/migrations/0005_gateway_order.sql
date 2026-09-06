-- Backs the Parent app's real-time online fee payment feature (Razorpay). A payment
-- gateway order has to be created BEFORE we know its outcome, and — unlike the
-- existing Finance "Receive Payment" (offline CASH/CHEQUE/DD) flow — the parent
-- picks which of several obligations the amount should be split across, before the
-- payment is even confirmed. That intended split has to be remembered somewhere
-- between "order created" and "gateway webhook confirms it", since
-- payment_allocation itself only ever records an APPLIED split (see
-- PaymentsService.allocate — it requires payment.state = 'CONFIRMED' and applies to
-- fee_demand.paid_paise in the same breath). This table is that holding place: one
-- row per gateway order, deleted-in-spirit (left as history) once its payment
-- resolves.
--
-- gateway is its own column (not hardcoded) so a second online gateway can reuse
-- this table later without a schema change — only the CHECK constraint's allowed
-- list grows.
--
-- Purely additive: no existing columns touched.
-- NOT executed automatically — run this against Supabase yourself.

CREATE TABLE gateway_order (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid NOT NULL UNIQUE REFERENCES payment (id),
  student_id       uuid NOT NULL REFERENCES student (id),
  gateway          text NOT NULL,
  gateway_order_id text NOT NULL,
  -- [{ "feeDemandId": "...", "amountPaise": "..." }, ...] — the split this order's
  -- amount will be applied as, computed and validated server-side at order-creation
  -- time, replayed verbatim into PaymentsService.allocate() once the webhook
  -- confirms the payment.
  allocations      jsonb NOT NULL,
  created_by       uuid NOT NULL REFERENCES person (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gateway_order_gateway CHECK (gateway IN ('RAZORPAY')),
  CONSTRAINT uq_gateway_order_gateway_ref UNIQUE (gateway, gateway_order_id)
);

CREATE INDEX idx_gateway_order_student_id ON gateway_order (student_id);
