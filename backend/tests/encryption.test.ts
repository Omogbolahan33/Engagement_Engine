/**
 * Encryption + key-rotation behaviour.
 *
 * The module builds its keyring once at import time, so each scenario resets the
 * module registry and re-imports under a different environment.
 */

type EncryptionModule = typeof import('../src/utils/encryption');

const KEY_V1 = 'a'.repeat(32); // legacy derivation needs >= 32 bytes
const KEY_V2 = 'a-completely-different-key-value';

function loadEncryption(env: Record<string, string | undefined>): EncryptionModule {
  let mod!: EncryptionModule;
  jest.isolateModules(() => {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    try {
      mod = require('../src/utils/encryption');
    } finally {
      process.env = previous;
    }
  });
  return mod;
}

describe('encrypt / decrypt', () => {
  const enc = () =>
    loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });

  it('round-trips a value', () => {
    const { encrypt, decrypt } = enc();
    const secret = JSON.stringify({ apiKey: 'super-secret-value' });

    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertext for the same input (random IV)', () => {
    const { encrypt, decrypt } = enc();

    const a = encrypt('same input');
    const b = encrypt('same input');

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('round-trips unicode and empty strings', () => {
    const { encrypt, decrypt } = enc();

    for (const value of ['', 'çéñ 日本語 🎉', ' '.repeat(100)]) {
      expect(decrypt(encrypt(value))).toBe(value);
    }
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const { encrypt, decrypt } = enc();

    const envelope = JSON.parse(Buffer.from(encrypt('secret'), 'base64').toString('utf8'));
    // Flip a byte of the ciphertext; GCM's auth tag must catch it.
    envelope.data = envelope.data.replace(/^../, '00');
    const tampered = Buffer.from(JSON.stringify(envelope)).toString('base64');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects a malformed envelope', () => {
    const { decrypt } = enc();
    expect(() => decrypt('not-base64-json')).toThrow(/Malformed ciphertext/);
  });

  it('refuses a version-1 key shorter than 32 bytes instead of mis-keying', () => {
    expect(() =>
      loadEncryption({
        ENCRYPTION_KEY: 'too-short',
        ENCRYPTION_KEY_VERSION: '1',
        ENCRYPTION_KEYS: '',
      }).encrypt('x')
    ).toThrow(/at least 32 bytes/);
  });
});

describe('key rotation', () => {
  it('stamps the active key version onto new ciphertext', () => {
    const { encrypt, keyVersionOf, currentKeyVersion } = loadEncryption({
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: '2',
      ENCRYPTION_KEYS: JSON.stringify({ 1: KEY_V1 }),
    });

    expect(currentKeyVersion()).toBe(2);
    expect(keyVersionOf(encrypt('value'))).toBe(2);
  });

  it('still reads data written under the previous key', () => {
    // Written while v1 was active...
    const v1 = loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });
    const legacyCiphertext = v1.encrypt('written-under-v1');

    // ...and read after rotating to v2, with v1 retained on the keyring.
    const v2 = loadEncryption({
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: '2',
      ENCRYPTION_KEYS: JSON.stringify({ 1: KEY_V1 }),
    });

    expect(v2.decrypt(legacyCiphertext)).toBe('written-under-v1');
    expect(v2.keyVersionOf(legacyCiphertext)).toBe(1);
  });

  it('re-wraps old ciphertext under the current key, preserving the plaintext', () => {
    const v1 = loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });
    const legacyCiphertext = v1.encrypt('rotate-me');

    const v2 = loadEncryption({
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: '2',
      ENCRYPTION_KEYS: JSON.stringify({ 1: KEY_V1 }),
    });

    const rewrapped = v2.reencrypt(legacyCiphertext);

    expect(v2.keyVersionOf(rewrapped)).toBe(2);
    expect(v2.decrypt(rewrapped)).toBe('rotate-me');
  });

  it('fails loudly when the key a payload names is no longer on the keyring', () => {
    const v1 = loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });
    const legacyCiphertext = v1.encrypt('orphaned');

    // v1 retired without rotating the data first.
    const v2Only = loadEncryption({
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: '2',
      ENCRYPTION_KEYS: '',
    });

    expect(() => v2Only.decrypt(legacyCiphertext)).toThrow(/No encryption key for version 1/);
  });

  it('treats an unversioned envelope as version 1', () => {
    const { keyVersionOf } = loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });

    const unversioned = Buffer.from(
      JSON.stringify({ iv: '00'.repeat(12), tag: '00'.repeat(16), data: 'ab' })
    ).toString('base64');

    expect(keyVersionOf(unversioned)).toBe(1);
  });

  it('accepts a 64-char hex key as raw key material at v2+', () => {
    const hexKey = 'f'.repeat(64);
    const { encrypt, decrypt } = loadEncryption({
      ENCRYPTION_KEY: hexKey,
      ENCRYPTION_KEY_VERSION: '2',
      ENCRYPTION_KEYS: '',
    });

    expect(decrypt(encrypt('hex-keyed'))).toBe('hex-keyed');
  });

  it('reports every readable version', () => {
    const { availableKeyVersions } = loadEncryption({
      ENCRYPTION_KEY: KEY_V2,
      ENCRYPTION_KEY_VERSION: '3',
      ENCRYPTION_KEYS: JSON.stringify({ 1: KEY_V1, 2: KEY_V2 }),
    });

    expect(availableKeyVersions()).toEqual([1, 2, 3]);
  });
});

describe('hashing and masking', () => {
  const enc = () =>
    loadEncryption({
      ENCRYPTION_KEY: KEY_V1,
      ENCRYPTION_KEY_VERSION: '1',
      ENCRYPTION_KEYS: '',
    });

  it('hashes deterministically', () => {
    const { hash } = enc();
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });

  it('masks all but the leading characters', () => {
    const { maskSensitive } = enc();
    expect(maskSensitive('abcdefgh', 4)).toBe('abcd****');
    // Nothing leaks when the value is shorter than the visible window.
    expect(maskSensitive('ab', 4)).toBe('**');
  });

  it('generates distinct tokens of the requested byte length', () => {
    const { generateToken } = enc();
    const a = generateToken(16);
    expect(a).toHaveLength(32); // hex
    expect(a).not.toBe(generateToken(16));
  });
});
