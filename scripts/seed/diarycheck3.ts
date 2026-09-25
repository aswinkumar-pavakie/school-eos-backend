// Real-data verification of the fixes: (1) concurrent roster-open no longer 500s with a unique
// violation, (2) a genuine subject-teaching (non-advisor) faculty member can open the new
// attendance-only student profile for one of their students, (3) scope is still enforced (a
// student outside a faculty member's classes is a 404), (4) leadership keeps profileMode FULL.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { AttendanceDiaryRepository } from "../../src/modules/attendance-diary/repositories/attendance-diary.repository";
import { AttendanceDiaryService } from "../../src/modules/attendance-diary/attendance-diary.service";
import { AttendanceSessionRepository } from "../../src/modules/attendance/repositories/attendance-session.repository";
import { AttendanceRecordRepository } from "../../src/modules/attendance/repositories/attendance-record.repository";

const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = env.match(/^DIRECT_URL=(.*)$/m)![1]!.trim().replace(/^"|"$/g, "");

(async () => {
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4, connectionTimeoutMillis: 30000 });
  const q = (t: string, p?: unknown[]) => pool.query(t, p as any[]);
  const repo = new AttendanceDiaryRepository({ query: q } as any);
  const svc = new AttendanceDiaryService(repo, { record: async () => undefined } as any);
  const person = async (like: string) => (await q(`SELECT person_id FROM login_identifier WHERE value LIKE $1 LIMIT 1`, [like])).rows[0].person_id as string;
  let n = 0;
  const ok = (m: string) => { n++; console.log("PASS", m); };

  // 1) concurrent findOrCreate on a NEW section+date must not 500 (this is the exact bug reported)
  const sessionRepo = new AttendanceSessionRepository({ query: q } as any);
  const recordRepo = new AttendanceRecordRepository({ query: q } as any);
  const testDate = "2026-04-01"; // inside the year, unlikely to already have a session
  const anySection = (await q(`SELECT id FROM section WHERE academic_year_id=(SELECT id FROM academic_year WHERE is_current) ORDER BY id LIMIT 1`)).rows[0].id as string;
  await q(`DELETE FROM attendance_record WHERE session_id IN (SELECT id FROM attendance_session WHERE section_id=$1 AND session_date=$2)`, [anySection, testDate]);
  await q(`DELETE FROM attendance_session WHERE section_id=$1 AND session_date=$2`, [anySection, testDate]);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, async () => {
      const client = await pool.connect();
      try {
        const session = await sessionRepo.findOrCreate(anySection, testDate, client as any);
        const students = await sessionRepo.findActiveEnrolledStudentIds(anySection, client as any);
        await recordRepo.createManyPresent(session.id, students, client as any);
        return session.id;
      } finally {
        client.release();
      }
    }),
  );
  assert.ok(results.every((r) => r.status === "fulfilled"), "a concurrent roster-open must never throw");
  const ids = new Set((results as PromiseFulfilledResult<string>[]).map((r) => r.value));
  assert.equal(ids.size, 1, "all 8 concurrent callers must resolve to the SAME session row");
  const recCount = Number((await q(`SELECT count(*) c FROM attendance_record WHERE session_id=$1`, [[...ids][0]])).rows[0].c);
  const studentCount = Number((await q(`SELECT count(*) c FROM student_enrolment WHERE section_id=$1 AND status='ACTIVE'`, [anySection])).rows[0].c);
  assert.equal(recCount, studentCount, "records were not duplicated by the concurrent race");
  ok(`8 concurrent roster-opens on the same section+date resolve to 1 session, ${recCount} records (no duplicates, no 500)`);
  await q(`DELETE FROM attendance_record WHERE session_id=$1`, [[...ids][0]]);
  await q(`DELETE FROM attendance_session WHERE id=$1`, [[...ids][0]]);

  // 2) a genuine subject-teaching (non-advisor) faculty member opens the new profile for one of
  //    their real students (this is exactly the bug in the screenshot)
  const nonAdvisorTeacher = (await q(`
    SELECT so.teacher_staff_id tid, so.section_id sid FROM subject_offering so
    JOIN role_assignment ra ON ra.role_code='FACULTY' AND ra.status='ACTIVE' AND ra.person_id=(SELECT person_id FROM staff WHERE id=so.teacher_staff_id)
    WHERE so.status='ACTIVE' AND NOT EXISTS (
      SELECT 1 FROM role_assignment adv WHERE adv.role_code='CLASS_ADVISOR' AND adv.status='ACTIVE'
        AND adv.scope_id = so.section_id AND adv.person_id = (SELECT person_id FROM staff WHERE id = so.teacher_staff_id)
    ) LIMIT 1`)).rows[0];
  assert.ok(nonAdvisorTeacher, "fixture assumption failed: expected at least one non-advisor subject teacher");
  const teacherPerson = (await q(`SELECT person_id FROM staff WHERE id=$1`, [nonAdvisorTeacher.tid])).rows[0].person_id;
  const theirStudent = (await q(`SELECT student_id FROM student_enrolment WHERE section_id=$1 AND status='ACTIVE' LIMIT 1`, [nonAdvisorTeacher.sid])).rows[0].student_id;
  const profile = await svc.getStudentProfile(teacherPerson, theirStudent, "2026-03-10");
  assert.equal(profile.student.studentId, theirStudent);
  ok(`non-advisor subject teacher can open the attendance-only profile of their own student (${profile.student.firstName})`);

  // 3) the SAME teacher is refused a student outside their classes (still scoped -- not a security regression)
  const otherStudent = (await q(`SELECT student_id FROM student_enrolment WHERE section_id<>$1 AND status='ACTIVE' LIMIT 1`, [nonAdvisorTeacher.sid])).rows[0].student_id;
  await assert.rejects(() => svc.getStudentProfile(teacherPerson, otherStudent, "2026-03-10"), /not found/i);
  n++; console.log("PASS non-advisor teacher is still refused a student outside their own classes (404)");

  // 4) leadership keeps the FULL profile mode (their own existing profile page, unaffected)
  const admin = await person("admin%@sis.in");
  const ctx = await svc.getContext(admin, {} as any);
  assert.equal(ctx.access.profileMode, "FULL");
  ok("leadership context reports profileMode=FULL (own existing student profile, unaffected)");
  const advisorCtx = await svc.getContext((await q(`SELECT person_id FROM role_assignment WHERE role_code='CLASS_ADVISOR' AND status='ACTIVE' LIMIT 1`)).rows[0].person_id, {} as any);
  assert.equal(advisorCtx.access.profileMode, "ATTENDANCE");
  ok("class advisor context reports profileMode=ATTENDANCE (limited profile)");

  console.log(`\nALL ${n} FIX-VERIFICATION CHECKS PASSED`);
  await pool.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
