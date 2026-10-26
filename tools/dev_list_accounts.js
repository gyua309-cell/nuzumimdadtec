const { Client } = require('pg');
const c = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
c.connect().then(async () => {
  const r = await c.query(
    "SELECT code, name_ar, account_class, subtype FROM acc.accounts WHERE company_id = '01a105ec-6a9a-74cd-b663-0ef527c4cfde' AND (code LIKE '2%' OR code LIKE '3%' OR code LIKE '5%' OR code LIKE '1%') ORDER BY code",
  );
  console.log(r.rows.map((x) => `${x.code} ${x.account_class} ${x.subtype} ${x.name_ar}`).join('\n'));
  await c.end();
});
