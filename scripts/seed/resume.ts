// RESUME runner: never wipes. Reloads ids of already-committed data, builds report cards set-based
// (server-side SQL), then runs tiers 11-14 unchanged. Autocommit + reconnect via lib/db.
import { withSeedTransaction, type SeedContext } from "./lib/db";
import { seedTier11 } from "./tiers/tier11_ops_misc";
import { seedTier11b } from "./tiers/tier11b";
import { seedTier11c } from "./tiers/tier11c";
import { seedTier12 } from "./tiers/tier12_final";
import { seedTier12b } from "./tiers/tier12b";
import { seedTier12c } from "./tiers/tier12c";
import { seedTier13 } from "./tiers/tier13_final2";
import { seedTier13b } from "./tiers/tier13b";
import { seedTier14 } from "./tiers/tier14_last6";

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7); // e.g. --only=reportcards,11,12

async function loadIds(ctx: SeedContext) {
  const map = async (sql: string) => Object.fromEntries((await ctx.query<{ k: string; id: string }>(sql)).rows.map((r) => [r.k, r.id]));
  const ids = async (sql: string) => (await ctx.query<{ id: string }>(sql)).rows.map((r) => r.id);
  const ay = (await ctx.query<{ id: string }>(`SELECT id FROM academic_year ORDER BY start_date LIMIT 1`)).rows[0]!.id;
  const t0: any = {
    schoolId: 1, academicYearId: ay,
    departmentIds: await map(`SELECT name k, id FROM department`),
    gradeIds: await map(`SELECT name k, id FROM grade`),
    mediumIds: { english: (await ctx.query(`SELECT id FROM medium WHERE code='ENG'`)).rows[0].id, tamil: (await ctx.query(`SELECT id FROM medium WHERE code='TAM'`)).rows[0].id },
    subjectIds: await map(`SELECT name k, id FROM subject ORDER BY code`),
    inventoryCategoryIds: await map(`SELECT name k, id FROM inventory_category`),
    vendorIds: await map(`SELECT name k, id FROM vendor`),
    houseIds: await ids(`SELECT id FROM house ORDER BY name`),
    sportIds: await map(`SELECT name k, id FROM sport`),
    expenseCategoryIds: await map(`SELECT name k, id FROM expense_category`),
    hostelIds: { boys: (await ctx.query(`SELECT id FROM hostel WHERE gender='MALE'`)).rows[0].id, girls: (await ctx.query(`SELECT id FROM hostel WHERE gender='FEMALE'`)).rows[0].id },
    vehicleIds: await ids(`SELECT id FROM vehicle ORDER BY registration_no`),
    routeIds: await ids(`SELECT id FROM route ORDER BY id`),
    gpsDeviceIds: await ids(`SELECT id FROM gps_device ORDER BY id`),
    terminalIds: await ids(`SELECT id FROM terminal ORDER BY terminal_uid`),
    equipmentIds: await ids(`SELECT id FROM equipment ORDER BY id`),
    libraryCategoryIds: {}, feeHeadIds: {}, gradeScaleId: "", campusId: "", timetablePeriodIds: [],
  };
  const sectionIds = await map(`SELECT g.name||'-'||s.name k, s.id FROM section s JOIN grade g ON g.id=s.grade_id`);
  const students = (await ctx.query<any>(
    `SELECT s.id "studentId", s.person_id "personId", g.name||'-'||sec.name "sectionKey", s.community_category "communityCategory",
            s.is_hosteller "isHosteller", s.uses_school_transport "usesTransport", CASE WHEN m.code='TAM' THEN 'tamil' ELSE 'english' END medium
       FROM student s JOIN student_enrolment e ON e.student_id=s.id JOIN section sec ON sec.id=e.section_id JOIN grade g ON g.id=sec.grade_id
       LEFT JOIN medium m ON m.id=s.medium_id ORDER BY s.admission_no`)).rows;
  const staff = (await ctx.query<any>(
    `SELECT id "staffId", person_id "personId", is_teaching "isTeaching", specialization "subjectSpecialization" FROM staff ORDER BY employee_no`)).rows;
  const lead = async (code: string) => (await ctx.query<{ person_id: string }>(`SELECT person_id FROM role_assignment WHERE role_code=$1 AND status='ACTIVE' LIMIT 1`, [code])).rows[0]!.person_id;
  const subjectOfferingIds = (await ctx.query<any>(
    `SELECT so.id, g.name||'-'||sec.name "sectionKey", sub.name "subjectName", so.teacher_staff_id "teacherStaffId",
            EXISTS (SELECT 1 FROM exam_subject es WHERE es.subject_offering_id=so.id) examinable
       FROM subject_offering so JOIN section sec ON sec.id=so.section_id JOIN grade g ON g.id=sec.grade_id JOIN subject sub ON sub.id=so.subject_id`)).rows;
  const t1: any = {
    sectionIds, sectionMeta: {}, students, staff,
    leadershipPersonIds: { principal: await lead("PRINCIPAL"), vicePrincipal: await lead("VICE_PRINCIPAL") },
    subjectOfferingIds, academicTermIds: await ids(`SELECT id FROM academic_term ORDER BY term_number`),
  };
  const t2: any = {
    examIds: [], gradeScaleBandIds: [], hostelBlockIds: { boys: [], girls: [] }, feeStructureIdByBand: {},
    guardianPersonIds: await (async () => (await ctx.query<{ person_id: string }>(`SELECT DISTINCT person_id FROM guardian_link ORDER BY person_id`)).rows.map((r) => r.person_id))(),
    studentFeeAssignmentIds: new Map<string, string>(),
  };
  const t3: any = { examSubjectIds: [], attendanceSessionIds: [] };
  return { t0, t1, t2, t3 };
}

