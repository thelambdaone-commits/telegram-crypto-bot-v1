import crypto from 'node:crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { Telegraf } from 'telegraf';
import { config } from './core/config.js';
import { setupHandlers } from './bot/handlers/index.js';
import { StorageService } from './core/storage.js';
import { logger } from './shared/logger.js';
import { cleanupAllFeeds } from './clob/feed.js';
import { auditLogger } from './shared/security/audit-logger.js';

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

    logger.info('Bot starting', { adminId: config.adminChatId });

    this._setupRequestIdMiddleware();
    this._setupErrorHandler();

    const handlerResult = await setupHandlers(this.bot, this.storage);
    this.sessions = handlerResult.sessions;
    this.depositMonitor = handlerResult.depositMonitor;

    this._setupShutdown();

    this.bot.launch();
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

  _setupShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Bot shutting down (${signal})`);
      cleanupAllFeeds();
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
