const { Client } = require('pg');

async function check() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const entries = await client.query(`
    SELECT je.id, je.entry_no, je.entry_date, je.description, je.status,
           je.source_module, je.source_type, je.source_id,
           je.total_debit_base, je.total_credit_base
      FROM acc.journal_entries je
     WHERE je.source_module = 'purchases'
     ORDER BY je.created_at DESC
     LIMIT 2
  `);

  console.log('Purchases Journal Entries:');
  for (const je of entries.rows) {
    console.log(`\n======================================================`);
    console.log(`Entry: ${je.entry_no} | Status: ${je.status} | Total Base: ${je.total_debit_base}`);
    console.log(`Description: ${je.description}`);

    const lines = await client.query(`
      SELECT jl.line_no, a.code as acc_code, a.name_ar as acc_name,
             jl.debit_tx, jl.credit_tx, jl.debit_base, jl.credit_base, jl.description
        FROM acc.journal_lines jl
        JOIN acc.accounts a ON a.id = jl.account_id
       WHERE jl.entry_id = $1
       ORDER BY jl.line_no ASC
    `, [je.id]);

    console.log('Lines:');
    lines.rows.forEach(l => {
      console.log(`  #${l.line_no} [${l.acc_code}] ${l.acc_name}`);
      console.log(`     Debit: ${l.debit_tx} | Credit: ${l.credit_tx} | Base Dr: ${l.debit_base} | Base Cr: ${l.credit_base}`);
      console.log(`     Desc: ${l.description}`);
    });
  }

  await client.end();
}

check().catch(console.error);
