# Online Classes module (Faculty)

Owns `online_class` and `online_class_reschedule` (see
`database/migrations/0002_online_classes.sql`). Faculty schedules/views/reschedules/
cancels their own online classes and attaches a recording afterward. Google
Calendar/Meet integration (Phase 6/7) is **not** implemented here — see "Google
integration boundary" below.

Reads `staff` and `subject_offering` narrowly (own repositories in this module, same
pattern as identity's `PersonRepository`) since the modules that will eventually own
those tables (people/academics) don't exist as real code yet.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/online-classes` | `@Roles('FACULTY')` | Requires `Idempotency-Key` header. Creates `status='DRAFT'`, `meeting_creation_status='PENDING'` — no Google call is made. Retrying with the same header from the same faculty returns the original record, never a duplicate. |
| GET | `/api/v1/online-classes/my-subject-offerings` | `@Roles('FACULTY')` | Backs the mobile Schedule form's class/section picker (added for the mobile Online Classes UI — no timetable/academics module exists to source this from elsewhere). Returns the caller's own `ACTIVE` subject offerings (`{id, subjectName, gradeName, sectionName}[]`), resolved via the same `staff.id` lookup every other endpoint here uses — never a client-supplied id. Declared before `:id` below so it isn't swallowed by that param route. |
| GET | `/api/v1/online-classes?view=upcoming\|completed\|cancelled` | `@Roles('FACULTY')` | Scoped to the caller's own classes only. `upcoming` = `DRAFT`/`SCHEDULED`/`LIVE`. |
| GET | `/api/v1/online-classes/:id` | `@Roles('FACULTY')` | 404s (not 403) if the class exists but belongs to a different faculty. |
| PATCH | `/api/v1/online-classes/:id/reschedule` | `@Roles('FACULTY')` | Only from `DRAFT`/`SCHEDULED`. Writes `online_class_reschedule` before updating the parent row, in one transaction, then (Phase 8) syncs the new time to the existing Google Calendar event — see below. |
| PATCH | `/api/v1/online-classes/:id/cancel` | `@Roles('FACULTY')` | Only from `DRAFT`/`SCHEDULED`. Sets `status='CANCELLED'` on the existing row — never deletes it. (Phase 8) also deletes the Google Calendar event first. |
| PATCH | `/api/v1/online-classes/:id/start` | `@Roles('FACULTY')` | (Phase 8) `SCHEDULED -> LIVE`. No body — the backend performs the transition, never a client-supplied status. |
| PATCH | `/api/v1/online-classes/:id/complete` | `@Roles('FACULTY')` | (Phase 8) `LIVE -> COMPLETED`. No body. This is what makes `/recording` reachable. |
| PATCH | `/api/v1/online-classes/:id/recording` | `@Roles('FACULTY')` | Only when `status='COMPLETED'`. |

## Authorization (Phase 5)

- The caller's `staff.id` is always resolved server-side from `actor.personId` (the
  JWT-verified identity) via `StaffRepository.findByPersonId` — the client never
  supplies `facultyStaffId` anywhere, on any endpoint.
- Scheduling requires `subject_offering.teacher_staff_id === (resolved) staff.id` and
  `subject_offering.status = 'ACTIVE'`. A mismatch and a nonexistent offering return the
  exact same 404 (`Subject offering not found`) — never distinguishable, mirroring the
  HLD's 404-not-403 rule for out-of-scope objects.
- Every other endpoint re-derives "is this mine" the same way: `online_class` not found
  and `online_class` found-but-not-mine both return the same 404 (`Online class not
  found`).
- A person with a `FACULTY` role assignment but no matching `staff` row (or a `staff`
  row with `status='EXITED'`) is rejected with 403 (`Authenticated user is not an active
  faculty member`) — this is an actor-integrity failure, not an object-scope one, so it
  doesn't follow the 404 convention above.

## Business validation (Phase 5)

- `endTime` must be after `startTime` (checked in the service before the DB's own
  `chk_online_class_time_range` would reject it, so the client gets a clean 400 instead
  of a raw constraint violation).
- Cannot schedule/reschedule into the past.
- A faculty cannot have two non-cancelled online classes overlapping on the same date
  (checked via `OnlineClassRepository.hasOverlap`) — enforced at the application layer
  only; the migration deliberately left this as a business rule rather than a DB
  `EXCLUDE` constraint for MVP.
