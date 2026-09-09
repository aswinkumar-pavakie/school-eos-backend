# SCHOOL EOS — COMPLETE API DOCUMENTATION (FINAL, v4.0)

**Single-School Product · Feature-Based Developer Reference**
**Every endpoint tagged by platform: which app actually calls it**

## 688 total endpoints

| Platform | Count | Meaning |
|---|---:|---|
| 🖥️ WEB | 524 | Next.js staff/admin web app only |
| 📱 APP | 110 | Expo mobile app only (Faculty, Parent, Warden, Vendor) |
| 🖥️📱 BOTH | 42 | Called from both web and mobile |
| 🔌 DEVICE | 10 | Device-credential auth — NFC terminals, GPS trackers, biometric terminals, not a human login |
| ⚙️ SERVER | 2 | Inbound provider webhook — payment/notification gateway only |

---

## Document Control

| Item | Value |
|---|---|
| Product | School EOS |
| Version | v4.0 — Sports Manager role removed, Academic Coordinator web access removed, Sports Faculty introduced |
| API base path | `/api/v1` (health checks at root: `/health`, `/ready`) |
| Deployment model | Single school. One Supabase project. Handed over to the school |
| Multi-school surface | None. No `/schools`, no `/campuses`, no tenant scope |

**Note carried over from prior versions:** the endpoint total stated in
the header (688) and the sum of the Feature Index table below have
never fully reconciled to the row-by-row count in Section 3 (off by a
handful, pre-dating v4.0) — flagged here rather than silently
adjusted, since this version did not touch endpoint counts, only
platform tags and access columns.

## ROLE MODEL CHANGE IN v3.0

**Transport Manager is removed as a role.** All transport office work —
vehicles, routes, stops, student allocation, devices, incidents — is now
**Admin's** responsibility on the web app. This was a deliberate decision:
the school does not want a separate transport office login; Admin absorbs
that scope alongside everything else Admin already manages.

**Hostel Warden is retained, but narrowed to daily operations only.**
Admin (web) now owns 100% of hostel *structure and allocation* — creating
blocks, floors, rooms and beds, and assigning students to a bed. The
Warden's mobile app has **no access to structure or allocation endpoints
at all.** The Warden only does: night roll call, gate pass issue and
approval, visitor log, mess attendance, incident reporting. This mirrors
exactly how it works in practice — Admin sets up the hostel once a year;
the Warden lives the daily operational reality of it.

## ROLE MODEL CHANGE IN v4.0

**Sports Manager is removed as a role.** There is no dedicated Sports
login anymore. Sports work splits, on the same "who actually owns this
day to day" logic already used for Transport and Hostel:

- **Admin (web)** now owns sports *structure and assets* — defining
  sports and categories, facilities, and equipment master data
  (`POST`/`PATCH /sports`, `/sport-categories`, `/sports/facilities`,
  `/sports/equipment`). This is rarely-touched setup work, exactly like
  Admin's Transport vehicle/device records and Hostel structure — not
  something that needs a standing dedicated login. Admin also creates
  coach records and assigns a coach to a team, the same way Admin
  assigns a driver to a route or a Warden to a hostel: a staff/
  assignment decision, not a daily operational one.
- **Sports Faculty — a new Faculty permission assignment (mobile)** now
  owns sports *operations* — the day-to-day work of running a team: a
  student's sport profile and participations, trials and trial
  results, teams and rosters, training sessions and attendance,
  tournaments, fixtures and results, rankings, achievements,
  certificates, facility bookings, and equipment issue/return. This
  is exactly the same pattern as Class Advisor, Health In-Charge, or
  Community In-Charge: a permission assignment on an existing Faculty
  account, not a separate login, and it is scoped server-side to the
  specific team(s)/sport(s) that Faculty member is assigned to — not
  school-wide.

**Academic Coordinator no longer unlocks a web app.** In the prior
version, Academic Coordinator was the one Faculty assignment that
additionally opened a web surface for heavy screens (timetable
building, exam setup, bulk report card generation). That web access is
removed. Academic Coordinator is now a Faculty assignment exactly like
every other one — mobile only, same login, same app as any other
Faculty member. The heavy web screens it used to reach (timetables,
examination setup, grade scales, report-card generation/publish/lock)
remain on the web, gated to `Academic authority`, which now resolves
only to Admin, Principal, and Vice Principal — never to a Faculty
account, regardless of assignment.

**Admin can tag a Faculty account with a sports assignment at any
point in the staff lifecycle** — at admission/staff creation or later
— through the exact same mechanism used for every other Faculty
assignment: `POST /api/v1/staff/{id}/role-assignments`, assignment
type `SPORTS_FACULTY`, scoped to the sport(s)/team(s) that assignment
covers. This is not a new endpoint or a special case; it is the same
call Admin already makes for Class Advisor, Academic Coordinator,
Health In-Charge, and Community In-Charge.

**Current role model — 7 active roles** (Super Admin/Correspondent is
reserved in the schema for future use but not active):

`Admin` · `Principal` · `Vice Principal` · `Faculty` · `Parent` ·
`Finance/Accounts` · `Hostel Warden`

Additional Faculty responsibilities — Class Advisor, Academic
Coordinator, Health In-Charge, Primary/Middle/Senior In-Charge,
Community In-Charge, **Sports Faculty** — remain permission assignments
on the Faculty account, not separate logins, and none of them unlock a
web surface. Faculty is mobile-only, full stop.

## LOGIN TO PLATFORM MAP

| Login | Platform |
|---|---|
| Admin | 🖥️ WEB only — now includes Transport, Hostel, and Sports structure/equipment setup |
| Principal | 🖥️📱 BOTH — dashboard/approvals on mobile, full reports on web |
| Vice Principal | 🖥️ WEB only |
| Finance/Accounts | 🖥️ WEB only |
| Faculty | 📱 APP only — no assignment (Class Advisor, Academic Coordinator, Health In-Charge, Community In-Charge, Sports Faculty) unlocks web |
| Parent | 📱 APP only — no web version exists at all |
| Hostel Warden | 📱 APP only — daily operations, no structure/allocation access |
| Bus Attendant | 📱 APP only — device-credential terminal, boarding scan |
| Canteen Vendor | 📱 APP only — device-credential terminal, tap-to-pay |

---

# 1. Feature Index

| Phase | Feature | APIs | New |
|---|---|---:|---:|
| 1 | Authentication, Identity & Session | 16 | — |
| 2 | School Academic Configuration & People | 31 | — |
| 2 | User Accounts, Roles & Access | 26 | — |
| 2 | Students, Guardians & Enrolment | 33 | — |
| 2 | Admissions | 9 | — |
| 3 | Classes, Teaching Assignments & Timetable | 28 | — |
| 3 | Attendance | 14 | 5 |
| 3 | Homework, Assignments, LMS & Syllabus | 27 | — |
| 3 | Assessment, Examination & Report Cards | 38 | — |
| 4 | Student Development & Activities | 45 | — |
| 4 | Community | 13 | — |
| 4 | Sports | 61 | — (structure/equipment: Admin web · operations: Sports Faculty app) |
| 5 | Finance, Fees & Payments | 43 | 3 |
| 5 | Wallet & Canteen | 39 | 11 |
| 6 | Transport, NFC, GPS & Devices | 67 | 10 |
| 7 | Hostel | 67 | — |
| 8 | Health / Infirmary | 43 | 4 |
| 9 | Incidents, Discipline, Safety & Emergency | 30 | — |
| 9 | Communication, Notifications, Documents & Evidence | 10 | 1 |
| 10 | Approvals | 5 | — |
| 10 | Bulk Operations | 8 | — |
| 10 | Audit | 3 | — |
| 10 | Reporting & Scheduled Operations | 6 | — |
| 11 | Camps | 26 | 26 |
| | **Total** | **688** | **60** |

---

# 2. Global API Standards

## 2.1 Role model

See "ROLE MODEL CHANGE IN v4.0" above. 7 active roles, no platform layer, no school/campus scope.

## 2.2 Authentication and authorization pipeline

```
Authentication -> permission -> object access -> state/business rules
```

## 2.3 Standard request headers

| Header | Requirement |
|---|---|
| `Authorization` | `Bearer <access-token>` |
| `Content-Type` | `application/json` |
| `X-Request-Id` | Optional; returned as `meta.requestId` |
| `Idempotency-Key` | Required for retry-prone consequential writes |
| `If-Match` / `version` | Optimistic concurrency where defined |

## 2.4 Standard responses

**Success:** `{"success": true, "data": {}, "meta": {"requestId": "req_01J..."}}`
**Collection:** `{"success": true, "data": [], "meta": {"requestId":"...","page":1,"pageSize":25,"total":0}}`
**Error:** `{"success": false, "error": {"code":"...","message":"...","details":{}}, "meta":{"requestId":"..."}}`

## 2.5 HTTP status contract

| Status | Code | Meaning |
|---|---|---|
| 200/201/202 | — | Success / created / accepted async |
| 400 | `VALIDATION_ERROR` | Malformed request |
| 401 | `UNAUTHENTICATED` | Missing/invalid auth |
| 403 | `FORBIDDEN` | Permission/object/functional failure |
| 404 | `NOT_FOUND` | Absent or intentionally hidden |
| 409 | `CONFLICT` / `STATE_TRANSITION_INVALID` / `IDEMPOTENCY_CONFLICT` | |
| 422 | `SEMANTIC_RULE_VIOLATION` | Business invariant failed |
| 429 | `RATE_LIMITED` | |
| 500/503 | `INTERNAL_ERROR` / `DEPENDENCY_UNAVAILABLE` | |

**Out-of-scope objects return 404, not 403.**

## 2.6 Provider-facing boundary endpoints (⚙️ SERVER)

`POST /finance/payment-events` · `POST /notifications/delivery-events`

Exempt from Bearer auth. Authenticated by provider signature over the raw
request body. Provider event ID is the idempotency key. Never trust a
client-side callback for payment confirmation.

## 2.7 Device-authenticated endpoints (🔌 DEVICE)

NFC terminals and GPS trackers authenticate with a device credential, not
a user token. These are not human logins — no person "is" a device.
Fail-closed on payment if the blocklist is stale; fail-open on attendance.

## 2.8 Batch sync endpoints

`POST /attendance/sessions/sync` · `POST /canteen/transactions/sync` ·
`POST /transport/taps/sync` — all return per-item outcomes.
`DUPLICATE` is a success, not an error.

## 2.9 Append-only resources

Published marks · locked attendance · wallet ledger · payments · card taps
· boarding events · medication administration · sick bay observations ·
gate movements · audit events · telemetry. Corrections append; nothing is
overwritten.

## 2.10 Parent password policy

One self-service reset, consumed on success, then `POST /admin/parents/{id}/password-reset` only.

---

# 3. Complete Endpoint Index — tagged by platform


## Phase 1 · Authentication, Identity & Session

16 APIs · 16 BOTH

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/login` | Authenticate a user and establish an authenticated session. | Public |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/refresh` | Refresh an access session/token. | Authenticated/refresh credential |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/logout` | Terminate the current session. | Authenticated |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/me` | Return the authenticated product identity, roles, assignments and | Authenticated |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/auth/session` | Return current session status. | Authenticated |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/auth/sessions` | List sessions belonging to the authenticated user. | Authenticated |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/sessions/{sessionId}/revoke` | Revoke one owned session. | Authenticated + ownership |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/sessions/revoke-all` | Revoke all sessions for the authenticated user. | Authenticated |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/password/reset-request` | Start password reset; parent policy is checked server-side. | Public |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/password/reset` | Complete an eligible password reset. | Reset token / authenticated flow |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/mfa/enroll` |  | Enroll an MFA factor when MFA is enabled for the account/policy. Authenticated + policy |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/mfa/verify` | Verify MFA challenge. | Authenticated / challenge |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/auth/mfa/disable` | Disable MFA after required verification. | Authenticated + policy |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/admin/parents/{parentId}/password-reset` | Admin-authorized parent credential reset/recreation. | Admin + object scope |  |
| 🖥️📱 BOTH | `GET` | `/health` | Liveness check; no business data. | Public |  |
| 🖥️📱 BOTH | `GET` | `/ready` | Readiness check; no sensitive dependency details. | Public |  |

