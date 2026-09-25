// Full-database wipe — every one of the 271 real tables, in one TRUNCATE
// statement (Postgres resolves FK ordering itself under CASCADE, so no
// manual tier-reversal is needed here). Runs inside the SAME transaction as
// the reseed that follows it, so under dry-run mode the whole
// wipe+reseed is rolled back together — the live database never sees a
// half-wiped, not-yet-reseeded state, even for a moment, unless --commit
// is passed and the whole thing succeeds end to end.
import type { SeedContext } from "./db";

export async function wipeAllTables(ctx: SeedContext, allTableNames: string[]): Promise<void> {
  const quoted = allTableNames.map((t) => `"${t}"`).join(", ");
  await ctx.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log(`Wiped ${allTableNames.length} tables.`);
}
