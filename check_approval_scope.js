const fs = require('fs');
const { Pool } = require('pg');
const envText = fs.readFileSync('.env', 'utf8');
const match = envText.match(/^DATABASE_URL=(.*)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query(`SELECT DISTINCT approver_role_code, count(*) FROM approval_policy_step GROUP BY approver_role_code ORDER BY approver_role_code`);
  console.log('=== real approver_role_code values across all approval policies ===');
  console.table(r.rows);

  const corr = await pool.query(`SELECT count(*) FROM approval_policy_step WHERE approver_role_code = 'CORRESPONDENT'`);
  console.log('CORRESPONDENT as approver_role_code count:', corr.rows[0].count);

  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
