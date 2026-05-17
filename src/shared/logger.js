import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { rename, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure logs directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log levels with numeric values for filtering
 */
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

const LEVEL_VALUES = {
  ERROR: 40,
  WARN: 30,
  INFO: 20,
  DEBUG: 10,
};

const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
let currentLogLevel = DEFAULT_LOG_LEVEL;

/**
 * Structured logger for AI-assisted debugging
 */
class Logger {
  constructor(logFile = 'bot.log') {
    this.logPath = join(LOG_DIR, logFile);
    this.errorLogPath = join(LOG_DIR, 'errors.log');
    this.redactKeys = new Set([
      'privateKey', 'encryptedPrivateKey',
      'seedPhrase', 'mnemonic', 'encryptedMnemonic',
      'secretKey', 'apiKey', 'apiSecret', 'apiPassphrase',
      'passphrase', 'masterKey',
    ]);
  }

  redact(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clone = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(clone)) {
      if (this.redactKeys.has(key)) {
        clone[key] = '[REDACTED]';
      } else if (typeof clone[key] === 'object' && clone[key] !== null) {
        clone[key] = this.redact(clone[key]);
      }
    }
    return clone;
  }

  /**
   * Rotate log file if it exceeds max size (async)
   */
  async rotateIfNeeded(logPath) {
    try {
      const stats = await stat(logPath).catch(() => null);
      if (!stats || stats.size <= MAX_LOG_SIZE) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = logPath.replace('.log', `.${timestamp}.log`);
      await rename(logPath, rotatedPath);
    } catch {
      // Silently ignore rotation failures
    }
  }

  /**
   * Format log entry as JSON for easy parsing
   */
  formatEntry(level, message, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.redact(context),
    });
  }

  /**
   * Set the minimum log level for console output
   */
  setLevel(level) {
    if (LEVEL_VALUES[level] !== undefined) {
      currentLogLevel = level;
    }
  }

  /**
   * Check if a level should be shown in console output
   */
  _shouldLog(level) {
    return (LEVEL_VALUES[level] || 0) >= (LEVEL_VALUES[currentLogLevel] || 0);
  }

  /**
   * Write log entry
   * File output is always written (unfiltered for debugging).
   * Console output is filtered by LOG_LEVEL.
   */
  write(level, message, context = {}) {
    this.rotateIfNeeded(this.logPath).catch(() => {});

    const entry = this.formatEntry(level, message, context);
    appendFileSync(this.logPath, entry + '\n');

    // Also write errors to separate file
    if (level === LogLevel.ERROR) {
      this.rotateIfNeeded(this.errorLogPath).catch(() => {});
      appendFileSync(this.errorLogPath, entry + '\n');
    }

    // Console output filtered by LOG_LEVEL
    if (this._shouldLog(level)) {
      const consoleMsg = `[${level}] ${message}`;
      if (level === LogLevel.ERROR) {
        console.error(consoleMsg, context);
      } else if (level === LogLevel.WARN) {
        console.warn(consoleMsg, context);
      } else {
        console.log(consoleMsg);
      }
    }
  }

  error(message, context = {}) {
    this.write(LogLevel.ERROR, message, context);
  }

  warn(message, context = {}) {
    this.write(LogLevel.WARN, message, context);
  }

  info(message, context = {}) {
    this.write(LogLevel.INFO, message, context);
  }

  debug(message, context = {}) {
    this.write(LogLevel.DEBUG, message, context);
  }

  /**
   * Log bot interaction
   */
  logInteraction(chatId, username, action, details = {}) {
    this.info(`User interaction: ${action}`, {
      chatId,
      username,
      action,
      ...details,
    });
  }

  /**
   * Log error with full context
   */
  logError(error, context = {}) {
    this.error(error.message || String(error), {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    });
  }

  /**
   * Log transaction
   */
  logTransaction(chatId, chain, type, details = {}) {
    this.info(`Transaction: ${type}`, {
      chatId,
      chain,
      type,
      ...details,
    });
  }

  /**
   * Log with standardized context fields
   * Ensures chatId, userId, username, module, action are always present
   */
  logWithContext(level, message, ctx = {}) {
    const { chatId, userId, username, module, action, requestId, ...rest } = ctx;
    this.write(level, message, {
      chatId,
      userId,
      username,
      module: module || 'unknown',
      action: action || 'unknown',
      ...(requestId ? { requestId } : {}),
      ...rest,
    });
  }
}

// Export singleton instance
export const logger = new Logger();
