# SCHOOL EOS — HIGH LEVEL DESIGN (FINAL)

**Deployment:** one school · one Supabase project · handed over to the school
**Stack:** Next.js · NestJS · Supabase
**API:** 684 endpoints, Phases 1–11
**Database:** 186 tables, 18 domains
**Roles:** 9 active — Admin, Principal, Vice Principal, Faculty, Parent, Finance, Hostel Warden, Sports Manager, plus Bus Attendant and Canteen Vendor as device-scoped operational logins. No Transport Manager, no Super Admin/Correspondent (reserved, not built)

---

# 1. The Stack, and What Each Piece Does

| Layer | Technology | Responsibility |
|---|---|---|
| **Staff web app** | **Next.js** (App Router) | Admin, Principal, Vice Principal, Finance, Transport, Sports. Dense tables, Excel, printing |
| **Parent app** | **React Native (Expo)** | Parent only. iOS + Android |
| **Staff mobile app** | **React Native (Expo)** | Faculty, Hostel Warden, Bus Attendant |
| **Terminal app** | **Kotlin, native Android** | Canteen counter and bus reader. Native because of NFC and the SAM module |
| **API** | **NestJS** | All 684 endpoints, authorization, business rules, transactions, device ingestion |
| **Job worker** | **NestJS + BullMQ** | Notifications, PDFs, bulk imports, scheduled jobs, reconciliation |
| **Database** | **Supabase PostgreSQL** | 186 tables. School-owned project |
| **File storage** | **Supabase Storage** | Documents, photos, generated PDFs |
| **Queue** | **Redis** | BullMQ, rate limiting |
| **ORM** | **Prisma** | Typed query client, generated from the SQL |

## 1.1 Supabase — what we use and what we do not

| Use | Do not use |
|---|---|
| PostgreSQL | Supabase Auth |
| Storage | Auto-generated REST / GraphQL APIs |
| Point-in-time recovery | Realtime |
| Supavisor pooler | RLS as the primary authorization control |

**Why not Supabase Auth.** The API documentation defines its own auth surface — login, refresh, sessions, MFA, and `POST /admin/parents/{id}/password-reset` — plus a custom parent password policy: one self-service reset, then Admin only. Supabase Auth (GoTrue) cannot model a consumable reset allowance or role assignments scoped to a section or stage as first-class queryable data. NestJS owns identity end to end against its own tables.

**What that actually looks like inside NestJS, concretely:**

```
person             one row per human — name, mobile, email, status
user_credential    password_hash (Argon2id), mfa_secret, failed_attempt_count, locked_until
login_identifier   lets one account log in by mobile OR email
otp_challenge      for password reset and MFA verification
user_session       refresh tokens — one row per active device, revocable
role_assignment    role + scope (section/stage/subject) + academic year
```

- **Access token:** JWT, 15-minute expiry, carries `personId` + resolved roles/scopes
- **Refresh token:** a random opaque string, NOT a JWT — hashed and stored in `user_session` so it can be revoked early. Rotates on every use; a reused old token is the signal that it was stolen, and revokes the whole session family
- **Password hashing:** Argon2id (OWASP-recommended), never bcrypt-only, never plaintext anywhere
- **MFA:** standard TOTP (`otplib`), same algorithm as any authenticator app, verified server-side
- **Parent reset allowance:** a boolean on `user_credential` consumed on first successful self-service reset; only `POST /admin/parents/{id}/password-reset` clears it. This exact policy is what made Supabase Auth a non-starter — GoTrue has no concept of "allowed once, then requires an administrator to re-enable it"

**Why not the auto-generated APIs.** They bypass the authorization pipeline entirely and would put business logic in two places.

**RLS stays enabled anyway**, for one specific reason: after handover, school staff may have Supabase dashboard access. RLS is what stops a curious administrator reading health or counselling records through the SQL editor.

## 1.2 Two settings that will break the build if missed

