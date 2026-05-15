/**
 * Handlers Index - Aggregates all modular handlers
 */
import { setupStartHandler } from './start/index.js';
import { setupWalletHandlers } from './wallet/index.js';
import { setupKeysHandlers } from './keys/index.js';
import { setupSendHandlers } from './send/index.js';
import { setupAdminHandlers } from './admin/index.js';
import { setupDustHandlers } from './dust/index.js';
import { setupStakingHandlers } from './staking/index.js';
import { setupTokenHandlers } from './token/index.js';
import { setupNFTHandlers } from './nft/index.js';
import { setupPolymarketHandlers } from './polymarket/index.js';
import { setupCommands } from './commands/index.js';
import { setupBalanceHandlers } from './balance.handlers.js';
import { setupNavigationHandlers } from './nav.handlers.js';
import { SessionManager } from '../../core/session/index.js';
import { WalletService } from '../../modules/wallet/wallet.service.js';
import { config } from '../../core/config.js';
import { DepositMonitor } from '../../core/monitor.js';
import { globalRateLimit, cleanupLimiters } from '../middlewares/security.middleware.js';
import { adminGuard } from '../middlewares/auth.middleware.js';
import { adminExtendedKeyboard } from '../keyboards/index.js';
import { logger } from '../../shared/logger.js';

/**
 * Setup all handlers
 */
export async function setupHandlers(bot, storage) {
  const walletService = new WalletService(storage, config);
  const sessions = new SessionManager({
    timeoutMinutes: config.sessionTimeout || 30,
    persistPath: config.dataPath,
    masterKey: config.masterKey,
  });

  await sessions.init();

  // Cleanup & Flush interval
  setInterval(async () => {
    await sessions.cleanup();
    await sessions.flush();
  }, 5 * 60 * 1000);

  setInterval(() => cleanupLimiters(), 60 * 1000);

  // Setup deposit monitor
  const depositMonitor = new DepositMonitor(storage, walletService, bot);
  depositMonitor.start();

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
  setupSendHandlers(bot, storage, walletService, sessions);
  setupAdminHandlers(bot, storage, sessions, walletService);
  setupBalanceHandlers(bot, storage, walletService);
  setupNavigationHandlers(bot, storage, walletService, sessions);

  // Protected feature loading
  const safeSetup = (name, setupFn) => {
    try {
      setupFn(bot, storage, walletService, sessions);
      logger.info(`✅ ${name} handlers loaded`);
    } catch (error) {
      logger.error(`❌ Error loading ${name} handlers`, { error: error.message });
    }
  };

  safeSetup('Dust', setupDustHandlers);
  safeSetup('Staking', setupStakingHandlers);
  safeSetup('Token', setupTokenHandlers);
  safeSetup('NFT', setupNFTHandlers);
  safeSetup('Polymarket', setupPolymarketHandlers);

  setupCommands(bot, storage, walletService, sessions);

  bot.command('id', (ctx) => {
    ctx.reply(`🆔 *Ton ChatID* : \`${ctx.chat.id}\`\n👤 *Ton UserID* : \`${ctx.from.id}\``, {
      parse_mode: 'Markdown',
    });
  });

  bot.hears('👑 Admin', async (ctx) => {
    if (!adminGuard(ctx)) return;
    ctx.reply('👑 *Panel Admin*', adminExtendedKeyboard());
  });

  return { sessions, walletService, depositMonitor };
}
