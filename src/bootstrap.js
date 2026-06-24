import crypto from 'node:crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { Telegraf } from 'telegraf';
import { config } from './core/config.js';
import { setupHandlers } from './bot/handlers/index.js';
import { StorageService } from './core/storage.js';
import { logger } from './shared/logger.js';
import { auditLogger } from './shared/security/audit-logger.js';
import { initRateLimiters } from './bot/middlewares/security.middleware.js';
import { registerBotCommands } from './bot/bot-commands.js';

// Telegram errors that are expected and harmless (a re-render with identical
// content, a stale callback, a blocked/deleted chat). They must NOT be logged as
// real errors nor surfaced to the user as "an error occurred".
const BENIGN_TELEGRAM_ERROR =
  /message is not modified|query is too old|message can't be edited|message to (edit|delete) not found|bot was blocked|user is deactivated|chat not found|MESSAGE_ID_INVALID|forbidden/i;

// Transient network failures that warrant a retry rather than aborting startup.
// A blip reaching api.telegram.org at boot must never permanently disable polling.
const TRANSIENT_NETWORK_ERROR =
  /EHOSTUNREACH|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EPIPE|socket hang up|network|timed? out|FetchError/i;

function isTransientNetworkError(error) {
  return TRANSIENT_NETWORK_ERROR.test(`${error?.code || ''} ${error?.message || ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class App {
  constructor() {
    this.bot = null;
    this.storage = null;
    this.sessions = null;
    this.depositMonitor = null;
  }

  async start() {
    this._rejectUnencryptedSessions();
    this.bot = new Telegraf(config.botToken);
    this.storage = new StorageService(config.dataPath, config.masterKey);
    await this.storage.init();

    initRateLimiters(this.storage.secrets);

    logger.info('Bot starting', { adminId: config.adminChatId });

    this._setupRequestIdMiddleware();
    this._setupErrorHandler();
    this._setupProcessGuards();

    const handlerResult = await setupHandlers(this.bot, this.storage);
    this.sessions = handlerResult.sessions;
    this.depositMonitor = handlerResult.depositMonitor;

    this._setupShutdown();

    // Reaching Telegram at boot can fail on a transient network blip. Retry
    // instead of letting the rejection bubble up — otherwise launch() below is
    // never reached and the process lingers "online" with no polling at all.
    await this._withRetry(() => this.bot.telegram.getMe(), 'getMe');
    await this._withRetry(() => registerBotCommands(this.bot), 'registerBotCommands');

    // launch() resolves only when long-polling stops. Don't await it. If it ever
    // rejects (fatal startup error), exit non-zero so the supervisor restarts a
    // clean process rather than leaving a deaf bot behind.
    this.bot.launch().catch((error) => {
      logger.logError(error, { context: 'bot.launch' });
      process.exit(1);
    });
    logger.info('Bot started successfully', { adminsCount: config.adminChatId.length });
    logger.info('Bot Telegram Crypto Wallet demarre');
    logger.info(
      `Admin ID: ${config.adminChatId.length > 0 ? `${config.adminChatId.length} configure(s)` : 'Non configure'}`
    );

    return this;
  }

  // Retry a startup network call across transient failures with capped
  // exponential backoff. Non-network errors fail fast (no point retrying a bad
  // token). After exhausting attempts, rethrow so start() rejects and the
  // process exits — the supervisor then restarts and tries again from scratch.
  async _withRetry(fn, label, attempts = 6, baseDelayMs = 2000) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!isTransientNetworkError(error) || attempt === attempts) {
          throw error;
        }
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 30000);
        logger.warn(`Startup step "${label}" failed (network), retrying`, {
          attempt,
          attempts,
          delayMs: delay,
          error: error?.message,
        });
        await sleep(delay);
      }
    }
  }

  _rejectUnencryptedSessions() {
    const sessionsJsonPath = join(config.dataPath, 'sessions.json');
    if (existsSync(sessionsJsonPath)) {
      const msg = 'SECURITY_ALERT: Unencrypted sessions.json detected. Remove it immediately.';
      logger.error(msg);
      process.exit(1);
    }
  }

  _setupRequestIdMiddleware() {
    this.bot.use(async (ctx, next) => {
      ctx.state.requestId = crypto.randomUUID();
      return next();
    });
  }

  _setupErrorHandler() {
    this.bot.catch((err, ctx) => {
      // Benign Telegram errors (e.g. editing a message to identical content) are
      // not failures — don't log them as errors and don't alarm the user.
      if (BENIGN_TELEGRAM_ERROR.test(err?.message || '')) {
        logger.debug('Benign Telegram error ignored', { error: err.message, updateType: ctx.updateType });
        return;
      }
      logger.logError(err, {
        requestId: ctx.state?.requestId,
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        username: ctx.from?.username,
      });
      ctx.reply('Une erreur est survenue. Reessayez.').catch(() => {});
    });
  }

  // Last-resort net for detached promise rejections (fire-and-forget
  // ctx.reply / ctx.editMessageText that bot.catch never sees). Benign Telegram
  // send/edit errors are ignored; anything else is logged with context instead
  // of becoming a silent unhandledRejection.
  _setupProcessGuards() {
    process.on('unhandledRejection', (reason) => {
      const message = reason?.message || String(reason);
      if (BENIGN_TELEGRAM_ERROR.test(message)) return;
      logger.logError(reason instanceof Error ? reason : new Error(message), {
        context: 'unhandledRejection',
      });
    });
  }

  _setupShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Bot shutting down (${signal})`);
      if (this.depositMonitor) {
        this.depositMonitor.stop();
      }
      if (this.storage) {
        await this.storage.stop();
      }
      if (this.sessions) {
        await this.sessions.stop();
      }
      await auditLogger.flush();
      this.bot.stop(signal);
    };

    process.once('SIGINT', () => {
      shutdown('SIGINT').catch((error) => logger.logError(error, { context: 'shutdown' }));
    });
    process.once('SIGTERM', () => {
      shutdown('SIGTERM').catch((error) => logger.logError(error, { context: 'shutdown' }));
    });
  }
}
