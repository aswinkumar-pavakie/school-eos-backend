# Approvals module (Feature 1 — the generic approvals engine)

Every feature that needs sign-off (Finance's refunds, concessions, fee-structure
activation, expenses above petty-cash today) calls `ApprovalsService.createRequest`
in-process, inside its own transaction, and registers a `SubjectStateHandler` (see
`subject-state.registry.ts`) for its `subject_object_type` — the engine flips that
object's state atomically with the decision, without knowing anything about the
owning feature's tables.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/approvals` | authenticated | The caller's inbox: `?status=PENDING` (default) shows requests currently awaiting a decision from one of the caller's roles, scope-checked against their own `role_assignment`; `?status=APPROVED\|REJECTED` shows requests *this exact person* decided. Sorted closest-due-first. |
| POST | `/api/v1/approvals` | authenticated | Rarely called directly — see module comment. `requestedBy` is always the caller, never client-supplied. |
| GET | `/api/v1/approvals/:id` | requester or an assigned-role approver | |
| POST | `/api/v1/approvals/:id/approve` | the resolved current-step approver | Comment optional. |
| POST | `/api/v1/approvals/:id/reject` | same | Comment **required** — the design system is explicit ("Reject always demands a reason"). |
| POST | `/api/v1/approvals/:id/withdraw` | the original requester only | `CANCELLED` is a real `approval_request` state distinct from `REJECTED` (a rejection is someone else's decision; a withdrawal is the requester's own). Only valid while still open. |

## Security posture (verified live against the real database)

- **Self-approval is blocked centrally**, for every request type: `decide()` checks `requestedBy === actor.personId` before anything else, regardless of role match.
- **A step's approver is resolved dynamically from `role_assignment`**, not stored on the step — `personHoldsRole` checks the caller actually holds the step's `approver_role_code` (optionally scoped, via `payload.approverScope`), so a role held "in general" doesn't satisfy a step assigned to someone else.
- **Multi-step chains advance correctly**: a non-final step decision advances `current_step` and leaves the request `PENDING`; only the final step's approval flips the request (and its subject) to a terminal state. Verified live with `REFUND`'s real 2-step FINANCE→PRINCIPAL chain.
- **Every decision writes an audit_event row and an outbox notification to the requester**, in the same transaction as the state change.

## Corrections made after reading the live DB directly

`approval_policy` was already seeded — richer than this module's schema-only research
assumed. Request-type names are the DB's own, not invented: `REFUND` (not
`REFUND_REQUEST`, 2-step FINANCE→PRINCIPAL), `FEE_CONCESSION` (2-step, unconditional),
`FEE_STRUCTURE` (single step, PRINCIPAL), `EXPENSE_ABOVE_PETTY` (single step,
PRINCIPAL), plus `STAFF_LEAVE_REQUEST`/`PRINCIPAL_LEAVE_REQUEST`/`STUDENT_LEAVE_REQUEST`
from an earlier pass. Always read `approval_policy` directly before assuming a
request_type needs seeding — it may already exist under a different name.
