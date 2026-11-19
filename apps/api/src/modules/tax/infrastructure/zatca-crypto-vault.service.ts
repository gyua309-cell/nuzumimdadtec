import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Server-side AES-256-GCM Secret Vault for ZATCA Phase 2 Credentials
 * (ECDSA Private Keys, Compliance CSID Secrets, Production CSID Secrets).
 *
 * Keys are NEVER returned to frontend clients and NEVER stored in plaintext.
 * Production deployments MUST set `ZATCA_ENCRYPTION_KEY` (32+ chars / 64 hex)
 * via Secret Manager / Environment Variables.
 */
@Injectable()
export class ZatcaCryptoVaultService {
  private readonly logger = new Logger(ZatcaCryptoVaultService.name);
  private readonly key: Buffer;
  private readonly prefix = 'enc:v1:';

  constructor() {
    const rawKey =
      process.env.ZATCA_ENCRYPTION_KEY ||
      process.env.SECRET_KEY ||
      process.env.JWT_ACCESS_SECRET ||
      '';

    if (!process.env.ZATCA_ENCRYPTION_KEY) {
      this.logger.warn(
        'ZATCA_ENCRYPTION_KEY is not explicitly set; deriving vault key from server secret. Configure ZATCA_ENCRYPTION_KEY in Secret Manager before Production onboarding.',
      );
    }

    const seed = rawKey || 'idham-erp-dev-zatca-vault-fallback-change-in-prod';
    this.key = createHash('sha256').update(`idham:zatca:vault:v1:${seed}`, 'utf8').digest();
  }

  /**
   * Encrypts sensitive UTF-8 secret into authenticated AES-256-GCM envelope.
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    if (plaintext.startsWith(this.prefix)) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${this.prefix}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * Decrypts AES-256-GCM envelope back to UTF-8 plaintext.
   * Gracefully passes through legacy non-prefixed strings so existing dev rows do not crash.
   */
  decrypt(stored: string | null | undefined): string {
    if (!stored) return '';
    if (!stored.startsWith(this.prefix)) return stored;
    const body = stored.slice(this.prefix.length);
    const parts = body.split(':');
    if (parts.length !== 3) {
      throw new Error('ZATCA_VAULT_CORRUPTED_ENVELOPE');
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /** Checks whether a stored string is already encrypted by the vault. */
  isEncrypted(stored: string | null | undefined): boolean {
    return Boolean(stored && stored.startsWith(this.prefix));
  }

  /** Masks sensitive credentials for safe logging/audit display. */
  mask(secret: string | null | undefined): string {
    if (!secret) return '—';
    const clean = this.isEncrypted(secret) ? 'ENCRYPTED_SECRET' : secret;
    if (clean.length <= 8) return '••••••••';
    return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
  }
}
