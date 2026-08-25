#!/usr/bin/env node
/**
 * Generate a TOTP code for testing two-factor login without an authenticator app.
 *
 * Mirrors the RFC 6238 implementation in
 * backend/src/services/two-factor.service.ts.
 *
 *   node scripts/totp.js <base32-secret>
 *
 * The secret is printed by the 2FA setup step in Settings -> Security.
 */
import crypto from 'crypto';

function base32Decode(encoded) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of encoded.toUpperCase()) {
    const val = chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', base32Decode(secret));
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    (((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)) %
    1000000;

  return code.toString().padStart(6, '0');
}

const secret = process.argv[2];
if (!secret) {
  console.error('usage: node scripts/totp.js <base32-secret>');
  process.exit(1);
}

const secondsLeft = 30 - Math.floor((Date.now() / 1000) % 30);
console.log(`${totp(secret)}   (valid for ${secondsLeft}s)`);
