import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '../../../data/audit.log');

/**
 * Audit Logger - Logs all sensitive actions
 * Actions are stored in memory and periodically flushed to file
 */
class AuditLogger {
  constructor() {
    this.logs = [];
    this.maxMemoryLogs = 100;

    // Flush to file every 5 minutes without keeping short-lived scripts alive.
    const flushInterval = setInterval(() => this.flush(), 5 * 60 * 1000);
    flushInterval.unref?.();
  }

  /**
   * Log an action
   * @param {string} action - Type of action (CREATE_WALLET, VIEW_KEY, SEND_TX, etc.)
   * @param {number} chatId - User's chat ID
   * @param {object} details - Additional details
   * @param {boolean} isAdmin - Whether action was performed by admin
   */
  log(action, chatId, details = {}, isAdmin = false) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      chatId,
      isAdmin,
      details,
    };

    this.logs.push(entry);
    console.log(`[AUDIT] ${action} - ChatId: ${chatId}${isAdmin ? ' (ADMIN)' : ''}`);

    // Keep memory bounded
    if (this.logs.length > this.maxMemoryLogs * 2) {
      this.flush();
    }
  }

  /**
   * Get recent logs (for admin panel)
   * @param {number} limit - Number of logs to return
   */
  getRecent(limit = 50) {
    return this.logs.slice(-limit).reverse();
  }

  /**
   * Get logs for specific user
   */
  getByUser(chatId, limit = 20) {
    return this.logs
      .filter((l) => l.chatId === chatId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Flush logs to file
   */
  async flush() {
    if (this.logs.length === 0) return;

    // Take current batch and clear it from memory immediately to prevent duplicates
    const logsToWrite = [...this.logs];
    this.logs = [];

    try {
      const logText = logsToWrite.map((l) => JSON.stringify(l)).join('\n') + '\n';
      await fs.appendFile(LOG_FILE, logText, 'utf8');
    } catch (error) {
      console.error('Audit flush error:', error.message);
      // If write fails, put logs back (optional, but safer)
      this.logs = [...logsToWrite, ...this.logs].slice(-this.maxMemoryLogs);
    }
  }

  /**
   * Clear all logs (admin action)
   */
  async clear() {
    this.logs = [];
    try {
      await fs.writeFile(LOG_FILE, '', 'utf8');
    } catch (error) {
      console.error('Audit clear error:', error.message);
    }
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

// Action types
export const AUDIT_ACTIONS = {
  CREATE_WALLET: 'CREATE_WALLET',
  DELETE_WALLET: 'DELETE_WALLET',
  VIEW_SEED: 'VIEW_SEED',
  VIEW_PRIVKEY: 'VIEW_PRIVKEY',
  SEND_TX: 'SEND_TX',
  ADMIN_VIEW_USER: 'ADMIN_VIEW_USER',
  ADMIN_VIEW_USER_KEYS: 'ADMIN_VIEW_USER_KEYS',
  ADMIN_BAN: 'ADMIN_BAN',
  ADMIN_UNBAN: 'ADMIN_UNBAN',
  ADMIN_BROADCAST: 'ADMIN_BROADCAST',
  ADMIN_DELETE_WALLET: 'ADMIN_DELETE_WALLET',
  USER_START: 'USER_START',
};
