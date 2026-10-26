const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const file = '0015_custody_petty_cash_and_fx.sql';
const sql = fs.readFileSync(path.join(__dirname, '..', 'apps', 'api', 'db', 'migrations', file), 'utf8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');
const wanted = ['contract_currency', 'contract_amount', 'payout_currency', 'payout_exchange_rate', 'payout_amount', 'total_payout_sar', 'total_payout_egp'];
(async () => {
  const c = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await c.connect();
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE column_name = ANY($1::text[])", [wanted]);
  const found = new Set(r.rows.map((x) => x.column_name));
  const missing = wanted.filter((w) => !found.has(w));
  if (missing.length) {
    console.log('NOT syncing, missing columns:', missing.join(', '));
  } else {
    await c.query('UPDATE public.schema_migrations SET checksum = $2 WHERE filename = $1', [file, checksum]);
    console.log('all 0015 columns present; checksum synced for idham');
  }
  await c.end();
})();
