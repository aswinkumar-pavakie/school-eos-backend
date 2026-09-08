# Hostel Warden module

Mobile-only role. 9 operational features on top of Admin's hostel-structure
module (`src/modules/hostel`, which stays the only writer of
hostel/block/room/bed/allocation data).

## Status (as of 2026-09-07 — all 9 features now live)

All 9 features are wired into `AppModule` (`HostelWardenModule` +
`HostelWardenPendingModule`) — the tables/columns the last 3 needed were
created and confirmed live on 2026-09-07 (see `query.md`).

| Feature | Backing table(s) |
|---|---|
| Night Attendance | `hostel_attendance` (existing, was unused before this) |
| Gate Pass | `outing_request` + `gate_pass` + the generic `approvals` engine (existing, was unused before this) — **needs the `approval_policy` seed in `query.md` to actually route to a Warden; not yet run** |
| Emergency Exit | same as Gate Pass — see modeling note below — **same outstanding seed** |
| Visitor Log | `hostel_visitor` (existing, was unused before this) |
| Class Absence Alert | derived — reads `attendance_record` (read-only, via `AttendanceRecordsService`) + `hostel_allocation`, writes only to `notification` |
| Room & Bed View | read-only, reuses `HostelModule`'s own repositories |
| Study Attendance | `hostel_study_session` / `hostel_study_attendance` (new, created 2026-09-07) |
| Parent Call Request | `hostel_call_request` (new, created 2026-09-07) |
| Hostel Complaints | existing `complaint` + 4 new nullable columns (added 2026-09-07) |

`HostelWardenPendingModule`'s own header comment tracks this history.

## Authorization / hostel-scoping

`@Roles('HOSTEL_WARDEN')` only proves "this caller is *a* hostel warden
somewhere" — every request re-derives, server-side, from the JWT `personId`
alone:

```
personId -> staff (PeopleModule.StaffRepository.findByPersonId, must be ACTIVE)
         -> hostelIds (WardenAssignmentRepository, v_active_role_assignment,
                        role_code='HOSTEL_WARDEN', scope_type='HOSTEL')
```

See `warden-context.service.ts`. This mirrors `ClassAdvisorRepository`
(messaging module) and `ApproverAssignmentRepository.personHoldsRole`
(approvals module) exactly — `role_assignment` is the real authorization
source, not `hostel.warden_staff_id` (a pre-existing, untouched legacy field).
Admin grants a warden through the **already-existing** generic
role-assignment endpoint (`scope_type='HOSTEL'` was already a valid value —
no new Admin code needed).

Cross-hostel access (a real record whose derived hostel isn't in the caller's
`hostelIds`) returns 404, matching the project's existing "not found vs not
yours both 404" convention (`getScoped`/`getOwnedDetailOrThrow`-style helpers
throughout).

## Emergency Exit modeling

Emergency Exit reuses the same `outing_request` table as Gate Pass — same
shape, same lifecycle — distinguished purely by the `approval_request.request_type`
string (`HOSTEL_GATE_PASS_REQUEST` vs `HOSTEL_EMERGENCY_EXIT_REQUEST`) and by
separate controllers/services/DTOs/endpoints. On approval, one shared
`SubjectStateHandler` (`hostel-warden-approval-handlers.service.ts`) issues the
matching `gate_pass` row, setting `is_emergency`/`emergency_reason` from the
request's own type — exactly what those columns were already modeled for.

## Hostel Complaints modeling

Reuses the generic `complaint`/`complaint_update` tables as-is (category,
severity, `assigned_to`, state machine, SLA) — `category` is fixed to
`'HOSTEL'` server-side (already a valid value on the real, live CHECK
constraint), and the finer-grained issue type (fan/plumbing/etc, which the task
actually asks for) goes into a new `issue_type` column, since no existing
column carries it. See `query.md` for the exact DDL and the real
`complaint.state`/`category` CHECK constraints (verified live, not assumed —
the task brief's suggested `ASSIGNED` state doesn't exist on the real table).

## Endpoints

See the plan file / final report for the full list — all `/hostel/*` routes
are `@Roles('HOSTEL_WARDEN')`; parent-initiated creation
(`/parent/hostel/*`) lives in `src/modules/parent` (Gate Pass, Emergency Exit)
or in this module's `HostelWardenPendingModule` (Call Request), gated
`@Roles('PARENT')` + a real `guardian_link` check.

## Verified

`npx tsc --noEmit`, `npm run build`, `npm run lint`, and the full Jest suite
(173/173) all clean, both before and after wiring in the 3 previously-pending
features. The real app was bootstrapped 5 times total via `npm run start:dev` /
`node dist/main.js` during development, the last one after the migration ran —
every route across all 9 features mapped, zero DI-resolution errors each time.

Full request-level E2E (`curl` with a real Warden/Parent login) still needs:
the `approval_policy` seed for the 2 outing-request types (confirmed **not**
run yet — `SELECT ... FROM approval_policy WHERE request_type LIKE 'HOSTEL%'`
returns 0 rows), and a real `HOSTEL_WARDEN` `role_assignment` grant to a real
staff member (neither exists in this DB yet). See `query.md`.
