# Identity module (Auth)

Owns `person` (read-only here), `login_identifier`, `user_credential`, `otp_challenge`,
`user_session`, and `role_assignment` (read-only here). Every other module depends on
this one for `request.user` (via the global `AuthGuard`) and `@Roles()` checks (via
`RolesGuard`) — see `src/common/auth/`.

## Blocking dependency

`user_credential.reset_allowance_used` does not exist in the live schema yet. Every
password-mutating path (`password-reset/complete`, `password-reset/request`'s check,
and the admin reset) queries or writes it and will fail with
`column "reset_allowance_used" does not exist` until
`database/migrations/0001_user_credential_reset_allowance.sql` is applied. `login`,
`refresh`, `logout`, and `/me` are unaffected — they don't touch that column.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/login` | `@Public()` | See identity.service.ts for the 10-step ordering (lockout check before hashing, etc). |
| POST | `/api/v1/auth/refresh` | `@Public()` | Rotates the refresh token (delete + insert); reuse of a rotated-out token is the compromise signal, by design. |
| POST | `/api/v1/auth/logout` | `@Public()` | Deletes the session by refresh-token hash. Access token is left to expire naturally (≤15 min) — not a bug. |
| GET | `/api/v1/auth/me` | Bearer token | Same `person`/`roles` shape as login. |
| POST | `/api/v1/auth/password-reset/request` | `@Public()` | No-ops (200, no OTP sent) if the identifier doesn't exist or has no mobile/email — never reveals existence. 403 if the one-time allowance is already used. |
| POST | `/api/v1/auth/password-reset/complete` | `@Public()` | Consumes the OTP, sets `reset_allowance_used = true`, revokes all of that person's sessions. |
| POST | `/api/v1/admin/parents/:personId/password-reset` | `@Roles('ADMIN')` | 404s if the target isn't an active PARENT. `newPassword` in the body is optional — omit it to get a generated temp password back once in the response. Clears `reset_allowance_used`, revokes all sessions. |

## Assumptions made beyond the literal spec (not in brain/ or the task text — flag if wrong)

- **Refresh token TTL**: 30 days (`AUTH_REFRESH_TOKEN_TTL_DAYS`). Not specified anywhere; picked as a conventional default.
- **OTP TTL**: 10 minutes (`AUTH_OTP_TTL_MINUTES`); attempt cap comes from the DB's own `otp_challenge.max_attempts` (defaults to 5), not app config.
- **OTP destination**: `person.mobile` if present, else `person.email` — task says "registered mobile" but `person` doesn't guarantee one (only mobile-OR-email).
- **Session revocation on any password reset** (self-service or admin): not explicitly requested, but leaving old sessions valid after a reset would undermine the point of resetting a possibly-compromised credential.
- **Admin reset target must hold an active PARENT role_assignment**: the route is literally `/admin/parents/:personId/...`; a non-parent personId 404s rather than silently resetting the wrong kind of account.
- **`must_change_password`**: set `true` on an admin-issued reset (temp password), `false` on a self-service reset (user chose it themselves). Not required by the task; the column exists and this is its obvious use.
- **Refresh token & OTP hashing**: SHA-256, not Argon2id — both need a deterministic digest for an equality lookup by hash, which Argon2id's per-call random salt can't do. Argon2id (with the exact params given) is used only for `password_hash`, at hash-time — `argon2.verify()` reads those params back out of the stored hash itself, so they aren't (and can't be) passed to `verify()`.
- **`/auth/refresh` and `/auth/logout` responses**: minimal — `{ accessToken, refreshToken }` and `{ loggedOut: true }` respectively — since the task's exact contract only pins down `/auth/login`'s shape.
