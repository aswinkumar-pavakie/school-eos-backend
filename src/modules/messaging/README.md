# messaging

Parent <-> Faculty messaging MVP. One shared conversation per (guardian, ward,
academic_year, section); participants are the parent plus every faculty member
currently authorized for that ward's class (subject teachers + class advisor),
deduplicated. REST only — no WebSockets, no push notifications, no attachments, no
editing/deletion (see "Not implemented" below).

## Class advisor source of truth

`role_assignment` with `role_code = 'CLASS_ADVISOR'`, `scope_type = 'SECTION'`,
`scope_id = <section.id>`, `status = 'ACTIVE'` — verified against real, populated
data before this module was built (10+ real CLASS_ADVISOR rows, e.g. `Aditya Iyer`
advising `Standard 7-A` for the current academic year). This is a real,
pre-existing relationship, not invented for this feature.

One nuance: `role_assignment.academic_year_id` is **not reliably populated** on
real CLASS_ADVISOR rows (mostly `NULL`). Every query here instead joins through
`section.academic_year_id` via `scope_id`, since each academic year has its own
distinct `section` rows — `scope_id` already unambiguously encodes the year.

## The one authorization rule

**`conversation_participant` is a display/read-state cache, never the
authorization boundary.** Every single access (list, detail, message history,
send, mark-read, translate) re-derives "is this actor currently allowed here"
live, from `guardian_link` + `student_enrolment` + `subject_offering` +
`role_assignment`, via `MessagingService.getAuthorizedConversationOrThrow`. A
stored participant row from before a faculty reassignment or a guardian
revocation can never grant access on its own — see "Faculty reassignment
policy" below for what this means concretely.

- **Parent**: `conversation.parentPersonId === actor.personId` AND an `ACTIVE`
  `guardian_link` for `conversation.studentId` AND an `ACTIVE` `student_enrolment`
  for that student matching the conversation's exact `academic_year_id` +
  `section_id`. A `REVOKED` guardian link, or an enrolment that has since become
  `TRANSFERRED_SECTION`/`CLOSED` (including because the ward was promoted to a new
  year), fails this check.
- **Faculty**: an `ACTIVE` `staff` row, and the conversation's `(section_id,
  academic_year_id)` must be in the union of (a) sections where an `ACTIVE`
  `subject_offering` has `teacher_staff_id` = this faculty, and (b) sections where
  an `ACTIVE` `CLASS_ADVISOR` `role_assignment` names this faculty.
- Both paths return the **identical 404** (`Conversation not found`) whether the
  conversation doesn't exist, belongs to someone else, or the actor's
  authorization has since lapsed — never distinguishable (mirrors the
  online-classes module's 404-not-403 convention).

### Faculty reassignment policy (Step 22 requires this be explicit, not silent)

If Faculty A is removed from a subject offering (or their `CLASS_ADVISOR`
assignment is revoked), **they lose API access to that conversation on their very
next request**, even though their old `conversation_participant` row still
exists. This module does **not** offer a "historical read access" mode — there is
no way to view a conversation for a class you no longer teach/advise. Message
rows themselves are never deleted (`sender_person_id` still attributes old
messages correctly), but the conversation becomes unreachable via every endpoint
here once the underlying relationship lapses. This was a deliberate choice made
explicit here per Step 22's instruction not to silently decide — if historical
access is actually wanted, it needs a separate, explicitly-scoped decision.

### Conversation creation policy

Conversations are created lazily, **parent-initiated only**: a parent's first
`GET /messages/conversations` (or a client that has never called it) find-or-
creates a conversation for each of their currently-active wards
(`uq_conversation_context` makes concurrent duplicate creation impossible).
Faculty's list endpoint only shows conversations that **already exist** for their
authorized sections — it does not proactively create one for every student in
their class. This matches the product description ("parent can send to all
subject handling faculty and advisor... faculty can reply") — parent-initiated is
the primary flow. A faculty-initiated "message a parent who has never opened the
chat" flow is a possible future enhancement, not built here.

## Data model

- **`conversation`**: `(student_id, parent_person_id, academic_year_id,
  section_id)` unique. `last_message_id`/`last_message_at` denormalized for the
  list preview, updated transactionally with every message insert.
  `last_message_id` is deliberately **not** a foreign key — `message.conversation_id
  -> conversation.id` already points the other way, so an FK back would make the
  two tables mutually referencing with no clean single-statement direction; the
  application sets it inside the same transaction as the insert instead.
- **`conversation_participant`**: `(conversation_id, person_id)` unique,
  `participant_role` (`PARENT`/`SUBJECT_TEACHER`/`CLASS_ADVISOR`), `last_read_at`
  — independent per person (Parent's and Faculty's read state never share a row).
  Kept in sync with the live-derived set on every access (see above) — a
  dual-role person (subject teacher *and* class advisor) gets exactly one row,
  labeled `CLASS_ADVISOR`.
- **`message`**: immutable (no edit/delete in this MVP), `bigserial` id,
  idempotent per `(conversation_id, sender_person_id, idempotency_key)` —
  mirrors `online_class`'s own faculty-scoped idempotency constraint exactly.
- **`message_translation`**: pure cache keyed by `(message_id, target_language)`.
  Never mutates `message.message_text`.

## Endpoints

All under `/api/v1/messages`, all `@Roles('FACULTY', 'PARENT')` — the actual
per-conversation authorization is decided inside `MessagingService`, not by role
alone.

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations` | Parent: lazily find-or-creates one conversation per currently-active ward, then lists all of the parent's conversations. Faculty: lists existing conversations for their currently-authorized sections only. |
| GET | `/conversations/:id` | 404s if the conversation doesn't exist or the actor isn't currently authorized for it. Adds `ownLastReadAt` to the list shape. |
| GET | `/conversations/:id/messages?limit=&before=` | Cursor-paginated (`before` = oldest message id already seen), newest page first if omitted, bounded (`limit` 1-100, default 30), never an unbounded `SELECT`. Response messages are chronological (oldest first) for direct rendering. |
| POST | `/conversations/:id/messages` | Requires `Idempotency-Key` header. Body: `{ "message": "..." }` — no `senderPersonId`/`recipientPersonId` field exists anywhere in the DTO; sender is always `actor.personId`. Trims, rejects empty/whitespace-only, max 2000 chars. Transactional: message insert + conversation `last_message_*` update happen in one `UnitOfWork.run`. |
| PATCH | `/conversations/:id/read` | Marks only the caller's own `last_read_at`. No body. |
| POST | `/conversations/:conversationId/messages/:messageId/translate` | Body: `{ "targetLanguage": "ta" }`. Never mutates the original message; cached by `(messageId, targetLanguage)`. |

