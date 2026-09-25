// Read-only data snapshot of every table to JSON (safety net before the wipe).
import pg from "pg"; import fs from "node:fs"; import path from "node:path";
const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)![1]!.trim().replace(/^"|"$/g, "");
const tables: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "all-tables.json"), "utf8"));
(async () => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await c.connect();
  const out = process.argv[2]!; let total = 0;
  for (const t of tables) {
    const r = await c.query(`SELECT * FROM "${t}"`);
    fs.writeFileSync(path.join(out, `${t}.json`), JSON.stringify(r.rows)); total += r.rows.length;
  }
  console.log("backed up rows:", total); await c.end();
})();
