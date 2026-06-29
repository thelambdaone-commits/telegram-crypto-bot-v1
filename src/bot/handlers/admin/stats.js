import { adminExtendedKeyboard } from '../../keyboards/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { safeAnswerCbQuery, escapeHtml } from '../../../shared/utils/telegram.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';
import { CHAIN_EMOJIS } from '../../ui/formatters.js';

export function setupAdminStats(bot, storage, walletService) {
  // Global stats
  bot.action(CALLBACKS.ADMIN_STATS, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (!isAdmin(chatId)) return;

    try {
      const stats = await storage.getGlobalStats();
      const prices = await getPricesEUR().catch((e) => {
        logger.warn('Failed to fetch prices for stats', { error: e.message });
        return { eth: 0, btc: 0, sol: 0, xmr: 0, zec: 0 };
      });

      const globalBalances = {};
      const users = await storage.getAllUsers();

      // Helper: fetch with timeout (5s per user max)
      const fetchWithTimeout = async (fn, timeoutMs = 5000) => {
        return Promise.race([
          fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
        ]);
      };

      let failedFetches = 0;

      for (const user of users) {
        try {
          const balances = await fetchWithTimeout(
            () => walletService.getAllBalances(user.chatId),
            5000
          );
          for (const wallet of balances) {
            if (wallet.balance && wallet.balance !== 'Erreur') {
              const balance = Number.parseFloat(wallet.balance);
              if (!isNaN(balance)) {
                globalBalances[wallet.chain] = (globalBalances[wallet.chain] || 0) + balance;
              }
            }
          }
        } catch (e) {
          failedFetches++;
        }
      }

      const chainEmojis = CHAIN_EMOJIS;

      let totalEUR = 0;
      for (const [chain, balance] of Object.entries(globalBalances)) {
        if (prices[chain]) {
          totalEUR += balance * prices[chain];
        }
      }

      let text = '📊 <b>Statistiques Globales</b>\n\n';
      text += `👥 Utilisateurs : <b>${stats.userCount}</b>\n`;
      text += `💰 Wallets : <b>${stats.totalWallets}</b>\n`;
      text += `🔄 Transactions : <b>${stats.totalTransactions}</b>\n\n`;

      text += '⛓ <b>Par blockchain :</b>\n';
      Object.entries(stats.walletsByChain || {})
        .sort((a, b) => b[1] - a[1])
        .forEach(([chain, count]) => {
          text += `${chainEmojis[chain] || '●'} ${chain.toUpperCase()} : ${count}\n`;
        });

      text += '\n💰 <b>Solde global :</b>\n';
      Object.entries(globalBalances)
        .sort((a, b) => b[1] - a[1])
        .forEach(([chain, balance]) => {
          const price = prices[chain] || 0;
          const valueEUR = balance * price;
          text += `${chainEmojis[chain] || '●'} ${chain.toUpperCase()} : ${balance.toFixed(balance < 0.1 ? 8 : 4)}`;
          if (valueEUR > 0) {
            text += ` (${formatEUR(valueEUR)})`;
          }
          text += '\n';
        });

      text += `\n💎 <b>Total Global : ${formatEUR(totalEUR)}</b>\n`;

      if (failedFetches > 0) {
        text += `\n⚠️ <i>${failedFetches} user(s) non récupéré(s) (API timeout)</i>`;
      }

      try {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...adminExtendedKeyboard(),
        });
      } catch (e) {
        // Ignore "message is not modified" error
        if (!e.message?.includes('message is not modified')) {
          throw e;
        }
      }
    } catch (error) {
      try {
        await ctx.editMessageText(`❌ Erreur stats : ${escapeHtml(error.message)}`, {
          parse_mode: 'HTML',
          ...adminExtendedKeyboard(),
        });
      } catch (e) {}
    }
  });
}
