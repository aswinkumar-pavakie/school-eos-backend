// Read-only: exercises the diary repository + service against the real seeded data.
import pg from "pg"; import fs from "node:fs"; import path from "node:path";
import { AttendanceDiaryRepository } from "../../src/modules/attendance-diary/repositories/attendance-diary.repository";
import { AttendanceDiaryService } from "../../src/modules/attendance-diary/attendance-diary.service";
const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = env.match(/^DIRECT_URL=(.*)$/m)![1]!.trim().replace(/^"|"$/g, "");
(async () => {
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 20000 });
  const repo = new AttendanceDiaryRepository({ query: (t: string, p?: unknown[]) => pool.query(t, p as any[]) } as any);
  const audit: any = { record: async () => undefined };
  const svc = new AttendanceDiaryService(repo, audit);
  const time = async <T>(label: string, fn: () => Promise<T>) => { const t = Date.now(); const r = await fn(); console.log(`  [${Date.now() - t} ms] ${label}`); return r; };
  const person = async (emailLike: string) => (await pool.query(`SELECT person_id FROM login_identifier WHERE value LIKE $1 LIMIT 1`, [emailLike])).rows[0]?.person_id as string;

  const admin = await person("admin%@sis.in");
  const D = "2026-03-10";
  console.log("ADMIN (whole school) on", D);
  const s = await time("students page 1", () => svc.listStudents(admin, { date: D, pageSize: 5 } as any));
  console.log("  total", s.total, "summary", JSON.stringify(s.summary)); console.log("  first:", s.items[0]);
  const lt = await time("percent < 75", () => svc.listStudents(admin, { date: D, percentBand: "LT75", pageSize: 3, sort: "PERCENT_ASC" } as any));
  console.log("  count <75%:", lt.total, "lowest:", lt.items.map((i: any) => i.percentage));
  const q = await time("search 'ravi'", () => svc.listStudents(admin, { date: D, q: "ravi", pageSize: 3 } as any));
  console.log("  matches", q.total, q.items.map((i: any) => `${i.firstName} ${i.lastName} ${i.gradeName}-${i.sectionName}`));
  const e = await time("employees 2026-09-23", () => svc.listEmployees(admin, { date: "2026-09-23", pageSize: 5 } as any));
  console.log("  employees total", e.total, "summary", JSON.stringify(e.summary)); console.log("  first:", e.items[0]);
  const ctx = await svc.getContext(admin, {} as any); console.log("  context sections:", ctx.sections.length, "grades:", ctx.grades.length, "today:", ctx.today);

  for (const [label, like] of [["CLASS ADVISOR (10a)", "classadvisor10a@sis.in"], ["ACADEMIC COORDINATOR 1", "academiccoordinator1@sis.in"], ["FACULTY", "facultyadityapalaniappan076@sis.in"], ["PRINCIPAL", "principal%@sis.in"], ["PARENT", "parent%@sis.in"]] as const) {
    const pid = await person(like); console.log(`\n${label}`);
    try {
      const c = await svc.getContext(pid, { date: D } as any);
      const st = await svc.listStudents(pid, { date: D, pageSize: 3 } as any);
      console.log(`  role=${c.access.roleLabel} classes=${c.access.classCount} employeesTab=${c.access.canViewEmployees} students=${st.total}`);
      console.log("  classes:", c.sections.slice(0, 8).map((x: any) => `${x.gradeName}${x.name}`).join(", "));
      try { const em = await svc.listEmployees(pid, { date: "2026-09-23" } as any); console.log("  employees:", em.total, "groups:", [...new Set(em.items.map((i: any) => i.group))]); } catch (err: any) { console.log("  employees ->", err.message); }
    } catch (err: any) { console.log("  BLOCKED:", err.message); }
  }
  await pool.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
