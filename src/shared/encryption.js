import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const IV_LENGTH_LEGACY = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const VERSION_BYTE = 0x02;
const HKDF_SALT = 'telegram-crypto-bot-v1';
const HKDF_INFO_PREFIX = 'user-key:';

/**
 * Derives a key from passphrase using PBKDF2
 */
export function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Derives a per-user key from master key using HKDF
 * @param {string} masterKey - Hex-encoded master key
 * @param {number|string} userId - User identifier (chatId)
 * @returns {string} 64-char hex-encoded derived key
 */
export function deriveUserKey(masterKey, userId) {
  const keyBuffer = Buffer.from(masterKey, 'hex');
  const info = Buffer.from(`${HKDF_INFO_PREFIX}${userId}`, 'utf-8');
  const salt = Buffer.from(HKDF_SALT, 'utf-8');
  const derived = crypto.hkdfSync('sha256', keyBuffer, salt, info, 32);
  return Buffer.from(derived).toString('hex');
}

/**
 * Encrypts data with AES-256-GCM
 * Uses 12-byte IV (NIST SP 800-38D) with a version prefix for forward compatibility.
 * @param {string} plaintext - Data to encrypt
 * @param {string} masterKey - Hex-encoded master key
 * @returns {string} Encrypted data as base64
 */
export function encrypt(plaintext, masterKey) {
  const keyBuffer = Buffer.from(masterKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const versionBuf = Buffer.from([VERSION_BYTE]);
  return Buffer.concat([versionBuf, iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts data encrypted with AES-256-GCM
 * Supports both current (12-byte IV + version byte) and legacy (16-byte IV) formats.
 * @param {string} ciphertext - Base64-encoded encrypted data
 * @param {string} masterKey - Hex-encoded master key
 * @returns {string} Decrypted plaintext
 */
export function decrypt(ciphertext, masterKey) {
  const keyBuffer = Buffer.from(masterKey, 'hex');
  const data = Buffer.from(ciphertext, 'base64');

  if (data.length > 0 && data[0] === VERSION_BYTE) {
    const iv = data.subarray(1, 1 + IV_LENGTH);
    const tag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(1 + IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  const iv = data.subarray(0, IV_LENGTH_LEGACY);
  const tag = data.subarray(IV_LENGTH_LEGACY, IV_LENGTH_LEGACY + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH_LEGACY + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Generates a random encryption key
 * @returns {string} 64-character hex string
 */
export function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a passphrase for verification
 */
export function hashPassphrase(passphrase) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha512');
  return Buffer.concat([salt, hash]).toString('base64');
}

/**
 * Verifies a passphrase against a hash
 */
export function verifyPassphrase(passphrase, storedHash) {
  const data = Buffer.from(storedHash, 'base64');
  const salt = data.subarray(0, 16);
  const storedHashBytes = data.subarray(16);
  const hash = crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha512');
  return crypto.timingSafeEqual(hash, storedHashBytes);
}
