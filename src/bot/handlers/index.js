/**
 * Handlers Index - Aggregates all modular handlers
 */
import { setupStartHandler } from './start/index.js';
import { setupWalletHandlers } from './wallet/index.js';
import { setupKeysHandlers } from './keys/index.js';
import { setupDepositHandlers } from './deposit/index.js';
import { setupSendHandlers } from './send/index.js';
import { setupAdminHandlers } from './admin/index.js';
import { setupCommands } from './commands/index.js';
import { setupBalanceHandlers } from './balance.handlers.js';
import { setupNavigationHandlers } from './nav.handlers.js';
import { SessionManager } from '../../core/session/index.js';
import { WalletService } from '../../modules/wallet/wallet.service.js';
import { config, torProxyUrl } from '../../core/config.js';
import { initTorProxy } from '../../shared/tor-proxy.js';
import { DepositMonitor } from '../../core/monitor.js';
import {
  globalRateLimit,
  messageLengthGuard,
  cleanupLimiters,
} from '../middlewares/security.middleware.js';
import { dedupUpdates, cleanupDedup } from '../middlewares/dedup.middleware.js';
import { adminGuard } from '../middlewares/auth.middleware.js';
import { adminExtendedKeyboard } from '../keyboards/index.js';
import { initPatterns } from '../patterns/index.js';
import { logger } from '../../shared/logger.js';

/**
 * Setup all handlers
 */
export async function setupHandlers(bot, storage) {
  initTorProxy(torProxyUrl);
  const walletService = new WalletService(storage, config);
  const sessions = new SessionManager({
    timeoutMinutes: config.sessionTimeout || 30,
    persistPath: config.dataPath,
    masterKey: config.masterKey,
  });

  await sessions.init();
  sessions.start();
  initPatterns(bot, sessions);

  setInterval(() => {
    cleanupLimiters();
    cleanupDedup();
  }, 60 * 1000);

  // Setup deposit monitor
  const depositMonitor = new DepositMonitor(storage, walletService, bot);
  depositMonitor.start();

  // Drop duplicate/redelivered updates and debounce rapid button taps first,
  // so a flood never reaches profile sync, rate limiting, or handlers.
  bot.use(dedupUpdates);

  // Reject oversized text (broken/flood messages) before any processing.
  bot.use(messageLengthGuard);

  // Global middleware
  bot.use(async (ctx, next) => {
    const chatType = ctx.chat?.type;
    const chatId = ctx.chat?.id;

    if (chatType === 'private' && ctx.from) {
      try {
        await storage.updateUserProfile(
          chatId,
          ctx.from.first_name || 'N/A',
          ctx.from.username || null
        );
      } catch (e) {
        logger.warn('[PROFILE] Failed to update user profile', { chatId, error: e.message });
      }
    }

    if (
      (chatType === 'group' || chatType === 'supergroup') &&
      !config.adminChatId.includes(chatId)
    ) {
      try {
        await ctx.reply('Ce bot est destine a un usage personnel uniquement.');
        await ctx.leaveChat();
      } catch (e) {
        logger.warn('[SECURITY] Failed to leave unauthorized chat', { chatId, error: e.message });
      }
      return;
    }

    return globalRateLimit(ctx, next);
  });

  // Modular Handlers
  setupStartHandler(bot, storage, walletService);
  setupWalletHandlers(bot, storage, walletService, sessions);
  setupKeysHandlers(bot, storage, walletService);
  setupDepositHandlers(bot, storage);
  setupSendHandlers(bot, storage, walletService, sessions);
  setupAdminHandlers(bot, storage, sessions, walletService);
  setupBalanceHandlers(bot, storage, walletService);
  setupNavigationHandlers(bot, storage, walletService, sessions);

  setupCommands(bot, storage, walletService, sessions);

  bot.command('id', (ctx) => {
    ctx.reply(
      `🆔 <b>Ton ChatID</b> : <code>${ctx.chat.id}</code>\n👤 <b>Ton UserID</b> : <code>${ctx.from.id}</code>`,
      {
        parse_mode: 'HTML',
      }
    );
  });

  bot.hears('👑 Admin', async (ctx) => {
    if (!adminGuard(ctx)) return;
    ctx.reply('👑 <b>Panel Admin</b>', { parse_mode: 'HTML', ...adminExtendedKeyboard() });
  });

  return { sessions, walletService, depositMonitor };
}