| Setting | Value |
|---|---|
| Pooled connection string | `?pgbouncer=true&connection_limit=1` — Supavisor transaction mode does not support prepared statements, which Prisma uses by default |
| Migration connection | **Direct** connection, port 5432. DDL must not go through the pooler |

## 1.3 The SQL is the source of truth

Migrations are hand-written SQL. `schema.prisma` is generated from the database with `prisma db pull`.

This is the reverse of the usual Prisma workflow and it is deliberate: the schema depends on CHECK constraints, partial unique indexes, `EXCLUDE USING gist` range constraints and immutability triggers. Prisma cannot express any of them.

---

# 2. Feature to Technology Map

| Feature | Client | Server | Storage | Notes |
|---|---|---|---|---|
| Login, roles, sessions, MFA | All | NestJS | Postgres | NestJS-owned auth, not Supabase Auth |
| Student and staff records | Next.js | NestJS | Postgres + Storage | Excel import via job worker |
| Attendance marking | Expo (staff) | NestJS | Postgres | **Works offline**, syncs with idempotency keys |
| Marks entry | Expo (staff) | NestJS | Postgres | Purpose-built mobile screen, auto-advance |
| Report cards | Next.js | NestJS + worker | Storage | Headless Chromium → PDF, async |
| Fees and payments | Expo (parent), Next.js | NestJS | Postgres | Gateway webhook via `finance/payment-events` |
| Notices and alerts | All | NestJS + worker | Postgres | Fan-out queued: FCM, SMS, WhatsApp |
| **Bus live tracking** | Expo (parent) | NestJS | Postgres, partitioned | **Polling, 15 s.** Not Realtime — see §5 |
| **Bus boarding** | Kotlin terminal | NestJS | Postgres | NFC tap → boarding event → parent alert |
| **Canteen tap-to-pay** | Kotlin terminal | NestJS | Postgres | NFC tap → wallet debit, offline-capable |
| Wallet top-up | Expo (parent) | NestJS | Postgres | UPI first; UPI Autopay for auto top-up |
| Hostel roll call, gate passes | Expo (staff) | NestJS | Postgres | Warden, ops only — no allocation access |
| Hostel structure and allocation | Next.js | NestJS | Postgres | Admin only. Warden reads this, never writes it |
| Transport setup (vehicles, routes, drivers, allocation) | Next.js | NestJS | Postgres | Admin — no separate Transport Manager role |
| Health, medication rounds | Expo (staff) | NestJS | Postgres | Restricted scope, append-only dose log |
| Camps and checkups | Next.js, Expo | NestJS | Postgres + Storage | Findings write back into health |
| Sports, community | Next.js, Expo | NestJS | Postgres | — |
| Approvals | All | NestJS | Postgres | One engine for every request type |
| Reports and exports | Next.js | NestJS + worker | Storage | Async, `202` + job resource |

---

# 3. Components

**Three deployable services. That is the whole production footprint.**

```
+------------------------------------------------------------------+
|  Next.js web    Expo parent    Expo staff    Kotlin terminal     |
+---------------------------+--------------------------------------+
                            |  Bearer JWT  /  device credential
                 +----------v-----------+
                 |   NestJS API  x2     |   all 684 endpoints
                 |   + device ingestion |   auth, authz, business rules
                 |   + provider events  |
                 +----------+-----------+
                            |
                   +--------v--------+
                   | Supavisor pooler|
                   +--------+--------+
                            |
                 +----------v-----------+
                 | SUPABASE (school's)  |
                 | PostgreSQL + Storage |
                 +----------------------+

     +---------+        +------------------+
     |  Redis  |<------>| NestJS worker x1 |----> FCM, SMS, WhatsApp
     +---------+        +------------------+
```

**Two API instances, not one.** One instance means every deploy is downtime and a crash is an outage during school hours. Two behind a proxy gives rolling deploys and survives one failure.

**Device ingestion lives inside the API.** At one school, GPS telemetry is 0.5 writes per second. A separate ingestion service would be premature. Keep it in its own NestJS module with device-credential guards so it can be extracted later if the school count grows.

---

# 4. NFC Card Workflow

