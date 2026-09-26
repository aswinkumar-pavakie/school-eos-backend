# School EOS — Master Seed Plan (consolidated reference)

Status: PLANNING COMPLETE. Nothing seeded yet. This file is the single source of truth
the actual seed script is built from — supersedes anything said in chat.

## 1. Population model (every number below must stay internally consistent)

- 14 grades: LKG, UKG, 1–12. 4 sections/grade (A–D). 40 students/section.
  Total students = 14 × 4 × 40 = 2,240.
- Total families = 1,900 (1,560 single-child, 340 two-sibling → 1,560+680=2,240 students ✓).
  Two-guardian families = 1,235 (65%), single-guardian = 665 (35%).
  Distinct guardian persons = 1,235×2 + 665×1 = 3,135.
  guardian_link rows = 3,696 (computed per-family, not flat).
- Staff = 150: 108 classroom teachers + 2 leadership (Principal, VP) = 110 is_teaching=true;
  40 non-teaching (is_teaching=false): Admin/office 2, Finance/Accounts 4, Librarians 3,
  Lab assistants 4, Hostel Wardens 2, Nurses 2, Counsellors 2, Security 6, Bus Attendants 12,
  Transport Manager 1, Media Room 3. (2+4+3+4+2+2+2+6+12+1+3=40)
- Separate non-staff persons: Correspondent 1, Drivers 12, Canteen Vendor reps 3,
  Attendants 6 (gate/POS). Coaches (8) are NOT persons (no login, own table only).
- TOTAL person rows = 2,240 (students) + 150 (staff) + 1 (correspondent) + 3,135 (guardians)
  + 12 (drivers) + 3 (canteen vendor) + 6 (attendants) + 56 (class_teacher_login SEAT
  persons) + 12 (academic_coordinator_login SEAT persons) = 5,615.
  (A real teammate schema change, confirmed via database/migrations/0032_class_teacher_
  login.sql, requires class_teacher_login.login_person_id and academic_coordinator_
  login.coordinator_person_id to each be their OWN separate person row with its own
  login/credential/role_assignment — never the real teacher's own personId. The real
  teacher is linked via class_teacher_login_assignment.faculty_person_id /
  academic_coordinator_login.faculty_person_id instead. Fixed in tier1.ts.)
- Hostellers: 224 (10%) — 130 boys / 94 girls. Bus riders: 672 (30%). Day scholar/own
  transport: 1,344 (60%). is_hosteller and uses_school_transport are INDEPENDENT booleans,
  both always filled, never null, for all 2,240 students.
- Medium: English 1,904 (85%) / Tamil 336 (15%).
- Blood group (real Indian distribution, sums to 2,240): O+ 840, B+ 660, A+ 470, AB+ 160,
  O- 45, B- 35, A- 20, AB- 10.
- community_category (real Tamil Nadu categories, sums to 2,240): OC 1,210 (54%),
  BC 448 (20%), MBC 157 (7%), SC 381 (17%), SC(A) 22 (1%), ST 22 (1%).
- is_first_gen_learner: true 134 (6%) / false 2,106. is_differently_abled: true 45 (2%) /
  false 2,195, support_needs filled only for those 45 (conditionally-null elsewhere, correct).
- Concession: 513 rows total = 473 (community-based: 90% of the 425 SC/SC(A)/ST students +
  5% of the other 1,815) + 40 (RTE 25% quota at LKG entry, 160 LKG seats × 25%).
- Sports (8, Tamil-Nadu-real): Cricket, Kabaddi, Football, Volleyball, Kho-Kho, Athletics,
  Silambam, Chess.
- Houses (4, real TN names): Bharathiyar, Kamarajar, Anna, Periyar.
- Board: Tamil Nadu State Board (Samacheer Kalvi). Grade 10 = SSLC, Grade 12 = HSC/Plus Two
  registered with the real Tamil Nadu Directorate of Government Examinations.
