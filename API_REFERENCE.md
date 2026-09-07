# API Reference — Online Classes, Messaging, Permissions

Request/response contracts for the three modules built this cycle. All paths are
relative to the global prefix **`/api/v1`**. Every response body is wrapped as
`{ "data": ... }` (list-messages additionally returns a `meta` sibling). Auth is a
`Bearer <accessToken>` header on every endpoint below (`POST /auth/login` issues
it); the required role is noted per endpoint.

`permission_activity` and `permission_request` tables exist in the live database
and have been exercised end-to-end against real accounts — this is a live
contract, not a proposal.

---

## Online Classes

Faculty schedules/manages a live session; Parent joins it. `online_class.status`
lifecycle: `DRAFT → SCHEDULED → LIVE → COMPLETED`, or `→ CANCELLED` from
`DRAFT`/`SCHEDULED`. `meetingCreationStatus`: `PENDING → CREATING → SUCCEEDED`, or
`FAILED` (e.g. faculty hasn't connected Google Calendar).

### POST /online-classes — schedule a class
**Role:** FACULTY · **Headers:** `Idempotency-Key` (required)

Request:
```json
{
  "subjectOfferingId": "25ba9e81-ea6b-4445-8110-638eb608171c",
  "topic": "Photosynthesis — Chapter 4",
  "description": "Bring your lab notebooks.",
  "scheduledDate": "2026-09-25",
  "startTime": "10:00",
  "endTime": "11:00"
}
```
`topic` required (1–200 chars); `description` optional (≤2000); `scheduledDate`
ISO date; `startTime`/`endTime` `HH:mm`.

Response `200` → `OnlineClassDetail` (see below).
**Errors:** `OFFERING_NOT_FOUND` 404 · `INVALID_TIME_RANGE` 400 · `IN_PAST` 400 ·
`OVERLAPPING_SCHEDULE` 409 · missing `Idempotency-Key` 400.

### GET /online-classes?view=upcoming|completed|cancelled — list
**Role:** FACULTY, PARENT · `view` required.
`upcoming` = DRAFT+SCHEDULED+LIVE, `completed` = COMPLETED, `cancelled` = CANCELLED.

Response `200` → `OnlineClassDetail[]` (FACULTY) or `ParentOnlineClassView[]` (PARENT).

### GET /online-classes/my-subject-offerings
**Role:** FACULTY. Feeds the Schedule form's class/section/subject picker.

```json
{ "data": [
  { "id": "25ba9e81-...", "academicYearId": "9ab6803f-...", "sectionId": "e6aeedc3-...",
    "subjectId": "daf1b05d-...", "teacherStaffId": "f4246621-...", "status": "ACTIVE",
    "subjectName": "Physical Training", "sectionName": "B", "gradeName": "Standard 4" }
] }
```

### GET /online-classes/:id — detail
**Role:** FACULTY, PARENT. `404 NOT_FOUND` — identical for nonexistent and unauthorized.

### GET /online-classes/:id/join
**Role:** PARENT only.
Response `200` → `{ "meetingUrl": string, "status": OnlineClassStatus }`.
**Errors:** `JOIN_NOT_STARTED` 409 (still DRAFT) · `JOIN_ALREADY_ENDED` 409
(COMPLETED) · `JOIN_CANCELLED` 409 · `JOIN_LINK_NOT_READY` 409 (no meetingUrl yet).

### PATCH /online-classes/:id/reschedule
**Role:** FACULTY
```json
{ "scheduledDate": "2026-09-26", "startTime": "11:00", "endTime": "12:00", "reason": "Room conflict" }
```
`reason` optional (≤500). **Errors:** `ALREADY_FINALIZED` 409 (not DRAFT/SCHEDULED) ·
`INVALID_TIME_RANGE` · `IN_PAST` · `OVERLAPPING_SCHEDULE` 409.

### PATCH /online-classes/:id/cancel
**Role:** FACULTY · Body: `{ "reason"?: string }` (≤500). **Error:** `ALREADY_FINALIZED` 409.

### PATCH /online-classes/:id/start
**Role:** FACULTY · No body. `SCHEDULED → LIVE`. **Error:** `NOT_SCHEDULED` 409.

### PATCH /online-classes/:id/complete
**Role:** FACULTY · No body. `LIVE → COMPLETED`. **Error:** `NOT_LIVE` 409.

### PATCH /online-classes/:id/recording
**Role:** FACULTY · Body: `{ "recordingUrl": string }` (valid URL, required).
**Error:** `NOT_COMPLETED` 409 (only settable once COMPLETED).

### GET /online-classes/google/connect
**Role:** FACULTY. Response → `{ "authUrl": string }`.

### GET /online-classes/google/callback
**Public** (identity comes from the signed `state` param). Query: `code?`, `state`
(required), `error?`. Response → `{ "success": boolean, "message": string, "googleAccountEmail"?: string }`.

### `OnlineClassDetail` (Faculty-facing)
```ts
{
  id: string; subjectOfferingId: string; facultyStaffId: string;
  subjectName: string; gradeName: string; sectionName: string;
  topic: string; description: string | null;
  scheduledDate: string; startTime: string; endTime: string;
  status: 'DRAFT'|'SCHEDULED'|'LIVE'|'COMPLETED'|'CANCELLED';
  meetingProvider: string;
  meetingCreationStatus: 'PENDING'|'CREATING'|'SUCCEEDED'|'FAILED';
  meetingCreationError: string | null;
  googleCalendarEventId: string | null; googleMeetId: string | null;
  meetingUrl: string | null; recordingUrl: string | null;
  recordingAddedAt: string | null;
  cancelledAt: string | null; cancellationReason: string | null;
  createdAt: string; updatedAt: string; version: number;
}
```

### `ParentOnlineClassView` (Parent-facing — no faculty/offering/version/Google internals)
```ts
{
  id: string; subjectName: string; gradeName: string; sectionName: string;
  topic: string; description: string | null;
  scheduledDate: string; startTime: string; endTime: string;
  status: 'DRAFT'|'SCHEDULED'|'LIVE'|'COMPLETED'|'CANCELLED';
  meetingUrl: string | null; recordingUrl: string | null;
  cancellationReason: string | null; createdAt: string; updatedAt: string;
}
```

---

## Messaging

One shared conversation per (student, parent). Parents see every faculty
participant (subject teachers + class advisor); every access re-derives live
authorization, never trusting a stored participant row.

### GET /messages/conversations
**Role:** FACULTY, PARENT.
```json
{ "data": [{
  "id": "2043e001-...",
  "student": { "id": "e4e8689e-...", "name": "Abinaya Balasubramaniam" },
  "grade": { "name": "UKG" }, "section": { "name": "D" },
  "academicYear": { "id": "9ab6803f-...", "name": "2025-2026" },
  "participants": [
    { "personId": "acc81351-...", "name": "Aishwarya Thangavel", "role": "SUBJECT_TEACHER" },
    { "personId": "afc4941e-...", "name": "Latha Venkatesh", "role": "CLASS_ADVISOR" }
  ],
  "lastMessage": { "id": "12", "senderPersonId": "acc81351-...", "text": "Please submit by Friday.", "createdAt": "2026-09-06T15:12:16.382Z" },
  "unreadCount": 0,
  "lastMessageAt": "2026-09-06T15:12:16.382Z"
}] }
```
`participants` always excludes the caller themselves (Faculty sees the parent
+ co-faculty; Parent sees the faculty).

### GET /messages/conversations/:id
**Role:** FACULTY, PARENT. Same shape as above `+ "ownLastReadAt": string | null`.
**Error:** `CONVERSATION_NOT_FOUND` 404 — identical for nonexistent/unauthorized/lapsed access.

### GET /messages/conversations/:id/messages?limit=&before=
`limit` optional int 1–100 (default 30); `before` optional cursor (oldest message
id already seen).
```json
{ "data": [{
  "id": "12", "conversationId": "2043e001-...",
  "sender": { "personId": "acc81351-...", "name": "Aishwarya Thangavel", "role": "SUBJECT_TEACHER" },
  "text": "Please submit by Friday.", "createdAt": "2026-09-06T15:12:16.382Z",
  "readAt": null, "status": "SENT"
}], "meta": { "hasMore": false, "nextCursor": null } }
```
`readAt` is only ever populated on the viewer's **own** sent messages.

### POST /messages/conversations/:id/messages — send
**Headers:** `Idempotency-Key` (required). Body: `{ "message": string }` (≤2000,
non-blank after trim). Response → single `MessageDto` as above.
Retrying with the same key returns the original message, never a duplicate.
**Errors:** `EMPTY_MESSAGE` 400 · `MESSAGE_TOO_LONG` 400 · missing key 400.

### PATCH /messages/conversations/:id/read
No body. Response → `{ "success": true }`.

### POST /messages/conversations/:conversationId/messages/:messageId/translate
Body: `{ "targetLanguage": string }` (2–10 chars; allow-list `en, ta, hi, te, kn, ml`).
```json
{ "data": { "messageId": "12", "sourceLanguage": "en", "targetLanguage": "ta", "translatedText": "..." } }
```
**Errors:** `MESSAGE_NOT_FOUND` 404 · `UNSUPPORTED_LANGUAGE` 400 ·
`TRANSLATION_NOT_CONFIGURED` / `TRANSLATION_FAILED` 503.

---

## Permissions (Parent Consent)

Faculty creates a **permission_activity** for a section (all students, or an
explicit list); each targeted student gets its own independently-trackable
**permission_request**. `PermissionRequestStatus`: `PENDING → CONSENTED |
DECLINED | CANCELLED`, or `EXPIRED` — computed live off `responseDeadline`, never
physically written.

### POST /permissions/activities — create
**Role:** FACULTY
```json
{
  "title": "Science Museum Field Trip",
  "description": "Transport by school bus. Packed lunch required.",
  "permissionType": "TRIP",
  "academicYearId": "9ab6803f-...",
  "sectionId": "be72e693-...",
  "activityDate": "2026-09-25",
  "startTime": "09:00",
  "endTime": "15:00",
  "responseDeadline": "2026-09-20",
  "allStudents": true
}
```
`permissionType` ∈ `ONE_TIME_ACTIVITY | ANNUAL_CONSENT | TERM_CONSENT |
MEDIA_CONSENT | TRIP | SPORTS | OTHER`. If `allStudents: false`, `studentIds:
string[]` is required (≥1 UUID) — every id is independently re-validated against
the section's live roster.

Response `200/201` →
```json
{ "data": {
  "id": "5712ac4d-...", "academicYearId": "9ab6803f-...", "academicYearName": "2025-2026",
  "sectionId": "be72e693-...", "sectionName": "A", "gradeName": "Standard 7",
  "createdByStaffId": "f4246621-...", "title": "Science Museum Field Trip",
  "description": "Transport by school bus. Packed lunch required.",
  "permissionType": "TRIP", "activityDate": "2026-09-25",
  "startTime": "09:00:00", "endTime": "15:00:00", "responseDeadline": "2026-09-20",
  "status": "ACTIVE", "cancelledAt": null, "cancelledBy": null,
  "createdAt": "2026-09-06T15:13:41.426Z", "updatedAt": "2026-09-06T15:13:41.426Z",
  "studentCount": 21
} }
```
**Errors:** `SECTION_NOT_FOUND` 404 (also thrown if not currently authorized for
that section — never distinguishable) · `INVALID_TIME_RANGE` / `INVALID_DEADLINE`
400 · `NO_ELIGIBLE_STUDENTS` 400 · `STUDENT_NOT_ELIGIBLE` 400.

### GET /permissions/activities — list
**Role:** FACULTY. Scoped to the caller's currently-authorized sections (teaching
+ class-advisor, live-derived). Response → `PermissionActivityDto[]` (shape above).

