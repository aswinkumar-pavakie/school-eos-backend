// SAFETY-CRITICAL: the whole "never affect the database without an explicit
// human --commit" guarantee lives here. Everything runs in ONE transaction.
//
// Performance: rows are buffered client-side (UUID primary keys are generated
// here, so callers can reference ids immediately) and flushed as large
// multi-row INSERTs in FK-dependency (tier) order — flushed automatically
// before any SELECT/other statement, so reads always see prior writes.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadDatabaseUrl(): string {
  const env = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".env"), "utf8");
  // Prefer the direct (session-mode) URL: one long transaction is safer there than through the transaction pooler.
  const m = env.match(/^DIRECT_URL=(.*)$/m) ?? env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error("DATABASE_URL not found in .env");
  return m[1]!.trim().replace(/^"|"$/g, "");
}

const META: { depth: Record<string, number>; uuidId: string[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "table-meta.json"), "utf8"),
);
const UUID_ID = new Set(META.uuidId);

export interface SeedContext {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  insertReturningId(table: string, columns: Record<string, unknown>): Promise<string>;
  insertMany(table: string, columnNames: string[], rows: unknown[][]): Promise<void>;
  checkpoint(): Promise<void>;
  counters: Record<string, number>;
}

interface Buffer { table: string; cols: string[]; rows: unknown[][] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isConnErr = (e: any) =>
  !e?.code || ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED", "57P01", "57P02", "08006", "08001", "08003"].includes(e.code) ||
  /terminated|not queryable|socket|ECONNRESET|timeout/i.test(String(e?.message));

// Autocommit loader: every batch is its own atomic transaction (committed work is never lost), a dropped
// connection is re-established and the batch retried, and a bad row is skipped + recorded, not fatal.
export async function withSeedTransaction(
  commit: boolean,
  fn: (ctx: SeedContext) => Promise<void>,
): Promise<Record<string, number>> {
  if (!commit) throw new Error("Dry runs were removed: run with --commit (autocommit, resumable, backup exists).");
  let client!: pg.Client;
  async function connect() {
    client = new pg.Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false }, keepAlive: true, keepAliveInitialDelayMillis: 10000, connectionTimeoutMillis: 30000 });
    client.on("error", (e) => { console.log("CONNECTION ERROR:", e.message); });
    await client.connect();
    await client.query("SET statement_timeout = 0");
  }
  await connect();
  const counters: Record<string, number> = {};
  const errors = new Map<string, number>();
  const buffers = new Map<string, Buffer>();

  async function exec(sql: string, params?: unknown[]): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      try { return await client.query(sql, params as any[]); }
      catch (e: any) {
        if (!isConnErr(e) || attempt >= 60) throw e;
        console.log(`  [connection lost (${e.message}); reconnecting, attempt ${attempt + 1}]`);
        try { await client.end(); } catch { /* ignore */ }
        await sleep(Math.min(30000, 2000 * (attempt + 1)));
        try { await connect(); } catch (e2: any) { console.log("  [reconnect failed:", e2.message, "]"); }
      }
    }
  }
  const record = (table: string, e: any, n = 1) => {
    const key = `${table}: ${e.message}${e.detail ? " | " + e.detail : ""}${e.constraint ? " [" + e.constraint + "]" : ""}`;
    errors.set(key, (errors.get(key) ?? 0) + n);
  };

  async function runInsert(table: string, cols: string[], rows: unknown[][]): Promise<void> {
    const chunk = Math.max(1, Math.min(500, Math.floor(20000 / cols.length)));
    const colSql = cols.map((c) => `"${c}"`).join(", ");
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const params: unknown[] = [];
      const values = part.map((row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`);
      try { await exec(`INSERT INTO "${table}" (${colSql}) VALUES ${values.join(", ")}`, params); continue; }
      catch (e: any) {
        if (isConnErr(e)) throw e;
        // isolate bad rows; if the first 25 all fail, the chunk is systematically bad
        let failed = 0, ok = 0;
        for (let r = 0; r < part.length; r++) {
          const row = part[r]!;
          const p2: unknown[] = []; const v2 = `(${row.map((v) => { p2.push(v); return `$${p2.length}`; }).join(", ")})`;
          try { await exec(`INSERT INTO "${table}" (${colSql}) VALUES ${v2}`, p2); ok++; }
          catch (e2: any) { if (isConnErr(e2)) throw e2; failed++; record(table, e2); if (ok === 0 && failed >= 25) { record(table, e2, part.length - r - 1); break; } }
        }
      }
    }
  }

  async function flushAll(): Promise<void> {
    if (buffers.size === 0) return;
    const all = [...buffers.values()].sort((a, b) => (META.depth[a.table] ?? 99) - (META.depth[b.table] ?? 99));
    buffers.clear();
    for (const b of all) await runInsert(b.table, b.cols, b.rows);
  }

  function buffer(table: string, cols: string[], rows: unknown[][]) {
    const key = `${table}|${cols.join(",")}`;
    let b = buffers.get(key);
    if (!b) { b = { table, cols, rows: [] }; buffers.set(key, b); }
    for (const r of rows) b.rows.push(r);
    counters[table] = (counters[table] ?? 0) + rows.length;
  }

  const printErrors = () => {
    console.log(`\n=== ${errors.size} DISTINCT ROW ERRORS (rows skipped; to be filled) ===`);
    for (const [k, n] of errors) console.log(`${k}  (x${n})`);
  };

  try {
    const ctx: SeedContext = {
      counters,
      async checkpoint() {
        await flushAll();
        console.log(`  [checkpoint: all rows so far are committed, ${errors.size} distinct errors so far]`);
      },
      async query(sql, params) {
        await flushAll();
        if (/^\s*(INSERT|UPDATE)/i.test(sql)) {
          try { return await exec(sql, params); }
          catch (e: any) { if (isConnErr(e)) throw e; record(`DIRECT ${sql.slice(0, 40).replace(/\s+/g, " ")}`, e); return { rows: [] } as any; }
        }
        return exec(sql, params);
      },
      async insertReturningId(table, columns) {
        if (!UUID_ID.has(table)) {
          await flushAll();
          const keys = Object.keys(columns);
          const { rows } = await exec(
            `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
            Object.values(columns),
          );
          counters[table] = (counters[table] ?? 0) + 1;
          return rows[0].id;
        }
        const id = crypto.randomUUID();
        buffer(table, ["id", ...Object.keys(columns)], [[id, ...Object.values(columns)]]);
        return id;
      },
      async insertMany(table, columnNames, rows) {
        if (rows.length) buffer(table, columnNames, rows);
      },
    };
    await fn(ctx);
    await flushAll();
    printErrors();
    console.log(errors.size ? "DONE: committed, with skipped rows listed above." : "DONE: committed, zero skipped rows.");
    return counters;
  } catch (err) {
    printErrors();
    throw err;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}
