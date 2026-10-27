const BASE_URL = 'http://localhost:3000/api/v1';

async function req(path, method = 'GET', body = null, token = null, companyId = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (companyId) headers['x-company-id'] = companyId;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('1. Checking setup status...');
  const status = await req('/setup/status');
  console.log('Setup status:', status);

  let companyId;
  let token;

  if (!status.initialized) {
    console.log('2. Initializing company and admin user on Supabase...');
    const initRes = await req('/setup/initialize', 'POST', {
      company: {
        code: 'IMDAD',
        nameAr: 'شركة نُظم إمداد للتقنية والحلول الرقمية',
        nameEn: 'Nuzum Imdad Technology Co.',
        legalName: 'شركة نُظم إمداد للتقنية - شركة شخص واحد',
        taxNumber: '310123456700003',
        countryCode: 'SA',
        timezone: 'Asia/Riyadh',
        baseCurrency: 'SAR',
        fiscalYearStartMonth: 1,
      },
      firstFiscalYear: {
        code: '2026',
        startDate: '2026-01-01',
      },
      admin: {
        username: 'admin',
        fullName: 'المدير التنفيذي (نظم إمداد تك)',
        email: 'admin@nuzumimdadtec.com',
        password: 'AdminPass12345!',
      },
    });
    console.log('Initialized successfully! Company ID:', initRes.companyId);
    companyId = initRes.companyId;
  }

  console.log('3. Logging in as admin...');
  const loginRes = await req('/auth/login', 'POST', {
    username: 'admin',
    password: 'AdminPass12345!',
  });
  token = loginRes.accessToken;
  console.log('Logged in successfully!');

  // Fetch current company
  const comp = await req('/companies/current', 'GET', null, token);
  companyId = comp.id;
  console.log(`Working with Company: ${comp.nameAr} (${companyId}), Base Currency: ${comp.baseCurrencyCode}`);

  console.log('==============================================');
  console.log('SUPABASE INITIALIZATION COMPLETED SUCCESSFULLY!');
  console.log('==============================================');
}

main().catch(err => {
  console.error('Error during init:', err);
  process.exit(1);
});
