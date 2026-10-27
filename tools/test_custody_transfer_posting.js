const http = require('http');

async function testTransfer() {
  const compId = '01a17cb2-9afa-7ef5-91f6-b47561899afb';
  // Login
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass12345!' }),
  });
  const login = await loginRes.json();
  const token = login.accessToken;
  console.log('Login successful:', login.user?.username);

  // Get Custody 2
  const listRes = await fetch('http://localhost:3000/api/v1/custodies', {
    headers: { 'Authorization': 'Bearer ' + token, 'x-company-id': compId },
  });
  const list = await listRes.json();
  const cust2 = list.data.find(c => c.custody_no === 'CUST-2026-0002');
  console.log('Target Custody:', cust2.custody_no, 'Current Balance:', cust2.remaining_balance_target);

  // Transfer 5,000 SAR @ 13.05 = 65,250 EGP
  console.log('\n--- Executing Transfer: 5,000 SAR -> 65,250 EGP ---');
  const transferRes = await fetch(`http://localhost:3000/api/v1/custodies/${cust2.id}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'x-company-id': compId,
    },
    body: JSON.stringify({
      amountSar: 5000,
      exchangeRate: 13.05,
      amountEgp: 65250,
      bankFeesSar: 35,
      bankReference: 'REF-SAMA-REPLENISH-2026',
      notes: 'تعزيز رصيد عهدة التوظيف بعد وصوله لمستوى الأمان',
    }),
  });

  const updated = await transferRes.json();
  console.log('Transfer Response Status:', transferRes.status, updated);
  console.log('New Remaining Balance:', updated.remaining_balance_target, updated.target_currency);
  console.log('Is Low Balance Now?:', updated.isLowBalance);
  console.log('Total Transfers on Custody:', updated.transfers?.length);
  if (updated.transfers?.length > 0) {
    const latest = updated.transfers[0];
    console.log('Latest Transfer:', latest.transfer_number, 'Amount SAR:', latest.amount_sar, 'Amount EGP:', latest.amount_egp);
    console.log('SA JE:', latest.saJournalEntryNo, 'EG JE:', latest.egJournalEntryNo);
  }
}

testTransfer().catch(console.error);
