import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';

/**
 * Envelope written by `encrypt`. `v` is the key version that wrapped the data;
 * payloads produced before versioning omit it and are read as version 1.
 */
export interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
  v?: number;
}

/**
 * Key material, addressed by version.
 *
 * Rotation works because the keyring holds every key we can still *read*, while
 * only one key is used to *write*. To rotate: add a new key at a higher version,
 * point ENCRYPTION_KEY_VERSION at it, keep the old key in ENCRYPTION_KEYS until
 * `credentialRotationService` has re-wrapped every row, then drop the old key.
 */
function buildKeyring(): Map<number, Buffer> {
  const ring = new Map<number, Buffer>();

  // Historical keys: {"1":"...","2":"..."}
  if (config.encryption.previousKeys) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(config.encryption.previousKeys);
    } catch {
      throw new Error('ENCRYPTION_KEYS must be valid JSON of the form {"1":"<key>"}');
    }
    for (const [version, key] of Object.entries(parsed)) {
      ring.set(Number(version), deriveKey(key, Number(version)));
    }
  }

  // The active key always wins for its version.
  const activeVersion = config.encryption.keyVersion;
  ring.set(activeVersion, deriveKey(config.encryption.key, activeVersion));
  return ring;
}

/**
 * AES-256 needs exactly 32 bytes.
 *
 * Version 1 reproduces the original derivation — truncate the UTF-8 bytes of the
 * passphrase — because data already at rest was wrapped that way and must stay
 * readable. That scheme is weak: it silently mis-keys any passphrase containing
 * multi-byte characters, and throws outright on one shorter than 32 bytes.
 *
 * Version 2+ hashes instead, which accepts a passphrase of any length. A key
 * given as 64 hex chars or 32-byte base64 is used as raw key material so
 * operators can supply real random keys rather than a passphrase.
 *
 * Rotating from v1 to v2 therefore upgrades the derivation as well as the key.
 */
function deriveKey(secret: string, version: number): Buffer {
  if (version <= 1) {
    const legacy = Buffer.from(secret, 'utf-8').subarray(0, 32);
    if (legacy.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must be at least 32 bytes for key version 1. ' +
          'Set ENCRYPTION_KEY_VERSION=2 to use the length-independent derivation.'
      );
    }
    return legacy;
  }

  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  const asBase64 = Buffer.from(secret, 'base64');
  if (asBase64.length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(secret)) {
    return asBase64;
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

const KEYRING = buildKeyring();

function keyFor(version: number): Buffer {
  const key = KEYRING.get(version);
  if (!key) {
    throw new Error(
      `No encryption key for version ${version}. ` +
        'Add it to ENCRYPTION_KEYS before decrypting data wrapped with it.'
    );
  }
  return key;
}

/** Version new ciphertext is written with. */
export function currentKeyVersion(): number {
  return config.encryption.keyVersion;
}

/** Versions this process can still decrypt, ascending. */
export function availableKeyVersions(): number[] {
  return [...KEYRING.keys()].sort((a, b) => a - b);
}

/**
 * Encrypt sensitive data (credentials, tokens, etc.)
 * Uses AES-256-GCM for authenticated encryption.
 */
export function encrypt(plaintext: string): string {
  const version = currentKeyVersion();
  const iv = crypto.randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = crypto.createCipheriv(ALGORITHM, keyFor(version), iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted,
    v: version,
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decrypt sensitive data, selecting the key by the version stamped on the
 * payload. Unversioned payloads predate rotation support and use version 1.
 */
export function decrypt(encryptedBase64: string): string {
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
  } catch {
    throw new Error('Malformed ciphertext envelope');
  }

  const version = payload.v ?? 1;
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, keyFor(version), iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** Which key version a stored payload is wrapped with, without decrypting it. */
export function keyVersionOf(encryptedBase64: string): number {
  try {
    const payload: EncryptedPayload = JSON.parse(
      Buffer.from(encryptedBase64, 'base64').toString('utf8')
    );
    return payload.v ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Re-wrap ciphertext with the active key. Decrypts with whichever key the
 * payload names, then encrypts with the current one.
 */
export function reencrypt(encryptedBase64: string): string {
  return encrypt(decrypt(encryptedBase64));
}

/**
 * Hash data for comparison (one-way)
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate API key with prefix
 */
export function generateApiKey(prefix: string = 'ep'): { key: string; hash: string; prefix: string } {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_${randomPart}`;
  return {
    key,
    hash: hash(key),
    prefix: `${prefix}_${randomPart.substring(0, 8)}`,
  };
}

/**
 * Mask sensitive data for display
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return '*'.repeat(value.length);
  return value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars);
}
