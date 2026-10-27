async function testSettlement() {
  const compId = '01a17cb2-9afa-7ef5-91f6-b47561899afb';
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass12345!' }),
  });
  const login = await loginRes.json();
  const token = login.accessToken;

  // Get Custody 1
  const listRes = await fetch('http://localhost:3000/api/v1/custodies', {
    headers: { 'Authorization': 'Bearer ' + token, 'x-company-id': compId },
  });
  const list = await listRes.json();
  const cust1 = list.data.find(c => c.custody_no === 'CUST-2026-0001');
  console.log('Target Custody:', cust1.custody_no, 'Status:', cust1.status);

  // Post Settlement
  console.log('\n--- Executing Settlement for CUST-2026-0001 ---');
  const settleRes = await fetch(`http://localhost:3000/api/v1/custodies/${cust1.id}/settlements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'x-company-id': compId,
    },
    body: JSON.stringify({
      settlementDate: '2026-02-15',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      settlementRate: 13.05,
      notes: 'تسوية دورية معتمدة لمصروفات شهر يناير 2026 لفرع القاهرة',
    }),
  });

  const updated = await settleRes.json();
  console.log('Settlement Response Status:', settleRes.status, updated);
  console.log('Total Settlements count:', updated.settlements?.length);
  if (updated.settlements?.length > 0) {
    const stl = updated.settlements[0];
    console.log('Settlement No:', stl.settlement_number, 'Expenses EGP:', stl.total_expenses_egp, 'Expenses SAR:', stl.total_expenses_sar);
    console.log('Settlement JE No:', stl.journalEntryNo, 'FX Difference SAR:', stl.fx_gain_loss_sar);
  }
}

testSettlement().catch(console.error);