The most complex part of the product, and the part most likely to be built wrong.

## 4.1 The core principle

**The card carries identity, not money.**

The balance lives in `wallet_ledger_entry` on the server. The card holds a random opaque credential in an AES-protected file — no name, no student ID, no balance. Lose the card and you block the credential. The money was never on it.

## 4.2 Hardware

| Item | Choice | Cost | Where |
|---|---|---|---|
| Card | **MIFARE DESFire EV3** | ₹100–180 | One per student |
| Canteen terminal | Android tablet + reader **with SAM slot** | ~₹15,000 | Per counter |
| Bus terminal | NFC Android phone, 12 V power | ~₹10,000 | Per bus |

**Why DESFire and not a cheap NFC card.** All of these are NFC — NTAG213, MIFARE Classic and DESFire use the same 13.56 MHz radio. They differ in what is inside:

| Chip | Security | Verdict |
|---|---|---|
| NTAG213 | None. UID readable and spoofable | Attendance only |
| MIFARE Classic 1K | Crypto-1, broken since 2008 | Attendance only |
| **DESFire EV3** | AES-128 mutual authentication, multi-application | **Use this** |

DESFire supports separate keys per application on the same chip, so a compromised bus reader key does not expose the wallet.

## 4.3 The tap exchange

```
Reader -> Card   Select application (AID)
Reader -> Card   Authenticate(AES, key)
Card   -> Reader E(RndB)
Reader -> Card   E(RndA || RndB')        reader proves it knows the key
Card   -> Reader E(RndA')                card proves it knows the key
                 -> session key derived
Reader -> Card   ReadData(file)
Card   -> Reader encrypted card credential
```

Two personalisation settings, both set at card issue:

- **Key diversification** — each card's key is derived from a master key plus that card's UID. Extracting one card's key compromises that card only, not the other 999.
- **Random UID** — the card presents a different UID on every tap, so a child cannot be tracked by sniffing the air interface.

## 4.4 Where the AES key lives

| Location | Security | Works offline | Cost |
|---|---|---|---|
| **SAM module in the reader** | Strongest | Yes | +₹3,000–5,000 per counter |
| Android hardware Keystore | Good | Yes | Free |
| Server-side APDU relay | Strongest | **No** | Free |

**Canteen: use a SAM.** Money moves, and the tablet sits unattended on a counter all day.
**Bus: Keystore is acceptable.** A forged bus tap produces a false attendance record, not cash.

Server-side relay has the cleanest key handling and is the worst operational choice — the first time canteen wifi drops at 12:30, nobody eats.

## 4.5 Canteen purchase — the full sequence

```
Idle screen: "Tap card"
  -> student taps
  -> AES mutual authentication, read credential
  -> POST /api/v1/transport/taps  (or canteen sale endpoint)
  -> resolve credential -> student
  -> terminal shows STUDENT PHOTO + NAME + CLASS + BALANCE, large
  -> cashier visually confirms it is the right child     <-- the real control
  -> server checks, in order:
        card not blocked
        wallet ACTIVE, not frozen
        amount within per-transaction cap
        today's spend + amount within daily cap
        no parent item block on the selected items
        balance sufficient, or within the grace allowance
  -> confirmed: wallet_ledger_entry (DEBIT) + pos_transaction written atomically
  -> parent push notification within seconds
  -> back to idle
```

**The photo is the actual security control, not the card.** Which is why a screenless reader will not do for the canteen.

**Every rejection needs its own distinct screen** — Card blocked · Wallet frozen · Over daily limit · Item blocked by parent · Insufficient balance. A generic "failed" makes the cashier re-tap, and re-tapping is how double charges happen.

**Double charges are impossible by construction.** `card_tap_event` and `pos_transaction` both carry a unique constraint on `(terminal_id, device_idempotency_key)`. A retry after a timeout is physically incapable of charging twice.

## 4.6 Bus boarding — the full sequence

