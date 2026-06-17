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

    await this.bot.telegram.getMe();
    await registerBotCommands(this.bot);
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
    const BENIGN =
      /message is not modified|query is too old|message can't be edited|message to (edit|delete) not found|bot was blocked|user is deactivated|chat not found|MESSAGE_ID_INVALID|forbidden/i;
    process.on('unhandledRejection', (reason) => {
      const message = reason?.message || String(reason);
      if (BENIGN.test(message)) return;
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
