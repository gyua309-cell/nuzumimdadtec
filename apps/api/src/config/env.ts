import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * Minimal .env loader (no extra dependency). Real environment variables always win.
 */
function loadDotEnv(): void {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | undefined;

export function env(): AppEnv {
  if (cached) return cached;
  loadDotEnv();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.JWT_ACCESS_SECRET.includes('change-me')) {
      throw new Error('Refusing to start in production with a default JWT secret');
    }
    if (!parsed.data.COOKIE_SECURE) {
      throw new Error('COOKIE_SECURE must be true in production');
    }
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: reset cached configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}