## Phase 2 · School Academic Configuration & People

31 APIs · 31 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/academic-years` | List academic years. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-years` | Create academic year. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-years/{id}` | Get academic year. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-years/{id}` | Update mutable attributes before closure. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-years/{id}/activate` | Activate academic year. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-years/{id}/close` | Close academic year. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-stages` | List stages. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-stages` | Create stage. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-stages/{id}` | Get stage. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-stages/{id}` | Update stage. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/grades` | List grades. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/grades` | Create grade. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/grades/{id}` | Get grade. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/grades/{id}` | Update grade. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/sections` | List sections. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sections` | Create section. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/sections/{id}` | Get section. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/sections/{id}` | Update section. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/subjects` | List subjects. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/subjects` | Create subject. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/subjects/{id}` | Get subject. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/subjects/{id}` | Update subject. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-calendars` | List calendars. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-calendars` | Create calendar. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-calendars/{id}` | Get calendar. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-calendars/{id}` | Update calendar. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-calendars/{id}/events` | List calendar events. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-calendars/{id}/events` | Create calendar event. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/persons/{id}` | Get common person record. | Authorized object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/persons` | Create person master record. | Admin / authorized service |  |
| 🖥️ WEB | `PATCH` | `/api/v1/persons/{id}` | Update mutable person attributes. | Admin / authorized service |  |

## Phase 2 · User Accounts, Roles & Access

26 APIs · 26 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/academic-calendar-events/{id}` | Get calendar event. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-calendar-events/{id}` | Update event. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/user-accounts` | List product accounts within scope. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/user-accounts` | Create account mapping; credential is handled by Auth. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/user-accounts/{id}` | Get account metadata. | Admin / authorized scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/user-accounts/{id}` | Update mutable account metadata. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/user-accounts/{id}/activate` | Activate product account. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/user-accounts/{id}/deactivate` | Deactivate product account. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/roles` | List roles. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/roles` | Create role where custom roles are supported. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/roles/{id}` | Get role. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/roles/{id}` | Update role metadata. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/permissions` | List permissions. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/permissions` | Create permission definition where custom permissions are | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/permissions/{id}` | Get permission. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/roles/{id}/permissions` | List role permissions. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/roles/{id}/permissions` | Assign permission to role. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/user-roles` | List role assignments. | Admin / authorized scope |  |
| 🖥️ WEB | `POST` | `/api/v1/user-roles` | Assign role to account. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/user-roles/{id}` | Update role assignment. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/user-roles/{id}/end` | End role assignment. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/user-assignments` | List responsibility assignments. | Admin / authorized scope |  |
| 🖥️ WEB | `POST` | `/api/v1/user-assignments` | Create responsibility assignment. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/user-assignments/{id}` | Get assignment. | Admin / authorized scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/user-assignments/{id}` | Update assignment. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/user-assignments/{id}/end` | End assignment. | Admin |  |

## Phase 2 · Students, Guardians & Enrolment

33 APIs · 33 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/students` | List/search accessible students. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/students` | Create student outside admission flow when permitted. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/students/{id}` | Get student profile. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/students/{id}` | Update mutable student data. | Admin / authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/students/{id}/activate` | Activate student. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/students/{id}/deactivate` | Deactivate student. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/students/{id}/archive` | Archive student when policy permits. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/staff` | List/search staff. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/staff` | Create staff. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/staff/{id}` | Get staff. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/staff/{id}` | Update staff. | Admin / authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/staff/{id}/activate` | Activate staff. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/staff/{id}/deactivate` | Deactivate staff. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/guardians` | List guardians within permitted scope. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/guardians` | Create guardian profile. | Admin / admission workflow |  |
| 🖥️ WEB | `GET` | `/api/v1/guardians/{id}` | Get guardian profile. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/guardians/{id}` | Update guardian profile. | Admin / authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-guardians` | List student-guardian relationships. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/student-guardians` | Create relationship. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/student-guardians/{id}` | Get relationship. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-guardians/{id}` | Update relationship attributes. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/student-guardians/{id}/end` | End relationship without deleting history. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/student-enrolments` | List enrolments. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-enrolments` | Create enrolment. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/student-enrolments/{id}` | Get enrolment. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-enrolments/{id}` | Update permitted enrolment attributes. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/student-enrolments/{id}/activate` | Activate enrolment. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/student-enrolments/{id}/end` | End enrolment. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/student-identifiers` | List identifiers within scope. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-identifiers` | Create identifier. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/student-identifiers/{id}` | Get identifier. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-identifiers/{id}` | Update permitted identifier attributes. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/student-identifiers/{id}/revoke` | Revoke identifier while preserving history. | Admin |  |

## Phase 2 · Admissions

