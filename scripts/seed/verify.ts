// READ-ONLY completeness audit: empty tables + NULL counts per column. Never writes.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = (env.match(/^DIRECT_URL=(.*)$/m) ?? env.match(/^DATABASE_URL=(.*)$/m))![1]!.trim().replace(/^"|"$/g, "");
const EXCLUDED = new Set(["conversation", "conversation_participant", "message", "message_translation", "audit_event"]);

async function main() {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, keepAlive: true, connectionTimeoutMillis: 30000 });
  await c.connect();
  await c.query("SET statement_timeout = 0");
  const cols = (await c.query(
    `SELECT table_name, column_name, is_nullable, is_generated FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')
     ORDER BY table_name, ordinal_position`)).rows as { table_name: string; column_name: string; is_nullable: string; is_generated: string }[];
  const byTable = new Map<string, string[]>();
  for (const r of cols) { if (!byTable.has(r.table_name)) byTable.set(r.table_name, []); byTable.get(r.table_name)!.push(r.column_name); }

  const empty: string[] = []; const nullCols: string[] = []; let populated = 0;
  for (const [table, columns] of byTable) {
    if (EXCLUDED.has(table)) continue;
    const sel = columns.map((col, i) => `count(*) FILTER (WHERE "${col}" IS NULL) AS n${i}`).join(", ");
    const r = (await c.query(`SELECT count(*)::int AS total, ${sel} FROM "${table}"`)).rows[0];
    if (r.total === 0) { empty.push(table); continue; }
    populated++;
    const bad = columns.map((col, i) => [col, r[`n${i}`] as number] as const).filter(([, n]) => n > 0);
    if (bad.length) nullCols.push(`${table} (${r.total} rows): ${bad.map(([col, n]) => `${col}=${n}`).join(", ")}`);
  }
  console.log(`POPULATED TABLES: ${populated}   EMPTY TABLES: ${empty.length}   TABLES WITH NULL COLUMNS: ${nullCols.length}`);
  console.log("\n--- EMPTY TABLES ---\n" + empty.join("\n"));
  console.log("\n--- COLUMNS WITH NULLS ---\n" + nullCols.join("\n"));
  await c.end();
}
main().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
