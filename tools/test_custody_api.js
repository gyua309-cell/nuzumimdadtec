const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request('http://localhost:3000/api/v1' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
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
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  const login = await post('/auth/login', { username: 'admin', password: 'AdminPass12345!' });
  const token = login.data.accessToken;
  console.log('Login Status:', login.status, 'User:', login.data?.user?.username);

  const compId = '01a17cb2-9afa-7ef5-91f6-b47561899afb';
  const custodies = await new Promise((resolve, reject) => {
    const req = http.request('http://localhost:3000/api/v1/custodies', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'x-company-id': compId,
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
  console.log('Custodies Response Status:', custodies.status, custodies.data);
  console.log('Custodies count:', custodies.data?.data?.length);
  for (const c of custodies.data?.data || []) {
    console.log(`Custody ${c.custody_no}: ${c.title_ar} - Status: ${c.status} - Remaining: ${c.remaining_balance_target} ${c.target_currency}`);
  }

  if (custodies.data?.data?.length > 0) {
    const cust = custodies.data.data[0];
    const detail = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:3000/api/v1/custodies/' + cust.id, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'x-company-id': compId,
        }
      }, res => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }); }
          catch { resolve({ status: res.statusCode, data: buf }); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    console.log('\n--- Detail of First Custody (' + cust.custody_no + ') ---');
    console.log('Transfers count:', detail.data?.transfers?.length);
    console.log('Lines count:', detail.data?.lines?.length);
    console.log('Is Low Balance:', detail.data?.isLowBalance);
    console.log('Balance Ratio:', detail.data?.balanceRatio);
    console.log('Low Balance Message:', detail.data?.lowBalanceMessage);
  }
}

test().catch(console.error);