### Response shapes

`GET /conversations` / `GET /conversations/:id`:
```json
{
  "data": [{
    "id": "...",
    "student": { "id": "...", "name": "Aarav Kumar" },
    "grade": { "name": "8" },
    "section": { "name": "A" },
    "academicYear": { "id": "...", "name": "2025-2026" },
    "participants": [{ "personId": "...", "name": "Ms. Lakshmi P", "role": "SUBJECT_TEACHER" }],
    "lastMessage": { "id": "...", "text": "...", "senderPersonId": "...", "createdAt": "..." },
    "unreadCount": 2,
    "lastMessageAt": "..."
  }]
}
```
`participants` always excludes the viewer themselves (they already know who they
are) — from a parent's perspective this lists faculty; from a faculty's
perspective it lists the parent (and any co-faculty).

`GET .../messages`:
```json
{
  "data": [{
    "id": "101",
    "conversationId": "...",
    "sender": { "personId": "...", "name": "...", "role": "PARENT" },
    "text": "...",
    "createdAt": "...",
    "readAt": null,
    "status": "SENT"
  }],
  "meta": { "hasMore": false, "nextCursor": null }
}
```
`readAt` is populated **only on the viewer's own sent messages** (matches real
chat UX — you don't need a read receipt on a message you're currently reading),
and only when it can be truthfully determined: for a parent's own message, the
moment every currently-authorized faculty member has read it; for a faculty's own
message, the parent's `last_read_at` once it is at or after that message. Every
other message's `readAt` is `null` — never fabricated.

`POST .../translate`:
```json
{ "data": { "messageId": "101", "sourceLanguage": "en", "targetLanguage": "ta", "translatedText": "..." } }
```

## Translation provider

No translation service/dependency existed anywhere in this repository before
this module. `TranslationProvider` (interface) / `TranslationService`
(orchestration: language validation -> cache -> provider -> cache store) /
`GoogleTranslateProvider` (concrete implementation, plain `fetch` against the
Cloud Translation v2 REST API, no new SDK dependency) — chosen for consistency
with the Google APIs this project already trusts (Calendar/Meet in
online-classes), configured via `GOOGLE_TRANSLATE_API_KEY` (see `.env.example`).

**No API key is configured in this environment.** `TranslationService` reports
this explicitly (`503 Translation is not configured on this server`) rather than
faking a translated result — real-provider E2E could not be run; see the final
report. Unit tests mock the provider.

Supported target languages are an explicit allow-list
(`translation/supported-languages.ts`: `en`, `ta`, `hi`, `te`, `kn`, `ml`) —
extend by adding a code there, no other change required. An unsupported code is
rejected with `400` before the cache or provider is ever touched.

## Not implemented (explicitly out of scope per the spec)

- Push notifications, WebSockets/realtime — REST only.
- Message editing or deletion.
- Attachments, voice messages, video calls, typing indicators, reactions.
- `delivered` state — no realtime/push infrastructure exists to truthfully
  determine it, so it is not represented anywhere in the API rather than being
  faked.
- `audit_event` integration — the table exists in the database but no other
  module in this codebase actually writes to it yet (verified: zero references
  in application code); per the instruction to follow an *existing* convention
  rather than invent one, messaging does not write to it either. Flagged here as
  a known gap, not silently skipped.
