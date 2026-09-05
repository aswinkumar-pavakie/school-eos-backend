# school-eos-backend
NestJS backend for School EOS. Raw `pg` (node-postgres) for all application queries —
Prisma is used only as a read-only schema-introspection/GUI tool (`prisma db pull`,
Prisma Studio), never as the application's query layer or migration runner.

## Module layout

One folder per feature under `src/modules/`. Copy an existing module's shape
(`identity/` or `admin/`) as the template for a new one: its own `dto/`,
`repositories/`, a `*.module.ts`, and `exports` on anything another module needs to
reuse (never a second repository class hitting the same table).

- **`identity/`** — shared Auth, used by every login: login, refresh (rotating),
  logout, `/me`, self-service password reset (OTP-gated, one-time via
  `reset_allowance_used`). Owns `person` (read), `login_identifier`,
  `user_credential`, `otp_challenge`, `user_session`, `role_assignment` (read). Every
  other module depends on this one for `request.user` (global `AuthGuard`) and
  `@Roles()` checks (`RolesGuard`) — see `src/common/auth/`.

  | Method | Path | Auth | Notes |
  |---|---|---|---|
  | POST | `/api/v1/auth/login` | `@Public()` | Lockout check happens before password hashing, not after. |
  | POST | `/api/v1/auth/refresh` | `@Public()` | Rotates the refresh token (delete + insert); reuse of a rotated-out token is the compromise signal, by design. |
  | POST | `/api/v1/auth/logout` | `@Public()` | Deletes the session by refresh-token hash. Access token is left to expire naturally (≤15 min) — not a bug. |
  | GET | `/api/v1/auth/me` | Bearer token | Same `person`/`roles` shape as login. |
  | POST | `/api/v1/auth/password-reset/request` | `@Public()` | No-ops (200, no OTP sent) if the identifier doesn't exist or has no mobile/email — never reveals existence. 403 if the one-time allowance is already used. |
  | POST | `/api/v1/auth/password-reset/complete` | `@Public()` | Consumes the OTP, sets `reset_allowance_used = true`, revokes all of that person's sessions. |

  Assumptions made beyond the literal spec:
  - Refresh token TTL: 30 days (`AUTH_REFRESH_TOKEN_TTL_DAYS`), OTP TTL: 10 minutes
    (`AUTH_OTP_TTL_MINUTES`); neither was specified anywhere.
  - OTP destination: `person.mobile` if present, else `person.email`.
  - Any password reset (self-service or admin) revokes all of that person's sessions.
  - Refresh token & OTP are hashed with SHA-256, not Argon2id — both need a
    deterministic digest for an equality lookup by hash, which Argon2id's per-call
    random salt can't do. Argon2id (fixed params `{type: argon2id, memoryCost: 19456,
    timeCost: 2, parallelism: 1}`) is used only for `password_hash`, at hash-time —
    `argon2.verify()` reads those params back out of the stored hash itself.

- **`admin/`** — everything Admin's own panel calls, as opposed to "everything Admin
  happens to have permission on" (those get their own domain modules as they're
  built): person listing/creation/activate/deactivate/force-sign-out, role
  grant/revoke, roles catalog + permission preview, login-activity/audit read, and
  the admin-authorized parent password reset (`AdminIdentityController`, which calls
  back into `identity/`'s `PasswordResetService` — exported from `IdentityModule`
  for exactly this).

  | Method | Path | Auth | Notes |
  |---|---|---|---|
  | GET/POST | `/api/v1/persons` | `@Roles('ADMIN')` | Search joins `login_identifier` too — most seeded `person` rows have null `email`/`mobile`. |
  | POST | `/api/v1/persons/:id/activate`, `/deactivate`, `/force-sign-out` | `@Roles('ADMIN')` | Deactivate blocks login via `person.status` check in `IdentityService.login()`. |
  | POST | `/api/v1/persons/:id/password-reset` | `@Roles('ADMIN')` | Generalized reset; parent vs non-parent `reset_allowance_used` handling differs. |
  | POST/POST | `/api/v1/role-assignments`, `/:id/revoke` | `@Roles('ADMIN')` | 409 on duplicate-active or single-instance-role (ADMIN/PRINCIPAL/VICE_PRINCIPAL) conflicts. Admin cannot grant the ADMIN role. |
  | GET | `/api/v1/roles` | `@Roles('ADMIN')` | Catalog + `is_core_login` + `moduleAccess` preview. |
  | GET | `/api/v1/audit-events` | `@Roles('ADMIN')` | `outcome` is `SUCCESS \| DENIED \| ERROR` only — there is no `FAILURE`. |
  | POST | `/api/v1/admin/parents/:personId/password-reset` | `@Roles('ADMIN')` | 404s if the target isn't an active PARENT. `newPassword` optional — omit for a generated temp password back in the response (`must_change_password = true`). |

- **`people/`** — placeholder for the next module (Student Records / Parent &
  Guardian): `student.repository.ts`, `guardian-link.repository.ts`,
  `people.controller/service/module.ts` all currently stubs, not wired into
  `AppModule` yet.

## Backend-wide status

Per the dependency-ordered build plan in the website repo's `workflow.md`: System
Foundation, Identity/People (Person + Auth only — Staff/Student/Guardian still
stubbed), and Accounts/Roles/Authorization (the `admin/` module above) are done and
live-verified. Everything after that — Academic Master Data, Admissions, Teaching
Assignments, Timetable, Attendance, Assessment, Approvals, Finance, Wallet, Canteen,
Transport, Hostel, Sports, Health, Camps, Communication, Safety, Documents/
Certificates, Audit query layer, Bulk ops, Reporting — is not started. The live
Supabase schema already has tables for effectively all of it (181 models as of the
last `prisma db pull`); building each module is an application-code task against
already-existing tables, not a schema-design task, unless a specific gap turns up
(as `reset_allowance_used` did — see below).

## Database migrations (hand-written SQL, not `prisma migrate`)

`database/migrations/` holds the hand-written SQL that is the executable
physical-schema authority for this project. The schema depends on CHECK
constraints, partial unique indexes, and other things Prisma's own migration engine
can't express well, so migrations are plain `.sql` files applied directly to
PostgreSQL by hand — never via `prisma migrate`. Afterwards `prisma/schema.prisma`
is regenerated with `prisma db pull` (introspection only, never the other
direction).

Per project policy, this assistant never runs write/DDL operations against the
database or GitHub — only reads and `prisma db pull`/`prisma generate`. Any SQL a
task needs is written out (here, or in `query.md` at the repo root) for a human to
run.

**Outstanding**: `database/migrations/0001_user_credential_reset_allowance.sql` adds
`user_credential.reset_allowance_used`, required by every password-reset path
(self-service and admin). Until it's applied, `login`/`refresh`/`logout`/`me` work
fine, but password-reset endpoints will 500 with `column "reset_allowance_used"
does not exist`.
.