### GET /permissions/activities/my-sections
**Role:** FACULTY. Feeds the "Post request" form's class/section picker.
```json
{ "data": [{ "sectionId": "be72e693-...", "academicYearId": "9ab6803f-...", "gradeName": "Standard 7", "sectionName": "A" }] }
```

### GET /permissions/activities/:activityId — detail
**Role:** FACULTY. **Error:** `ACTIVITY_NOT_FOUND` 404 (nonexistent or no longer authorized).

### PATCH /permissions/activities/:activityId — update
**Role:** FACULTY. All fields optional — `title`, `description`, `activityDate`,
`startTime`, `endTime`, `responseDeadline`. `academicYearId`/`sectionId`/
`permissionType`/`studentIds`/creator can never change.
**Errors:** `ACTIVITY_ALREADY_CANCELLED` 409 · `INVALID_TIME_RANGE` /
`INVALID_DEADLINE` 400.

### POST /permissions/activities/:activityId/cancel
**Role:** FACULTY. No body. Sets the activity `CANCELLED` and cascades **only**
still-`PENDING` requests to `CANCELLED` — `CONSENTED`/`DECLINED` history is
preserved untouched. **Error:** `ACTIVITY_ALREADY_CANCELLED` 409.

### GET /permissions/activities/:activityId/status
**Role:** FACULTY.
```json
{ "data": { "total": 21, "consented": 1, "declined": 1, "pending": 19, "expired": 0, "cancelled": 0 } }
```

