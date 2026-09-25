// Read-only (the one audit probe runs inside a transaction that is rolled back).
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { AttendanceDiaryRepository } from "../../src/modules/attendance-diary/repositories/attendance-diary.repository";
import { AttendanceDiaryService } from "../../src/modules/attendance-diary/attendance-diary.service";
import { AuditService } from "../../src/common/audit/audit.service";

const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = env.match(/^DIRECT_URL=(.*)$/m)![1]!.trim().replace(/^"|"$/g, "");

(async () => {
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 30000 });
  const q = (t: string, p?: unknown[]) => pool.query(t, p as any[]);
  const svc = new AttendanceDiaryService(new AttendanceDiaryRepository({ query: q } as any), { record: async () => undefined } as any);
  const person = async (like: string) => (await q(`SELECT person_id FROM login_identifier WHERE value LIKE $1 LIMIT 1`, [like])).rows[0].person_id as string;
  let n = 0;
  const ok = (m: string) => { n++; console.log("PASS", m); };
  const LC = `WITH lc AS (SELECT DISTINCT ON (attendance_record_id) attendance_record_id, new_status FROM attendance_correction ORDER BY attendance_record_id, corrected_at DESC)`;

  // 1) independent recount of one day straight from the raw tables (incl. corrections)
  const D = "2026-03-10";
  const raw = (await q(`${LC} SELECT COALESCE(lc.new_status, ar.status) s, count(*)::int c FROM attendance_session se JOIN attendance_record ar ON ar.session_id=se.id LEFT JOIN lc ON lc.attendance_record_id=ar.id WHERE se.session_date=$1 AND se.session_type='DAILY' GROUP BY 1`, [D])).rows;
  const rawMap = Object.fromEntries(raw.map((r: any) => [r.s, r.c]));
  const admin = await person("admin%@sis.in");
  const s = await svc.listStudents(admin, { date: D, pageSize: 1 } as any);
  assert.equal(s.summary.present, rawMap.PRESENT ?? 0);
  assert.equal(s.summary.absent, rawMap.ABSENT ?? 0);
  assert.equal(s.summary.late, rawMap.LATE ?? 0);
  ok(`diary summary matches the raw tables for ${D}: present ${s.summary.present}, absent ${s.summary.absent}, late ${s.summary.late}`);

  // 2) one student's percentage recomputed independently
  const one = (await svc.listStudents(admin, { date: D, sort: "PERCENT_ASC", pageSize: 1 } as any)).items[0];
  const chk = (await q(`${LC} SELECT count(*)::int total, count(*) FILTER (WHERE COALESCE(lc.new_status, ar.status) IN ('PRESENT','LATE'))::int present
      FROM attendance_record ar JOIN attendance_session se ON se.id=ar.session_id LEFT JOIN lc ON lc.attendance_record_id=ar.id
      WHERE ar.student_id=$1 AND se.session_date BETWEEN (SELECT start_date FROM academic_year WHERE is_current) AND $2 AND se.session_type='DAILY'`, [one.studentId, D])).rows[0];
  assert.equal(one.totalDays, chk.total);
  assert.equal(one.presentDays, chk.present);
  ok(`student percentage recomputed independently (${one.firstName}: ${chk.present}/${chk.total})`);

  // 3) every class advisor sees exactly their own class
  const seats = (await q(`SELECT person_id, scope_id FROM role_assignment WHERE role_code='CLASS_ADVISOR' AND scope_type='SECTION' AND status='ACTIVE'`)).rows;
  for (const seat of seats) {
    const r = await svc.listStudents(seat.person_id, { date: D, pageSize: 100 } as any);
    assert.equal(r.total, 40);
    assert.ok(r.items.every((i: any) => i.sectionId === seat.scope_id));
    await assert.rejects(() => svc.listEmployees(seat.person_id, { date: D } as any), /not available/);
  }
  ok(`all ${seats.length} class-advisor logins see exactly their own 40 students and no employee data`);

  // 4) every faculty sees exactly the classes they teach / hold the seat for (independent SQL)
  const fac = (await q(`SELECT DISTINCT s.person_id FROM staff s JOIN role_assignment ra ON ra.person_id=s.person_id AND ra.role_code='FACULTY' AND ra.status='ACTIVE' WHERE s.status='ACTIVE' AND s.employee_no LIKE 'EMP%' AND NOT EXISTS (SELECT 1 FROM role_assignment l WHERE l.person_id=s.person_id AND l.status='ACTIVE' AND l.role_code IN ('PRINCIPAL','VICE_PRINCIPAL'))`)).rows;
  let bad = 0;
  for (const f of fac) {
    const expected = (await q(`SELECT DISTINCT x.sid FROM (
        SELECT so.section_id sid FROM subject_offering so JOIN staff st ON st.id=so.teacher_staff_id AND st.person_id=$1 AND st.status='ACTIVE'
          JOIN section sec ON sec.id=so.section_id AND sec.academic_year_id=(SELECT id FROM academic_year WHERE is_current) WHERE so.status='ACTIVE'
        UNION SELECT a.section_id FROM class_teacher_login_assignment a JOIN section sec ON sec.id=a.section_id AND sec.academic_year_id=(SELECT id FROM academic_year WHERE is_current)
          WHERE a.faculty_person_id=$1 AND a.status='ACTIVE') x`, [f.person_id])).rows.map((r: any) => r.sid).sort();
    const got = new Set<string>();
    const first = await svc.listStudents(f.person_id, { date: D, pageSize: 100 } as any);
    first.items.forEach((i: any) => got.add(i.sectionId));
    for (let p = 2; p <= Math.ceil(first.total / 100); p++) (await svc.listStudents(f.person_id, { date: D, pageSize: 100, page: p } as any)).items.forEach((i: any) => got.add(i.sectionId));
    if (JSON.stringify([...got].sort()) !== JSON.stringify(expected)) bad++;
  }
  assert.equal(bad, 0);
  ok(`all ${fac.length} faculty logins see exactly the classes they teach (independent SQL cross-check, 0 mismatches)`);

  // 5) every coordinator: student scope = their grades; employees never include principal / VP
  const coords = (await q(`SELECT DISTINCT person_id FROM role_assignment WHERE role_code='ACADEMIC_COORDINATOR' AND status='ACTIVE'`)).rows;
  for (const c of coords) {
    const grades = (await q(`SELECT scope_id FROM role_assignment WHERE person_id=$1 AND role_code='ACADEMIC_COORDINATOR' AND status='ACTIVE' AND scope_type='GRADE'`, [c.person_id])).rows.map((r: any) => r.scope_id);
    const expected = Number((await q(`SELECT count(*) FROM student_enrolment e JOIN section sec ON sec.id=e.section_id WHERE e.status='ACTIVE' AND sec.grade_id = ANY($1::uuid[]) AND e.academic_year_id=(SELECT id FROM academic_year WHERE is_current)`, [grades])).rows[0].count);
    const r = await svc.listStudents(c.person_id, { date: D, pageSize: 1 } as any);
    assert.equal(r.total, expected);
    const e = await svc.listEmployees(c.person_id, { date: "2026-09-23", pageSize: 100 } as any);
    assert.ok(e.items.every((i: any) => i.group === "FACULTY"));
    assert.ok(e.total > 0);
  }
  ok(`all ${coords.length} coordinators: student scope equals their grades exactly; employee list has no principal / vice principal`);

  // 6) leadership sees all 110 employees incl. principal + VP
  const emp = await svc.listEmployees(admin, { date: "2026-09-23", pageSize: 100 } as any);
  assert.equal(emp.total, 110);
  assert.ok(emp.items.some((i: any) => i.group === "PRINCIPAL") && emp.items.some((i: any) => i.group === "VICE_PRINCIPAL"));
  ok("admin employee list = 110 including principal and vice principal");

  // 7) the audit write works against the REAL audit_event table (rolled back - nothing persisted)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await new AuditService({ query: q } as any).record(
      { actorPersonId: admin, actorRoleCode: "ADMIN", action: "ATTENDANCE_DIARY_VIEW", objectType: "attendance_diary", outcome: "SUCCESS", afterData: { tab: "STUDENTS", scope: "FULL", resultTotal: 2240 } },
      client as any,
    );
    const denied = await client.query(`INSERT INTO audit_event (actor_person_id, actor_role_code, action, object_type, outcome) VALUES ($1,'CLASS_ADVISOR','ATTENDANCE_DIARY_VIEW','attendance_diary','DENIED') RETURNING id`, [admin]);
    assert.ok(denied.rows[0].id);
    ok("audit_event accepts SUCCESS and DENIED diary rows (transaction rolled back)");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  console.log(`\nALL ${n} REAL-DATA CHECKS PASSED`);
  await pool.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