async function reportCards(ctx: SeedContext, principalPersonId: string) {
  const existing = Number((await ctx.query<{ n: string }>(`SELECT count(*) n FROM report_card`)).rows[0]!.n);
  if (existing > 0) { console.log(`report_card already has ${existing} rows; skipping (no duplicates).`); return; }
  // Per (student, term, subject): average of the term's exam marks. Term 1 = exams before 1 Dec 2025.
  const base = `
    WITH subj AS (
      SELECT m.student_id, CASE WHEN es.exam_date < DATE '2025-12-01' THEN 'Term 1' ELSE 'Term 2' END term,
             sub.name subject_name, avg(m.marks_obtained)::numeric(6,2) avg_marks, max(es.max_marks)::numeric(6,2) max_marks
        FROM mark m JOIN exam_subject es ON es.id=m.exam_subject_id
        JOIN subject_offering so ON so.id=es.subject_offering_id JOIN subject sub ON sub.id=so.subject_id
       WHERE m.is_absent = false AND m.marks_obtained IS NOT NULL
       GROUP BY 1,2,3)`;
  await ctx.query(`INSERT INTO report_card (id, student_id, academic_year_id, term, snapshot, total_marks, percentage, overall_grade, class_rank,
        attendance_percent, advisor_remark, pdf_object_key, generated_at, generated_by, signed_off_by, signed_off_at, state)
    ${base},
    agg AS (
      SELECT student_id, term, sum(avg_marks) total, sum(max_marks) maxsum,
             jsonb_agg(jsonb_build_object('subject', subject_name, 'marks', avg_marks, 'max', max_marks) ORDER BY subject_name) snap
        FROM subj GROUP BY 1,2),
    att AS (
      SELECT ar.student_id, CASE WHEN s.session_date < DATE '2025-12-01' THEN 'Term 1' ELSE 'Term 2' END term,
             round(100.0 * count(*) FILTER (WHERE ar.status IN ('PRESENT','LATE')) / count(*), 2) pct
        FROM attendance_record ar JOIN attendance_session s ON s.id=ar.session_id GROUP BY 1,2),
    ranked AS (
      SELECT a.*, e.section_id, round(100.0*a.total/a.maxsum, 2) pct,
             rank() OVER (PARTITION BY e.section_id, a.term ORDER BY a.total DESC) rnk
        FROM agg a JOIN student_enrolment e ON e.student_id=a.student_id)
    SELECT gen_random_uuid(), r.student_id, (SELECT id FROM academic_year ORDER BY start_date LIMIT 1), r.term,
           jsonb_build_object('term', r.term, 'subjects', r.snap), r.total, r.pct,
           CASE WHEN r.pct>=91 THEN 'A1' WHEN r.pct>=81 THEN 'A2' WHEN r.pct>=71 THEN 'B1' WHEN r.pct>=61 THEN 'B2' WHEN r.pct>=51 THEN 'C1' WHEN r.pct>=41 THEN 'C2' WHEN r.pct>=33 THEN 'D' ELSE 'E' END,
           r.rnk, coalesce(at.pct, 100),
           CASE WHEN r.pct>=91 THEN 'Outstanding performance. Keep up the excellent work.' WHEN r.pct>=81 THEN 'Very good performance. Aim higher next term.'
                WHEN r.pct>=71 THEN 'Good progress. Regular practice will help improve further.' WHEN r.pct>=61 THEN 'Satisfactory. Needs more focus on weaker subjects.'
                WHEN r.pct>=51 THEN 'Average performance. Extra practice is recommended.' ELSE 'Needs close attention and regular revision support.' END,
           'report-cards/2025-2026/' || r.student_id || '/' || replace(lower(r.term),' ','-') || '.pdf',
           CASE WHEN r.term='Term 1' THEN TIMESTAMPTZ '2025-12-20 10:00+05:30' ELSE TIMESTAMPTZ '2026-04-30 10:00+05:30' END,
           $1::uuid, $1::uuid,
           CASE WHEN r.term='Term 1' THEN TIMESTAMPTZ '2025-12-20 10:00+05:30' ELSE TIMESTAMPTZ '2026-04-30 10:00+05:30' END,
           'PUBLISHED'
      FROM ranked r LEFT JOIN att at ON at.student_id=r.student_id AND at.term=r.term`, [principalPersonId]);
  await ctx.query(`INSERT INTO report_card_line (id, report_card_id, subject_name_snapshot, marks_obtained, max_marks, grade_label, teacher_remark, display_order)
    ${base}
    SELECT gen_random_uuid(), rc.id, s.subject_name, s.avg_marks, s.max_marks,
           CASE WHEN p>=91 THEN 'A1' WHEN p>=81 THEN 'A2' WHEN p>=71 THEN 'B1' WHEN p>=61 THEN 'B2' WHEN p>=51 THEN 'C1' WHEN p>=41 THEN 'C2' WHEN p>=33 THEN 'D' ELSE 'E' END,
           CASE WHEN p>=81 THEN 'Excellent understanding of the subject.' WHEN p>=61 THEN 'Good grasp; keep practising.' WHEN p>=41 THEN 'Fair; needs more revision.' ELSE 'Requires focused support.' END,
           row_number() OVER (PARTITION BY rc.id ORDER BY s.subject_name)
      FROM (SELECT *, round(100.0*avg_marks/max_marks, 2) p FROM subj) s
      JOIN report_card rc ON rc.student_id=s.student_id AND rc.term=s.term`);
  const n = (await ctx.query<any>(`SELECT (SELECT count(*) FROM report_card) rc, (SELECT count(*) FROM report_card_line) rcl`)).rows[0];
  console.log(`report_card: ${n.rc}, report_card_line: ${n.rcl}`);
}

