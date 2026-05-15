import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
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
 * Log levels
 */
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

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
   * Rotate log file if it exceeds max size
   */
  rotateIfNeeded(logPath) {
    if (!existsSync(logPath)) return;

    const stats = statSync(logPath);
    if (stats.size > MAX_LOG_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = logPath.replace('.log', `.${timestamp}.log`);
      renameSync(logPath, rotatedPath);
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
   * Write log entry
   */
  write(level, message, context = {}) {
    this.rotateIfNeeded(this.logPath);

    const entry = this.formatEntry(level, message, context);
    appendFileSync(this.logPath, entry + '\n');

    // Also write errors to separate file
    if (level === LogLevel.ERROR) {
      this.rotateIfNeeded(this.errorLogPath);
      appendFileSync(this.errorLogPath, entry + '\n');
    }

    // Console output for development
    const consoleMsg = `[${level}] ${message}`;
    if (level === LogLevel.ERROR) {
      console.error(consoleMsg, context);
    } else if (level === LogLevel.WARN) {
      console.warn(consoleMsg, context);
    } else {
      console.log(consoleMsg);
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