9 APIs · 9 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/admissions` | List/search admissions. | Admin / authorized leadership |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions` | Create admission application; may provision parent account as | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/admissions/{id}` | Get admission. | Admin / authorized leadership |  |
| 🖥️ WEB | `PATCH` | `/api/v1/admissions/{id}` | Update editable admission data. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions/{id}/submit` | Submit admission. | Admin / authorized admission operator |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions/{id}/approve` | Approve admission. | Authorized approver |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions/{id}/reject` | Reject admission. | Authorized approver |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions/{id}/withdraw` | Withdraw admission. | Authorized operator |  |
| 🖥️ WEB | `POST` | `/api/v1/admissions/{id}/convert-to-student` | Create/activate the student/enrolment from approved admission | Admin |  |

## Phase 3 · Classes, Teaching Assignments & Timetable

28 APIs · 28 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/academic-classes` | List classes. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-classes` | Create class. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-classes/{id}` | Get class. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-classes/{id}` | Update class. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-classes/{id}/activate` | Activate class. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-classes/{id}/close` | Close class. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-classes/{id}/subjects` | List class subjects. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-classes/{id}/subjects` | Attach subject to class. | Admin / academic authority |  |
| 🖥️ WEB | `PATCH` | `/api/v1/class-subjects/{id}` | Update class-subject configuration. | Admin / academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/class-subjects/{id}/end` | End class-subject assignment. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/faculty-subject-assignments` | List teaching assignments. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/faculty-subject-assignments` | Create teaching assignment. | Admin / academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/faculty-subject-assignments/{id}` | Get teaching assignment. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/faculty-subject-assignments/{id}` | Update assignment. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/faculty-subject-assignments/{id}/end` | End assignment. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/timetables` | List timetables. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/timetables` | Create timetable. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/timetables/{id}` | Get timetable. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/timetables/{id}` | Update timetable before publication/lock. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/timetables/{id}/entries` | List timetable entries. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/timetables/{id}/entries` | Create timetable entry. | Academic authority |  |
| 🖥️ WEB | `PATCH` | `/api/v1/timetable-entries/{id}` | Update timetable entry. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/timetables/{id}/publish` | Publish timetable. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/timetables/{id}/lock` | Lock timetable. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-progress-records` | List student academic progress records. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/academic-progress-records` | Create progress record. | Faculty / academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/academic-progress-records/{id}` | Get progress record. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/academic-progress-records/{id}` | Update permitted progress data. | Owner/academic authority |  |

## Phase 3 · Attendance

14 APIs · 10 APP · 4 BOTH/DEVICE · **5 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 📱 APP | `GET` | `/api/v1/attendance/sessions` | List attendance sessions. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/attendance/sessions` | Create attendance session. | Faculty / authorized operator |  |
| 📱 APP | `GET` | `/api/v1/attendance/sessions/{id}` | Get session. | Authenticated + permission/object |  |
| 📱 APP | `GET` | `/api/v1/attendance/sessions/{id}/records` | List attendance records. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/attendance/sessions/{id}/records` | Record attendance. | Faculty / authorized operator |  |
| 📱 APP | `GET` | `/api/v1/attendance/records/{id}` | Get attendance record. | Object scoped |  |
| 📱 APP | `POST` | `/api/v1/attendance/records/{id}/corrections` | Create controlled attendance correction. | Authorized correction role |  |
| 📱 APP | `POST` | `/api/v1/attendance/sessions/{id}/lock` | Lock attendance session. | Authorized academic operator |  |
| 📱 APP | `POST` | `/api/v1/attendance/sessions/{id}/unlock` | Unlock attendance session under elevated policy. | Restricted leadership/admin |  |
| 📱 APP | `POST` | `/api/v1/attendance/sessions/sync` | Synchronize queued offline attendance sessions and records. | Faculty + assigned class scope | **NEW** |
| 🔌 DEVICE | `POST` | `/api/v1/staff/attendance/biometric-events` | Record a staff biometric (face/fingerprint) check-in or check-out event. | Authenticated device (BIOMETRIC_TERMINAL) | **NEW** |
| 🖥️📱 BOTH | `POST` | `/api/v1/staff/attendance/manual` | Record a manual staff attendance entry when the biometric terminal is unavailable. | Admin/Principal (direct, confirmed) or Faculty own (self-report, pending approval) | **NEW** |
| 🖥️📱 BOTH | `GET` | `/api/v1/staff/attendance` | List staff attendance events, filterable by staff, date range, method and state. | Admin (all) / Faculty (own only) | **NEW** |
| 🖥️📱 BOTH | `GET` | `/api/v1/staff/attendance/{id}` | Get one staff attendance event. | Admin / Faculty own / object scoped | **NEW** |

## Phase 3 · Homework, Assignments, LMS & Syllabus

27 APIs · 27 APP

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 📱 APP | `GET` | `/api/v1/homework` | List homework. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/homework` | Create homework. | Faculty / authorized academic role |  |
| 📱 APP | `GET` | `/api/v1/homework/{id}` | Get homework. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/homework/{id}` | Update homework before lock/close. | Owner/academic scope |  |
| 📱 APP | `POST` | `/api/v1/homework/{id}/publish` | Publish homework. | Faculty / academic authority |  |
| 📱 APP | `POST` | `/api/v1/homework/{id}/close` | Close homework. | Faculty / academic authority |  |
| 📱 APP | `GET` | `/api/v1/assignments` | List assignments. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/assignments` | Create assignment. | Faculty / academic authority |  |
| 📱 APP | `GET` | `/api/v1/assignments/{id}` | Get assignment. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/assignments/{id}` | Update assignment. | Owner/academic scope |  |
| 📱 APP | `GET` | `/api/v1/assignments/{id}/submissions` | List submissions. | Faculty/object scope |  |
| 📱 APP | `POST` | `/api/v1/assignments/{id}/submissions` | Create student submission. | Student-facing operation if enabled; |  |
| 📱 APP | `GET` | `/api/v1/submissions/{id}` | Get submission. | Object scoped |  |
| 📱 APP | `PATCH` | `/api/v1/submissions/{id}` | Update permitted submission state/content. | Object scoped |  |
| 📱 APP | `GET` | `/api/v1/lms-materials` | List materials. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/lms-materials` | Create material. | Faculty / academic authority |  |
| 📱 APP | `GET` | `/api/v1/lms-materials/{id}` | Get material. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/lms-materials/{id}` | Update material. | Owner/academic scope |  |
| 📱 APP | `POST` | `/api/v1/lms-materials/{id}/publish` | Publish material. | Faculty / academic authority |  |
| 📱 APP | `POST` | `/api/v1/lms-materials/{id}/archive` | Archive material. | Owner/academic authority |  |
| 📱 APP | `GET` | `/api/v1/syllabi` | List syllabi. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/syllabi` | Create syllabus. | Academic authority |  |
| 📱 APP | `GET` | `/api/v1/syllabi/{id}` | Get syllabus. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/syllabi/{id}` | Update syllabus. | Academic authority |  |
| 📱 APP | `GET` | `/api/v1/syllabi/{id}/progress` | Get syllabus progress. | Academic scope |  |
| 📱 APP | `POST` | `/api/v1/syllabi/{id}/progress` | Record progress. | Faculty / academic authority |  |
| 📱 APP | `PATCH` | `/api/v1/syllabus-progress/{id}` | Correct/update progress under policy. | Faculty / academic authority |  |

## Phase 3 · Assessment, Examination & Report Cards

38 APIs · 38 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/assessment-types` | List assessment types. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/assessment-types` | Create assessment type. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/assessment-types/{id}` | Get assessment type. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/assessment-types/{id}` | Update assessment type. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/assessments` | List assessments. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/assessments` | Create assessment. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/assessments/{id}` | Get assessment. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/assessments/{id}` | Update assessment before lock. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/assessments/{id}/subjects` | List assessment subjects. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/assessments/{id}/subjects` | Add assessment subject. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/assessment-subjects/{id}/questions` | Create/configure question. | Authorized assessment role |  |
| 🖥️ WEB | `GET` | `/api/v1/assessment-marks` | List marks within scope. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/assessment-marks` | Record marks. | Faculty / authorized assessment role |  |
| 🖥️ WEB | `GET` | `/api/v1/assessment-marks/{id}` | Get mark. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/assessment-marks/{id}` | Update mark before lock. | Authorized assessment role |  |
| 🖥️ WEB | `POST` | `/api/v1/assessment-marks/{id}/corrections` | Correct locked/recorded mark with traceability. | Restricted academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/assessments/{id}/lock` | Lock assessment. | Authorized academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/assessments/{id}/publish` | Publish assessment outcome where applicable. | Authorized academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/examinations` | List examinations. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/examinations` | Create examination. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/examinations/{id}` | Get examination. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/examinations/{id}` | Update examination before lock. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/examinations/{id}/schedules` | List examination schedules. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/examinations/{id}/schedules` | Create examination schedule. | Academic authority |  |
| 🖥️ WEB | `PATCH` | `/api/v1/examination-schedules/{id}` | Update schedule. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/examinations/{id}/publish` | Publish examination schedule. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/examinations/{id}/lock` | Lock examination configuration. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/grade-scales` | List grade scales. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/grade-scales` | Create grade scale. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/grade-scales/{id}` | Get grade scale. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/grade-scales/{id}` | Update grade scale. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/report-cards` | List report cards within scope. | Leadership/Faculty/Parent according to |  |
| 🖥️ WEB | `POST` | `/api/v1/report-cards` | Generate/create report card. | Academic authority |  |
| 🖥️ WEB | `GET` | `/api/v1/report-cards/{id}` | Get report card. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/report-cards/{id}/items` | Add/update report-card item through controlled command. | Academic authority |  |
| 🖥️ WEB | `PATCH` | `/api/v1/report-card-items/{id}` | Update report-card item before lock. | Academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/report-cards/{id}/publish` | Publish report card. | Authorized academic authority |  |
| 🖥️ WEB | `POST` | `/api/v1/report-cards/{id}/lock` | Lock report card. | Authorized academic authority |  |

## Phase 4 · Student Development & Activities

45 APIs · 45 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/activities` | List activities. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/activities` | Create activity. | Authorized development role |  |
| 🖥️ WEB | `GET` | `/api/v1/activities/{id}` | Get activity. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/activities/{id}` | Update activity. | Owner/authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/activities/{id}/offerings` | List offerings. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/activities/{id}/offerings` | Create offering. | Authorized development role |  |
| 🖥️ WEB | `PATCH` | `/api/v1/activity-offerings/{id}` | Update offering. | Authorized development role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-activity-participations` | List participations. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-activity-participations` | Create participation. | Authorized activity operator |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-activity-participations/{id}` | Update participation. | Authorized activity operator |  |
| 🖥️ WEB | `GET` | `/api/v1/activity-attendance` | List activity attendance. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/activity-attendance` | Record activity attendance. | Activity operator |  |
| 🖥️ WEB | `GET` | `/api/v1/student-achievements` | List achievements. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-achievements` | Create achievement. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-achievements/{id}` | Get achievement. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-achievements/{id}` | Update achievement metadata. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-certificates` | List certificates. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-certificates` | Create certificate record. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-certificates/{id}` | Get certificate. | Authenticated + permission/object |  |
| 🖥️ WEB | `GET` | `/api/v1/student-behaviour-records` | List behaviour records. | Restricted scoped access |  |
| 🖥️ WEB | `POST` | `/api/v1/student-behaviour-records` | Create behaviour record. | Authorized faculty/leadership |  |
| 🖥️ WEB | `GET` | `/api/v1/student-behaviour-records/{id}` | Get behaviour record. | Restricted object scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-behaviour-records/{id}` | Update permitted attributes; preserve history where | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-observations` | List observations. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-observations` | Create observation. | Faculty/authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-observations/{id}` | Get observation. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-observations/{id}` | Update observation before it becomes historical/locked. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-progress-records` | List development progress. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/student-progress-records` | Create progress record. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/student-progress-records/{id}` | Get progress record. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/student-progress-records/{id}` | Update permitted progress attributes. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/communities` | List communities. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/communities` | Create community. | Authorized community role |  |
| 🖥️ WEB | `GET` | `/api/v1/communities/{id}` | Get community. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/communities/{id}` | Update community. | Authorized community role |  |
| 🖥️ WEB | `GET` | `/api/v1/communities/{id}/incharge-assignments` | List in-charge assignments. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/communities/{id}/incharge-assignments` | Assign in-charge. | Authorized community role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/student-sport-profiles` | List profiles. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/student-sport-profiles` | Create profile. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/student-sport-profiles/{id}` | Get profile. | Object scoped |  |
| 📱 APP | `PATCH` | `/api/v1/student-sport-profiles/{id}` | Update profile. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/student-sport-participations` | List participations. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/student-sport-participations` | Create participation. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/student-sport-participations/{id}` | Get participation. | Object scoped |  |
| 📱 APP | `PATCH` | `/api/v1/student-sport-participations/{id}` | Update participation. | Sports Faculty |  |

## Phase 4 · Community

13 APIs · 13 BOTH

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `GET` | `/api/v1/community-memberships` | List memberships. | Authenticated + permission/object |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-memberships` | Create membership. | Authorized community role |  |
| 🖥️📱 BOTH | `PATCH` | `/api/v1/community-memberships/{id}` | Update membership. | Authorized community role |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-memberships/{id}/end` | End membership. | Authorized community role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/community-activities` | List community activities. | Authenticated + permission/object |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-activities` | Create community activity. | Authorized community role |  |
| 🖥️📱 BOTH | `PATCH` | `/api/v1/community-activities/{id}` | Update activity. | Authorized community role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/community-activity-participants` | List participants. | Authenticated + permission/object |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-activity-participants` | Add participant. | Authorized community role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/community-activity-attendance` | List attendance. | Authenticated + permission/object |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-activity-attendance` | Record attendance. | Authorized community role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/community-achievements` | List achievements. | Authenticated + permission/object |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/community-achievements` | Create achievement. | Authorized community role |  |

## Phase 4 · Sports

61 APIs · Admin (🖥️ WEB, structure/assets) + Sports Faculty (📱 APP,
operations) + shared reads (🖥️📱 BOTH). No Sports Manager login; see
"ROLE MODEL CHANGE IN v4.0."

**Reading this table:** `Admin` below always means the web login.
`Sports Faculty` always means a Faculty account (mobile, 📱 APP) holding
the Sports Faculty assignment, object-scoped server-side to the
sport(s)/team(s) they are assigned to — never school-wide, and never
usable by a Faculty account without that assignment.

STRUCTURE & ASSETS — Admin only, web:

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `GET` | `/api/v1/sports` | List sports. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sports` | Create sport. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/{id}` | Get sport. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/sports/{id}` | Update sport. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sport-categories` | List sport categories. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sport-categories` | Create category. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/sport-categories/{id}` | Update category. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/facilities` | List facilities. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sports/facilities` | Create facility. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/facilities/{id}` | Get facility. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/sports/facilities/{id}` | Update facility. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/equipment` | List equipment. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sports/equipment` | Create equipment. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/equipment/{id}` | Get equipment. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/sports/equipment/{id}` | Update equipment. | Admin |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/teams/{id}/coaches` | List coaches. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/sports/teams/{id}/coaches` | Assign coach to team — internal (a Faculty member holding Sports Faculty) or external, with police-verification-expiry tracked the same way as a transport driver. | Admin |  |

OPERATIONS — Sports Faculty only, mobile, object-scoped to their assigned sport(s)/team(s):

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/{id}/offerings` | List sport offerings. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/{id}/offerings` | Create sport offering. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sport-trials` | List trials. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sport-trials` | Create trial. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sport-trials/{id}` | Get trial. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/sport-trials/{id}` | Update trial. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sport-trial-results` | List results. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sport-trial-results` | Record result. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/teams` | List teams. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/teams` | Create team. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/teams/{id}` | Get team. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/sports/teams/{id}` | Update team. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/teams/{id}/rosters` | List roster. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/teams/{id}/rosters` | Add roster member — the student's own team/sport profile and participation history live here, all owned by Sports Faculty. | Sports Faculty |  |
| 📱 APP | `POST` | `/api/v1/sports/teams/{id}/rosters/{rosterId}/end` | End roster membership. | Sports Faculty |  |
| 📱 APP | `POST` | `/api/v1/sports/training-sessions` | Create training session. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/training-sessions` | List training sessions. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/sports/training-sessions/{id}` | Update training session. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/training-sessions/{id}/attendance` | List training attendance. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/training-sessions/{id}/attendance` | Record training attendance. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/tournaments` | List tournaments. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/tournaments` | Create tournament. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/tournaments/{id}` | Get tournament. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/sports/tournaments/{id}` | Update tournament. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/tournaments/{id}/entries` | List tournament entries. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/tournaments/{id}/entries` | Create tournament entry. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/fixtures` | List fixtures. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/fixtures` | Create fixture. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/fixtures/{id}` | Get fixture. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/sports/fixtures/{id}` | Update fixture. | Sports Faculty |  |
| 📱 APP | `POST` | `/api/v1/sports/fixtures/{id}/results` | Record fixture result. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/team-rankings` | List rankings. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/team-rankings` | Record/update ranking snapshot. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/achievements` | List sports achievements. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/achievements` | Create sports achievement — writes into the SAME shared `achievement` table as Community, not a parallel one. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/certificates` | List sports certificates. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/certificates` | Create sports certificate. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/facilities/{id}/bookings` | List bookings. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/facilities/{id}/bookings` | Create booking. | Sports Faculty |  |
| 📱 APP | `PATCH` | `/api/v1/sports/facility-bookings/{id}` | Update booking. | Sports Faculty |  |
| 📱 APP | `POST` | `/api/v1/sports/facility-bookings/{id}/cancel` | Cancel booking. | Sports Faculty |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/sports/equipment-issues` | List issues. | Authenticated + permission/object |  |
| 📱 APP | `POST` | `/api/v1/sports/equipment/{id}/issues` | Issue equipment (from Admin's master inventory) to a student/team. | Sports Faculty |  |
| 📱 APP | `POST` | `/api/v1/sports/equipment-issues/{id}/return` | Record return. | Sports Faculty |  |

## Phase 5 · Finance, Fees & Payments

43 APIs · 38 WEB · 4 APP · 1 SERVER · **3 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/finance/fee-structures` | List fee structures. | Finance/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/fee-structures` | Create fee structure. | Finance/Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/fee-structures/{id}` | Get fee structure. | Finance/Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/finance/fee-structures/{id}` | Update before activation/lock. | Finance/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/fee-structures/{id}/activate` | Activate fee structure. | Finance/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/fee-structures/{id}/deactivate` | Deactivate fee structure without deleting history. | Finance/Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/obligations` | List student financial obligations. | Finance/authorized object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/obligations` | Create obligation where manual creation is supported. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/obligations/{id}` | Get obligation. | Finance/object scope |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/obligation-imports` | List import jobs. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/obligation-imports` | Create import job. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/obligation-imports/{id}` | Get import job/status. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/obligation-imports/{id}/validate` | Validate import without committing final obligations. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/obligation-imports/{id}/confirm` | Commit validated import. | Finance + explicit confirmation |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/obligation-imports/{id}/cancel` | Cancel import. | Finance |  |
| 📱 APP | `GET` | `/api/v1/finance/payments` | List payments. | Finance / parent own scope |  |
| 📱 APP | `POST` | `/api/v1/finance/payments` | Create payment intent/transaction as defined by provider | Finance / parent |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/payments/{id}` | Get payment. | Object scoped |  |
| ⚙️ SERVER | `POST` | `/api/v1/finance/payment-events` | Receive/process verified payment event; provider-facing | Verified provider/internal |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/payments/{id}/allocations` | List allocations. | Finance/object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/payments/{id}/allocations` | Allocate confirmed payment to obligations. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/payments/{id}/receipt` | Get receipt metadata/access. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/payments/{id}/receipt` | Generate receipt where required. | Finance/system |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/payments/{id}/refunds` | List refunds. | Finance/object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/payments/{id}/refunds` | Create refund command. | Finance + policy |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/refunds/{id}` | Get refund. | Finance/object scope |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/expenses` | List expenses. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/expenses` | Create expense. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/expenses/{id}` | Get expense. | Finance |  |
| 🖥️ WEB | `PATCH` | `/api/v1/finance/expenses/{id}` | Update draft expense. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/expenses/{id}/submit` | Submit expense. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/expenses/{id}/approve` | Approve expense. | Authorized approver; separation of |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/expenses/{id}/reject` | Reject expense. | Authorized approver |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/expenses/{id}/cancel` | Cancel draft/submitted expense when allowed. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/reconciliations` | List reconciliation jobs. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/reconciliations` | Create reconciliation. | Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/finance/reconciliations/{id}` | Get reconciliation. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/reconciliations/{id}/run` | Run reconciliation. | Finance/system |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/reconciliations/{id}/resolve` | Resolve discrepancy. | Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/finance/reconciliations/{id}/close` | Close reconciliation. | Finance |  |
| 📱 APP | `POST` | `/api/v1/finance/obligations/{obligationId}/extension-requests` | Request an extension of a fee due date. | Parent (own child) / Finance | **NEW** |
| 📱 APP | `GET` | `/api/v1/finance/extension-requests` | List fee extension requests within scope. | Finance / parent own | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/finance/extension-requests/{id}` | Get fee extension request. | Object scoped | **NEW** |

## Phase 5 · Wallet & Canteen

39 APIs · 25 WEB · 13 APP · 1 DEVICE · **11 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 📱 APP | `GET` | `/api/v1/wallets` | List wallets within authorized scope. | Finance / parent own children |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets` | Create wallet. | Finance/Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/wallets/{id}` | Get wallet status/balance view. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets/{id}/activate` | Activate wallet. | Finance/Admin |  |
| 📱 APP | `POST` | `/api/v1/wallets/{id}/freeze` | Freeze wallet. | Finance/Admin / authorized parent |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets/{id}/unfreeze` | Unfreeze wallet. | Finance/Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/wallets/{id}/limits` | List wallet limits. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets/{id}/limits` | Create limit. | Finance/Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/wallet-limits/{id}` | Update limit. | Finance/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/wallet-limits/{id}/deactivate` | Deactivate limit. | Finance/Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/wallets/{id}/transactions` | List wallet transactions. | Object scoped |  |
| 🖥️ WEB | `GET` | `/api/v1/wallets/{id}/ledger` | List authoritative ledger entries. | Finance/object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets/{id}/topups` | Credit wallet through authorized top-up flow. | Finance/verified provider |  |
| 📱 APP | `POST` | `/api/v1/wallets/{id}/debits` | Debit wallet for authoritative purchase/use. | Authorized system/device/service |  |
| 🖥️ WEB | `POST` | `/api/v1/wallets/{id}/refunds` | Create wallet refund/compensation entry. | Finance/authorized service |  |
| 🖥️ WEB | `GET` | `/api/v1/canteens` | List canteens. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/canteens` | Create canteen. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/canteens/{id}` | Get canteen. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/canteens/{id}` | Update canteen. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/canteens/{id}/products` | List products. | Canteen scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/canteens/{id}/products` | Create product. | Canteen/Finance authorized |  |
| 🖥️ WEB | `GET` | `/api/v1/canteen-products/{id}` | Get product. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/canteen-products/{id}` | Update product. | Canteen/Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/canteen-products/{id}/activate` | Activate product. | Canteen/Finance |  |
| 🖥️ WEB | `POST` | `/api/v1/canteen-products/{id}/deactivate` | Deactivate product. | Canteen/Finance |  |
| 🖥️ WEB | `GET` | `/api/v1/canteens/{id}/transactions` | List canteen transactions. | Canteen/Finance |  |
| 📱 APP | `POST` | `/api/v1/canteens/{id}/transactions` | Create authoritative canteen sale. | Canteen operator/device service |  |
| 🖥️ WEB | `GET` | `/api/v1/canteen-transactions/{id}` | Get canteen transaction. | Object scoped |  |
| 📱 APP | `POST` | `/api/v1/wallets/{id}/auto-topup` | Create an automatic top-up instruction. | Authorized parent | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/wallets/{id}/auto-topup` | Get the active automatic top-up instruction. | Object scoped | **NEW** |
| 📱 APP | `PATCH` | `/api/v1/wallet-auto-topups/{id}` | Update automatic top-up threshold or amount. | Authorized parent | **NEW** |
| 📱 APP | `POST` | `/api/v1/wallet-auto-topups/{id}/cancel` | Cancel automatic top-up instruction. | Authorized parent / Finance | **NEW** |
| 📱 APP | `GET` | `/api/v1/canteen/menu-items` | List canteen menu items. | Vendor / Finance / parent | **NEW** |
| 📱 APP | `POST` | `/api/v1/canteen/menu-items` | Create or update a canteen menu item. | Vendor / Admin | **NEW** |
| 📱 APP | `POST` | `/api/v1/canteen/pre-orders` | Create and pay for a meal pre-order. | Authorized parent | **NEW** |
| 📱 APP | `GET` | `/api/v1/canteen/pre-orders` | List meal pre-orders within scope. | Vendor / parent own | **NEW** |
| 📱 APP | `POST` | `/api/v1/canteen/pre-orders/{id}/collect` | Record pre-order collection against a card tap. | Authorized vendor terminal | **NEW** |
| 📱 APP | `POST` | `/api/v1/canteen/pre-orders/{id}/cancel` | Cancel and refund an uncollected pre-order. | Authorized parent / Vendor | **NEW** |
| 🔌 DEVICE | `POST` | `/api/v1/canteen/transactions/sync` | Synchronize queued offline canteen sales. | Authenticated device | **NEW** |

## Phase 6 · Transport, NFC, GPS & Devices

67 APIs · 52 WEB · 7 APP · 8 DEVICE · **10 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/devices` | List devices. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/devices` | Register device. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/devices/{id}` | Get device. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/devices/{id}` | Update device metadata. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/devices/{id}/activate` | Activate device. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/devices/{id}/deactivate` | Deactivate device. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/devices/{id}/assignments` | List device assignments. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/devices/{id}/assignments` | Assign device to permitted operational context. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/device-assignments/{id}` | Update device assignment. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/device-assignments/{id}/end` | End device assignment. | Admin |  |
| 🔌 DEVICE | `POST` | `/api/v1/devices/{id}/heartbeat` | Device heartbeat. | Authenticated device |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/vehicles` | List vehicles. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/vehicles` | Create vehicle. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/vehicles/{id}` | Get vehicle. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/transport/vehicles/{id}` | Update vehicle. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/vehicles/{id}/activate` | Activate vehicle. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/vehicles/{id}/deactivate` | Deactivate vehicle. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/routes` | List routes. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/routes` | Create route. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/routes/{id}` | Get route. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/transport/routes/{id}` | Update route. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/routes/{id}/stops` | List route stops. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/routes/{id}/stops` | Create route stop. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/transport/route-stops/{id}` | Update stop. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/route-stops/{id}/activate` | Activate stop. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/route-stops/{id}/deactivate` | Deactivate stop. | Admin |  |
| 📱 APP | `GET` | `/api/v1/transport/student-assignments` | List active/historical transport assignments. | Transport / parent object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/student-assignments` | Assign student to route/stop/transport context. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/student-assignments/{id}` | Get assignment. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/transport/student-assignments/{id}` | Update permitted assignment attributes. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/student-assignments/{id}/end` | End assignment. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/trips` | List trips. | Transport / leadership scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/trips` | Create trip. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/trips/{id}` | Get trip. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/trips/{id}/start` | Start trip. | Admin / device |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/trips/{id}/complete` | Complete trip. | Admin / device |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/trips/{id}/cancel` | Cancel trip. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/nfc/cards` | List cards within scope. | Transport/Finance/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/nfc/cards` | Register NFC card. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/nfc/cards/{id}` | Get card status. | Authorized scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/nfc/cards/{id}` | Update permitted card metadata. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/nfc/cards/{id}/assign` | Assign card to permitted student/user context. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/nfc/cards/{id}/activate` | Activate card. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/nfc/cards/{id}/suspend` | Suspend card. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/nfc/cards/{id}/revoke` | Revoke card permanently. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/nfc/cards/{id}/history` | Get card assignment/status history. | Authorized scope |  |
| 🔌 DEVICE | `POST` | `/api/v1/transport/taps` | Ingest a single device tap event. | Authenticated device |  |
| 🔌 DEVICE | `POST` | `/api/v1/transport/taps/sync` | Synchronize queued offline tap events. | Authenticated device |  |
| 📱 APP | `GET` | `/api/v1/transport/student-events` | List validated transport student events. | Transport / parent own child scope |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/student-events/{id}` | Get validated transport event. | Object scoped |  |
| 🔌 DEVICE | `POST` | `/api/v1/transport/gps/telemetry` | Ingest GPS telemetry. | Authenticated device |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/trips/{id}/gps` | Read trip telemetry/read model. | Transport/leadership scoped |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/incidents` | List transport incidents. | Transport/leadership |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/incidents` | Create transport incident. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/transport/incidents/{id}` | Get incident. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/transport/incidents/{id}` | Update permitted incident data. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/transport/incidents/{id}/close` | Close incident. | Admin |  |
| 🔌 DEVICE | `POST` | `/api/v1/transport/trips/{tripId}/boardings` | Record a student board or alight event. | Authenticated device / attendant | **NEW** |
| 📱 APP | `GET` | `/api/v1/transport/trips/{tripId}/boardings` | List boarding events for a trip. | Transport / leadership scoped | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/transport/trips/{tripId}/student-status` | Per-student status board for a trip. | Transport / leadership scoped | **NEW** |
| 📱 APP | `GET` | `/api/v1/transport/trips/{tripId}/exceptions` | List students expected but not yet boarded. | Transport / attendant | **NEW** |
| 📱 APP | `POST` | `/api/v1/transport/trips/{tripId}/boarding/close` | Finalise boarding; expected students become not-boarded. | Admin / device | **NEW** |
| 📱 APP | `GET` | `/api/v1/students/{studentId}/transport/status` | Current transport status for one student. | Parent (own child) / Transport | **NEW** |
| 📱 APP | `GET` | `/api/v1/students/{studentId}/transport/live` | Current vehicle position during an active trip. | Parent (own child) / Transport | **NEW** |
| 🔌 DEVICE | `POST` | `/api/v1/nfc/cards/{id}/provisioning-token` | Issue a single-use card personalisation token. | Admin + card management scope | **NEW** |
| 🔌 DEVICE | `POST` | `/api/v1/nfc/cards/{id}/provisioning/confirm` | Confirm successful card personalisation. | Authorized personalisation station | **NEW** |
| 🔌 DEVICE | `GET` | `/api/v1/nfc/cards/blocklist` | Retrieve the current card blocklist for terminal sync. | Authenticated device | **NEW** |

## Phase 7 · Hostel

67 APIs · 29 WEB · 37 APP · 1 BOTH

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `GET` | `/api/v1/hostels` | List hostels. | Hostel/Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostels` | Create hostel. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostels/{id}` | Get hostel. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/hostels/{id}` | Update hostel. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostels/{id}/activate` | Activate hostel. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostels/{id}/deactivate` | Deactivate hostel. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostels/{id}/blocks` | List blocks. | Hostel scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/hostels/{id}/blocks` | Create block. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel-blocks/{id}` | Get block. | Hostel scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/hostel-blocks/{id}` | Update block. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-blocks/{id}/activate` | Activate block. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-blocks/{id}/deactivate` | Deactivate block. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel-blocks/{id}/rooms` | List rooms. | Hostel scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-blocks/{id}/rooms` | Create room. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel-rooms/{id}` | Get room. | Hostel scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/hostel-rooms/{id}` | Update room. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel-rooms/{id}/beds` | List beds. | Hostel scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-rooms/{id}/beds` | Create bed. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel-beds/{id}` | Get bed. | Hostel scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/hostel-beds/{id}` | Update bed. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-beds/{id}/activate` | Activate bed. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel-beds/{id}/deactivate` | Deactivate bed. | Admin |  |
| 📱 APP | `GET` | `/api/v1/hostel/allocations` | List allocations. | Warden / parent limited child scope |  |
| 📱 APP | `POST` | `/api/v1/hostel/allocations` | Create allocation. | Warden |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel/allocations/{id}` | Get allocation. | Object scoped |  |
| 📱 APP | `POST` | `/api/v1/hostel/allocations/{id}/check-in` | Check in student. | Warden |  |
| 📱 APP | `POST` | `/api/v1/hostel/allocations/{id}/check-out` | Check out student. | Warden |  |
| 📱 APP | `POST` | `/api/v1/hostel/allocations/{id}/transfer` | Transfer allocation. | Warden |  |
| 📱 APP | `GET` | `/api/v1/hostel/attendance/sessions` | List hostel attendance sessions. | Warden |  |
| 📱 APP | `POST` | `/api/v1/hostel/attendance/sessions` | Create session. | Warden |  |
| 📱 APP | `GET` | `/api/v1/hostel/attendance/sessions/{id}` | Get session. | Warden |  |
| 📱 APP | `GET` | `/api/v1/hostel/attendance/sessions/{id}/records` | List records. | Warden |  |
| 📱 APP | `POST` | `/api/v1/hostel/attendance/sessions/{id}/records` | Record attendance. | Warden |  |
| 📱 APP | `GET` | `/api/v1/hostel/attendance/records/{id}` | Get attendance record. | Warden/object scope |  |
| 📱 APP | `POST` | `/api/v1/hostel/attendance/records/{id}/corrections` | Controlled correction. | Warden/authorized leadership |  |
| 📱 APP | `POST` | `/api/v1/hostel/attendance/sessions/{id}/lock` | Lock session. | Warden/authorized leadership |  |
| 📱 APP | `GET` | `/api/v1/hostel/leave-requests` | List leave requests. | Warden / parent own child scope |  |
| 🖥️ WEB | `POST` | `/api/v1/hostel/leave-requests` | Create leave request. | Parent/authorized operator |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel/leave-requests/{id}` | Get leave request. | Object scoped |  |
| 📱 APP | `PATCH` | `/api/v1/hostel/leave-requests/{id}` | Update request while editable. | Requester/Warden scope |  |
| 📱 APP | `POST` | `/api/v1/hostel/leave-requests/{id}/approve` | Approve leave. | Warden/authorized approver |  |
| 📱 APP | `POST` | `/api/v1/hostel/leave-requests/{id}/reject` | Reject leave. | Warden/authorized approver |  |
| 📱 APP | `POST` | `/api/v1/hostel/leave-requests/{id}/cancel` | Cancel request. | Requester/Warden policy |  |
| 📱 APP | `GET` | `/api/v1/hostel/incidents` | List hostel incidents. | Warden/leadership |  |
| 📱 APP | `POST` | `/api/v1/hostel/incidents` | Create hostel incident. | Warden |  |
| 🖥️ WEB | `GET` | `/api/v1/hostel/incidents/{id}` | Get incident. | Authenticated + permission/object |  |
| 📱 APP | `PATCH` | `/api/v1/hostel/incidents/{id}` | Update permitted incident data. | Warden |  |
| 📱 APP | `POST` | `/api/v1/hostel/incidents/{id}/close` | Close incident. | Warden/leadership |  |
| 📱 APP | `GET` | `/api/v1/health/infirmary-visits` | List infirmary visits where authorized. | Restricted health role / permitted parent |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits` | Create infirmary visit. | Authorized health staff |  |
| 🖥️ WEB | `GET` | `/api/v1/health/infirmary-visits/{id}` | Get visit. | Restricted object scope |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/vitals` | Record vitals. | Health staff |  |
| 📱 APP | `GET` | `/api/v1/health/infirmary-visits/{id}/vitals` | Get visit vitals. | Health staff / permitted scope |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/sick-bay-admission` | Admit to sick bay. | Health staff |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/sick-bay-discharge` | Discharge from sick bay. | Health staff |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/medications` | Record medication order/administration plan as supported. | Health staff |  |
| 📱 APP | `GET` | `/api/v1/health/infirmary-visits/{id}/medications` | List visit medications. | Restricted health scope |  |
| 📱 APP | `POST` | `/api/v1/health/medications/{id}/administer` | Record administration. | Authorized health staff |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/escalations` | Create escalation. | Health staff |  |
| 🖥️ WEB | `GET` | `/api/v1/health/escalations/{id}` | Get escalation. | Restricted scope |  |
| 📱 APP | `POST` | `/api/v1/health/escalations/{id}/hospital-referrals` | Create hospital referral. | Authorized health staff |  |
| 🖥️ WEB | `GET` | `/api/v1/health/hospital-referrals/{id}` | Get referral. | Restricted scope |  |
| 📱 APP | `POST` | `/api/v1/health/hospital-referrals/{id}/complete` | Complete referral record. | Authorized health staff |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/follow-ups` | Create follow-up. | Health staff |  |
| 🖥️ WEB | `GET` | `/api/v1/health/infirmary-visits/{id}/follow-ups` | List follow-ups. | Restricted scope |  |
| 📱 APP | `POST` | `/api/v1/health/follow-ups/{id}/complete` | Complete follow-up. | Authorized health staff |  |
| 📱 APP | `POST` | `/api/v1/health/infirmary-visits/{id}/close` | Close visit. | Authorized health staff |  |

## Phase 8 · Health / Infirmary

43 APIs · 39 WEB · 4 APP · **4 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/announcements` | List announcements visible to caller. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/announcements` | Create announcement. | Admin/leadership/authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/announcements/{id}` | Get announcement. | Authenticated + permission/object |  |
| 🖥️ WEB | `PATCH` | `/api/v1/announcements/{id}` | Update draft announcement. | Owner/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/announcements/{id}/schedule` | Schedule announcement. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/announcements/{id}/publish` | Publish announcement. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/announcements/{id}/cancel` | Cancel scheduled announcement. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/announcements/{id}/expire` | Expire announcement. | Authorized role/system |  |
| 🖥️ WEB | `GET` | `/api/v1/notifications` | List current user's notifications. | Authenticated |  |
| 🖥️ WEB | `GET` | `/api/v1/notifications/{id}` | Get own notification. | Authenticated + ownership |  |
| 🖥️ WEB | `POST` | `/api/v1/notifications/{id}/read` | Mark notification read. | Authenticated + ownership |  |
| 🖥️ WEB | `POST` | `/api/v1/notifications/read-all` | Mark visible notifications read. | Authenticated |  |
| 🖥️ WEB | `GET` | `/api/v1/notification-preferences` | Get current user's preferences. | Authenticated |  |
| 🖥️ WEB | `POST` | `/api/v1/notification-preferences` | Create preference set where needed. | Authenticated |  |
| 🖥️ WEB | `PATCH` | `/api/v1/notification-preferences/{id}` | Update own permitted preferences. | Authenticated + ownership |  |
| 🖥️ WEB | `GET` | `/api/v1/messages/conversations` | List conversations accessible to caller. | Authenticated/scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/messages/conversations` | Create conversation. | Authorized communication role |  |
| 🖥️ WEB | `GET` | `/api/v1/messages/conversations/{id}` | Get conversation. | Participant/object scope |  |
| 🖥️ WEB | `GET` | `/api/v1/messages/conversations/{id}/participants` | List participants. | Participant/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/messages/conversations/{id}/participants` | Add permitted participant. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/messages/conversations/{id}/messages` | List messages. | Participant/object scope |  |
| 🖥️ WEB | `POST` | `/api/v1/messages/conversations/{id}/messages` | Send message. | Participant/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/messages/{id}/attachments` | Attach file/document. | Participant + document policy |  |
| 🖥️ WEB | `GET` | `/api/v1/documents` | List documents visible to caller. | Object/purpose scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/upload-sessions` | Create private upload session. | Authenticated + permission |  |
| 🖥️ WEB | `GET` | `/api/v1/documents/{id}` | Get document metadata. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/documents/{id}` | Update mutable metadata. | Owner/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/upload-sessions/{id}/complete` | Finalize uploaded object and create/validate metadata. | Authenticated + upload ownership |  |
| 🖥️ WEB | `GET` | `/api/v1/documents/{id}/links` | List business-object links. | Authorized scope |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/{id}/links` | Link document to business object. | Authorized scope |  |
| 🖥️ WEB | `GET` | `/api/v1/documents/{id}/versions` | List document versions. | Authorized scope |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/{id}/versions` | Create new version. | Authorized scope |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/{id}/verify` | Verify document. | Authorized reviewer |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/{id}/reject` | Reject document. | Authorized reviewer |  |
| 🖥️ WEB | `POST` | `/api/v1/documents/{id}/archive` | Archive document. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/evidence` | List evidence visible to caller. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/evidence` | Create evidence link/record. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/evidence/{id}` | Get evidence. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/evidence/{id}/archive` | Archive evidence record without destroying audit history. | Authorized role |  |
| 📱 APP | `POST` | `/api/v1/health/students/{studentId}/medication-schedules` | Create a standing medication schedule. | Authorized health staff | **NEW** |
| 📱 APP | `GET` | `/api/v1/health/students/{studentId}/medication-schedules` | List standing medication schedules for a student. | Restricted health scope / parent own | **NEW** |
| 📱 APP | `POST` | `/api/v1/health/medication-schedules/{id}/stop` | Stop an active medication schedule. | Authorized health staff | **NEW** |
| 📱 APP | `GET` | `/api/v1/health/medication-rounds` | List medication doses due within a time window. | Authorized health staff / Warden | **NEW** |

## Phase 9 · Incidents, Discipline, Safety & Emergency

30 APIs · 30 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/incidents` | List general incidents. | Authenticated + permission/object |  |
| 🖥️ WEB | `POST` | `/api/v1/incidents` | Create incident. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/incidents/{id}` | Get incident. | Object scoped |  |
| 🖥️ WEB | `PATCH` | `/api/v1/incidents/{id}` | Update permitted incident data. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/incidents/{id}/participants` | List participants. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/incidents/{id}/participants` | Add participant. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/incidents/{id}/evidence` | List incident evidence. | Object scoped |  |
| 🖥️ WEB | `POST` | `/api/v1/incidents/{id}/evidence` | Attach evidence. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/incidents/{id}/close` | Close incident. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/discipline/cases` | List discipline cases. | Restricted leadership/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases` | Create discipline case. | Authorized leadership/discipline role |  |
| 🖥️ WEB | `GET` | `/api/v1/discipline/cases/{id}` | Get case. | Restricted object scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/discipline/cases/{id}` | Update permitted case metadata. | Authorized discipline role |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/investigate` | Move case into investigation. | Authorized discipline role |  |
| 🖥️ WEB | `GET` | `/api/v1/discipline/cases/{id}/findings` | List findings. | Restricted |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/findings` | Record finding. | Authorized discipline role |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/decision` | Record decision. | Authorized decision maker |  |
| 🖥️ WEB | `GET` | `/api/v1/discipline/cases/{id}/actions` | List actions. | Restricted |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/actions` | Create disciplinary action. | Authorized decision maker |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/actions/{id}/complete` | Complete action. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/resolve` | Resolve case. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/discipline/cases/{id}/close` | Close case. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/safety/incidents` | List safety incidents. | Restricted safety/leadership |  |
| 🖥️ WEB | `POST` | `/api/v1/safety/incidents` | Create safety incident. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/safety/incidents/{id}` | Get safety incident. | Restricted object scope |  |
| 🖥️ WEB | `PATCH` | `/api/v1/safety/incidents/{id}` | Update permitted safety data. | Authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/safety/incidents/{id}/follow-ups` | List follow-ups. | Restricted |  |
| 🖥️ WEB | `POST` | `/api/v1/safety/incidents/{id}/follow-ups` | Create follow-up. | Authorized safety role |  |
| 🖥️ WEB | `POST` | `/api/v1/safety/follow-ups/{id}/complete` | Complete follow-up. | Authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/safety/incidents/{id}/close` | Close safety incident. | Authorized role |  |

## Phase 9 · Communication, Notifications, Documents & Evidence

10 APIs · 9 BOTH · 1 SERVER · **1 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️📱 BOTH | `GET` | `/api/v1/emergencies` | List emergencies. | Highly restricted leadership |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies` | Create emergency record. | Highly restricted |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/emergencies/{id}` | Get emergency. | Highly restricted |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies/{id}/declare` | Declare emergency. | Authorized emergency role |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies/{id}/response` | Record response action/status. | Authorized emergency role |  |
| 🖥️📱 BOTH | `GET` | `/api/v1/emergencies/{id}/escalations` | List escalations. | Highly restricted |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies/{id}/escalations` | Create escalation. | Authorized emergency role |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies/{id}/resolve` | Resolve emergency. | Authorized emergency role |  |
| 🖥️📱 BOTH | `POST` | `/api/v1/emergencies/{id}/close` | Close emergency record. | Authorized leadership |  |
| ⚙️ SERVER | `POST` | `/api/v1/notifications/delivery-events` | Receive/process verified delivery status event; provider-facing boundary. | Verified provider/internal | **NEW** |

## Phase 10 · Approvals

5 APIs · 5 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/approvals` | List approvals available to the caller. | Authorized workflow scope |  |
| 🖥️ WEB | `POST` | `/api/v1/approvals` | Create workflow approval request where applicable. | Domain service/authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/approvals/{id}` | Get approval request. | Authorized workflow scope |  |
| 🖥️ WEB | `POST` | `/api/v1/approvals/{id}/approve` | Approve current workflow step. | Authorized approver; separation of |  |
| 🖥️ WEB | `POST` | `/api/v1/approvals/{id}/reject` | Reject current workflow step. | Authorized approver |  |

## Phase 10 · Bulk Operations

8 APIs · 8 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/bulk-jobs` | List bulk jobs. | Admin/domain authorized |  |
| 🖥️ WEB | `POST` | `/api/v1/bulk-jobs` | Create bulk job. | Admin/domain authorized |  |
| 🖥️ WEB | `GET` | `/api/v1/bulk-jobs/{id}` | Get job status. | Job owner/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/bulk-jobs/{id}/input` | Attach/import input. | Job owner/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/bulk-jobs/{id}/validate` | Dry-run/validate job input. | Job owner/authorized role |  |
| 🖥️ WEB | `POST` | `/api/v1/bulk-jobs/{id}/confirm` | Explicitly confirm processing. | Authorized confirmer |  |
| 🖥️ WEB | `POST` | `/api/v1/bulk-jobs/{id}/cancel` | Cancel job before irreversible processing. | Job owner/authorized role |  |
| 🖥️ WEB | `GET` | `/api/v1/bulk-jobs/{id}/errors` | Get structured row-level errors/results. | Job owner/authorized role |  |

## Phase 10 · Audit

3 APIs · 3 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/audit-events` | Query audit events allowed to caller. | Restricted Admin/leadership/audit role |  |
| 🖥️ WEB | `GET` | `/api/v1/audit-events/{id}` | Get one audit event. | Restricted |  |
| 🖥️ WEB | `POST` | `/api/v1/audit-events/{id}/annotations` | Add controlled annotation if product requires it. | Restricted audit role |  |

## Phase 10 · Reporting & Scheduled Operations

6 APIs · 6 WEB

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/scheduled-jobs` | List user-managed schedules if this feature is enabled. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/scheduled-jobs` | Create user-managed schedule if enabled. | Admin |  |
| 🖥️ WEB | `GET` | `/api/v1/scheduled-jobs/{id}` | Get schedule. | Admin |  |
| 🖥️ WEB | `PATCH` | `/api/v1/scheduled-jobs/{id}` | Update schedule. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/scheduled-jobs/{id}/activate` | Activate schedule. | Admin |  |
| 🖥️ WEB | `POST` | `/api/v1/scheduled-jobs/{id}/deactivate` | Deactivate schedule. | Admin |  |

## Phase 11 · Camps

26 APIs · 18 WEB · 8 APP · **26 new**

| Platform | Method | Endpoint | Purpose | Access | |
|---|---|---|---|---|---|
| 🖥️ WEB | `GET` | `/api/v1/camps` | List camps within scope. | Scoped | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps` | Create camp. | Admin | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camps/{id}` | Get camp. | Scoped | **NEW** |
| 🖥️ WEB | `PATCH` | `/api/v1/camps/{id}` | Update mutable camp attributes before start. | Admin | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/announce` | Announce camp to the target audience. | Admin / Principal | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/start` | Mark camp ongoing. | Admin / camp organiser | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/complete` | Complete camp. | Admin / camp organiser | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/cancel` | Cancel camp. | Admin / Principal | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camps/{id}/sessions` | List camp sessions. | Scoped | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/sessions` | Create camp session. | Admin / organiser | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camps/{id}/services` | List camp services. | Scoped | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/services` | Define a camp service. | Admin / health authority | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camps/{id}/participants` | List camp participants. | Organiser / faculty scoped | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camps/{id}/participants` | Register camp participants. | Admin / organiser | **NEW** |
| 📱 APP | `POST` | `/api/v1/camps/{id}/consents` | Record parent consent for a participant. | Authorized parent | **NEW** |
| 📱 APP | `POST` | `/api/v1/camp-participants/{id}/attendance` | Mark camp session attendance. | Faculty / organiser | **NEW** |
| 📱 APP | `GET` | `/api/v1/camp-participants/{id}/checkups` | List checkup records for a participant. | Restricted health scope / parent own | **NEW** |
| 📱 APP | `POST` | `/api/v1/camp-participants/{id}/checkups` | Record a camp checkup finding. | Authorized health staff | **NEW** |
| 📱 APP | `GET` | `/api/v1/camp-checkups/{id}` | Get checkup record. | Restricted object scope | **NEW** |
| 📱 APP | `PATCH` | `/api/v1/camp-checkups/{id}` | Correct a checkup record before camp completion. | Authorized health staff | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camps/{id}/follow-ups` | List follow-ups arising from a camp. | Restricted health scope | **NEW** |
| 📱 APP | `POST` | `/api/v1/camp-checkups/{id}/follow-ups` | Create a follow-up action. | Authorized health staff | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camp-follow-ups/{id}/complete` | Complete a follow-up. | Authorized health staff | **NEW** |
| 🖥️ WEB | `GET` | `/api/v1/camp-partners` | List camp partner organisations. | Admin / organiser | **NEW** |
| 🖥️ WEB | `POST` | `/api/v1/camp-partners` | Register a camp partner. | Admin | **NEW** |
| 📱 APP | `GET` | `/api/v1/students/{studentId}/camps` | List a student's camp participation and findings. | Parent (own child) / restricted health scope | **NEW** |
---

# 4. Detailed Contracts — New and Corrected Endpoints

Every endpoint inherits Section 2. Only endpoint-specific items are stated here. The 628 base endpoints retain the contract structure of the school's approved specification (Contract Item / Definition tables, Request, Validation & Business Rules, Success Response, Error Contract, Implementation Notes) and are not restated in full here.

---

## 4.1 Correction — `POST /api/v1/finance/payment-events`

The endpoint, path, purpose and access are unchanged from the base specification. Its security contract was generic ("Bearer access token/session unless explicitly... provider-authenticated") and left the mechanism of "verified" undefined for the single most security-sensitive endpoint in the product.

| Contract item | Definition |
|---|---|
| Purpose | Receive/process verified payment event; provider-facing boundary |
| Authentication | **Exempt from Bearer token.** Provider signature only |
| Authorization | Verified provider / internal |
| Signature verification | Mandatory. Verify the provider HMAC signature header against the **raw request body before parsing**. Reject with 401 on mismatch |
| Replay protection | The provider event identifier is stored and treated as an idempotency key. A repeated event returns 200 with the original outcome and performs no further state change |
| Ordering | Events may arrive out of order. State transitions are forward-only; a stale event is acknowledged and discarded |
| Body | Provider-defined payload, passed through an adapter |
| Rate limiting | Per source IP |
| Success status | 200 |

**Validation and business rules**

- The raw body must be preserved unparsed until signature verification completes.
- A payment is never marked confirmed by any path other than this endpoint or a reconciliation job. A client-side callback is never trusted.
- Settlement against obligations remains a separate operation via the finance allocations endpoint. This separation is what allows one payment to settle obligations for several siblings.
- An event for an unknown payment reference is acknowledged with 200 and queued for reconciliation, not rejected.

---

## 4.2 Attendance — offline sync

### `POST /api/v1/attendance/sessions/sync`

| Contract item | Definition |
|---|---|
| Purpose | Synchronize queued offline attendance sessions and records |
| Authorization | Faculty + assigned class scope |
| Operation | Batch resource mutation |
| Success status | 200 with per-item outcomes |
| Body | Array of queued sessions, each containing records and a client-generated `clientKey` |
| Idempotency | **Required.** Each `clientKey` is unique per device and enforced by a database constraint |
| Response | Array of `{ clientKey, outcome, sessionId?, error? }` |

**Validation and business rules**

- `DUPLICATE` is a success outcome, not an error.
- Items are processed independently. One rejection does not roll back the others.
- A queued session for a date or class outside the caller's assignment window is rejected.
- Session lock state is evaluated at sync time. A session locked in the interim returns `REJECTED` with the attendance-correction path in the error detail.
- Absence notifications for synced records are enqueued after commit, and are suppressed for dates where approved leave exists.

---

## 4.2a Staff biometric and manual attendance — NEW

Staff/faculty attendance did not previously exist as its own endpoint group. This adds it, with two entry points reflecting the same rule every device-fed feature in this document follows: a machine is the fast path, a human is the fallback, and the fallback is never silently trusted — it is either entered by someone with the authority to confirm it directly, or it goes through the approval engine like everything else in this system that needs a second pair of eyes.

**Underlying table (new):** `staff_attendance_event` — append-only. `method` distinguishes `BIOMETRIC_FACE`, `BIOMETRIC_FINGERPRINT`, `MANUAL`, and test-only values (`SIMULATED`, `SIMULATED_FACE`) used during development, which can never be mistaken for a production record. `state` is `CONFIRMED`, `PENDING`, or `REJECTED`.

**Correction to `POST /api/v1/devices`:** the device type enum gains `BIOMETRIC_TERMINAL` alongside the existing GPS and NFC terminal types. No path or method change — this is the same endpoint already used to register every other device in Phase 6, extended to cover one more device class.

### `POST /api/v1/staff/attendance/biometric-events`

| Contract item | Definition |
|---|---|
| Purpose | Record a staff biometric check-in or check-out event |
| Authentication | Device credential (`BIOMETRIC_TERMINAL`), not a user Bearer token |
| Success status | 201 |
| Body | `staffId`, `eventType` (`CHECK_IN` \| `CHECK_OUT`), `method`, `capturedAt`, `confidenceScore` (optional) |
| Idempotency | Required — `device_idempotency_key`, unique per device |

**Validation and business rules**

- Written with `state = CONFIRMED` immediately. A biometric match from a registered device is trusted at face value — this is the fast path the manual fallback below exists to cover when it's unavailable.
- `method` values used by a real production terminal (`BIOMETRIC_FACE`, `BIOMETRIC_FINGERPRINT`) are rejected from any caller not authenticated as a genuine device. Test-only values (`SIMULATED`, `SIMULATED_FACE`) are permitted only in non-production environments — enforce this with an environment check in the guard, not by convention.
- A duplicate `device_idempotency_key` returns the original outcome, never a second row.
- This endpoint never authenticates a *person* — the face or fingerprint match already happened on the device before this call is made. The API's job is to record the outcome, not to perform the biometric match itself.

### `POST /api/v1/staff/attendance/manual`

| Contract item | Definition |
|---|---|
| Purpose | Record a manual staff attendance entry when the biometric terminal is unavailable |
| Authentication | Bearer token |
| Authorization | **Admin or Principal** → direct entry, immediately `CONFIRMED`. **Faculty, own record only** → self-report, created `PENDING` |
| Success status | 201 |
| Body | `staffId`, `eventType`, `occurredAt`, `reason` (**mandatory**) |
| Idempotency | Required |

**Validation and business rules**

- `reason` is mandatory on every manual entry regardless of who creates it — "device was down" is exactly the kind of thing that needs to be on record, not assumed.
- **When Admin or Principal creates the entry:** state is `CONFIRMED` immediately. They are the authority; no further step needed. `recorded_by` is set to their person ID.
- **When Faculty creates the entry for themselves:** state is `PENDING`, and this creates an `approval_request` with request type `STAFF_ATTENDANCE_MANUAL_ENTRY`, routed to Admin or Principal through the existing approval engine (`POST /approvals/{id}/approve` / `reject` — no new approval endpoint, this reuses what Phase 10 already provides).
- A Faculty member cannot self-confirm their own attendance. This is the one rule in this whole addition that must never be relaxed — the entire point of a fallback path is that it is not simply "the person says so."
- On approval, the event's `state` transitions to `CONFIRMED`. On rejection, `REJECTED`, and it does not count toward attendance totals or payroll.
- A Faculty member may not create a second `PENDING` manual entry for the same date and `eventType` while one is already pending — resolve the first before submitting another.

### `GET /api/v1/staff/attendance` · `GET /api/v1/staff/attendance/{id}`

| Contract item | Definition |
|---|---|
| Purpose | List or retrieve staff attendance events |
| Authorization | Admin — all records, filterable by staff/date/method/state. Faculty — own records only |
| Query (list) | `staffId`, `dateFrom`, `dateTo`, `method`, `state` |

**Validation and business rules**

- Faculty calling the list endpoint without `staffId`, or with any `staffId` other than their own, is scoped server-side to their own records — this is an object-scope rule enforced by the same authorization resolver as everywhere else, not a client-side filter.
- A `PENDING` entry is visible to the Faculty member who created it and to Admin/Principal as a pending approval item; it does not appear in payroll or attendance-percentage calculations until `CONFIRMED`.

---

## 4.3 Finance — fee extension requests

### `POST /api/v1/finance/obligations/{obligationId}/extension-requests`

| Contract item | Definition |
|---|---|
| Purpose | Request an extension of a fee due date |
| Authorization | Parent (own child) / Finance |
| Operation | Resource mutation |
| Success status | 201 |
| Body | `requestedDueDate`, `reason`, optional `documentId` |
| Idempotency | Required |

**Validation and business rules**

- `requestedDueDate` must be later than the current due date and within a configured maximum extension window.
- Only obligations in `PENDING`, `PARTIAL` or `OVERDUE` accept a request.
- Creating the request creates a workflow approval through the existing approvals engine with request type `FEE_EXTENSION`. **It does not change the obligation.**
- The obligation due date changes only when the approval reaches an approved terminal state.
- One open request per obligation. A second returns 409.
- Late fee accrual during a pending request follows configured policy and is not hardcoded.

### `GET /api/v1/finance/extension-requests` · `GET /api/v1/finance/extension-requests/{id}`

Standard scoped reads. A parent sees only requests for their own children.

---

## 4.4 Wallet & Canteen

### `POST /api/v1/wallets/{id}/auto-topup`

| Contract item | Definition |
|---|---|
| Purpose | Create an automatic top-up instruction |
| Authorization | Authorized parent |
| Success status | 201 |
| Body | `thresholdAmount`, `topupAmount`, `mandateReference` |
| Idempotency | Required |

**Validation and business rules**

- Requires an active provider mandate reference. The instruction is created inactive until the mandate is confirmed.
- One active instruction per wallet. A second returns 409.
- `topupAmount` must exceed `thresholdAmount`.
- A failed mandate deactivates the instruction and notifies the parent. Manual top-up remains available.
- Auto top-up executions appear in the wallet ledger identically to manual top-ups, distinguished only by source.

### `GET /api/v1/wallets/{id}/auto-topup` · `PATCH /api/v1/wallet-auto-topups/{id}` · `POST /api/v1/wallet-auto-topups/{id}/cancel`

Standard object-scoped read, update and state transition. Cancellation does not revoke the underlying provider mandate; that is the parent's action with their bank.

### `GET /api/v1/canteen/menu-items` · `POST /api/v1/canteen/menu-items`

| Contract item | Definition |
|---|---|
| Purpose | List or maintain canteen menu items |
| Authorization | Vendor / Admin for write; Vendor, Finance and parent for read |
| Body | `name`, `category`, `price`, `allergenTags[]`, `isActive` |

**Validation and business rules**

- Price changes do not retroactively alter recorded transactions, which snapshot the item name and unit price.
- Deactivating an item does not delete it; historical transactions retain their reference.
- `allergenTags` drive parent item blocks and are validated against a controlled vocabulary.

### `POST /api/v1/canteen/pre-orders`

| Contract item | Definition |
|---|---|
| Purpose | Create and pay for a meal pre-order |
| Authorization | Authorized parent |
| Success status | 201 |
| Body | `studentId`, `forDate`, `items[]` |
| Idempotency | Required |

**Validation and business rules**

- `forDate` must be a future school day within the configured pre-order window.
- **The wallet is debited at creation.** The pre-order references the resulting ledger entry.
- Wallet limits and parent item blocks are evaluated at creation, not at collection.
- One pre-order per student, per vendor, per date. A second returns 409.
- Insufficient balance returns 422 with the shortfall in the error detail.

### `POST /api/v1/canteen/pre-orders/{id}/collect`

**Validation and business rules**

- Requires a card tap; the tap event reference is recorded.
- **Photo confirmation is not required for a pre-order**, because payment and authorisation already occurred at creation. This removes the pre-order from the lunch-rush critical path.
- Collection is only valid on `forDate`. Earlier or later returns 422.
- Idempotent. A second collection attempt returns 200 with the original outcome.

### `POST /api/v1/canteen/pre-orders/{id}/cancel`

**Validation and business rules**

- Refunds to the wallet as a ledger entry. Never as cash.
- Cancellable until collection. After collection, returns 409.
- Cancellation after the configured cut-off requires Vendor authorisation rather than parent.

### `POST /api/v1/canteen/transactions/sync`

| Contract item | Definition |
|---|---|
| Purpose | Synchronize queued offline canteen sales |
| Authentication | Device credential |
| Success status | 200 with per-item outcomes |
| Body | Array of queued sales with `deviceIdempotencyKey`, `cardCredential`, `amount`, `items[]`, `tappedAt`, `photoConfirmed` |

**Validation and business rules**

- Duplicate keys return `DUPLICATE` and perform no debit.
- Each queued sale is validated against the offline floor for that student and date. Sales exceeding it are `REJECTED` and reported for manual settlement.
- A sale against a card blocked **before** the queued timestamp is rejected.
- A resulting negative balance within the configured grace allowance is permitted and flagged to the parent immediately on sync.
- Parent notifications for synced sales state the actual `tappedAt` time, not the sync time.

---

## 4.5 Transport, NFC, GPS & Devices

The largest gap in the base specification. `POST /transport/taps` ingests a tap, but nothing converted it into a boarding record, and no per-student trip status existed.

### `POST /api/v1/transport/trips/{tripId}/boardings`

| Contract item | Definition |
|---|---|
| Purpose | Record a student board or alight event |
| Authentication | Device credential, or Bearer token for an attendant recording manually |
| Success status | 201 |
| Body | `studentId`, `direction` (`BOARD` \| `ALIGHT`), `routeStopId`, `source` (`CARD_TAP` \| `ATTENDANT_MANUAL`), `tapEventId` when source is a tap, `recordedAt` |
| Idempotency | Required |

**Validation and business rules**

- The trip must be in `STARTED` or `IN_PROGRESS`. Otherwise 422.
- `ALIGHT` requires a prior `BOARD` for the same student on the same trip. Otherwise 422.
- A second event for the same student, direction and trip within the configured debounce window is recorded as a duplicate and does not create a second boarding.
- A student with no active transport allocation to this route sets `isWrongBus` and raises a `WRONG_BUS` alert to the parent, the attendant and Admin.
- **Boarding events are append-only.** A wrong entry is corrected by a compensating record, never by update or delete.
- Recording a boarding updates the student's derived trip status and enqueues a parent notification.

### `GET /api/v1/transport/trips/{tripId}/student-status`

Returns one row per expected student: `studentId`, `status`, `boardedAt`, `alightedAt`, `boardedStopId`, `alightedStopId`, `lastUpdatedAt`.

`status` ∈ `EXPECTED` · `BOARDED` · `DROPPED` · `NOT_BOARDED` · `ABSENT`

Parent-facing wording: *Not boarded yet* · *On bus* · *Dropped* · *Did not board* · *Absent*.

### `GET /api/v1/transport/trips/{tripId}/exceptions`

Returns students expected at stops the vehicle has already departed, who have no boarding event. Used by the attendant to resolve exceptions before boarding closes.

### `POST /api/v1/transport/trips/{tripId}/boarding/close`

| Contract item | Definition |
|---|---|
| Purpose | Finalise boarding; expected students become not-boarded |
| Authorization | Transport operator / device |
| Operation | State transition with side effects |
| Success status | 200 |
| Idempotency | Required |

**Validation and business rules**

- Every student still `EXPECTED` transitions to `NOT_BOARDED`.
- **Each transition to `NOT_BOARDED` raises a parent notification and a `NOT_BOARDED` alert.** This is the primary safety notification of the transport module.
- **A student on approved leave, or flagged as not travelling for that date, is set to `ABSENT` and no alert is raised.** A false not-boarded alert is a serious trust failure and this suppression is mandatory.
- The class advisor is notified for students marked `NOT_BOARDED` on a pickup trip.
- Idempotent. Closing an already-closed boarding returns 200 and raises no further alerts.

### `GET /api/v1/students/{studentId}/transport/status`

Current status for one student across today's trips. Parent access is scoped through the active student-guardian relationship.

### `GET /api/v1/students/{studentId}/transport/live`

| Contract item | Definition |
|---|---|
| Purpose | Current vehicle position during an active trip |
| Authorization | Parent (own child) / Transport |
| Success status | 200 |
| Response | `latitude`, `longitude`, `recordedAt`, `speed`, `nextStop`, `etaMinutes`, `isStale` |

**Validation and business rules**

- Available **only** while a trip serving this student's allocated route is `STARTED` or `IN_PROGRESS`. Otherwise 404.
- **Returns the current position only. This endpoint never returns historical positions to a parent.**
- `isStale` is true when the last telemetry is older than the configured staleness threshold.
- Historical playback remains available only through the transport-scoped trip GPS endpoint under transport and leadership authorization, and each such access is audited.
- Recommended client poll interval: 15 seconds while a trip is active.

### `POST /api/v1/nfc/cards/{id}/provisioning-token`

| Contract item | Definition |
|---|---|
| Purpose | Issue a single-use card personalisation token |
| Authorization | Admin + card management scope |
| Success status | 201 |
| Response | Single-use token, expiry, target card identifier |

**Validation and business rules**

- **The response never contains cryptographic key material.** Keys are derived at the personalisation station from a secure module.
- Single use, short expiry, bound to the specific card record.
- Issuing a token for an already-personalised card requires that card to be in `LOST`, `DAMAGED` or `REPLACED` state.
- Issuance and confirmation are both audited.

### `POST /api/v1/nfc/cards/{id}/provisioning/confirm`

Confirms successful personalisation, consumes the token and transitions the card to `ACTIVE`. An unconfirmed token expires without changing card state.

### `GET /api/v1/nfc/cards/blocklist`

| Contract item | Definition |
|---|---|
| Purpose | Retrieve the current card blocklist for terminal sync |
| Authentication | Device credential |
| Query | `sinceVersion` |
| Response | `blocklistVersion`, `entries[]`, `isFullSnapshot` |

**Validation and business rules**

- Version-based incremental sync. An unknown or far-behind version receives a full snapshot.
- **A terminal whose blocklist version is older than the configured maximum age must refuse payment taps while continuing to accept attendance taps** (Section 2.11).
- Blocking a card increments the blocklist version immediately.

---

## 4.6 Health / Infirmary — standing medication

The base specification's medication endpoints (`POST/GET /health/infirmary-visits/{id}/medications`, `POST /health/medications/{id}/administer`) are retained unchanged and remain correct for medication ordered during a visit. They cannot express a **standing prescription** — a hosteller on daily thyroid or asthma medication has no triggering visit.

### `POST /api/v1/health/students/{studentId}/medication-schedules`

| Contract item | Definition |
|---|---|
| Purpose | Create a standing medication schedule |
| Authorization | Authorized health staff |
| Success status | 201 |
| Body | `medicine`, `dosage`, `timesOfDay[]`, `startDate`, `endDate`, `prescribedBy`, `prescriptionDocumentId`, `parentConsentId` |
| Idempotency | Required |

**Validation and business rules**

- **`parentConsentId` is mandatory** and must reference an active consent for this student. No consent, no schedule, no dose.
- Overlapping active schedules for the same medicine and student return 409.
- `endDate`, when present, must not precede `startDate`.
- Creating a schedule generates the expected dose occurrences used by the medication round view.
- The existing `POST /health/medications/{id}/administer` endpoint records administration against a dose arising from either a visit medication or a standing schedule.

### `GET /api/v1/health/students/{studentId}/medication-schedules`

Restricted health scope. A parent may read schedules for their own child.

### `POST /api/v1/health/medication-schedules/{id}/stop`

Stops an active schedule with a required reason. Past administration records are unaffected and remain append-only.

### `GET /api/v1/health/medication-rounds`

| Contract item | Definition |
|---|---|
| Purpose | List medication doses due within a time window |
| Authorization | Authorized health staff / Warden |
| Query | `from`, `to`, optional `hostelId`, optional `status` |
| Response | Due doses with `studentId`, student name and photo reference, `medicine`, `dosage`, `scheduledAt`, `status`, `roomNo` when a hosteller |

**Validation and business rules**

- Ordered by scheduled time, then hostel room, to match the physical round.
- A dose past its scheduled slot with no administration record returns status `OVERDUE` and raises a `MEDICATION_MISSED` alert.
- Warden access is limited to students with an active hostel allocation.
- **Administration records are append-only.** A missed or refused dose is recorded with a reason, never deleted.

---

## 4.7 Communication — delivery events

### `POST /api/v1/notifications/delivery-events`

| Contract item | Definition |
|---|---|
| Purpose | Receive/process verified delivery status event; provider-facing boundary |
| Authentication | **Exempt from Bearer token.** Provider signature only |
| Authorization | Verified provider / internal |
| Idempotency | Provider event identifier stored and treated as an idempotency key |
| Success status | 200 |
| Body | Provider-defined delivery receipt, passed through an adapter |

**Validation and business rules**

- Updates delivery state only. Never alters notification content or the business event that produced it.
- **A delivery failure never rolls back the originating academic, financial or operational transaction.**
- Terminal failure on a critical alert channel triggers the configured fallback channel.
- Out-of-order events are acknowledged; delivery state transitions are forward-only.

---

## 4.8 Phase 11 · Camps — an entirely new feature

Absent from the base specification. Camps are cross-cutting with **no login of their own**: Admin creates them, health staff record findings, faculty mark attendance, parents give consent and read their own child's results.

### `POST /api/v1/camps`

| Contract item | Definition |
|---|---|
| Purpose | Create camp |
| Authorization | Admin |
| Success status | 201 |
| Body | `name`, `campType`, `description`, `partnerId`, `organiserStaffId`, `venue`, `startDate`, `endDate`, `targetScopeType`, `targetScopeId`, `requiresParentConsent` |
| Idempotency | Required |

`campType` ∈ `HEALTH_CHECKUP` · `DENTAL` · `VISION` · `IMMUNISATION` · `BLOOD_GROUP` · `NUTRITION` · `AWARENESS` · `CAREER_GUIDANCE` · `NCC_NSS` · `SPORTS` · `EDUCATIONAL` · `OTHER`

**Validation and business rules**

- `endDate` must not precede `startDate`.
- A camp with no services is valid — non-medical camps have none.
- Mutable attributes freeze once state leaves `DRAFT`, except through explicit transitions.

### `POST /api/v1/camps/{id}/announce` · `/start` · `/complete` · `/cancel`

State transitions: `DRAFT` → `ANNOUNCED` → `ONGOING` → `COMPLETED`, with `CANCELLED` reachable from any non-terminal state.

**On `complete`:**

- **The camp cannot complete while any abnormal finding has no follow-up raised.** Returns 422 with the count of unaddressed findings.
- Completion freezes checkup records against further `PATCH`.
- Aggregate outcomes become available to leadership.

### `POST /api/v1/camps/{id}/services`

`serviceType` ∈ `VISION` · `DENTAL` · `GENERAL` · `HAEMOGLOBIN` · `BMI` · `BLOOD_GROUP` · `IMMUNISATION` · `HEARING` · `COUNSELLING` · `FITNESS` · `OTHER`

`resultTemplate` declares the fields, units and normal ranges for the service, so findings can be validated and rendered without a schema change per camp type.

### `POST /api/v1/camp-participants/{id}/attendance`

**Validation and business rules**

- **When the camp requires consent, attendance cannot be marked without an active consent record for that participant.** Returns 422.
- Session capacity, where defined, is enforced.
- Idempotent per participant per session.

### `POST /api/v1/camp-participants/{id}/checkups`

| Contract item | Definition |
|---|---|
| Purpose | Record a camp checkup finding |
| Authorization | Authorized health staff |
| Success status | 201 |
| Body | `campServiceId`, `performedAt`, `performedBy`, `findings`, `resultSummary`, `isAbnormal`, `recommendation`, `referredTo` |
| Idempotency | Required |

**Validation and business rules**

- `findings` is validated against the service's declared `resultTemplate`.
- **`isAbnormal` true requires a non-empty `recommendation`.** Otherwise 422.
- **An abnormal finding automatically creates a follow-up and notifies the parent.** Enforced by the server, not left to the operator.
- Findings write back into the student's health record:

| Finding | Writes to |
|---|---|
| Blood group determined | Health profile |
| Vaccination administered | Immunisation record, source `SCHOOL_CAMP` |
| Allergy identified | Allergy record, which drives canteen item blocks and mess dietary flags |
| Vision or hearing issue | Follow-up, plus a fitness clearance restriction where needed |
| Height and weight | Health profile, restricted visibility |

- One checkup per participant per service. Correction uses `PATCH` before completion; after completion, requires a health-authority override with reason.
- **Access is restricted health scope.** Faculty may see *that* a student attended, never the findings. Leadership receives aggregate counts only.

### `POST /api/v1/camp-checkups/{id}/follow-ups` · `POST /api/v1/camp-follow-ups/{id}/complete`

- A follow-up carries an action, a due date and an assignee.
- Follow-ups overdue past `dueDate` raise a `FOLLOWUP_OVERDUE` alert and appear on the health dashboard.
- Parents are informed when a follow-up is created and when it completes.

### `GET /api/v1/students/{studentId}/camps`

**Validation and business rules**

- Parent access is limited to their own children through the active student-guardian relationship.
- Returns camp details, attendance, services received, findings, recommendations and follow-up status.
- **Body measurements such as height, weight and BMI are returned to parents and health staff only, and are never returned in any student-facing or comparative response.**

---

# 5. Testing and Acceptance

## 5.1 Base specification standards (retained)

- Exact field-level DTOs are frozen against the approved PostgreSQL schema.
- Authentication, authorization, business rules and object scope are tested together.
- Critical financial, wallet, canteen, NFC, transport, hostel allocation and approval operations are transactional and idempotent.
- Sensitive health records have dedicated authorization.

## 5.2 Additional acceptance invariants for the added endpoints

| # | Invariant |
|---|---|
| 1 | A parent cannot read another student's data by changing an identifier. Returns 404 |
| 2 | A faculty member cannot enter marks for a subject they do not teach |
| 3 | A duplicate `Idempotency-Key` never produces a second financial effect |
| 4 | A duplicate `deviceIdempotencyKey` never produces a second wallet debit |
| 5 | A forged payment event without a valid signature is rejected with 401 |
| 6 | A replayed payment event changes no state and returns the original outcome |
| 7 | Closing boarding sets every `EXPECTED` student to `NOT_BOARDED` and alerts the parent |
| 8 | Closing boarding does **not** alert for students on approved leave |
| 9 | `ALIGHT` without a prior `BOARD` is rejected |
| 10 | A parent cannot retrieve historical vehicle positions |
| 11 | A card provisioning response never contains key material |
| 12 | A terminal with a stale blocklist refuses payment taps and accepts attendance taps |
| 13 | A medication schedule cannot be created without an active parent consent |
| 14 | A missed dose is recorded, never deleted |
| 15 | Camp attendance cannot be marked without consent where the camp requires it |
| 16 | An abnormal camp finding always produces a follow-up |
| 17 | A camp cannot complete with unaddressed abnormal findings |
| 18 | Faculty cannot read camp checkup findings |
| 19 | Body measurements never appear in a student-facing response |
| 20 | Append-only resources reject mutation with 409 |
| 21 | No endpoint accepts or returns a school or campus identifier |
| 22 | No role other than the 9 listed in Section 2.1 can authenticate |
| 23 | A Faculty member cannot self-confirm their own manual attendance entry — it is always created `PENDING` and requires Admin/Principal approval |
| 24 | A `PENDING` staff attendance entry never counts toward attendance percentage or payroll until `CONFIRMED` |
| 25 | `SIMULATED` and `SIMULATED_FACE` biometric methods are rejected outside non-production environments |
| 26 | A biometric event with a duplicate device idempotency key never creates a second attendance row |
| 27 | A Faculty account without the Sports Faculty assignment cannot call any Sports operations endpoint, even for a team/sport it has no relation to |
| 28 | A Sports Faculty member can only read/write teams, rosters, trials, fixtures and equipment issues for the sport(s)/team(s) they are actually assigned to — never school-wide |
| 29 | Sports structure and asset writes (`sports`, `sport-categories`, `sports/facilities`, `sports/equipment`, coach assignment) succeed only for Admin; the same calls from a Sports Faculty token are denied, not merely hidden client-side |
| 30 | No Faculty account — regardless of assignment, including Academic Coordinator — can authenticate against a web-tagged (🖥️ WEB) endpoint; Faculty is mobile-only |

---

**End of Complete API Documentation, Final Corrected Version, v4.0**
