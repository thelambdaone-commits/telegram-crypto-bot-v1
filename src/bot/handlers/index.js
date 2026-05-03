/**
 * Handlers Index - Aggregates all modular handlers
 */
import { Markup } from 'telegraf';
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
import { SessionManager } from '../session.js';
import { WalletService } from '../../modules/wallet/wallet.service.js';
import { config } from '../../core/config.js';
import { globalRateLimit, cleanupLimiters } from '../middlewares/security.middleware.js';
import { safeAnswerCbQuery } from '../utils.js';

/**
 * Setup all handlers
 */
export async function setupHandlers(bot, storage) {
  const walletService = new WalletService(storage, config);
  const sessions = new SessionManager();

  // Cleanup intervals
  setInterval(() => sessions.cleanup(), 5 * 60 * 1000);
  setInterval(() => cleanupLimiters(), 60 * 1000);

  // Setup deposit monitor
  const { DepositMonitor } = await import('../../core/monitor.js');
  const depositMonitor = new DepositMonitor(storage, walletService, bot);
  depositMonitor.start();

  // Global middleware
  bot.use(async (ctx, next) => {
    const chatType = ctx.chat?.type;
    const chatId = ctx.chat?.id;

    if (chatType === 'private' && ctx.from) {
      try {
        await storage.updateUserProfile(chatId, ctx.from.first_name || 'N/A', ctx.from.username || null);
      } catch (e) {}
    }

    if ((chatType === 'group' || chatType === 'supergroup') && !config.adminChatId.includes(chatId)) {
      try {
        await ctx.reply('Ce bot est destine a un usage personnel uniquement.');
        await ctx.leaveChat();
      } catch (e) {}
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
      console.log(`✅ ${name} handlers loaded`);
    } catch (error) {
      console.error(`❌ Error loading ${name} handlers:`, error.message);
    }
  };

  safeSetup('Dust', setupDustHandlers);
  safeSetup('Staking', setupStakingHandlers);
  safeSetup('Token', setupTokenHandlers);
  safeSetup('NFT', setupNFTHandlers);
  safeSetup('Polymarket', setupPolymarketHandlers);

  setupCommands(bot, storage, walletService, sessions);

  bot.command('id', (ctx) => {
    ctx.reply(`🆔 *Ton ChatID* : \`${ctx.chat.id}\`\n👤 *Ton UserID* : \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
  });

  bot.hears('👑 Admin', async (ctx) => {
    const { isAdmin } = await import('../middlewares/auth.middleware.js');
    if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Accès réservé aux admins.');
    const { adminExtendedKeyboard } = await import('../keyboards/index.js');
    ctx.reply('👑 *Panel Admin*', adminExtendedKeyboard());
  });
}
