// READ-ONLY end-to-end consistency checks on the seeded data. Never writes.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import argon2 from "argon2";

const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = (env.match(/^DIRECT_URL=(.*)$/m) ?? env.match(/^DATABASE_URL=(.*)$/m))![1]!.trim().replace(/^"|"$/g, "");

async function main() {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, keepAlive: true, connectionTimeoutMillis: 30000 });
  await c.connect(); await c.query("SET statement_timeout = 0");
  const one = async (sql: string) => Object.values((await c.query(sql)).rows[0])[0] as any;
  let fail = 0;
  const check = (name: string, actual: any, expected: any) => { const ok = String(actual) === String(expected); if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${actual}${ok ? "" : `  (expected ${expected})`}`); };

  check("students", await one(`SELECT count(*) FROM student`), 2240);
  check("enrolments (1 per student)", await one(`SELECT count(DISTINCT student_id) FROM student_enrolment`), 2240);
  check("sections", await one(`SELECT count(*) FROM section`), 56);
  check("sections with exactly 40 students", await one(`SELECT count(*) FROM (SELECT section_id FROM student_enrolment GROUP BY 1 HAVING count(*)=40) x`), 56);
  check("grades", await one(`SELECT count(*) FROM grade`), 14);
  check("teaching staff (incl principal/VP)", await one(`SELECT count(*) FROM staff WHERE is_teaching AND employee_no LIKE 'EMP%'`), "see below");
  check("students without a guardian", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM guardian_link g WHERE g.student_id=s.id)`), 0);
  check("students without a primary contact", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM guardian_link g WHERE g.student_id=s.id AND g.is_primary_contact)`), 0);
  check("students without wallet", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM wallet w WHERE w.student_id=s.id)`), 0);
  check("students without health profile", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM health_profile h WHERE h.student_id=s.id)`), 0);
  check("students without emergency consent", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM emergency_treatment_consent e WHERE e.student_id=s.id)`), 0);
  check("students without house", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM student_house h WHERE h.student_id=s.id)`), 0);
  check("students without fee assignment", await one(`SELECT count(*) FROM student s WHERE NOT EXISTS (SELECT 1 FROM student_fee_assignment f WHERE f.student_id=s.id)`), 0);
  check("students without 4 fee instalments", await one(`SELECT count(*) FROM student s WHERE (SELECT count(*) FROM fee_demand d WHERE d.student_id=s.id) <> 4`), 0);
  check("hostellers", await one(`SELECT count(*) FROM student WHERE is_hosteller`), 224);
  check("hostellers without a bed", await one(`SELECT count(*) FROM student s WHERE s.is_hosteller AND NOT EXISTS (SELECT 1 FROM hostel_allocation a WHERE a.student_id=s.id)`), 0);
  check("bus riders", await one(`SELECT count(*) FROM student WHERE uses_school_transport`), 672);
  check("bus riders without allocation", await one(`SELECT count(*) FROM student s WHERE s.uses_school_transport AND NOT EXISTS (SELECT 1 FROM student_transport_allocation a WHERE a.student_id=s.id)`), 0);
  check("marks: rows", await one(`SELECT count(*) FROM mark`), 67200);
  check("marks: student x exam_subject gaps (students w/ offerings)", await one(`
    SELECT count(*) FROM (SELECT e.student_id, es.id FROM student_enrolment e JOIN subject_offering so ON so.section_id=e.section_id JOIN exam_subject es ON es.subject_offering_id=so.id
      EXCEPT SELECT student_id, exam_subject_id FROM mark) x`), 0);
  check("attendance sessions not holding 40 records", await one(`SELECT count(*) FROM (SELECT session_id FROM attendance_record GROUP BY 1 HAVING count(*)<>40) x`), 0);
  check("report cards: students with marks but no card (2 terms)", await one(`SELECT count(*) FROM (SELECT DISTINCT student_id FROM mark) m WHERE (SELECT count(*) FROM report_card r WHERE r.student_id=m.student_id) <> 2`), 0);
  check("report card lines without card", await one(`SELECT count(*) FROM report_card_line l WHERE NOT EXISTS (SELECT 1 FROM report_card r WHERE r.id=l.report_card_id)`), 0);
  check("payments = receipts", await one(`SELECT (SELECT count(*) FROM payment)=(SELECT count(*) FROM receipt)`), true);
  check("paid demands fully allocated", await one(`SELECT count(*) FROM fee_demand d WHERE d.state='PAID' AND NOT EXISTS (SELECT 1 FROM payment_allocation a WHERE a.fee_demand_id=d.id)`), 0);
  check("class-advisor seat logins", await one(`SELECT count(*) FROM class_teacher_login`), 56);
  check("academic-coordinator seat logins", await one(`SELECT count(*) FROM academic_coordinator_login`), 12);
  check("every login has a credential", await one(`SELECT count(*) FROM login_identifier l WHERE NOT EXISTS (SELECT 1 FROM user_credential u WHERE u.person_id=l.person_id)`), 0);
  check("login identifiers not @sis.in", await one(`SELECT count(*) FROM login_identifier WHERE value NOT LIKE '%@sis.in'`), 0);
  check("duplicate login identifiers", await one(`SELECT count(*) FROM (SELECT lower(value) FROM login_identifier GROUP BY 1 HAVING count(*)>1) x`), 0);
  check("persons without any login (students by design)", await one(`SELECT count(*) FROM person p WHERE NOT EXISTS (SELECT 1 FROM login_identifier l WHERE l.person_id=p.id)`), "see below");

  // real authentication check: sample credentials per role prefix
  const rows = (await c.query(`SELECT regexp_replace(split_part(l.value,'@',1), '[0-9]+$', '') AS stem, l.value, u.password_hash
    FROM login_identifier l JOIN user_credential u ON u.person_id=l.person_id ORDER BY md5(l.value)`)).rows as { stem: string; identifier: string; password_hash: string }[];
  const byPrefix = new Map<string, typeof rows>();
  for (const r of rows) { const k = r.stem.replace(/[a-z]+$/, (m) => m).slice(0, 12); (byPrefix.get(k) ?? byPrefix.set(k, []).get(k)!).push(r); }
  let authOk = 0, authBad = 0;
  const sample = rows.filter((_, i) => i % 40 === 0).slice(0, 80);
  for (const r of sample) { try { (await argon2.verify(r.password_hash, "SIS@test123")) ? authOk++ : authBad++; } catch { authBad++; } }
  check(`password SIS@test123 verifies (sample of ${sample.length} logins)`, `${authOk} ok / ${authBad} bad`, `${sample.length} ok / 0 bad`);
  const stems = await c.query(`SELECT regexp_replace(split_part(value,'@',1), '[0-9]+$', '') stem, count(*) n FROM login_identifier GROUP BY 1 ORDER BY 2 DESC`);
  console.log("\nLOGIN COUNTS BY EMAIL PREFIX (role + name):");
  const roleCounts = await c.query(`SELECT coalesce(substring(value from '^(viceprincipal|principal|faculty|classadvisor|academiccoordinator|parent|admin|finance|correspondent|driver|attendant|hostelwarden|hostelwarden|transportmanager|librarian|library|canteenvendor|vendor|mediaroom|media|healthincharge|health|nurse|sportsadmin|sportsfaculty|sports|communityincharge|community|student|coach|office|clerk)'), 'other') AS role, count(*) FROM login_identifier GROUP BY 1 ORDER BY 2 DESC`);
  console.log(roleCounts.rows.map((r: any) => `${r.role}: ${r.count}`).join("\n"));
  console.log(`\nSummary: ${fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED"}`);
  await c.end();
}
main().catch((e) => { console.error("CHECK FAILED:", e.message); process.exit(1); });
