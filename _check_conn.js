const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
pool
  .query('SELECT 1 as ok')
  .then((r) => {
    console.log('DB reachable', r.rows);
    process.exit(0);
  })
  .catch((e) => {
    console.log('DB unreachable:', e.message);
    process.exit(1);
  });
