import { MemoryStore } from './stores/MemoryStore.js';
import { FileStore } from './stores/FileStore.js';
import { logger } from '../../shared/logger.js';
import { join } from 'path';

/**
 * Persistent Session Manager
 * Combines in-memory speed with file-based persistence
 */
export class SessionManager {
  constructor(options = {}) {
    this.memoryStore = new MemoryStore(options.maxSessions || 1000);
    this.timeoutMinutes = options.timeoutMinutes || 30;
    this.masterKey = options.masterKey;
    
    if (options.persistPath) {
      const filename = this.masterKey ? 'sessions.enc' : 'sessions.json';
      this.fileStore = new FileStore(join(options.persistPath, filename), this.masterKey);
    }
    
    this.isDirty = false;
    this._cleanupInterval = null;
    this._flushInterval = null;
    this._started = false;
  }

  /**
   * Start periodic cleanup and flush intervals (idempotent)
   */
  start() {
    if (this._started) return;
    this._started = true;

    this._cleanupInterval = setInterval(async () => {
      await this.cleanup();
      await this.flush();
    }, 5 * 60 * 1000);
    this._cleanupInterval.unref();

    this._flushInterval = setInterval(() => {
      if (this.fileStore && this.isDirty) {
        this.flush();
      }
    }, 60 * 1000);
    this._flushInterval.unref();

    logger.debug('SessionManager started');
  }

  /**
   * Stop periodic intervals and perform final flush if dirty
   */
  async stop() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    if (this._flushInterval) {
      clearInterval(this._flushInterval);
      this._flushInterval = null;
    }
    this._started = false;
    await this.flush();
    logger.debug('SessionManager stopped');
  }

  async init() {
    if (this.fileStore) {
      const data = await this.fileStore.load();
      this.memoryStore.loadAll(data);
    }
  }

  _getSession(chatId) {
    let session = this.memoryStore.get(chatId);
    if (!session) {
      session = {
        state: null,
        data: {},
        lastActivity: Date.now(),
      };
      this.memoryStore.set(chatId, session);
      this.isDirty = true;
    }
    return session;
  }

  getState(chatId) {
    const session = this._getSession(chatId);
    return session.state;
  }

  setState(chatId, state) {
    const session = this._getSession(chatId);
    session.state = state;
    session.lastActivity = Date.now();
    this.memoryStore.set(chatId, session);
    this.isDirty = true;
  }

  getData(chatId) {
    const session = this._getSession(chatId);
    return session.data;
  }

  setData(chatId, data) {
    const session = this._getSession(chatId);
    session.data = data;
    session.lastActivity = Date.now();
    this.memoryStore.set(chatId, session);
    this.isDirty = true;
  }

  updateData(chatId, partial) {
    const session = this._getSession(chatId);
    session.data = { ...session.data, ...partial };
    session.lastActivity = Date.now();
    this.memoryStore.set(chatId, session);
    this.isDirty = true;
    return session.data;
  }

  clearData(chatId) {
    const session = this._getSession(chatId);
    session.data = {};
    session.lastActivity = Date.now();
    this.memoryStore.set(chatId, session);
    this.isDirty = true;
  }

  clearState(chatId) {
    const session = this._getSession(chatId);
    session.state = null;
    session.data = {};
    session.lastActivity = Date.now();
    this.memoryStore.set(chatId, session);
    this.isDirty = true;
  }

  async flush() {
    if (!this.isDirty || !this.fileStore) return;
    
    const data = this.memoryStore.getAll();
    await this.fileStore.save(data);
    this.isDirty = false;
  }

  async cleanup() {
    const now = Date.now();
    const expiry = this.timeoutMinutes * 60 * 1000;
    const keys = this.memoryStore.keys();
    let removed = 0;

    for (const chatId of keys) {
      const session = this.memoryStore.get(chatId);
      if (session && now - session.lastActivity > expiry) {
        this.memoryStore.delete(chatId);
        removed++;
        this.isDirty = true;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired sessions', { count: removed });
      await this.flush();
    }
  }
}
