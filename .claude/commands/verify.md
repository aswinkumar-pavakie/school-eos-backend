---
name: verify
description: Typecheck the backend and report any errors before considering a change done.
---

Run `npx tsc --noEmit` from the repo root and report the results.

- If clean, say so in one line.
- If there are errors, list each file/line and a one-line description, then fix
  them (don't just report broken code as done).

This is the same verification step used throughout this project's history —
typecheck clean is necessary but not sufficient; a live `curl` against the
running dev server with a real login is worth doing too for anything that
touches a new endpoint or query.
