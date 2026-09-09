// One-off READ-ONLY check. Never writes. Run: node check-db.js
const fs = require('fs');
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  await client.connect();

  const q = async (label, sql, params) => {
    try {
      const { rows } = await client.query(sql, params);
      console.log(`\n=== ${label} (${rows.length} rows) ===`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
      console.log(`\n=== ${label} — ERROR: ${e.message} ===`);
    }
  };

  await q('role SPORTS_FACULTY exists?', `SELECT code, name FROM role WHERE code = 'SPORTS_FACULTY'`);
  await q('validate_role_assignment_scope has SPORT branch?', `SELECT pg_get_functiondef(oid) LIKE '%SPORT%' AS has_sport FROM pg_proc WHERE proname = 'validate_role_assignment_scope'`);
  await q('role_assignment_scope_type_check allows SPORT?', `SELECT pg_get_constraintdef(oid) LIKE '%SPORT%' AS has_sport FROM pg_constraint WHERE conname = 'role_assignment_scope_type_check'`);
  await q('purchase_request.equipment_id exists?', `SELECT column_name FROM information_schema.columns WHERE table_name = 'purchase_request' AND column_name = 'equipment_id'`);
  await q('equipment_issue new columns exist?', `SELECT column_name FROM information_schema.columns WHERE table_name = 'equipment_issue' AND column_name IN ('issue_reason','signature_object_key','signed_at')`);
  await q('sport_od_request table exists?', `SELECT to_regclass('sport_od_request') AS exists`);
  await q('approval_policy rows for Sports', `SELECT request_type, sequence_no, approver_role_code, is_final FROM approval_policy WHERE request_type IN ('SPORTS_OD_REQUEST','SPORTS_EQUIPMENT_REQUEST') ORDER BY 1,2`);
  await q('SPORTS_FACULTY role_assignment rows', `SELECT id, person_id, scope_type, scope_id, status FROM role_assignment WHERE role_code = 'SPORTS_FACULTY'`);
  await q('sports table row count', `SELECT count(*)::int AS n FROM sport`);
  await q('team table row count', `SELECT count(*)::int AS n FROM team`);
  await q('team_member row count', `SELECT count(*)::int AS n FROM team_member`);
  await q('equipment row count', `SELECT count(*)::int AS n FROM equipment`);

  await client.end();
}

main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
