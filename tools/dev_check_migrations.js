const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const dir = path.join(__dirname, '..', 'apps', 'api', 'db', 'migrations');
(async () => {
  for (const db of ['idham', 'idham_test']) {
    const c = new Client(`postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/${db}`);
    await c.connect();
    const rows = (await c.query('SELECT filename, checksum FROM public.schema_migrations')).rows;
    const m = new Map(rows.map((r) => [r.filename, r.checksum]));
    const out = [];
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) {
      const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f), 'utf8')).digest('hex');
      out.push(`${f}: ${m.has(f) ? (m.get(f) === h ? 'ok' : 'MISMATCH') : 'not-applied'}`);
    }
    console.log(`== ${db}\n${out.join('\n')}`);
    await c.end();
  }
})();
