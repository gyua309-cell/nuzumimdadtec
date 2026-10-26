const http = require('http');

const COMPANY_ID = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';
const EXPENSE_ACCOUNT_ID = '01a16d62-f2b0-7d3a-b859-a861ed843e84'; // 5500 Software & Cloud

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://localhost:3000/api/v1' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        'x-company-id': COMPANY_ID
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:3000/api/v1' + path, {
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        'x-company-id': COMPANY_ID
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const login = await post('/auth/login', { username: 'admin', password: 'AdminPass12345' });
  const token = login.data.accessToken;

  // 1. Periods & Company Info
  const company = await get('/companies/current', token);
  console.log('Company:', company.data?.nameAr, 'Base Currency:', company.data?.baseCurrencyCode);
  const baseCurrency = company.data?.baseCurrencyCode || 'SAR';

  const periods = await get('/fiscal-periods', token);
  const periodId = periods.data[0]?.id;

  // 2. Vendors
  const vendors = await get('/vendors', token);
  const vendor = vendors.data?.data[0];
  console.log('Active Vendor:', vendor?.code, vendor?.nameAr);

  // 3. Create Purchase Invoice in base currency
  console.log('\n======================================================');
  console.log('--- Creating Purchase Invoice ---');
  const billRes = await post('/purchase-invoices', {
    vendorId: vendor.id,
    fiscalPeriodId: periodId,
    vendorInvoiceNo: 'AWS-2026-INV-9902',
    issueDate: '2026-01-15',
    dueDate: '2026-02-15',
    currencyCode: baseCurrency,
    exchangeRate: '1',
    notes: 'استضافة خوادم سحابية وتراخيص بيئة تطوير للمشاريع',
    lines: [
      {
        itemType: 'SERVER_HOSTING',
        description: 'خوادم سحابية Kubernetes وقواعد بيانات عالية التوفر',
        expenseAccountId: EXPENSE_ACCOUNT_ID,
        quantity: 1,
        unitPrice: 10000,
        vatRate: 15
      },
      {
        itemType: 'SOFTWARE_LICENSE',
        description: 'تراخيص بيئة التطوير والذكاء الاصطناعي السحابية',
        expenseAccountId: EXPENSE_ACCOUNT_ID,
        quantity: 5,
        unitPrice: 1000,
        vatRate: 15
      }
    ]
  }, token);

  console.log('Create Bill status:', billRes.status);
  console.log('Invoice No:', billRes.data?.invoiceNo);
  console.log('Subtotal:', billRes.data?.subtotal, 'VAT:', billRes.data?.vatAmount, 'Total:', billRes.data?.totalAmount);

  // 4. Post Purchase Invoice and check automatic journal entry
  if (billRes.data?.id) {
    const postBill = await post(`/purchase-invoices/${billRes.data.id}/post`, {}, token);
    console.log('\nPost Bill status:', postBill.status, 'Invoice Status:', postBill.data?.status);
    console.log('Auto Generated Journal Entry ID:', postBill.data?.journalEntryId);

    if (postBill.data?.journalEntryId) {
      const je = await get(`/journals/${postBill.data.journalEntryId}`, token);
      console.log('\n======================================================');
      console.log('--- Automatic Double-Entry Journal in General Ledger ---');
      console.log('Entry No:', je.data?.entryNo);
      console.log('Description:', je.data?.description);
      console.log('Total Debit:', je.data?.totalDebit, 'Total Credit:', je.data?.totalCredit);
      console.log('Balanced:', je.data?.isBalanced);
      console.log('Journal Lines:');
      je.data?.lines?.forEach(l => {
        console.log(`  [${l.accountCode}] ${l.accountNameAr} | Debit: ${l.debit} | Credit: ${l.credit}`);
      });
    }

    // 5. Test Debit Note (Purchase Return)
    console.log('\n======================================================');
    console.log('--- Testing Debit Note (Purchase Return & Reversal) ---');
    const debitNote = await post('/debit-notes', {
      originalInvoiceId: billRes.data.id,
      returnReason: 'مردود وخصم خطأ في تسعير تراخيص سحابية غير مستخدمة',
      issueDate: '2026-01-20',
      notes: 'إشعار مدين لعكس جزء من تكلفة التراخيص والتزام المورد'
    }, token);

    console.log('Debit Note status:', debitNote.status);
    console.log('Debit Note No:', debitNote.data?.invoiceNo, 'Total Amount:', debitNote.data?.totalAmount);
    console.log('Reversal Journal Entry ID:', debitNote.data?.journalEntryId);
    if (debitNote.data?.journalEntryId) {
      const je2 = await get(`/journals/${debitNote.data.journalEntryId}`, token);
      console.log('Reversal Entry Lines:');
      je2.data?.lines?.forEach(l => {
        console.log(`  [${l.accountCode}] ${l.accountNameAr} | Debit: ${l.debit} | Credit: ${l.credit}`);
      });
    }
  }
}

main().catch(console.error);