- Academic terms: 3/year (academic_term table) — Term1 Jun–Sep, Term2 Oct–Dec, Term3 Jan–Apr.
- Exams (7/year for grades 1–12, 2 informal assessments for LKG/UKG): Quarterly (Sep),
  Half-Yearly (Nov), Revision Test 1 (Jan, post-Pongal), Revision Test 2 (Mar),
  Public/Annual Exam (Mar–Apr) = 5 major + 2 Formative/Unit assessments = 7.
- Grade scale (real CBSE/TN band): A1 91-100, A2 81-90, B1 71-80, B2 61-70, C1 51-60,
  C2 41-50, D 33-40 (pass), E <33 (fail). pass_marks=33 on every exam_subject.
- Subjects by band (Part A in chat, unchanged): pre-primary 5, primary 5+PE+Club,
  middle 5+PE+Club, secondary 5+PE+Club, sr.sec (3 streams) 5+PE+Club each.
- subject_offering = 376 total (LKG/UKG 40 non-examinable + grades1-12 336, of which
  240 are academic/examinable, 96 are PE/Club).
- exam_subject = 240 examinable offerings × 7 exams = 1,680.
- mark = 240 offerings × 40 students/section × 7 exams = 67,200. Grade-band split
  (sums to 100% of 67,200): A1 8%(5,376) A2 14%(9,408) B1 18%(12,096) B2 20%(13,440)
  C1 16%(10,752) C2 12%(8,064) D 7%(4,704) E-fail 5%(3,360).
- Holidays/calendar_event: Pongal 4 days (mid-Jan), Tamil New Year 1, Deepavali 1,
  Karthigai Deepam 1, Republic Day/Independence Day/Gandhi Jayanti/Christmas 4,
  = 11 real holiday-days + 4 non-holiday school-event entries (Annual Day, Sports Day,
  2 PTA). Working days/year ≈ 220 (365 - ~52 Sun - ~24 alt-Sat - 11 holiday - ~58
  exam/vacation block days).
- attendance_session = 56 sections × 220 days = 12,320/year.
- attendance_record = 12,320 × 40 = 492,800/year. Present rate 95%.
- Fee heads (6, real TN private-school rupee figures — see PLAN table below) — 4
  installments/student/year. fee_demand = 2,240 × 4 = 8,960. Paid-on-time 85%(7,616),
  pending 9%(806), overdue 6%(538).
- Hostel: Boys 4 floors×10 rooms×4 beds=160 beds (130 occupied); Girls 4×8×4=128 beds
  (94 occupied). hostel_block 4, hostel_floor 8, hostel_room 72, hostel_bed 288,
  hostel_allocation 224.
- Canteen: 4 real POS terminals (revised up from 3 for real throughput headroom).
  canteen_transaction ≈ 268,800/year (2,240 × 3/week × 40 weeks).
- Library: library_category 12, library_book 5,500 (Eng 60%/Tamil 35%/Hindi 5%),
  library_book_copy ~9,000 (avg 1.64/title), library_member 3,331 (2,240 students +
  150 staff + 941 of the 3,135 guardians @30%), library_issue ~18,000/yr,
  library_fine ~1,260/yr.
- Inventory: inventory_category 8, inventory_item ~120.
- Role catalogue (18 real roles) — see PLAN.md §2 role-mapping table.
- EXCLUDED from seeding entirely (legacy, superseded by real E2EE messaging service):
  conversation, conversation_participant, message, message_translation.

## 2. Role → person mapping (must stay consistent with §1 headcounts)

