# Permissions module (Parent Consent)

Backend-only module letting Faculty request parental consent for student
participation in an activity (field trip, media consent, sports, etc.) and
Parents review and explicitly consent or decline. **Not registered in
`AppModule` yet** — `permission_activity` and `permission_request` do not exist
in the database. Every route here would 500 against a live server until the
migration below has been run. See the project's `.claude/CLAUDE.md` hard rule:
this module never executes DDL/DML itself.

## Domain model

Two tables, not one flat "permission" table:

- **`permission_activity`** — the shared thing Faculty creates once (one
  field trip, one term's media consent, etc.).
- **`permission_request`** — one row per targeted student, independently
  trackable. A trip to two students fans out into two independent
  `permission_request` rows; Parent A only ever sees Student A's row.

The spec's "decision" field is folded into `permission_request.status` itself
(`PENDING | CONSENTED | DECLINED | EXPIRED | CANCELLED`) rather than a separate
column, to avoid the two ever drifting out of sync.

## Authorization (live, never cached)

- **Faculty**: authorized for a `(section, academic_year)` if they currently
  have an ACTIVE `subject_offering` row there, OR an ACTIVE `role_assignment`
  with `role_code='CLASS_ADVISOR'`, `scope_type='SECTION'`,
  `scope_id=<section.id>`. Dual role collapses to one authorization, never a
  duplicate. Re-derived on every request — never from
  `permission_activity.created_by_staff_id` alone, so a reassigned/revoked
  faculty immediately loses access to activities they created.
- **Parent**: authorized for a `permission_request` only via an ACTIVE
  `guardian_link` to that exact student AND an ACTIVE `student_enrolment`
  matching the *activity's own* `(section, academic_year)` — not just any
  enrolment the student has ever had. A revoked guardian link, closed
  enrolment, or year/section mismatch immediately removes access. Unauthorized
  access is 404, identical to "doesn't exist" — never 403 (see
  `PERMISSION_ERRORS` in `src/common/errors/error-codes.ts`).

## Expiry — computed live, never physically written

There is no cron job or background worker. A `PENDING` request whose parent
activity's `response_deadline` has passed is treated as `EXPIRED` by every
read and every consent/decline check (`permission-status.util.ts`), without
rewriting the row. Faculty status summaries and Parent list/detail all reflect
this the same way.

## Cancellation cascade

Cancelling an activity (`PermissionActivityService.cancel`) sets the activity
to `CANCELLED` and cascades to still-`PENDING` requests only — `CONSENTED`/
`DECLINED` rows are historical decisions and are never touched. Both writes
happen in one `UnitOfWork` transaction. Cancelling an already-cancelled
activity is a 409 conflict, not a silent no-op.

## Multiple guardians

Any ACTIVE guardian may respond for a student. Once a request is resolved
(`CONSENTED`/`DECLINED`), a second guardian requesting the *same* decision is
idempotent (no second write, same response returned); requesting the
*opposite* decision is rejected as a 409 conflict — the first decision is
never silently overwritten. Concurrency is enforced by
`PermissionRequestRepository.claimDecision`'s atomic
`UPDATE ... WHERE status = 'PENDING'`.

## Reusable participation check

`PermissionRequestService.isStudentConsented(permissionRequestId, studentId)`
— for future modules (Trips/Sports/Activities/Events, not implemented here) to
check whether a specific student's consent is currently, effectively
`CONSENTED` (never `PENDING`/`DECLINED`/`CANCELLED`/`EXPIRED`, and never
scoped to the wrong student).

## API

**Faculty** (`@Roles('FACULTY')`):
- `POST /api/v1/permissions/activities` — create; `allStudents: true` resolves
  the live roster server-side, or `studentIds: string[]` with each id
  independently re-validated against the target section+year.
- `GET /api/v1/permissions/activities` — list, scoped to live-authorized
  sections.
- `GET /api/v1/permissions/activities/:activityId`
- `PATCH /api/v1/permissions/activities/:activityId` — title/description/
  activityDate/startTime/endTime/responseDeadline only; academic year,
  section, permission type, student membership, and creator can never change.
- `POST /api/v1/permissions/activities/:activityId/cancel`
- `GET /api/v1/permissions/activities/:activityId/status` — consent summary
  (total/consented/declined/pending/expired/cancelled).

**Parent** (`@Roles('PARENT')`):
- `GET /api/v1/permissions/requests` — list, scoped to the caller's own
  currently-active wards only.
- `GET /api/v1/permissions/requests/:requestId`
- `POST /api/v1/permissions/requests/:requestId/consent`
- `POST /api/v1/permissions/requests/:requestId/decline` — optional
  `{ reason?: string }` body.

## Database design (documentation only — not executed)

The SQL below is the exact proposal for the eventual migration. **No DDL has
been run.** Per `.claude/CLAUDE.md`, this belongs in `query.md` for the user to
run in the Supabase SQL Editor once the design is approved — it is reproduced
here as the required design documentation, not as something already applied.

```sql
CREATE TABLE permission_activity (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id    uuid NOT NULL REFERENCES academic_year(id),
  section_id          uuid NOT NULL REFERENCES section(id),
  created_by_staff_id uuid NOT NULL REFERENCES staff(id),
  title               varchar(200) NOT NULL,
  description         varchar(2000),
  permission_type     varchar(30) NOT NULL CHECK (permission_type IN (
                        'ONE_TIME_ACTIVITY', 'ANNUAL_CONSENT', 'TERM_CONSENT',
                        'MEDIA_CONSENT', 'TRIP', 'SPORTS', 'OTHER')),
  activity_date       date NOT NULL,
  start_time          time NOT NULL,
  end_time            time NOT NULL,
  response_deadline   date NOT NULL,
  status              varchar(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'CANCELLED')),
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES person(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  CHECK (response_deadline <= activity_date)
);
CREATE INDEX idx_permission_activity_section_year
  ON permission_activity (section_id, academic_year_id);
CREATE INDEX idx_permission_activity_created_by
  ON permission_activity (created_by_staff_id);

CREATE TABLE permission_request (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id            uuid NOT NULL REFERENCES permission_activity(id),
  student_id             uuid NOT NULL REFERENCES student(id),
  status                 varchar(20) NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN
                             ('PENDING', 'CONSENTED', 'DECLINED', 'EXPIRED', 'CANCELLED')),
  responded_by_person_id uuid REFERENCES person(id),
  signed_at              timestamptz,
  decline_reason         varchar(500),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, student_id)
);
CREATE INDEX idx_permission_request_activity ON permission_request (activity_id);
CREATE INDEX idx_permission_request_student ON permission_request (student_id);
```

- `permission_activity.status`/`permission_request.status` are plain
  `varchar` + `CHECK`, matching this codebase's existing enum convention (see
  `conversation.status`, `online_class.status`) rather than a Postgres `ENUM`
  type.
- The `UNIQUE (activity_id, student_id)` constraint on `permission_request` is
  what makes `createMany`'s bulk insert safe against duplicate fan-out, and is
  the DB-level backstop behind the idempotency logic in
  `PermissionRequestService`.
- No `parent_person_id` column on either table, by design — parent access is
  always re-derived through `guardian_link` + `student_enrolment`, never
  stored (see "Authorization" above).

## Tests

`permission-activity.service.spec.ts` and `permission-request.service.spec.ts`
cover the full FACULTY/PARENT/STATUS/AUDIT/SECURITY test list from the design
prompt (64 tests) against mocked repositories, following the same methodology
as `messaging.service.spec.ts` — the real SQL join semantics only mean
something against a real Postgres query, which doesn't exist yet for this
module.