```
Attendant starts trip
  -> at each stop, students tap
  -> photo and name flash to confirm
  -> POST /transport/trips/{id}/boardings
  -> running count: boarded / expected

  Duplicate tap within 60 s      -> ignored, not double counted
  Student not on this route      -> WRONG_BUS alert to parent, attendant, manager
  Bus leaves stop geofence       -> untapped students appear in /exceptions
  Attendant can mark manually    -> resolves the exception

  POST /transport/trips/{id}/boarding/close
  -> every student still EXPECTED becomes NOT_BOARDED
  -> parent alerted            <-- the most important alert in the product
  -> class advisor alerted
  -> students on approved leave become ABSENT, NO alert
```

Parent sees four plain states: **Not boarded yet · On bus · Dropped · Did not board.**

**Suppressing the alert for approved leave is mandatory.** Two false "your child did not board" messages and the parent mutes your notifications permanently.

## 4.7 Offline behaviour

Terminals cache the roster, photos, balances, limits, item blocks and the card blocklist in encrypted local SQLite.

| Rule | Behaviour |
|---|---|
| Offline sale limit | Capped by `terminal.offline_floor_paise` per student per day |
| Queued sync | `POST /canteen/transactions/sync`, per-item outcomes |
| Duplicate on sync | Returns `DUPLICATE` — a **success**, not an error |
| **Stale blocklist, payment** | **Fail closed.** Refuse the tap |
| **Stale blocklist, attendance** | **Fail open.** Accept and reconcile |

A blocked card must not buy food. A child must not be stranded at a bus stop because a reader could not sync.

## 4.8 Card lifecycle

```
Admin issues card
  -> POST /nfc/cards                      register the record
  -> POST /nfc/cards/{id}/provisioning-token
       single-use token; the response NEVER contains key material
  -> personalisation station writes AES keys, derived from the SAM
  -> POST /nfc/cards/{id}/provisioning/confirm  -> card ACTIVE

Card lost
  -> POST /nfc/cards/{id}/suspend
  -> blocklist_version increments
  -> GET /nfc/cards/blocklist pushes to every terminal
  -> all taps on that card rejected, including offline terminals
  -> replacement charged through the FEE ledger, not the wallet
  -> THE WALLET BALANCE IS UNTOUCHED
```

**The wallet belongs to the student, not the card.** Reissuing never touches the balance.

## 4.9 The one mistake that ruins this

**Most reader integrations read only the card UID and skip AES authentication.**

Every NFC card broadcasts its UID in the clear. Skip the authentication step and a ₹150 DESFire card is exactly as forgeable as a ₹20 sticker. It demos perfectly and it is completely insecure.

Three defences:

1. Put **AES mutual authentication** in writing to the hardware vendor, and confirm the reader model has a **SAM slot** — many popular readers do not.
2. `card_tap_event.auth_method` records `AES_MUTUAL` or `UID_ONLY`. **`UID_ONLY` taps must not authorise payment.**
3. Before go-live, have someone clone a card and try to buy something. If they succeed, the integration is wrong.

## 4.10 Parent wallet top-up

```
Parent app: Add money
  -> POST /api/v1/wallets/{id}/topups        create intent
  -> gateway SDK, UPI shown first
  -> gateway -> POST /finance/payment-events  webhook, signature verified
  -> wallet_ledger_entry (TOPUP), balance updated
  -> parent notified
```

**UPI first and most prominent.** UPI carries zero MDR in India; cards cost about 2%. On a ₹500 top-up that is ₹0 against roughly ₹10. Across 1,200 families topping up monthly, prominent card payment would cost the school over a lakh a year for nothing.

**Auto top-up** uses a UPI Autopay mandate created once: "keep ₹300, top up ₹500 when it drops below". Zero MDR, no stored card, and it eliminates the commonest support complaint — a child unable to buy lunch.

**Never confirm from the client callback.** The webhook is the only source of truth.

---

