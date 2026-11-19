import { createSign, generateKeyPairSync } from 'crypto';

/**
 * Pure Node.js ASN.1 DER PKCS#10 CSR Generator for ZATCA Fatoora Phase 2 (KSA)
 * Zero external OpenSSL binary dependency — works identically on Windows & Linux.
 *
 * Specification Compliance (ZATCA EGS Onboarding Technical Guidelines):
 * - Key Algorithm: ECDSA on secp256k1 (OID 1.3.132.0.10)
 * - Signature Algorithm: ecdsa-with-SHA256 (OID 1.2.840.10045.4.3.2)
 * - Certificate Template Name Extension (OID 1.3.6.1.4.1.311.20.2):
 *     SANDBOX    -> TSTZATCA-Code-Signing
 *     SIMULATION -> PREZATCA-Code-Signing
 *     PRODUCTION -> ZATCA-Code-Signing
 * - Subject Alternative Name (DirName) Extension (OID 2.5.29.17):
 *     SN (2.5.4.4)                    = 1-<solution>|2-<model>|3-<serial>
 *     UID (0.9.2342.19200300.100.1.1) = 15-digit Saudi VAT Number
 *     title (2.5.4.12)                = 1100 (Standard+Simplified) | 1000 | 0100
 *     registeredAddress (2.5.4.26)    = National Address / City
 *     businessCategory (2.5.4.15)     = Business Industry Category
 */

export type ZatcaEnvironment = 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';

export interface ZatcaCsrInput {
  environment: ZatcaEnvironment;
  commonName: string;       // e.g. TST-886431145-310123456700003
  serialNumber: string;     // formatted 1-IDHAM|2-ERP2026|3-<uuid> (auto-formatted if raw)
  organizationIdentifier: string; // 15-digit VAT number starting & ending with 3
  organizationUnitName: string;   // Branch name or 10-digit TIN for VAT group
  organizationName: string;       // Legal entity name
  countryName?: string;           // 'SA'
  invoiceType: '1100' | '1000' | '0100'; // 1100 = Both, 1000 = Standard, 0100 = Simplified
  locationAddress: string;        // City / National Address
  industryBusinessCategory: string;
}

export interface ZatcaCsrResult {
  privateKeyPem: string;
  publicKeyPem: string;
  csrPem: string;
  csrBase64: string;
  templateName: string;
  formattedSerialNumber: string;
  commonName: string;
}

const TEMPLATE_BY_ENV: Record<ZatcaEnvironment, string> = {
  SANDBOX: 'TSTZATCA-Code-Signing',
  SIMULATION: 'PREZATCA-Code-Signing',
  PRODUCTION: 'ZATCA-Code-Signing',
};

// ── Minimal, strict ASN.1 DER primitives ────────────────────────────────────
function encodeDerLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeDerLength(content.length), content]);
}

function derSequence(items: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(items));
}

function derSet(items: Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(items));
}

function derInteger(num: number): Buffer {
  if (num === 0) return derTag(0x02, Buffer.from([0x00]));
  const bytes: number[] = [];
  let n = num;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00);
  return derTag(0x02, Buffer.from(bytes));
}

function derOid(oid: string): Buffer {
  const parts = oid.split('.').map((p) => Number(p));
  const out: number[] = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val === 0) {
      out.push(0);
      continue;
    }
    const enc: number[] = [];
    enc.unshift(val & 0x7f);
    val >>= 7;
    while (val > 0) {
      enc.unshift((val & 0x7f) | 0x80);
      val >>= 7;
    }
    out.push(...enc);
  }
  return derTag(0x06, Buffer.from(out));
}

function derUtf8String(str: string): Buffer {
  return derTag(0x0c, Buffer.from(str, 'utf8'));
}

function derPrintableString(str: string): Buffer {
  return derTag(0x13, Buffer.from(str, 'ascii'));
}

function derOctetString(buf: Buffer): Buffer {
  return derTag(0x04, buf);
}

function derBitString(buf: Buffer): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function derAttrTypeAndValue(oid: string, value: string, printable = false): Buffer {
  return derSequence([derOid(oid), printable ? derPrintableString(value) : derUtf8String(value)]);
}

function derRdn(oid: string, value: string, printable = false): Buffer {
  return derSet([derAttrTypeAndValue(oid, value, printable)]);
}

/**
 * Formats an EGS serial number per ZATCA pattern: 1-<Solution>|2-<Model>|3-<Serial>
 */
export function formatZatcaEgsSerial(rawSerial: string, solutionName = 'IDHAM-ERP', model = 'PHASE2'): string {
  const trimmed = (rawSerial || '').trim();
  if (/^1-.+\|2-.+\|3-.+$/.test(trimmed)) return trimmed;
  const clean = trimmed.replace(/[|]/g, '-') || `EGS-${Date.now()}`;
  return `1-${solutionName}|2-${model}|3-${clean}`;
}

