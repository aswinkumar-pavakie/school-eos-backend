import { withSeedTransaction } from "./lib/db";
async function main() {
  await withSeedTransaction(true, async (ctx) => {
    const r: any = await ctx.query(`INSERT INTO syllabus_progress (subject_offering_id, syllabus_unit_id, status, completed_on, updated_by)
    SELECT so.id, su.id, CASE WHEN su.rn <= 2 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END, CASE WHEN su.rn <= 2 THEN DATE '2025-08-01' + (su.rn::int * 30) END,
           (SELECT person_id FROM staff WHERE id = so.teacher_staff_id)
      FROM subject_offering so JOIN section sec ON sec.id = so.section_id
      JOIN LATERAL (SELECT x.id, x.rn FROM (SELECT id, row_number() OVER (ORDER BY unit_no) rn FROM syllabus_unit WHERE subject_id = so.subject_id AND grade_id = sec.grade_id) x WHERE x.rn <= 3) su ON true
     WHERE EXISTS (SELECT 1 FROM exam_subject es WHERE es.subject_offering_id = so.id)`);
    console.log("syllabus_progress:", r?.rowCount ?? "error");
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