# 5. Key Design Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | **No multi-tenancy.** One school, one database, `school` is a single row | No `school_id`, no RLS tenant policy, no tenant registry. Do not build for a multi-school future speculatively — it needs a retrofit either way |
| 2 | **NestJS owns auth, not Supabase Auth** | The custom parent password policy and scoped role assignments cannot be modelled in GoTrue |
| 3 | **Hand-written SQL is the source of truth** | Prisma cannot express the constraints and triggers the schema relies on |
| 4 | **Polling for live bus tracking, not Supabase Realtime** | Realtime authorises through RLS, not through the permission resolver. "A parent sees only their own child's trip" must live in one place. Five buses at 15-second polling costs nothing |
| 5 | **Terminal app is native Kotlin** | USB SAM access needs native code; DESFire APDU timing is hard to debug through a React Native bridge |
| 6 | **Ingestion inside the API, not a separate service** | 0.5 telemetry writes per second at one school |
| 7 | **Approval engine before Finance** | Concessions, refunds, payroll, outings and mark corrections all use it. Retrofitting means touching every money path twice |
| 8 | **Append-only for consequential records** | Marks, attendance, payments, taps, boardings, doses, audit. Corrections append; nothing is overwritten |
| 9 | **404 not 403 for out-of-scope objects** | Confirming a record exists is itself a disclosure |
| 10 | **Fail closed on money, fail open on safety** | A blocked card must not buy food. A child must not be stranded |

---

# 6. Authorization

Four stages, as NestJS guards, in fixed order on every protected operation:

```
1. Authenticate            valid token, session not revoked
2. Permission              does this role hold this capability at all
3. Object access           is this specific object reachable
4. State / business rule   is the transition legal from here
```

School scope, stage 3 in the API documentation's five-stage pipeline, resolves to a constant here because there is one school. Campus scope stays active if the school runs multiple campuses.

**One resolver, called by every endpoint.** Never reimplemented per controller. Deny by default. Denials audited with outcome `DENIED`.

**Hostel scope split, enforced at this layer, not just hidden in the UI:** Admin can write to hostel structure and allocation (blocks, rooms, beds, bed assignment). Hostel Warden can only read that allocation and write to daily-operations tables (roll call, gate passes, visitors, mess, incidents). A Warden request touching a structure/allocation endpoint must be denied by the resolver itself — if this is only enforced by hiding the button on the Warden app, it is not enforced.

**Transport is entirely Admin's scope.** There is no Transport Manager role. Bus Attendant is a separate, narrower device-credential login for the one physically-present task Admin cannot do from a desk — scanning students onto a bus — and it sees name, photo and stop only.

Object scope uses database views already in the schema:

| View | Answers |
|---|---|
| `v_person_visible_student` | Which students may this person see, and on what basis |
| `v_person_markable_offering` | Which subjects may this faculty member enter marks for |
| `v_parent_children` | Which children belong to this parent, in display order |

---

# 7. Non-Functional Targets

## 7.1 Scale — one school

| Metric | Value |
|---|---|
| Students | 1,000 |
| Parent accounts | 1,200 |
| Staff | 60 |
| Buses | 5 |
| Canteen counters | 2 |
| Peak concurrent users | ~300, rising to ~800 on result day |

## 7.2 Load — three sharp peaks, not a flat curve

| Window | Driver | Load |
|---|---|---|
| 07:00–09:00 | Bus tracking + attendance | 0.5 telemetry writes/sec; ~3 attendance submissions/min |
| 12:30–13:00 | Canteen taps | ~12 taps/min, latency-critical |
| 15:00–16:30 | Bus tracking, drop | 0.5 writes/sec |
| Result day | Parents checking marks | 10× read burst, predictable |

**These numbers are small.** Two modest containers handle them comfortably. The risk in this project is scope and integration, not throughput.

## 7.3 Performance

| Operation | Target |
|---|---|
| API read, p95 | < 300 ms |
| API write, p95 | < 500 ms |
| **Canteen tap decision, p99** | **< 800 ms** |
| Attendance batch, 40 students | < 1.5 s |
| Live bus freshness | ≤ 15 s |
| **SOS enqueue → send** | **< 5 s** |
| **NOT_BOARDED alert after close** | **< 60 s** |