/**
 * Generates an ECDSA secp256k1 keypair and a ZATCA-compliant PKCS#10 CSR.
 */
export function generateZatcaCsr(input: ZatcaCsrInput): ZatcaCsrResult {
  const vat = (input.organizationIdentifier || '').trim();
  if (!/^3\d{13}3$/.test(vat)) {
    throw new Error('الرقم الضريبي للمنشأة (VAT) يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3');
  }

  const templateName = TEMPLATE_BY_ENV[input.environment] || TEMPLATE_BY_ENV.SANDBOX;
  const formattedSerial = formatZatcaEgsSerial(input.serialNumber);
  const country = (input.countryName || 'SA').toUpperCase().slice(0, 2);
  const commonName = (input.commonName || `${input.environment.slice(0, 3)}-${vat}`).trim();
  const orgName = (input.organizationName || 'IDHAM ERP Organization').trim();
  const orgUnit = (input.organizationUnitName || 'Main Branch').trim();
  const location = (input.locationAddress || 'Riyadh, Saudi Arabia').trim();
  const category = (input.industryBusinessCategory || 'Information Technology').trim();

  // 1. Generate secp256k1 ECDSA key pair
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const publicKeyDer = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey);
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyDer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

  // 2. Build Subject DN: C, OU, O, CN
  const subjectDn = derSequence([
    derRdn('2.5.4.6', country, true),         // C  (countryName)
    derRdn('2.5.4.11', orgUnit),              // OU (organizationalUnitName)
    derRdn('2.5.4.10', orgName),              // O  (organizationName)
    derRdn('2.5.4.3', commonName),            // CN (commonName)
  ]);

  // 3. Build ZATCA Extension 1: Certificate Template Name (OID 1.3.6.1.4.1.311.20.2)
  const certTemplateExt = derSequence([
    derOid('1.3.6.1.4.1.311.20.2'),
    derOctetString(derUtf8String(templateName)),
  ]);

  // 4. Build ZATCA Extension 2: Subject Alternative Name (DirName) (OID 2.5.29.17)
  const dirNameSeq = derSequence([
    derRdn('2.5.4.4', formattedSerial),                 // SN (serialNumber)
    derRdn('0.9.2342.19200300.100.1.1', vat),           // UID (VAT)
    derRdn('2.5.4.12', input.invoiceType || '1100'),    // title (1100 / 1000 / 0100)
    derRdn('2.5.4.26', location),                       // registeredAddress
    derRdn('2.5.4.15', category),                       // businessCategory
  ]);
  // GeneralName [4] EXPLICIT Name (directoryName) -> tag 0xA4
  const generalNames = derSequence([derTag(0xa4, dirNameSeq)]);
  const sanExt = derSequence([
    derOid('2.5.29.17'),
    derOctetString(generalNames),
  ]);

  // extensionRequest attribute (OID 1.2.840.113549.1.9.14)
  const extRequestAttr = derSequence([
    derOid('1.2.840.113549.1.9.14'),
    derSet([derSequence([certTemplateExt, sanExt])]),
  ]);

  // Attributes [0] IMPLICIT SET OF Attribute -> tag 0xA0
  const attributes = derTag(0xa0, extRequestAttr);

  // 5. CertificationRequestInfo
  const certRequestInfo = derSequence([
    derInteger(0), // version v1(0)
    subjectDn,
    publicKeyDer,  // SubjectPublicKeyInfo (already DER SEQUENCE)
    attributes,
  ]);

  // 6. Sign CertificationRequestInfo with ECDSA-SHA256
  const signer = createSign('sha256');
  signer.update(certRequestInfo);
  signer.end();
  const signatureDer = signer.sign(privateKey);

  // SignatureAlgorithmIdentifier: ecdsa-with-SHA256 (1.2.840.10045.4.3.2)
  const sigAlg = derSequence([derOid('1.2.840.10045.4.3.2')]);

  // 7. Complete CertificationRequest (PKCS#10)
  const csrDer = derSequence([
    certRequestInfo,
    sigAlg,
    derBitString(signatureDer),
  ]);

  const csrDerBase64 = csrDer.toString('base64');
  const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${csrDerBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE REQUEST-----`;
  // ZATCA Fatoora API expects Base64-encoded PEM string in `csr` JSON field
  const csrBase64 = Buffer.from(csrPem, 'utf8').toString('base64');

  return {
    privateKeyPem: privateKey,
    publicKeyPem,
    csrPem,
    csrBase64,
    templateName,
    formattedSerialNumber: formattedSerial,
    commonName,
  };
}
