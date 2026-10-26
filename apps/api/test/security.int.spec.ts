import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN, adminToken, api, expectOk, login, newCompany, sql, startApp, uniq } from './helpers';

describe('Security: setup, authentication, RBAC (integration)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await startApp();
    token = await adminToken(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('allows the setup wizard only once', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/setup/initialize')
      .send({ company: { code: 'AGAIN', nameAr: 'مرة ثانية', baseCurrency: 'EGP' }, admin: { ...ADMIN, username: 'other.admin' } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SETUP_ALREADY_COMPLETED');
  });

  it('rejects unauthenticated access and wrong passwords', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/accounts');
    expect(r.status).toBe(401);
    const bad = await login(app, ADMIN.username, 'wrong-password-1');
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const res = await login(app, ADMIN.username, ADMIN.password);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect(cookie).toMatch(/^idham_rt=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);

    const noCsrf = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(noCsrf.status).toBe(403);

    const r1 = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
    expect(r1.status).toBe(200);
    const cookie2 = r1.headers['set-cookie'][0].split(';')[0];
    expect(cookie2).not.toBe(cookie);

    const reuse = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
    expect(reuse.status).toBe(401);
    const afterReuse = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie2).set('X-Requested-With', 'XMLHttpRequest');
    expect(afterReuse.status).toBe(401);
  });

  it('enforces company access and permissions, and logs denials', async () => {
    const { companyId, api: adminApi } = await newCompany(app, token);
    const username = uniq('user').toLowerCase();
    const user = expectOk(await adminApi.post('/users', { username, fullName: 'محاسب', password: 'UserPass12345', mustChangePassword: false }), 201);
    const t = (await login(app, username, 'UserPass12345')).body.accessToken as string;
    const u = api(app, t, companyId);

    const noAccess = await u.get('/journal-entries');
    expect(noAccess.status).toBe(403);
    expect(noAccess.body.code).toBe('COMPANY_ACCESS_DENIED');

    const role = expectOk(await adminApi.post('/roles', { code: uniq('VIEW').toUpperCase(), nameAr: 'عرض القيود', permissions: ['acc.journal.view'] }), 201);
    expectOk(await adminApi.post(`/users/${user.id}/roles`, { roleId: role.id }), 201);

    expectOk(await u.get('/journal-entries'));
    const denied = await u.post('/journal-entries', { entryDate: '2026-01-01', description: 'xxx', lines: [] });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const c = sql();
    await c.connect();
    const ev = await c.query(`SELECT 1 FROM audit.security_events WHERE user_id = $1 AND event_type = 'PERMISSION_DENIED'`, [user.id]);
    await c.end();
    expect(ev.rowCount).toBeGreaterThan(0);
  });

  it('never returns password hashes and masks them in the audit trail', async () => {
    const c = sql();
    await c.connect();
    const r = await c.query(`SELECT new_values->>'password_hash' AS h FROM audit.audit_log WHERE table_name = 'users' AND action = 'INSERT' LIMIT 1`);
    await c.end();
    expect(r.rows[0].h).toBe('***');
    const me = expectOk(await api(app, token).get('/auth/me'));
    expect(JSON.stringify(me)).not.toMatch(/argon2/);
  });
});
