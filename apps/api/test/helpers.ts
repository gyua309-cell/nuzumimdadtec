import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { env } from '../src/config/env';

// Integration tests always hit the dedicated test database.
process.env.IDHAM_DB_URL_OVERRIDE = env().TEST_DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('../src/app.factory') as typeof import('../src/app.factory');

export const ADMIN = { username: 'admin.test', password: 'AdminPass12345', fullName: 'مدير الاختبارات' };

export async function startApp(): Promise<INestApplication> {
  const app = await createApp({ logger: process.env.IDHAM_TEST_LOG ? undefined : false });
  await app.init();
  return app;
}

export function sql(): Client {
  return new Client({ connectionString: env().TEST_DATABASE_URL });
}

export async function login(app: INestApplication, username: string, password: string) {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
  return res;
}

/** Initializes the system once (first run) and returns an admin access token. */
export async function adminToken(app: INestApplication): Promise<string> {
  const server = app.getHttpServer();
  const st = await request(server).get('/api/v1/setup/status');
  if (!st.body.initialized) {
    const init = await request(server)
      .post('/api/v1/setup/initialize')
      .send({
        company: { code: 'SETUP', nameAr: 'شركة الإعداد', baseCurrency: 'EGP' },
        admin: ADMIN,
      });
    if (init.status !== 201) throw new Error(`setup failed: ${JSON.stringify(init.body)}`);
  }
  const res = await login(app, ADMIN.username, ADMIN.password);
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

export interface Api {
  get(path: string): request.Test;
  post(path: string, body?: unknown): request.Test;
  put(path: string, body?: unknown): request.Test;
  patch(path: string, body?: unknown): request.Test;
  del(path: string): request.Test;
}

export function api(app: INestApplication, token: string, companyId?: string): Api {
  const server = app.getHttpServer();
  const h = (t: request.Test) => {
    t.set('Authorization', `Bearer ${token}`);
    if (companyId) t.set('X-Company-Id', companyId);
    return t;
  };
  return {
    get: (p) => h(request(server).get(`/api/v1${p}`)),
    post: (p, b) => h(request(server).post(`/api/v1${p}`)).send((b ?? {}) as object),
    put: (p, b) => h(request(server).put(`/api/v1${p}`)).send((b ?? {}) as object),
    patch: (p, b) => h(request(server).patch(`/api/v1${p}`)).send((b ?? {}) as object),
    del: (p) => h(request(server).delete(`/api/v1${p}`)),
  };
}

export const uniq = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`.slice(0, 20);

/** Fresh isolated company with a fiscal year (no business data). */
export async function newCompany(app: INestApplication, token: string, baseCurrency = 'EGP', fyStart = '2026-01-01') {
  const admin = api(app, token);
  const c = await admin.post('/companies', { code: uniq('T'), nameAr: 'شركة اختبار', baseCurrency });
  if (c.status !== 201) throw new Error(`company failed: ${JSON.stringify(c.body)}`);
  const companyId = c.body.id as string;
  const a = api(app, token, companyId);
  const fy = await a.post('/fiscal-years', { code: `FY${fyStart.slice(0, 4)}`, startDate: fyStart });
  if (fy.status !== 201) throw new Error(`fiscal year failed: ${JSON.stringify(fy.body)}`);
  return { companyId, api: a, fiscalYear: fy.body };
}

export function expectOk(res: request.Response, status = 200) {
  if (res.status !== status) {
    throw new Error(`Expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}
