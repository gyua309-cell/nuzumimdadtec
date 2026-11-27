import { env, resetEnvCache } from './env';

describe('Environment Configuration Security Guards', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    resetEnvCache();
  });

  it('requires ZATCA_ENCRYPTION_KEY of >= 32 chars in production', () => {
    resetEnvCache();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@db.example.com:5432/idham';
    process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_secret_at_least_32_characters_long';
    process.env.COOKIE_SECURE = 'true';
    delete process.env.ZATCA_ENCRYPTION_KEY;

    expect(() => env()).toThrow(/ZATCA_ENCRYPTION_KEY/);
  });

  it('rejects default change-me ZATCA_ENCRYPTION_KEY in production', () => {
    resetEnvCache();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@db.example.com:5432/idham';
    process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_secret_at_least_32_characters_long';
    process.env.COOKIE_SECURE = 'true';
    process.env.ZATCA_ENCRYPTION_KEY = 'change-me-dev-only-zatca-vault-key-32-chars';

    expect(() => env()).toThrow(/ZATCA_ENCRYPTION_KEY/);
  });

  it('accepts strong production configuration including DB_SSL_REJECT_UNAUTHORIZED', () => {
    resetEnvCache();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@db.example.com:5432/idham';
    process.env.JWT_ACCESS_SECRET = 'a_very_secure_jwt_secret_at_least_32_characters_long';
    process.env.ZATCA_ENCRYPTION_KEY = 'z_strong_prod_encryption_key_32_chars_minimum_ok';
    process.env.COOKIE_SECURE = 'true';
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'true';

    const cfg = env();
    expect(cfg.DB_SSL_REJECT_UNAUTHORIZED).toBe(true);
    expect(cfg.ZATCA_ENCRYPTION_KEY).toBe('z_strong_prod_encryption_key_32_chars_minimum_ok');
  });
});