The last three are not negotiable. A slow tap stalls a lunch queue. A slow SOS is a safety failure. A late not-boarded alert means a child stood at a bus stop for an hour.

## 7.4 Availability and recovery

| Aspect | Target |
|---|---|
| School hours availability | 99.5% (~50 min downtime per month) |
| Maintenance window | Sundays 01:00–04:00 IST |
| RPO | 15 minutes, via Supabase PITR |
| RTO | 4 hours during school hours |
| Degradation | Attendance, boarding and canteen continue offline |

**Two things must be true before go-live.** The school's Supabase project must be on a **paid tier** — a free project has no point-in-time recovery and pauses on inactivity. And a restore must have been performed once, timed, with the result written down. Backup creation is not proof of recoverability.

---

# 8. Failure Behaviour

| Failure | Behaviour |
|---|---|
| Supabase down | Full outage. Offline-capable clients keep working |
| One API instance dies | Proxy routes to the survivor. No impact |
| Redis down | Reads and writes continue. Notifications delayed, never silently lost |
| Payment webhook missed | Payment stays pending; reconciliation job polls the gateway |
| Duplicate payment retry | 409 at the database. No second charge |
| Duplicate tap | Recorded as duplicate. No second debit |
| GPS silent > 90 s | Mark stale, retain last position, alert. Parent sees a last-updated time |
| Terminal offline | Local queue, offline floor applies, blocklist fails closed for payment |
| Provider down | Async retry, channel fallback, delivery state recorded |
| Concurrent update | 409 via `If-Match` |
| Out-of-scope access | 404, audited `DENIED` |

**Principles:** never report success before authoritative persistence · retry only idempotent operations · a notification or PDF failure never rolls back the business transaction.

---

# 9. Security and Privacy

## 9.1 Trust boundaries

```
UNTRUSTED     Internet, parent devices, student-held cards
SEMI-TRUSTED  Staff devices; canteen and bus terminals (physically exposed)
TRUSTED       API, worker, Supabase
PRIVILEGED    service_role key, database password, card master key
```

**Canteen and bus terminals are semi-trusted, not trusted.** They sit unattended in public areas of the school. Hence the SAM, device-bound credentials, remote deprovisioning, encrypted local cache and a bounded offline spend floor.

**The Supabase `service_role` key bypasses RLS.** Server-side only, never in a client bundle. Add a CI check that fails the build if the string appears in any client build output.

## 9.2 Privacy rules enforced in code

| Rule |
|---|
| Parents see only their linked children, joined through the student-guardian relationship |
| Parents get live bus position only, only during their own child's active trip. **No historical location, ever** |
| Historical playback is transport and leadership only, and every access is audited |
| Clinical health detail is health staff only; for hostellers, also the Warden. Leadership sees that a visit occurred, never the notes |
| Camp findings: parent sees their own child. Faculty see attendance only. Leadership sees aggregate counts |
| Height, weight and BMI: parent, health staff and PE only. **Never on a student-facing screen, never ranked** |
| Canteen vendor and bus attendant see name, photo and class or stop. Nothing else |
| Every read of a restricted record writes an audit event |
| Audit rows cannot be updated or deleted by any operational user |

---

# 10. Handover

The part that replaces the tenancy layer, and the part most likely to be underestimated because it is not code.

## 10.1 Who owns what

| Item | Owner after handover |
|---|---|
| Supabase project and billing | **School** |
| All data in it | **School** |
| Payment gateway account | **School** |
| DLT / SMS account, WhatsApp Business account | **School** |
| NFC cards and terminals | **School** |
| Card master key (in a SAM) | **School.** Vendor retains no copy |
| Application tier | **Vendor**, under the support agreement — see 10.3 |

## 10.2 Handover artifacts

1. Runbook — start, stop, restart, deploy, roll back, rotate credentials, check health
2. Backup and restore procedure, with evidence of one successful timed restore
3. Monitoring access, and what each alert means
4. Credential inventory — what exists, where, who holds it
5. Data processing agreement — you hold database credentials to minors' data
6. Support agreement — hours, response times, escalation, scope
7. Admin training — the office must reset a parent password, issue a card, run a bulk import and generate a TC without calling you
8. Card personalisation procedure
9. Academic year rollover walkthrough, done once live

