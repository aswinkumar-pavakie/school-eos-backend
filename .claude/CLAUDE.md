# School EOS Backend

NestJS backend for School EOS. Raw `pg` (node-postgres) is the query layer
everywhere — **Prisma is never used to query data**, only for `prisma db pull`
(introspection) and Prisma Studio (browsing). `prisma` is pinned to `^7.9.0` in
package.json — never bump or change this without being explicitly asked.

## Hard rule — no write operations against the database

Never run a write/DDL operation against the database directly (no `INSERT`/
`UPDATE`/`DELETE`/`ALTER`/`CREATE` executed by you, no `prisma migrate`, no
`prisma db push`). `prisma db pull` and `prisma generate` are fine — they only
read from the DB / regenerate the local client, they never write to it.

Any SQL a task needs goes into `query.md` at this repo's root, for the user to
paste into the **Supabase SQL Editor** themselves (never Prisma Studio — it's a
data-browsing grid with no raw-SQL runner). `query.md` is a living scratchpad the
user edits directly too — **always re-read it immediately before editing**, and
prefer `Edit` (append) over `Write` (full overwrite) unless you've just re-read
the current content. It has been wiped to 0 bytes more than once this way.

## Before proposing a new table or column

**Check whether the real schema already has it.** This project's database is a
large, fully fleshed-out schema — several "obviously missing" features (a
Timetable, an Academic Calendar, a general Announcements system, per-role
scoped assignments like Class Advisor/Academic Coordinator) turned out to
already exist, fully populated with real data, simply with no API built in
front of them yet. Proposing a redundant new table wastes a migration and
creates a second, disconnected source of truth. Before writing a `CREATE TABLE`
into `query.md`:

1. Search `information_schema.tables`/`.columns` for related table and column
   names (table names alone aren't enough — a concept like "class advisor" can
   be modeled as *data* inside an existing generic table like `role_assignment`,
   not a dedicated table).
2. Check `pg_constraint` via `pg_get_constraintdef(oid)` for the real CHECK/FK
   constraints on any table you're about to touch, rather than guessing enum
   values or scope rules from a DTO or from memory.
3. If a real table already exists, check its actual row count and a few sample
   rows before assuming your mental model of its shape is right (e.g. a scope
   column you'd assume is GRADE-based might really be STAGE-based in production
   data — check, don't assume).

A quick way to do this read-only, without waiting on a slow `prisma db pull` on
a schema this size: a one-off Node script using the already-installed `pg`
package and this repo's own `DATABASE_URL`, run from this directory (so
`require('pg')` resolves) — never anything that writes.

## Architecture conventions

- **`UnitOfWork`** wraps multi-statement writes in a real `BEGIN`/`COMMIT`/
  `ROLLBACK` transaction — use it for anything that touches more than one table
  atomically (e.g. person + subtype record, or a paired-field state transition).
- **`AuditService.record()`** logs every meaningful write. `outcome` is
  `'SUCCESS' | 'DENIED' | 'ERROR'` only — never `'FAILURE'`.
- **Deactivate/supersede, not delete**, is the convention for anything with
  business meaning (fee structures, communities, id cards, etc.) — a real
  `DELETE` endpoint only exists for genuinely disposable rows (calendar events,
  a person's own guardian-link occupation) or literal test-data cleanup.
- Each module owns a `pg-error.util.ts` with `isUniqueViolation`/
  `isForeignKeyViolation`/`isCheckViolation` (Postgres codes 23505/23503/23514)
  — translate constraint violations into a clean 409/400/404 in the service
  layer, never let a raw Postgres error reach the client as a 500.
- Cross-module data is referenced by opaque UUID FK, not by importing another
  module's repository directly, *unless* the two modules genuinely need to share
  a service (e.g. Students needing Transport's summary for a profile page) — in
  that case import the other module and inject its exported service, don't
  duplicate its queries.
- Single-holder-of-a-resource invariants (current academic year, primary
  guardian contact, an active class advisor per section) need
  `SELECT ... FOR UPDATE` inside a transaction or a partial unique index — not
  just app-level checking, which races.

## Verifying your own work

After any backend change: `npx tsc --noEmit` from this directory, then a real
`curl` against the running dev server (port 3000) with a real login — logging
in as the seeded ADMIN account and hitting the actual endpoint beats trusting a
typecheck alone. Clean up any test data you create through the app's own
endpoints (or note it in `query.md` if the app has no delete path for it) —
never leave synthetic rows in a dataset that also has 900+ real seeded people in
it.
