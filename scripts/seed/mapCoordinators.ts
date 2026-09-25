// Maps each Academic Coordinator to specific grades (GRADE scope) instead of the whole school, the
// way Admin's "assign coordinator" flow does. Coordinator n -> grade n (1..12); coordinator 1 also
// gets LKG and UKG. Idempotent: re-running changes nothing once mapped. UPDATE/INSERT only.
import { withSeedTransaction } from "./lib/db";

withSeedTransaction(true, async (ctx) => {
  const coordinators = (
    await ctx.query<{ person_id: string; n: number }>(
      `SELECT ra.person_id, substring(l.value from 'academiccoordinator([0-9]+)@')::int AS n
         FROM role_assignment ra JOIN login_identifier l ON l.person_id = ra.person_id
        WHERE ra.role_code = 'ACADEMIC_COORDINATOR' AND ra.status = 'ACTIVE' AND l.value ~ '^academiccoordinator[0-9]+@'
        GROUP BY 1, 2 ORDER BY 2`,
    )
  ).rows;
  const grades = (await ctx.query<{ id: string; name: string }>(`SELECT id, name FROM grade`)).rows;
  const gradeId = (name: string) => grades.find((g) => g.name === name)?.id;
  const ay = (await ctx.query<{ id: string }>(`SELECT id FROM academic_year WHERE is_current LIMIT 1`)).rows[0]!.id;
  const admin = (await ctx.query<{ p: string }>(`SELECT person_id p FROM role_assignment WHERE role_code='ADMIN' AND status='ACTIVE' ORDER BY person_id LIMIT 1`)).rows[0]!.p;

  let updated = 0, added = 0;
  for (const c of coordinators) {
    const main = gradeId(String(c.n));
    if (!main) continue;
    const r: any = await ctx.query(
      `UPDATE role_assignment SET scope_type = 'GRADE', scope_id = $2, scope_stage = NULL
        WHERE person_id = $1 AND role_code = 'ACADEMIC_COORDINATOR' AND status = 'ACTIVE' AND scope_type = 'SCHOOL'`,
      [c.person_id, main],
    );
    updated += r.rowCount ?? 0;
    const extra = c.n === 1 ? ["LKG", "UKG"] : [];
    for (const g of extra) {
      const gid = gradeId(g);
      if (!gid) continue;
      const exists = await ctx.query(`SELECT 1 FROM role_assignment WHERE person_id=$1 AND role_code='ACADEMIC_COORDINATOR' AND scope_type='GRADE' AND scope_id=$2 AND status='ACTIVE'`, [c.person_id, gid]);
      if (exists.rows.length) continue;
      await ctx.query(
        `INSERT INTO role_assignment (person_id, role_code, scope_type, scope_id, academic_year_id, valid_from, status, assigned_by)
         VALUES ($1,'ACADEMIC_COORDINATOR','GRADE',$2,$3,'2025-06-01','ACTIVE',$4)`,
        [c.person_id, gid, ay, admin],
      );
      added++;
    }
  }
  console.log(`coordinators mapped: ${updated} re-scoped to a grade, ${added} extra grade rows added`);
}).then(() => process.exit(0)).catch((e) => { console.error("MAP FAILED:", e.message); process.exit(1); });