### GET /permissions/activities/:activityId/requests — who responded
**Role:** FACULTY.
```json
{ "data": [
  { "requestId": "1f7d6897-...", "studentId": "e4e8689e-...", "studentName": "Abinaya Balasubramaniam",
    "status": "DECLINED", "responderName": "Chitra Balasubramaniam",
    "signedAt": "2026-09-06T15:13:55.420Z", "declineReason": "Clashes with a medical appointment" },
  { "requestId": "a74dfdbd-...", "studentId": "aa8ac8fe-...", "studentName": "Anitha Muthusamy",
    "status": "PENDING", "responderName": null, "signedAt": null, "declineReason": null }
] }
```

### GET /permissions/requests — list (Parent)
**Role:** PARENT. Scoped to the caller's own currently-active wards only.
Response → `PermissionRequestDto[]` (shape below).

### GET /permissions/requests/:requestId — detail
**Role:** PARENT. **Error:** `REQUEST_NOT_FOUND` 404 — identical for
nonexistent/another parent's ward/lapsed guardian link.

### POST /permissions/requests/:requestId/consent
**Role:** PARENT. No body. Idempotent if already `CONSENTED` (returns the same
result, no duplicate write).
**Errors:** `REQUEST_NOT_FOUND` 404 · `REQUEST_EXPIRED` 409 ·
`REQUEST_ALREADY_CANCELLED` 409 · `REQUEST_ALREADY_DECLINED` 409 (a second
guardian can't flip an already-declined request).

### POST /permissions/requests/:requestId/decline
**Role:** PARENT. Body: `{ "reason"?: string }` (≤500). Idempotent if already
`DECLINED`. **Errors:** same family, plus `REQUEST_ALREADY_CONSENTED` 409.

Response `200` for both (`PermissionRequestDto`):
```json
{ "data": {
  "id": "1f7d6897-...", "activityId": "69260a42-...", "studentId": "e4e8689e-...",
  "status": "DECLINED", "respondedByPersonId": "0c7224a2-...",
  "signedAt": "2026-09-06T15:13:55.420Z", "declineReason": "Clashes with a medical appointment",
  "createdAt": "2026-09-06T15:13:41.426Z", "updatedAt": "2026-09-06T15:13:55.420Z",
  "studentFirstName": "Abinaya", "studentLastName": "Balasubramaniam",
  "activityTitle": "E2E Test - Sports Day", "activityDescription": "...",
  "permissionType": "SPORTS", "activityDate": "2026-10-05",
  "startTime": "08:00:00", "endTime": "13:00:00", "responseDeadline": "2026-10-01",
  "activityStatus": "ACTIVE", "gradeName": "UKG", "sectionName": "D",
  "academicYearId": "9ab6803f-...", "sectionId": "c690dc2b-..."
} }
```

### `PermissionActivityDto`
```ts
{
  id: string; academicYearId: string; academicYearName: string;
  sectionId: string; sectionName: string; gradeName: string;
  createdByStaffId: string; title: string; description: string | null;
  permissionType: 'ONE_TIME_ACTIVITY'|'ANNUAL_CONSENT'|'TERM_CONSENT'|'MEDIA_CONSENT'|'TRIP'|'SPORTS'|'OTHER';
  activityDate: string; startTime: string; endTime: string; responseDeadline: string;
  status: 'ACTIVE'|'CANCELLED'; cancelledAt: string | null; cancelledBy: string | null;
  createdAt: string; updatedAt: string; studentCount: number;
}
```

### `PermissionRequestDto`
```ts
{
  id: string; activityId: string; studentId: string;
  status: 'PENDING'|'CONSENTED'|'DECLINED'|'EXPIRED'|'CANCELLED'; // live-effective
  respondedByPersonId: string | null; signedAt: string | null; declineReason: string | null;
  createdAt: string; updatedAt: string;
  studentFirstName: string; studentLastName: string;
  activityTitle: string; activityDescription: string | null;
  permissionType: 'ONE_TIME_ACTIVITY'|'ANNUAL_CONSENT'|'TERM_CONSENT'|'MEDIA_CONSENT'|'TRIP'|'SPORTS'|'OTHER';
  activityDate: string; startTime: string; endTime: string; responseDeadline: string;
  activityStatus: 'ACTIVE'|'CANCELLED'; gradeName: string; sectionName: string;
  academicYearId: string; sectionId: string;
}
```
