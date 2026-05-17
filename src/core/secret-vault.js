import fs from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { encrypt, decrypt } from '../shared/encryption.js';
import { logger } from '../shared/logger.js';

/**
 * Manages an encrypted vault for global secrets
 */
export class SecretVault {
  constructor(dataPath, masterKey) {
    this.vaultPath = path.join(dataPath, '_secrets.enc');
    this.masterKey = masterKey;
    this.cache = {};
    this.isLoaded = false;
  }

  /**
   * Initialize and load secrets into memory
   */
  async init() {
    try {
      if (existsSync(this.vaultPath)) {
        const encryptedData = await fs.readFile(this.vaultPath, 'utf8');
        const decryptedData = decrypt(encryptedData, this.masterKey);
        this.cache = JSON.parse(decryptedData);
      }
      this.isLoaded = true;
      logger.info('Secret vault loaded successfully');
    } catch (error) {
      logger.error('Failed to load secret vault:', error.message);
      this.cache = {};
      this.isLoaded = true;
    }
  }

  /**
   * Synchronous load for config.js if needed
   */
  loadSync() {
    try {
      if (existsSync(this.vaultPath)) {
        const encryptedData = readFileSync(this.vaultPath, 'utf8');
        const decryptedData = decrypt(encryptedData, this.masterKey);
        this.cache = JSON.parse(decryptedData);
      }
      this.isLoaded = true;
    } catch (error) {
      // Don't log here to avoid issues during early boot
      this.cache = {};
      this.isLoaded = true;
    }
  }

  /**
   * Get a secret by key
   */
  get(key, defaultValue = null) {
    if (!this.isLoaded) this.loadSync();
    return this.cache[key] !== undefined ? this.cache[key] : defaultValue;
  }

  /**
   * Set a secret and persist to disk
   */
  async set(key, value) {
    this.cache[key] = value;
    await this._save();
    logger.info('Secret updated', { key });
  }

  /**
   * Delete a secret
   */
  async delete(key) {
    if (this.cache[key] !== undefined) {
      delete this.cache[key];
      await this._save();
      logger.info('Secret deleted', { key });
      return true;
    }
    return false;
  }

  /**
   * List all secret keys (masked for safety)
   */
  list() {
    return Object.keys(this.cache).map(key => ({
      key,
      value: this._maskValue(this.cache[key])
    }));
  }

  async _save() {
    try {
      const jsonData = JSON.stringify(this.cache, null, 2);
      const encryptedData = encrypt(jsonData, this.masterKey);
      await fs.writeFile(this.vaultPath, encryptedData, 'utf8');
    } catch (error) {
      logger.error('Failed to save secret vault:', error.message);
      throw error;
    }
  }

  _maskValue(value) {
    if (!value) return 'N/A';
    const str = String(value);
    if (str.length <= 8) return '********';
    return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
  }
}