| role_code | count | drawn from |
|---|---|---|
| PRINCIPAL | 1 | staff leadership |
| VICE_PRINCIPAL | 1 | staff leadership |
| CORRESPONDENT | 1 | separate person (not staff) |
| FINANCE | 4 | staff non-teaching |
| ADMIN | 2 | staff non-teaching |
| LIBRARY | 3 | staff non-teaching |
| MEDIA_ROOM | 3 | staff non-teaching |
| HOSTEL_WARDEN | 2 | staff non-teaching |
| TRANSPORT_MANAGER | 1 | staff non-teaching |
| BUS_ATTENDANT | 12 | staff non-teaching |
| CLASS_ADVISOR | 56 | label on teaching staff (1/section) |
| ACADEMIC_COORDINATOR | 12 | label on teaching staff |
| SPORTS_FACULTY | 20 | label on teaching staff |
| SPORTS_ADMIN | 2 | subset of SPORTS_FACULTY |
| COMMUNITY_INCHARGE | 5 | label on teaching staff |
| HEALTH_INCHARGE | 3 | label on teaching staff / nurses |
| FACULTY | 110 | base label, all teaching staff incl. leadership |
| PARENT | 3,135 | all distinct guardians |
| COMMUNITY | ~80 | subset of existing guardians (PTA-active), NOT new persons |
| DRIVER | 12 | separate persons |
| CANTEEN_VENDOR | 3 | separate persons |

## 3. Dependency tiers (271 tables, computed live from information_schema — see
   /tmp/final_tiers.json generated this session; regenerate via
   scripts/seed/lib/introspect.ts before running if schema has changed since)

Tier 0 (47) → Tier 1 (72) → Tier 2 (100) → Tier 3 (38) → Tier 4 (12) → Tier 5 (2) = 271.
Full per-tier table lists: see chat history / regenerate from live DB (query in
scripts/seed/lib/introspect.ts). Excluded 4 legacy tables removed from every tier.

## 4. Column-fill rule (applied programmatically, not manually per column)

1. Any column that is `NOT NULL` in the live schema → ALWAYS generate a real, non-placeholder
   value. No exceptions, no empty strings used as filler.
2. Any nullable column → filled UNLESS explicitly listed as "conditionally-null" below,
   in which case the condition decides, and both branches must occur in real seeded rows
   (never 100% one branch): date_of_leaving (only for status!=ACTIVE), support_needs
   (only for is_differently_abled=true), state_student_id (interstate-transfer students
   only, ~3%), bank_account_ref (staff payroll + fee-refund-eligible parents only).
3. Every "system-managed" column (created_at/updated_at/version) is left to real DB
   defaults/triggers — never hand-set to a fake value.

## 5. Build order for the actual script

scripts/seed/data/*.ts        — static real reference data (names, subjects, chapters, menus)
scripts/seed/lib/*.ts         — id pools, weighted-random pickers, date helpers, pg client
scripts/seed/tiers/tier0..5.ts — real INSERT logic, in this exact dependency order
scripts/seed/verify.ts        — post-seed audit (row-count-vs-expected, null-scan, orphan-scan)
scripts/seed/run.ts           — orchestrator; supports --dry-run (transaction + ROLLBACK,
                                  default) and --commit (real run, requires explicit flag)

Default mode is ALWAYS --dry-run. --commit is never passed automatically by any script
in this folder — it must be typed explicitly by a human, every single time.

## 6. Login email + password scheme (user-specified, applies to EVERY seeded login)

- Password for every account: `SIS@test123` (real argon2id hash, matching identity.util.ts).
- Email = `{roleword}{personname}{3-digit-id}@sis.in`, name lowercased with spaces
  removed, id a per-role sequential counter. e.g. parentrajeshkumar022@sis.in,
  facultyrio090@sis.in, principaltarik090@sis.in. Role words: parent, faculty,
  principal, viceprincipal, correspondent, finance, admin, library, mediaroom,
  hostelwarden, healthincharge (nurses), transportmanager, busattendant,
  canteenvendor, driver; non-login-role staff (lab assistant, counsellor,
  security) use labassistant/counsellor/security; students use `student` (contact
  email only, no login).
- Seat logins (separate persons, per the 0032 migration): Class Advisor =
  `classadvisor{grade}{section}@sis.in` (classadvisor1a, classadvisorlkga...),
  Academic Coordinator = `academiccoordinator{1..12}@sis.in`.
- Every guardian (parent) now gets a real login (previously missing).
- role catalogue is seeded in tier0; role_assignment for non-teaching staff is
  driven by the same roleCode used for the email prefix (no positional drift).
- Correspondent (1) + Canteen Vendor reps (3) + Drivers (12) now have persons,
  logins and role_assignments (were previously missing).
