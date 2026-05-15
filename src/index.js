import { Telegraf } from 'telegraf';
import { config } from './core/config.js';
import { setupHandlers } from './bot/handlers/index.js';
import { StorageService } from './core/storage.js';
import { logger } from './shared/logger.js';
import { cleanupAllFeeds } from './clob/feed.js';
import { auditLogger } from './shared/security/audit-logger.js';

const bot = new Telegraf(config.botToken);
const storage = new StorageService(config.dataPath, config.masterKey);

// Initialize
await storage.init();
logger.info('Bot starting', { adminId: config.adminChatId });

// Setup handlers
await setupHandlers(bot, storage);

// Error handling
bot.catch((err, ctx) => {
  logger.logError(err, {
    updateType: ctx.updateType,
    chatId: ctx.chat?.id,
    username: ctx.from?.username,
  });
  ctx.reply('Une erreur est survenue. Reessayez.').catch(() => {});
});

async function shutdown(signal) {
  logger.info(`Bot shutting down (${signal})`);
  cleanupAllFeeds();
  await auditLogger.flush();
  bot.stop(signal);
}

process.once('SIGINT', () => {
  shutdown('SIGINT').catch((error) => logger.logError(error, { context: 'shutdown' }));
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => logger.logError(error, { context: 'shutdown' }));
});

// Start
bot.launch();
logger.info('Bot started successfully', { adminsCount: config.adminChatId.length });
logger.info('Bot Telegram Crypto Wallet demarre');
logger.info(
  `Admin ID: ${config.adminChatId.length > 0 ? `${config.adminChatId.length} configuré(s)` : 'Non configure'}`
);