// Idempotent wrapper: a table that already has rows is skipped (parent inserts return an existing id so
// children still link). Never duplicates committed data; only empty tables get filled.
function guarded(ctx: SeedContext): SeedContext {
  const nonEmpty = new Map<string, boolean>();
  const existingIds = new Map<string, string[]>();
  const has = async (table: string) => {
    if (!nonEmpty.has(table)) nonEmpty.set(table, Number((await ctx.query<{ n: string }>(`SELECT count(*) n FROM "${table}"`)).rows[0]!.n) > 0);
    return nonEmpty.get(table)!;
  };
  const skipped = new Set<string>();
  return {
    counters: ctx.counters, query: ctx.query.bind(ctx), checkpoint: async () => { if (skipped.size) console.log(`  [skipped already-filled tables: ${[...skipped].join(", ")}]`); skipped.clear(); await ctx.checkpoint(); },
    async insertMany(table, cols, rows) { if (await has(table)) { skipped.add(table); return; } return ctx.insertMany(table, cols, rows); },
    async insertReturningId(table, columns) {
      if (await has(table)) {
        skipped.add(table);
        if (!existingIds.has(table)) existingIds.set(table, (await ctx.query<{ id: string }>(`SELECT id FROM "${table}" LIMIT 500`)).rows.map((r) => r.id));
        const ids = existingIds.get(table)!;
        return ids[Math.floor(Math.random() * ids.length)]!;
      }
      return ctx.insertReturningId(table, columns);
    },
  };
}

async function main() {
  const steps = only ? only.split(",") : ["11b", "12", "13", "14"];
  await withSeedTransaction(true, async (rawCtx) => {
    if (process.argv.includes("--clean-approval-step")) await rawCtx.query(`DELETE FROM approval_step`);
    const ctx = process.argv.includes("--guard") ? guarded(rawCtx) : rawCtx;
    const { t0, t1, t2, t3 } = await loadIds(rawCtx);
    console.log(`Loaded ids: ${t1.students.length} students, ${t1.staff.length} staff, ${t1.subjectOfferingIds.length} offerings, ${t2.guardianPersonIds.length} guardians.`);
    if (steps.includes("reportcards")) { await reportCards(ctx, t1.leadershipPersonIds.principal); await ctx.checkpoint(); }
    if (steps.includes("11")) { await seedTier11(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("11b")) { await seedTier11b(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("11c")) { await seedTier11c(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("12b")) { await seedTier12b(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("12")) { await seedTier12(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("12c")) { await seedTier12c(ctx, t0, t1, t2); await ctx.checkpoint(); }
    if (steps.includes("13b")) { await seedTier13b(ctx, t0, t1, t2, t3); await ctx.checkpoint(); }
    if (steps.includes("13")) { await seedTier13(ctx, t0, t1, t2, t3); await ctx.checkpoint(); }
    if (steps.includes("14")) { await seedTier14(ctx, t0, t1); await ctx.checkpoint(); }
  });
}
main().catch((e) => { console.error("RESUME FAILED:", e); process.exit(1); });
