// Orchestrator. Default mode is ALWAYS a dry-run (transaction + ROLLBACK) —
// only `--commit` on the real command line does a real COMMIT, and nothing in
// this repo ever passes that flag automatically. Per standing instruction,
// this file is NEVER invoked by me without the user explicitly saying to run
// it, in that exact moment — see memory: never-execute-destructive-db-ops.md.
import { withSeedTransaction } from "./lib/db";
import { wipeAllTables } from "./lib/wipe";
import { seedTier0 } from "./tiers/tier0";
import { seedTier1 } from "./tiers/tier1";
import { seedTier2 } from "./tiers/tier2";
import { seedTier3 } from "./tiers/tier3";
import { seedTier4 } from "./tiers/tier4";
import { seedTier5Org } from "./tiers/tier5_org";
import { seedTier6Library } from "./tiers/tier6_library";
import { seedTier7Sports, seedTier7SubstituteCoaches } from "./tiers/tier7_sports";
import { seedTier8Transport } from "./tiers/tier8_transport";
import { seedTier9AcademicOps } from "./tiers/tier9_academic_ops";
import { seedTier10 } from "./tiers/tier10_hr_hostel_finance";
import { seedTier11 } from "./tiers/tier11_ops_misc";
import { seedTier12 } from "./tiers/tier12_final";
import { seedTier13 } from "./tiers/tier13_final2";
import { seedTier14 } from "./tiers/tier14_last6";
import fs from "node:fs";
import path from "node:path";
const allTables: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "all-tables.json"), "utf8"));

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(commit ? "*** REAL COMMIT RUN (wipe + full reseed) ***" : "--- dry-run (wipe + full reseed, will ROLLBACK) ---");
  const counters = await withSeedTransaction(commit, async (ctx) => {
    await wipeAllTables(ctx, allTables);
    await ctx.checkpoint();
    const t0 = await seedTier0(ctx);
    await ctx.checkpoint();
    console.log("Tier 0 done.");
    const t1 = await seedTier1(ctx, t0);
    await ctx.checkpoint();
    console.log("Tier 1 done. Students:", t1.students.length, "Staff:", t1.staff.length, "Subject offerings:", t1.subjectOfferingIds.length);
    const t2 = await seedTier2(ctx, t0, t1);
    await ctx.checkpoint();
    console.log("Tier 2 done. Guardians:", t2.guardianPersonIds.length);
    const t3 = await seedTier3(ctx, t0, t1, t2);
    await ctx.checkpoint();
    console.log("Tier 3 done. Exam subjects:", t3.examSubjectIds.length, "Attendance sessions:", t3.attendanceSessionIds.length);
    await seedTier4(ctx, t1, t3);
    await ctx.checkpoint();
    for (const e of t2.examIds) {
      await ctx.query(`UPDATE exam SET state='PUBLISHED', published_at=$2, marks_entry_opens_at=$3, marks_entry_closes_at=$4 WHERE id=$1`,
        [e.id, new Date(e.date.getTime() + 14 * 86400000).toISOString(), e.date.toISOString(), new Date(e.date.getTime() + 7 * 86400000).toISOString()]);
    }
    await ctx.checkpoint();
    await seedTier5Org(ctx, t0, t1, t2);
    await ctx.checkpoint();
    await seedTier6Library(ctx, t1, t2);
    await ctx.checkpoint();
    const t7 = await seedTier7Sports(ctx, t0, t1);
    await ctx.checkpoint();
    const t8 = await seedTier8Transport(ctx, t0, t1);
    await ctx.checkpoint();
    await seedTier7SubstituteCoaches(ctx, t7.teamIds, t8.coachIds);
    await ctx.checkpoint();
    await seedTier9AcademicOps(ctx, t0, t1, t2);
    await ctx.checkpoint();
    await seedTier10(ctx, t0, t1, t2, t3);
    await ctx.checkpoint();
    await seedTier11(ctx, t0, t1, t2);
    await ctx.checkpoint();
    await seedTier12(ctx, t0, t1, t2);
    await ctx.checkpoint();
    await seedTier13(ctx, t0, t1, t2, t3);
    await ctx.checkpoint();
    await seedTier14(ctx, t0, t1);
    await ctx.checkpoint();
  });
  console.log("\nRow counts (per table):");
  for (const [table, count] of Object.entries(counters).sort()) console.log(`  ${table}: ${count}`);
  const total = Object.values(counters).reduce((a, b) => a + b, 0);
  console.log(`\nTOTAL ROWS: ${total}`);
  console.log(commit ? "\nCOMMITTED." : "\nROLLED BACK — nothing persisted.");
}

main().catch((err) => {
  console.error("SEED FAILED:", err);
  process.exit(1);
});
