# Sports Faculty Operations — API testing reference

Every endpoint below is **new** (built alongside the existing Admin-only
Sports Setup endpoints — `/sports`, `/sport-categories`, `/equipment`,
`/coaches` — which are unchanged). All base URLs assume `/api/v1` (the app's
global prefix) and `http://localhost:3000`.

**Before testing anything here**: run `query.md`'s SQL in Supabase (new table +
2 new columns + 3 new approval-policy rows + the `SPORTS_FACULTY` role code),
then give your test Faculty account a real `role_assignment` row (see
`query.md`'s own "After running" section) — every route below 404s otherwise,
by design (same 404-not-403 convention as the rest of this codebase).

## 1. Teams & roster (`FACULTY`)

```bash
TOKEN="<faculty JWT>"
BASE="http://localhost:3000/api/v1"

# Create a team (sportId must be one you hold SPORTS_FACULTY for)
curl -s -X POST $BASE/sports/teams -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sportId":"<sport-id>","academicYearId":"<academic-year-id>","name":"U16 Boys Football"}'

# List my teams / one team
curl -s $BASE/sports/teams -H "Authorization: Bearer $TOKEN"
curl -s $BASE/sports/teams/<team-id> -H "Authorization: Bearer $TOKEN"

# Add a roster member
curl -s -X POST $BASE/sports/teams/<team-id>/roster -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"<student-id>","jerseyNo":7,"role":"Forward"}'

# List roster / end a membership
curl -s $BASE/sports/teams/<team-id>/roster -H "Authorization: Bearer $TOKEN"
curl -s -X POST $BASE/sports/teams/<team-id>/roster/<member-id>/end -H "Authorization: Bearer $TOKEN"
```

## 2. Equipment — read + issue/return (`FACULTY`)

```bash
# Equipment for sports I'm assigned to (read-only — create/edit stays Admin-only on /equipment)
curl -s $BASE/sports/faculty/equipment -H "Authorization: Bearer $TOKEN"

# Issue equipment — signaturePngBase64 must be a real (if tiny) PNG's base64.
# Quick one-pixel PNG for testing:
SIG=$(node -e "console.log(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bf4a0000000049454e44ae426082','hex').toString('base64'))")

curl -s -X POST $BASE/sports/faculty/equipment/<equipment-id>/issues \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"issuedToStudentId\":\"<student-id>\",\"quantity\":2,\"reason\":\"Training session\",\"signaturePngBase64\":\"$SIG\"}"

# Return
curl -s -X POST $BASE/sports/faculty/equipment/issues/<issue-id>/return \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"conditionOnReturn":"Good"}'

# Cheap add-ons
curl -s $BASE/sports/faculty/equipment/outstanding-issues -H "Authorization: Bearer $TOKEN"
curl -s $BASE/sports/faculty/equipment/overdue-issues -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/sports/faculty/equipment/low-stock?threshold=5" -H "Authorization: Bearer $TOKEN"
```

## 3. Equipment restock (POP) — Faculty → Principal → Finance

```bash
# 1. PT teacher raises the request
curl -s -X POST $BASE/sports/equipment-indents -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"equipmentId":"<equipment-id>","quantity":10,"reason":"Running low before tournament"}'
# -> { data: { id, referenceNo, state: "PENDING", ... } }

# 2. Principal sees it in their inbox and approves (generic engine, unchanged)
PRINCIPAL_TOKEN="<principal JWT>"
curl -s $BASE/approvals?status=PENDING -H "Authorization: Bearer $PRINCIPAL_TOKEN"
curl -s -X POST $BASE/approvals/<approval-request-id>/approve -H "Authorization: Bearer $PRINCIPAL_TOKEN" -H "Content-Type: application/json" -d '{}'
# -> purchase_order auto-created (Finance's own handler), request now needs Finance's step

# 3. Finance approves the (now current) step
FINANCE_TOKEN="<finance JWT>"
curl -s -X POST $BASE/approvals/<approval-request-id>/approve -H "Authorization: Bearer $FINANCE_TOKEN" -H "Content-Type: application/json" -d '{}'
# -> request.state = APPROVED, purchase_order exists

# 4. Finance tracks delivery, then allots — THIS is what increments the equipment's stock
curl -s -X POST $BASE/finance/purchase-orders/<order-id>/update-stage -H "Authorization: Bearer $FINANCE_TOKEN" -H "Content-Type: application/json" \
  -d '{"stage":"DELIVERED","quantityDelivered":10}'
curl -s -X POST $BASE/finance/purchase-orders/<order-id>/allot -H "Authorization: Bearer $FINANCE_TOKEN" -H "Content-Type: application/json" \
  -d '{"quantity":10}'

# 5. Confirm the equipment's own quantity_total/quantity_available went up by 10
curl -s $BASE/sports/faculty/equipment -H "Authorization: Bearer $TOKEN"
```

## 4. OD (on-duty) request — Faculty → Principal → auto parent consent

```bash
# 1. PT teacher raises the OD request for a team + match date
curl -s -X POST $BASE/sports/od-requests -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"teamId":"<team-id>","eventDate":"2026-09-20","reason":"Inter-school football tournament"}'
# -> { data: { id, state: "PENDING", approvalRequestId, ... } }

# 2. Principal approves (generic engine, single step, final)
curl -s -X POST $BASE/approvals/<approval-request-id>/approve -H "Authorization: Bearer $PRINCIPAL_TOKEN" -H "Content-Type: application/json" -d '{}'
# -> SportsApprovalHandlers.onApproved creates a student_event + one
#    student_event_participant per active roster student

# 3. Confirm the OD request now shows APPROVED + a studentEventId
curl -s $BASE/sports/od-requests/<od-request-id> -H "Authorization: Bearer $TOKEN"

# 4. Faculty's own "Events" list should now show it too (created_by = the requesting teacher)
curl -s $BASE/faculty/events -H "Authorization: Bearer $TOKEN"

# 5. Parent signs (EXISTING endpoint, completely unchanged) — get the participant id
#    from step 4's event detail (GET /faculty/events/:id -> participants[].id), then as the parent:
PARENT_TOKEN="<parent JWT>"
curl -s $BASE/parent/permission-requests -H "Authorization: Bearer $PARENT_TOKEN"
curl -s -X POST $BASE/parent/permission-requests/<participant-id>/sign -H "Authorization: Bearer $PARENT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"signaturePngBase64\":\"$SIG\"}"
# or, to test the decline path instead:
curl -s -X POST $BASE/parent/permission-requests/<participant-id>/reject -H "Authorization: Bearer $PARENT_TOKEN"
```

## 5. Student sport profile (feature #12)

```bash
# Create/upsert a profile — re-running with the same studentId+sportId updates it
curl -s -X POST $BASE/sports/<sport-id>/profiles -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"<student-id>","positionOrRole":"Striker"}'

curl -s $BASE/sports/<sport-id>/profiles -H "Authorization: Bearer $TOKEN"

curl -s -X PATCH $BASE/sports/<sport-id>/profiles/<profile-id> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"positionOrRole":"Midfielder"}'
```

## 6. Training sessions + attendance (feature #13)

```bash
curl -s -X POST $BASE/sports/training-sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"teamId":"<team-id>","scheduledAt":"2026-09-15T16:00:00.000Z","venue":"Ground A","focus":"Passing drills"}'

curl -s $BASE/sports/training-sessions -H "Authorization: Bearer $TOKEN"

curl -s -X PATCH $BASE/sports/training-sessions/<session-id> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"COMPLETED"}'

# Bulk attendance — one call, multiple students
curl -s -X POST $BASE/sports/training-sessions/<session-id>/attendance -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"entries":[{"studentId":"<student-id-1>","status":"PRESENT"},{"studentId":"<student-id-2>","status":"ABSENT"}]}'

curl -s $BASE/sports/training-sessions/<session-id>/attendance -H "Authorization: Bearer $TOKEN"
```

## 7. Tournaments, fixtures, results (feature #14) + house performance (feature #17)

```bash
# Tournament
curl -s -X POST $BASE/sports/tournaments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sportId":"<sport-id>","name":"Inter-School Cup","level":"District","startDate":"2026-09-20","endDate":"2026-09-22"}'

curl -s $BASE/sports/tournaments -H "Authorization: Bearer $TOKEN"
curl -s $BASE/sports/tournaments/<tournament-id> -H "Authorization: Bearer $TOKEN"

# Fixture — homeTeamId/awayTeamId must be real teams (any sport, FK-checked only;
# tighten to same-sport-as-tournament validation later if needed)
curl -s -X POST $BASE/sports/tournaments/<tournament-id>/fixtures -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-09-20T10:00:00.000Z","venue":"Main Ground","homeTeamId":"<team-id-1>","awayTeamId":"<team-id-2>"}'

curl -s $BASE/sports/fixtures -H "Authorization: Bearer $TOKEN"
curl -s $BASE/sports/fixtures/<fixture-id> -H "Authorization: Bearer $TOKEN"

# Result — server rejects this if scheduledAt is still in the future (real check, not client-side)
curl -s -X POST $BASE/sports/fixtures/<fixture-id>/results -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"homeScore":"3","awayScore":"1","winnerTeamId":"<team-id-1>"}'

curl -s $BASE/sports/fixtures/<fixture-id>/results -H "Authorization: Bearer $TOKEN"

# House-wise performance — aggregated live from fixture_result, scoped to my sports
curl -s $BASE/sports/houses/performance -H "Authorization: Bearer $TOKEN"
```

## 8. Achievements (feature #15)

```bash
# teamId OR tournamentId required (used to resolve the sport for authorization) —
# provide whichever is more relevant to this achievement.
curl -s -X POST $BASE/sports/achievements -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"<student-id>","tournamentId":"<tournament-id>","placement":"1st Place","awardedOn":"2026-09-22"}'

curl -s $BASE/sports/achievements -H "Authorization: Bearer $TOKEN"
# Confirm it also feeds the shared achievement table (source_domain='SPORTS') —
# check via Supabase: SELECT * FROM achievement WHERE source_domain = 'SPORTS';
```

## 9. Coach-to-team assignment (feature #16)

```bash
# coachId must be a real row from the Admin-only /coaches catalog
curl -s -X POST $BASE/sports/teams/<team-id>/coach -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"coachId":"<coach-id>"}'

curl -s $BASE/sports/teams/<team-id> -H "Authorization: Bearer $TOKEN"
# -> coachId in the response should now match
```

## Quick sanity checklist

- [ ] `query.md` run in Supabase, `prisma db pull && prisma generate` refreshed
- [ ] Test Faculty account has a `SPORTS_FACULTY` `role_assignment` row
- [ ] Team create → roster add works
- [ ] Equipment issue reduces `quantity_available`; return restores it
- [ ] Restock: Principal approve → Finance approve → allot increments equipment stock
- [ ] OD request: Principal approve → `student_event` + participants created → visible in
      `GET /faculty/events` and to the parent's existing consent screen
- [ ] Sport profile upsert is idempotent (re-POST same studentId+sportId updates, doesn't duplicate)
- [ ] Training attendance bulk-save works and is idempotent (re-POST same entries updates, doesn't duplicate)
- [ ] Fixture result rejected if `scheduledAt` is in the future; accepted once it's passed
- [ ] Recording a fixture result also flips the fixture's own `status` to `COMPLETED`
- [ ] House performance numbers change after recording a result for a team with a `houseId`
- [ ] Achievement creation also inserts into the shared `achievement` table (`source_domain='SPORTS'`)
- [ ] Coach assignment updates `team.coachId`
- [ ] Every route above 404s (not 403) for a Faculty account with no `SPORTS_FACULTY` assignment on that sport
