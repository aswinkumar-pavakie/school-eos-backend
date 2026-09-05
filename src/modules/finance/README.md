# Finance module

Covers brain's Feature 2 (Finance, Fees & Payments, 2.1–2.9): Fee Structure, Financial
Obligation, Bulk Import Job, Payment, Payment Allocation, Receipt, Refund, Expense,
Reconciliation — plus Concession, added after already-configured `approval_policy`
data (`FEE_CONCESSION`, a real 2-step FINANCE→PRINCIPAL chain) proved it's a live,
required feature even though it isn't one of the 9 numbered items. Depends on
`modules/approvals` (Feature 1) for refund/concession/fee-structure-activation
sign-off — see that module for the generic engine.

Still out of scope (real schema models, zero endpoints here, flagged not silently
built): Wallet & Canteen, Payroll.

**Verification status**: every endpoint below except Bulk Import and Reconciliation has
been exercised end-to-end against the live Supabase database (58/58 scripted checks
passing) — full CRUD, every state transition, every approval path, the payment
webhook's signature/replay handling, and every cross-cutting security rule (self-approval
block, role-mismatch rejection, over-allocation rejection). Bulk Import and
Reconciliation are code-complete and type-checked but **cannot run at all yet** — their
tables don't exist in the live database. See "Required migrations" below; this is the
one remaining step, and it's yours to run per the standing rule that this session never
writes to the database directly.

## Required migrations (not yet applied — confirmed by querying the live DB directly)

Run these in Supabase, in order, then `npx prisma db pull` to refresh `schema.prisma`:
- `database/migrations/0002_bulk_import_job.sql` — new table, blocks all of Bulk Import.
- `database/migrations/0003_reconciliation.sql` — two new tables, blocks all of Reconciliation.

