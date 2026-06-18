import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encrypt, decrypt, generateKey, deriveKey, hashPassphrase, verifyPassphrase, deriveUserKey } from '../src/shared/encryption.js';
import { logger, LogLevel } from '../src/shared/logger.js';

const masterKey = crypto.randomBytes(32).toString('hex');

test('encrypt/decrypt round-trip with valid key', () => {
  const plaintext = 'Hello, crypto bot!';
  const encrypted = encrypt(plaintext, masterKey);
  const decrypted = decrypt(encrypted, masterKey);
  assert.equal(decrypted, plaintext);
});

test('encrypt produces different ciphertext each time (IV randomization)', () => {
  const plaintext = 'same text';
  const encrypted1 = encrypt(plaintext, masterKey);
  const encrypted2 = encrypt(plaintext, masterKey);
  assert.notEqual(encrypted1, encrypted2);
});

test('decrypt with wrong key throws error', () => {
  const plaintext = 'secret data';
  const encrypted = encrypt(plaintext, masterKey);
  const wrongKey = crypto.randomBytes(32).toString('hex');
  assert.throws(() => decrypt(encrypted, wrongKey), Error);
});

test('decrypt with tampered ciphertext throws error', () => {
  const plaintext = 'secret data';
  const encrypted = encrypt(plaintext, masterKey);
  // Flip one char to a GUARANTEED-different value (replacing with a fixed 'A'
  // was a no-op when that char was already 'A' — the source of the flake).
  const i = 10;
  const tampered = encrypted.slice(0, i) + (encrypted[i] === 'A' ? 'B' : 'A') + encrypted.slice(i + 1);
  assert.notEqual(tampered, encrypted);
  assert.throws(() => decrypt(tampered, masterKey));
});

test('generateKey produces 64-char hex string', () => {
  const key = generateKey();
  assert.equal(key.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(key));
});

test('large data encrypt/decrypt round-trip', () => {
  const large = 'x'.repeat(100000);
  const encrypted = encrypt(large, masterKey);
  const decrypted = decrypt(encrypted, masterKey);
  assert.equal(decrypted, large);
});

test('encrypt handles special characters', () => {
  const special = 'héllo wörld • 中文 español 👋 € ¥  \n\t\r\0';
  const encrypted = encrypt(special, masterKey);
  const decrypted = decrypt(encrypted, masterKey);
  assert.equal(decrypted, special);
});

test('hashPassphrase and verifyPassphrase work correctly', () => {
  const passphrase = 'my-strong-passphrase-123';
  const hash = hashPassphrase(passphrase);
  assert.ok(verifyPassphrase(passphrase, hash));
  assert.ok(!verifyPassphrase('wrong-passphrase', hash));
});

test('deriveKey produces deterministic output with same salt', () => {
  const salt = crypto.randomBytes(16);
  const key1 = deriveKey('passphrase', salt);
  const key2 = deriveKey('passphrase', salt);
  assert.deepEqual(key1, key2);
});

test('deriveKey produces different output with different passphrase', () => {
  const salt = crypto.randomBytes(16);
  const key1 = deriveKey('passphrase-1', salt);
  const key2 = deriveKey('passphrase-2', salt);
  assert.notDeepEqual(key1, key2);
});

test('logger redacts sensitive fields', () => {
  const entry = logger.redact({
    chatId: 12345,
    privateKey: '0xabc123secret',
    mnemonic: 'word1 word2 word3',
    nested: {
      seedPhrase: 'secret phrase',
      apiKey: 'sk-12345',
      harmless: 'visible',
    },
  });
  assert.equal(entry.privateKey, '[REDACTED]');
  assert.equal(entry.mnemonic, '[REDACTED]');
  assert.equal(entry.nested.seedPhrase, '[REDACTED]');
  assert.equal(entry.nested.apiKey, '[REDACTED]');
  assert.equal(entry.nested.harmless, 'visible');
  assert.equal(entry.chatId, 12345);
});

test('logger redact returns primitives unchanged', () => {
  assert.equal(logger.redact('hello'), 'hello');
  assert.equal(logger.redact(42), 42);
  assert.equal(logger.redact(null), null);
});

// --- deriveUserKey tests ---

test('deriveUserKey produces deterministic output for same userId', () => {
  const key1 = deriveUserKey(masterKey, 12345);
  const key2 = deriveUserKey(masterKey, 12345);
  assert.equal(key1, key2);
  assert.equal(key1.length, 64);
});

test('deriveUserKey produces different keys for different users', () => {
  const key1 = deriveUserKey(masterKey, 12345);
  const key2 = deriveUserKey(masterKey, 67890);
  assert.notEqual(key1, key2);
});

test('deriveUserKey produces different keys with different master keys', () => {
  const otherKey = crypto.randomBytes(32).toString('hex');
  const key1 = deriveUserKey(masterKey, 12345);
  const key2 = deriveUserKey(otherKey, 12345);
  assert.notEqual(key1, key2);
});

test('deriveUserKey key works with encrypt/decrypt round-trip', () => {
  const userKey = deriveUserKey(masterKey, 42);
  const plaintext = 'user-specific-data';
  const encrypted = encrypt(plaintext, userKey);
  const decrypted = decrypt(encrypted, userKey);
  assert.equal(decrypted, plaintext);
});

// --- IV migration tests (12-byte new format vs 16-byte legacy) ---

test('new format (12-byte IV) can be decrypted', () => {
  const plaintext = 'test with new IV format';
  const encrypted = encrypt(plaintext, masterKey);
  const decrypted = decrypt(encrypted, masterKey);
  assert.equal(decrypted, plaintext);
});

test('legacy format (16-byte IV, no version byte) can still be decrypted', () => {
  const keyBuffer = Buffer.from(masterKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update('legacy-data', 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const legacyCiphertext = Buffer.concat([iv, tag, encrypted]).toString('base64');

  const decrypted = decrypt(legacyCiphertext, masterKey);
  assert.equal(decrypted, 'legacy-data');
});

test('round-trip with user derived key using new format', () => {
  const userKey = deriveUserKey(masterKey, 999);
  const plaintext = 'multi-user test';
  const encrypted = encrypt(plaintext, userKey);
  const decrypted = decrypt(encrypted, userKey);
  assert.equal(decrypted, plaintext);
});

test('decrypt with wrong derived key fails', () => {
  const userKey = deriveUserKey(masterKey, 1);
  const wrongUserKey = deriveUserKey(masterKey, 2);
  const encrypted = encrypt('secret', userKey);
  assert.throws(() => decrypt(encrypted, wrongUserKey), Error);
});
