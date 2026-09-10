# messaging-integration

The one approved way the separate `school-eos-messaging` service reads
relationship/user data from Core (LLD §79: Messaging must never query this
database directly). Every route lives under `/internal/v1/messaging/*`, never
the versioned public `/api/v1/*` prefix, and is guarded by
`InternalServiceGuard`'s shared-secret check (`X-Internal-Service-Key` against
`MESSAGING_INTERNAL_KEY`) — `@Public()` only bypasses the global user-JWT
`AuthGuard`, which has nothing to check here anyway (there is no end-user
session on a service-to-service call).

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/internal/v1/messaging/relationships/parent/:personId` | `{ relatedPersonIds: string[] }` — every person this parent can message DIRECT right now (current subject faculty + class advisor + same-section parents, per active ward; current hostel warden if currently boarding) |
| GET | `/internal/v1/messaging/relationships/faculty/:personId` | Same shape — co-faculty + parents across every section this person currently teaches/advises |
| GET | `/internal/v1/messaging/relationships/warden/:personId` | Same shape — guardians of every student currently allocated to a hostel this person currently wardens |
| GET | `/internal/v1/messaging/users/:personId` | `{ data: MessagingUserProjection \| null }` — minimal profile + live `messagingEnabled` |
| GET | `/internal/v1/messaging/users?cursor=&limit=&excludePersonId=` | `{ data: MessagingUserProjection[], nextCursor: string \| null }` — every currently messaging-enabled active person, paginated |
| GET | `/internal/v1/messaging/users/:personId/push-tokens` | `{ tokens: string[] }` — real Expo push tokens already registered via the existing `POST /notifications/device-token` (every mobile login registers one). Messaging's own outbox worker calls this to deliver "new message" pushes — device tokens stay owned by Core, never duplicated into Messaging's own schema. |

Every relationship/query here reuses the exact SQL already proven in
`modules/messaging/repositories/*` (Parent↔Faculty MVP) and
`modules/hostel-warden/repositories/*` — re-provided directly in this module's
own providers array rather than exported from their home modules, matching
this codebase's established convention for reused repositories.

`messagingEnabled` is a **computed predicate**, not a stored column — see
`messaging-roles.constant.ts` for the exact role list and reasoning (a role the
LLD never mentions defaults to *not* messaging-enabled, fail-closed).

Set `MESSAGING_INTERNAL_KEY` in `.env` to enable this integration — left empty,
`InternalServiceGuard` denies every call (never treats "not configured" as
"no key required").
