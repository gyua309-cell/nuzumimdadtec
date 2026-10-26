const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const sql = fs.readFileSync(path.join(__dirname, '..', 'apps', 'api', 'db', 'migrations', '0015_custody_petty_cash_and_fx.sql'), 'utf8');
const tables = [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => m[1]);
const cols = [...sql.matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)].map((m) => m[1]);
(async () => {
  const c = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await c.connect();
  for (const t of tables) {
    const [s, n] = t.split('.');
    const r = await c.query('SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2', [s, n]);
    console.log(`table ${t}: ${r.rowCount ? 'present' : 'MISSING'}`);
  }
  console.log('ALTER ADD COLUMN names in file:', cols.join(', ') || '(none)');
  await c.end();
})();