- Reschedule/cancel are only valid from `DRAFT`/`SCHEDULED` — attempting either on an
  already `COMPLETED` or `CANCELLED` class returns 409.

## Google OAuth (Phase 6)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/online-classes/google/connect` | `@Roles('FACULTY')` | Returns `{ data: { authUrl } }` — the client opens this in a browser. Resolves the caller's own `staff.id` first (never trusts a client-supplied one), then 503s with a clear message if Google isn't configured, rather than returning a broken URL. |
| GET | `/api/v1/online-classes/google/callback` | `@Public()` | Google's redirect target — hit by a plain browser navigation with no `Authorization` header, so identity comes from the signed `state` param instead (`oauth-state.util.ts`), re-verified against `staff` again before anything is stored. Always returns plain JSON: `{ data: { success, message, googleAccountEmail? } }`. |

**Requires** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY_V1` in `.env` (see
`.env.example`) — a Google Cloud "Web application" OAuth client with the Calendar API
enabled. These are **not** required for the app to boot or for any other endpoint in
this module to work; only `/connect` and `/callback` need them, and both fail with a
clear `503` (not a crash) if they're missing.

- **Scopes requested**: `calendar.events`, `openid`, `email` — the minimum needed to
  create/update Calendar events and to know which Google account got connected.
- **`access_type=offline&prompt=consent`** on every consent URL — guarantees a
  `refresh_token` even on a reconnect, since Google only issues one by default on the
  very first consent.
- **Only the refresh token is persisted** (encrypted, in `google_account_connection`).
  Access tokens are never stored — they're always re-derived from the refresh token
  when actually needed (Phase 7's job).
- **Encryption**: AES-256-GCM, key read from `ConfigService` (never hard-coded),
  selected by `encryption_key_id` on the row — rotating to a new key later means adding
  a new env var + a new case in `google-token-crypto.util.ts`'s key map, not migrating
  every existing row immediately.
- **One connection per faculty** (`staff_id` is the table's primary key) — reconnecting
  overwrites the previous tokens (`ON CONFLICT (staff_id) DO UPDATE`), it doesn't error.

## Google Calendar + Meet creation (Phase 7)

`schedule()` now calls `ensureMeetingCreated()` immediately after the DRAFT row exists
(on the fresh-create path, and on both idempotent-replay paths) — see
`online-classes.service.ts`. It never throws on a Google problem: scheduling already
succeeded (the row exists); a Google failure is reported via
`meetingCreationStatus`/`meetingCreationError` on the same 200 response, not as an HTTP
error, so the class stays retryable.

**State machine**, enforced entirely by `OnlineClassRepository.claimForMeetingCreation`
(a single atomic `UPDATE`, not application-level locking):
- Claimable from `PENDING` or `FAILED` unconditionally.
- Claimable from `CREATING` only if it's been stuck there over 30 seconds (a genuinely
  slow/async Google conference, or a crashed attempt) — a *fresh* `CREATING` row is
  never reclaimed, which is what actually stops two concurrent `schedule()` calls (or a
  literal duplicate HTTP retry) from both calling Google for the same class.
- Never reclaims `SUCCEEDED` — `ensureMeetingCreated` short-circuits before even
  attempting the claim once `meetingCreationStatus` is already `SUCCEEDED`, so a plain
  idempotent replay after success never touches Google again.

**Duplicate prevention** is this claim, not Google's `conferenceData.createRequest.requestId`
— `requestId` only protects re-attaching a conference to an *already-existing* event
(which is what happens on a retry: `existingEventId` is set, so `GoogleCalendarService`
calls `events.get` to re-check, never `events.insert` again for that class).

**Async conference handling**: after `events.insert`, if
`conferenceData.createRequest.status.statusCode` is `"pending"`, the service polls
`events.get` up to 3 times (700ms/1400ms/2100ms backoff) before giving up for this
request — if it's still pending, the event id is persisted (so a retry checks the same
event) but `meetingCreationStatus` stays `CREATING` and `status` stays `DRAFT`. The Meet
URL is never assumed to exist just because `events.insert` returned.

**On success**: `google_calendar_event_id`, `google_meet_id`, `meeting_url` are stored
and `status` flips to `SCHEDULED` — all three only ever get written together, in
`markMeetingSucceeded`, never partially.

**Expired/revoked Google authorization**: detected via Google's `invalid_grant` error on
token refresh. On this, `google_account_connection.status` is set to `NEEDS_REAUTH`
*and* the class is marked `FAILED` with a message telling the faculty to reconnect —
reconnecting is the existing Phase 6 `/connect` flow (its `ON CONFLICT (staff_id) DO
UPDATE` already resets `status` back to `ACTIVE`), no new endpoint needed.

**Timezone**: read from the `school` singleton row (`SchoolRepository.getTimezone()`,
falling back to `Asia/Kolkata` only if that row is somehow missing) rather than
hard-coded, since the schema already models it.

**A real bug found and fixed during verification** (see conversation record / git
history for `google-calendar.service.ts`): `toLocalDateTimeString` originally built the
Calendar event's `start`/`end` `dateTime` using `scheduledDate.toISOString()` and
appended `:00` to `startTime`/`endTime`. Both were wrong: (1) `pg`'s per-column `DATE`
parser used to construct a JS `Date` from *local* year/month/day components, not UTC —
reading it back via `.toISOString()` (UTC-based) silently shifted the calendar day back
by one on any machine whose local timezone is ahead of UTC (confirmed against this
project's real Supabase data on a machine with unset `TZ` / IST local time); (2)
`startTime`/`endTime` as read back from a Postgres `time` column already include seconds
(`"10:00:00"`), so appending `:00` again produced a malformed `"...T10:00:00:00"` string
that Google's real API rejected with a 400. Fixed at the time by reading local `Date`
getters and no longer appending seconds.
**Superseded, root-cause fix (post-merge with `hot-fix-sri`)**: `PostgresService` now
registers a global type parser for `DATE` columns (OID 1082) that returns the column's
raw text (`'YYYY-MM-DD'`) untouched instead of constructing a `Date` at all — removing
the whole class of bug at its source, for every module, not just this one.
`scheduledDate` is a plain `string` everywhere in this module now (repositories,
`OnlineClassDetail`/`ParentOnlineClassView`, `toLocalDateTimeString`'s own signature);
the function is now trivial concatenation. `startTime`/`endTime` still need the
seconds-appending care described above — that half of the original bug is unrelated to
the DATE type-parser fix and still applies. Covered by
`google-calendar.service.spec.ts` so neither half can silently regress.

## Google Calendar reschedule/cancellation sync (Phase 8)

`reschedule()` and `cancel()` now sync to the **existing** Google Calendar event — never
`events.insert`, so a reschedule/cancel can never create a second event/Meet. Both skip
Google entirely if `googleCalendarEventId` is still `null` (nothing confirmed yet to
sync). Neither ever blocks or rolls back the EOS-side operation on a Google problem —
same non-throwing, retryable-via-`meetingCreationStatus`/`meetingCreationError`
philosophy as Phase 7's creation flow:

- **Reschedule**: DB transaction (history + schedule update) commits first, then
  `GoogleCalendarService.updateEventTime` `PATCH`es only `start`/`end`/`timeZone` on the
  event — `conferenceData` is never touched, so the same Meet conference survives. On
  success this also re-asserts `meeting_creation_status='SUCCEEDED'`/clears
  `meeting_creation_error` (see the stale-error bug below). On `NOT_FOUND`/
  `NEEDS_REAUTH`/`FAILED`, the EOS reschedule stays committed and the problem is recorded
  via `meetingCreationStatus='FAILED'`/`meetingCreationError`.
- **Cancellation**: Google delete is attempted *before* the EOS row is marked
  `CANCELLED` (matches the requested flow), but never blocks it — cancelling in School
  EOS is a time-sensitive faculty action that must not hang on a transient Google
  problem. `GoogleCalendarService.cancelEvent` treats a 404/410 (already deleted —
  covers repeated cancellation and an event removed directly in Google Calendar) as
  success, not failure, since the goal state is already true either way.
  `google_calendar_event_id`/`google_meet_id`/`meeting_url` are left untouched on the
  cancelled row for historical/audit reference.

**Two more real bugs found during E2E verification against a real Google account**
(both now covered by regression tests):
1. `syncRescheduleToGoogle` passed `dto.startTime`/`dto.endTime` — validated as exactly
   `"HH:mm"` — straight through to `updateEventTime`, which (per the Phase 7 fix) expects
   `"HH:mm:ss"` matching the DB round-trip shape. Missing seconds produced a malformed
   `dateTime` Google rejected with a real 400. Fixed by appending `:00` at the call site.
2. The `SUCCEEDED` branch of the reschedule-sync switch did nothing but `return` —
   leaving a **stale** `meeting_creation_status='FAILED'`/`meeting_creation_error` from
   an earlier failed sync attempt visible forever, even after a later sync genuinely
   succeeded. Fixed by re-calling `markMeetingSucceeded` with the same (unchanged)
   event/meet/url on success, which also clears the stale error.

## SCHEDULED -> LIVE -> COMPLETED (Phase 8)

`startClass`/`completeClass` (`:id/start`, `:id/complete`) — no request body; the
backend performs the transition itself. Enforced entirely by
`OnlineClassRepository.markLive`/`markCompleted`'s `WHERE status = '<required>'` clause
— the same atomic-conditional-UPDATE pattern as `claimForMeetingCreation`, race-safe by
construction, not by an application-level check. A 409 is thrown if the row wasn't in
the required starting state, covering every combination in the requested rejection
matrix (`DRAFT`/`COMPLETED`/`CANCELLED` can't go `LIVE`; `DRAFT`/`SCHEDULED`/`COMPLETED`/
`CANCELLED` can't go `COMPLETED`; neither state can be re-entered). This is what makes
`addRecording` reachable end-to-end for the first time — previously flagged as a known
gap in Phase 7, now closed.

## Google integration boundary — still not built

Notifications, student access, online attendance, automated recording discovery,
recurring classes, and in-app video/chat remain entirely unimplemented, per instruction.

## Assumptions made beyond the literal spec (flag if wrong)

- **`subjectOfferingId` as the schedule input**, not separate subject/class/section
  fields — `subject_offering` already is that resolved combination (with its assigned
  teacher), so the client supplies one id. Where the mobile app sources that id from
  (an offerings/timetable listing endpoint) is out of scope for this module.
- **Role code `'FACULTY'`** — verified directly against the live `role` table
  (`code='FACULTY'`, `name='Faculty'`, `is_core_login=true`) and 52 active
  `role_assignment` rows using it. No seed script exists in this repo, so this was
  confirmed by querying Supabase directly, not assumed.
- **`upcoming` view includes `DRAFT`** — a just-scheduled class with meeting creation
  still pending has to appear somewhere in the three tabs the spec describes; excluding
  it would make it invisible to the faculty who just created it.
- **No admin/principal oversight endpoint** — every read in this module is scoped to the
  caller's own `faculty_staff_id`; cross-faculty visibility wasn't requested in Phase 4's
  API list.
- **No optimistic-concurrency enforcement on `version`** — the column exists and is
  incremented on every mutation (matching `person`/`staff`/`student`'s convention), but
  no endpoint currently requires the caller to supply an expected version. Wasn't
  requested; flagged as a gap if concurrent reschedules turn out to matter.
- **Idempotency handled inline in this module**, not via `common/idempotency/
  idempotency.interceptor.ts` — that interceptor is still a stub with no working logic
  and isn't registered anywhere yet. This module reads the `Idempotency-Key` header
  itself and relies on the DB's `uq_online_class_idempotency` constraint as the
  ultimate guard against a race.
- **`/callback` returns plain JSON** (not an HTML page or redirect) — confirmed with
  the project owner, since there's no mobile screen yet to redirect/deep-link into.
  Revisit once the mobile Online Classes feature (Phase 9+) exists.
- **OAuth `state` param reuses `JWT_ACCESS_SECRET`** via plain HMAC-SHA256
  (`oauth-state.util.ts`), rather than adding `JwtModule` to this module for a second,
  unrelated token purpose. This token only proves the round-trip wasn't tampered with —
  actual authorization is re-checked from scratch (staff resolved and must be active)
  when the callback fires, so it doesn't need its own independent secret.
