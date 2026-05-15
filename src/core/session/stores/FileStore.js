import { promises as fs } from 'fs';
import { encrypt, decrypt } from '../../../shared/encryption.js';
import { logger } from '../../../shared/logger.js';

/**
 * File-based session store for persistence across restarts
 */
export class FileStore {
  constructor(filePath, masterKey = null) {
    this.filePath = filePath;
    this.masterKey = masterKey;
  }

  async save(data) {
    try {
      const json = JSON.stringify(data, null, 2);
      let content = json;

      if (this.masterKey) {
        content = encrypt(json, this.masterKey);
      }

      await fs.writeFile(this.filePath, content, 'utf8');
      logger.debug('Sessions saved to file', {
        path: this.filePath,
        count: Object.keys(data).length,
        encrypted: !!this.masterKey,
      });
    } catch (error) {
      logger.logError(error, { context: 'FileStore.save', path: this.filePath });
    }
  }

  async load() {
    try {
      const exists = await fs.access(this.filePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) return {};

      const content = await fs.readFile(this.filePath, 'utf8');
      let json = content;

      if (this.masterKey) {
        try {
          json = decrypt(content, this.masterKey);
        } catch (e) {
          logger.error('Failed to decrypt sessions file - key might have changed', {
            error: e.message,
          });
          return {};
        }
      }

      const data = JSON.parse(json);
      logger.info('Sessions loaded from file', {
        path: this.filePath,
        count: Object.keys(data).length,
        encrypted: !!this.masterKey,
      });
      return data;
    } catch (error) {
      logger.logError(error, { context: 'FileStore.load', path: this.filePath });
      return {};
    }
  }
}