## 10.3 The update problem — decide this in the contract

Supabase is only the database. The API, worker and web app must run somewhere.

If the school hosts them, you cannot ship a bug fix without credentials, and "we do not touch it" stops being true. If nobody can restart a container at 8am, attendance does not load.

**Recommendation:** the school owns the Supabase project and its data — a genuine and demonstrable ownership story. **You retain deployment rights on the application tier** under the support agreement, because that is where the operational capability sits.

Write the split down. Ambiguity here surfaces during the first outage, which is the worst moment to discover it.

## 10.4 Key rotation

The school can rotate its database password at any time, which silently breaks the product. Document the procedure, name who to notify, keep credentials in a secret store so rotation is a config change, and add a health check that fails loudly and distinguishably on an auth error.

---

# 11. What Must Happen Before Development

| # | Item | Lead time | Why it cannot wait |
|---|---|---|---|
| 1 | **SMS DLT registration** — in the school's name | **1–3 weeks** | Telecom operator approval. No engineering effort compresses it |
| 2 | **WhatsApp Business onboarding** via a BSP — in the school's name | **1–3 weeks** | Meta template approval |
| 3 | Payment gateway KYC | 1–2 weeks | Provider review |
| 4 | Supabase paid tier confirmed | Immediate | No PITR on free tier; free projects pause |
| 5 | Reader model with a confirmed SAM slot | Procurement | Many popular readers have none |
| 6 | Application hosting decision (10.3) | Immediate | Determines the runbook and the contract |

**Mitigation for 1 to 3:** one `NotificationProvider` interface with a mock implementation. The code path completes; only credentials are pending.

---

# 12. Build Order

| Stage | Schema | API phases | Delivers |
|---|---|---|---|
| 1 | 01 | 1, 2 | Auth, people, roles, master data |
| 2 | 02 | 3 (academic ops, attendance) | Timetable, attendance, absence alerts |
| 3 | 10 | 9 (communication) | Notices, notifications |
| 4 | 03 | 3 (assessment) | Exams, marks, report cards |
| 5 | 04, 05 | 10 (approvals), 5 (finance) | Approvals, then fees |
| 6 | 06, 07 | 4 | Community, sports, development |
| 7 | 08, 09 | 7, 6 | Hostel, transport, boarding |
| 8 | 11, 12 | 5 (wallet), 6 (NFC) | Cards, wallet, canteen |
| 9 | 13, 14 | 8, 11 | Health, camps |

**Stages 1 to 3 are the sellable core.** Fees, attendance and parent communication are what a school evaluates you on.

**Build the approval engine before Finance.** Concessions, refunds, payroll release, outings and mark corrections all run through it.

---

# 13. Open Decisions

| # | Decision | Owner |
|---|---|---|
| 1 | Where the application tier runs, and who deploys (10.3) | Team lead + school |
| 2 | Supabase plan tier — PITR required | School |
| 3 | RPO and RTO confirmation | School management |
| 4 | Camps in scope for v1? (26 endpoints) | Product |
| 5 | Payment gateway selection | School |
| 6 | GPS vendor and protocol | Procurement |
| 7 | Reader model with SAM slot | Procurement |
| 8 | Where the card master key is held after handover | Engineering + school |
| 9 | Pre-order, auto top-up, grace meal in scope? | Product |
| 10 | Multiple campuses? | School |

---

# 14. Related Documents

| Topic | Document |
|---|---|
| Endpoint contracts, 684 endpoints | Complete API Documentation v1.1 |
| Tables, constraints, triggers | `schema-00` to `schema-15` SQL |
| Entities and relationships | Domain model, ER diagrams |
| Screens and navigation | Frontend specification |
| Roles, features, workflows | Logins, features and workflows |
| Service internals | LLD — not yet written |