Already applied (verified live): `0001_user_credential_reset_allowance.sql`, the
`staff_attendance_event → approval_request` FK, and a fuller `approval_policy` seed
than this module originally assumed (see below) — no further action needed for those.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/finance/fee-heads`, `/api/v1/finance/expense-categories` | `@Roles('FINANCE','ADMIN')` | Master data — without these, fee-structure lines and expenses have no valid IDs to reference. |
| GET/POST | `/api/v1/finance/fee-structures` | same | Create computes `total_paise` server-side from `lines`; never trusts a client-sent total. |
| GET/PATCH/DELETE | `/api/v1/finance/fee-structures/:id` | same | PATCH/DELETE only while `state = 'DRAFT'`. |
| POST | `.../activate` | same | **Does not activate directly** — creates a `FEE_STRUCTURE` approval request (approver `PRINCIPAL`), moves state to `PENDING_APPROVAL`. Only the approvals engine's decision moves it to `ACTIVE` (or back to `DRAFT` on rejection). |
| POST | `.../deactivate` | same | `ACTIVE → SUPERSEDED` only; never deletes. |
| GET/POST/DELETE | `/api/v1/finance/obligations` | same | Maps to `fee_demand` (no model literally named "obligation" exists). DELETE only for an unpaid `PENDING` row, and is a soft-cancel (`state = 'CANCELLED'`), not a hard delete. |
| POST | `.../:id/waive` | same | `PENDING`/`PARTIAL`/`OVERDUE` → `WAIVED` — writes off a balance without a payment. |
| GET/POST | `/api/v1/finance/obligation-imports` | same | Blocked — see "Required migrations". |
| POST | `.../:id/validate` \| `.../:id/confirm` \| `.../:id/cancel` | same | Client resubmits the same `rows[]` to both validate and confirm — no upload/parsing service exists yet, so there's nothing else to read rows back from. |
| GET/POST | `/api/v1/finance/payments` | same | `mode` is the real DB enum: `CASH`/`CHEQUE`/`DD` (offline, confirmed immediately under Finance's own authority) or `UPI`/`CARD`/`NETBANKING`/`WALLET_TOPUP` (gateway-mediated, creates an `INITIATED` intent only — requires `gateway`). |
| GET | `/api/v1/finance/payments/:id` | same | |
| POST | `/api/v1/finance/payment-events` | `@Public()` + `PaymentWebhookGuard` (HMAC) | The only path that can set `state = 'CONFIRMED'`. Verified live: valid signature confirms, invalid signature 401s, a replayed event is idempotent (no double-processing). |
| GET/POST | `.../:id/allocations` | `@Roles('FINANCE','ADMIN')` | Requires `state = 'CONFIRMED'`; double-capped (app-level 409 + DB CHECK) against both the payment total and each demand's remaining balance. Triggers receipt generation as a separate post-commit step. |
| GET/POST | `.../:id/receipt` | same | One receipt per student per payment; idempotent; `RC-{financialYear}-{seq}` numbering, retried on collision. |
| GET/POST | `.../:id/refunds` | same | Below `finance.refundAutoApproveThresholdPaise`: Finance clears it directly (`state = 'APPROVED'`). Above: routed through the approvals engine as request_type **`REFUND`** (the real seeded policy name — a genuine 2-step **FINANCE → PRINCIPAL** chain, not a single Principal step). Either way, `APPROVED` is not yet paid out. |
| POST | `/api/v1/finance/refunds/:id/process` | `@Roles('FINANCE')` | `APPROVED → PROCESSED` — Finance confirms the money has actually been sent; the real terminal state, distinct from `APPROVED`. |
| GET | `/api/v1/finance/refunds/:id` | `@Roles('FINANCE','ADMIN','PRINCIPAL')` | Principal needs this to view detail when tapping through from their approvals inbox. |
| GET/POST/PATCH/DELETE | `/api/v1/finance/concessions` | `@Roles('FINANCE','ADMIN')` | Every concession routes through `FEE_CONCESSION` (always 2-step, no threshold bypass, unlike Refund). `amountPaise`/`percent` is a strict XOR (DB-enforced; app-level check gives a clean 409). DELETE is a soft-cancel (`state='CANCELLED'`) and only while still open (undecided). |
| GET/POST/PATCH/DELETE | `/api/v1/finance/expenses` | `@Roles('FINANCE')` write, `+ADMIN` read | Real DB state machine: `RECORDED → PENDING_APPROVAL → APPROVED/REJECTED → PAID` (no `SUBMITTED`/`CANCELLED` states exist). PATCH/DELETE only while `RECORDED`. |
| POST | `.../:id/submit` | `FINANCE` | At/below the category's `petty_limit_paise`: auto-`APPROVED` immediately, Finance's own authority. Above: creates an `EXPENSE_ABOVE_PETTY` approval request (approver `PRINCIPAL`, single step) — decided via the generic `/approvals/{id}/approve\|reject`, **not** a Finance-specific endpoint. |
| POST | `.../:id/pay` | `FINANCE` | `APPROVED → PAID`. |
| GET/POST/DELETE | `/api/v1/finance/reconciliations` | `@Roles('FINANCE','ADMIN')` | Blocked — see "Required migrations". DELETE only while `DRAFT`. |
| POST | `.../:id/run` \| `.../:id/resolve` \| `.../:id/close` | same | `run` matches inline `settlementRows[]` against `payment` by `(gateway, gateway_ref)` and flips matched payments to `state='RECONCILED'`; `close` blocked while anything is `UNMATCHED`/`DISCREPANCY`. |
| POST | `/api/v1/approvals/:id/withdraw` | authenticated | Not Finance-specific — added to the generic engine (Feature 1) since `CANCELLED` is a real `approval_request` state: the requester (only) can withdraw their own still-open request. |

## Security posture

- **Every write to a money-affecting row goes through `UnitOfWork`** (`BEGIN`/`COMMIT`/`ROLLBACK`) — allocation + fee_demand update, refund/concession creation + approval-request creation, webhook confirmation + audit row, are each one transaction, never split across two commits that could disagree if the process crashes between them. (A real transaction-visibility bug was caught and fixed here during live testing: a post-write read inside the same transaction must use that transaction's own client, not the default pool, or it sees nothing.)
- **`payment.idempotency_key` is enforced at the DB level** (`UNIQUE`); a repeat of the same key returns the original payment, not an error or a duplicate charge — verified live.
- **The webhook is the only path that can CONFIRM an online payment.** Signature verification uses `crypto.timingSafeEqual` (constant-time) over the **raw** request body (`rawBody: true` in `main.ts`), not the re-parsed JSON.
- **Self-approval is blocked centrally, for every request type, in the approvals engine itself** (`ApprovalsService.decide`: `requestedBy === actor.personId` → 403) — not left to each feature to remember. Verified live for both fee-structure activation and refund step 1.
- **Refund and concession separation of duties is structural**: `REFUND`'s and `FEE_CONCESSION`'s approval_policy steps name `FINANCE`/`PRINCIPAL` roles the engine's `personHoldsRole` check resolves against real `role_assignment` rows — a caller can't satisfy a step by merely holding some role in general. Verified live: a second Finance person approving their colleague's refund step 1 succeeds; the *same* Finance person self-approving, or a wrong-role caller taking step 2, both 403.
- **Every money-mutating action writes an `audit_event` row** in the same transaction as the change. `outcome` is DB-constrained to exactly `SUCCESS`/`DENIED`/`ERROR` — the actual business decision (approved/rejected/auto-approved/etc.) lives in `action` + `afterData`, never in `outcome` itself (a real bug here — passing e.g. `'APPROVED'` as outcome — was caught by a live constraint violation and fixed everywhere).
- **All money fields are integer-paise `BigInt`/string end-to-end** — DTOs validate as digit-string, never `number`.
- **Allocation is double-capped**: app-level checks give a clean 409; the DB's own `paid_paise <= amount_paise + late_fee_paise` CHECK constraint backstops it regardless of any app-code bug.

## Corrections made after reading the live DB's actual CHECK constraints

Several assumptions made from the brain docs/API doc alone turned out to be wrong once
tested against the real schema's CHECK constraints — fixed, not worked around:
- `payment.mode` is `UPI`/`CARD`/`NETBANKING`/`CASH`/`CHEQUE`/`DD`/`WALLET_TOPUP`, not a generic `'ONLINE'`.
- `fee_structure.state` is `DRAFT`/`PENDING_APPROVAL`/`ACTIVE`/`SUPERSEDED`, not an invented `'INACTIVE'`.
- `expense.state` is `RECORDED`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED`/`PAID` — no `SUBMITTED`, no `CANCELLED`.
- `refund.state` includes a distinct terminal `PROCESSED` beyond `APPROVED` — "cleared to pay" and "money actually sent" are different states.
- `concession.concession_type` is a fixed vocabulary (`SIBLING`/`STAFF_WARD`/`SCHOLARSHIP`/`RTE`/`MERIT`/`HARDSHIP`/`GOVT_SCHEME`/`OTHER`); `amount_paise`/`percent` is a strict XOR.
- `fee_demand.state` includes `WAIVED` and `CANCELLED`, both now reachable via real endpoints.
- The approval_policy request_type for refunds is **`REFUND`** (a real 2-step FINANCE→PRINCIPAL chain), not an invented `REFUND_REQUEST` single Principal step — the engine's generic multi-step handling covered this correctly once the name matched.

## Assumptions still standing (flag if wrong)

- **No object-storage/file-parsing service exists yet.** Bulk import's `validate`/`confirm` and reconciliation's `run` take row data inline in the request body, not read back from `sourceObjectKey`/`settlementObjectKey`.
- **No payment gateway is integrated.** The webhook contract is gateway-agnostic by design; a real integration needs a thin per-gateway adapter mapping that provider's payload onto `PaymentWebhookDto`. `FINANCE_PAYMENT_WEBHOOK_SECRET` must be set (it is, locally) for the webhook to accept anything.
- **`FINANCE_REFUND_AUTO_APPROVE_THRESHOLD_PAISE`** defaults to ₹5,000 — a placeholder; override per school via env.
