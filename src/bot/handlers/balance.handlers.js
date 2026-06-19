import { Markup } from 'telegraf';
import { mainMenuKeyboard, walletListKeyboard } from '../keyboards/index.js';
import { getPricesEUR, formatCryptoPricesEUR, clearPriceCache } from '../../shared/price.js';
import { buildBalancesText } from '../ui/wallet-display.js';
import { logger } from '../../shared/logger.js';

// Keyboard under the EUR price list: refresh, open the 📈 graph picker, menu/close.
function pricesKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Recharger', 'refresh_prices')],
    [Markup.button.callback('📈 Graphique', 'graph_pick')],
    [
      Markup.button.callback('🎮 Menu', 'back_to_menu'),
      Markup.button.callback('❌ Fermer', 'close_message'),
    ],
  ]);
}

export function setupBalanceHandlers(bot, storage, walletService) {
  bot.action('view_balances', async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery().catch(() => {});

    const wallets = await storage.getWallets(chatId);
    if (wallets.length === 0) {
      return ctx
        .editMessageText("❌ Tu n'as pas encore de wallet.", mainMenuKeyboard())
        .catch((e) => logger.warn('balance.editMessageText failed', { chatId, error: e.message }));
    }

    const text = '💰 <b>Soldes de tes Wallets</b>' + await buildBalancesText(walletService, storage, chatId);

    ctx
      .editMessageText(text, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      })
      .catch((e) => logger.warn('balance.editMessageText failed', { chatId, error: e.message }));
  });

  bot.action('prices_eur', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    try {
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      ctx.editMessageText(text, {
        ...mainMenuKeyboard(),
      });
    } catch (error) {
      ctx.editMessageText('❌ Erreur lors de la récupération des prix.', mainMenuKeyboard());
    }
  });

  bot.hears(['💰 Wallets', '💰 Mes Wallets'], async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id);
    ctx.reply('💰 <b>Tes Wallets</b>', {
      parse_mode: 'HTML',
      ...walletListKeyboard(wallets, 'wallet_'),
    });
  });

  bot.hears(['📊 Cours', '📊 Cours EUR', '📊 Prix'], async (ctx) => {
    try {
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      await ctx.reply(text, { ...pricesKeyboard() });
    } catch (error) {
      ctx.reply('❌ Erreur lors de la recuperation des prix.');
    }
  });

  bot.hears('💵 Soldes', async (ctx) => {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);
    if (wallets.length === 0) {
      return ctx.reply("❌ Tu n'as pas encore de wallet.");
    }

    const text = '💰 <b>Soldes de tes Wallets</b>' + await buildBalancesText(walletService, storage, chatId);
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.action('refresh_prices', async (ctx) => {
    try {
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      await ctx.editMessageText(text, { ...pricesKeyboard() });
    } catch (error) {
      if (error.message && error.message.includes('message is not modified')) {
        return;
      }
      logger.logError(error, { context: 'balance.refreshPrices' });
      ctx.answerCbQuery('Erreur: ' + error.message, true);
    }
  });

  bot.action('close_message', async (ctx) => {
    await ctx.deleteMessage();
  });
}
