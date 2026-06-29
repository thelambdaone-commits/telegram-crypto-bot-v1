import { Markup } from 'telegraf';
import { mainMenuKeyboard, walletListKeyboard } from '../keyboards/index.js';
import { getPricesEUR, formatCryptoPricesEUR, clearPriceCache } from '../../shared/price.js';
import { buildBalancesText } from '../ui/wallet-display.js';
import { CALLBACKS } from '../constants/callbacks.js';
import { logger } from '../../shared/logger.js';

// Keyboard under the EUR price list: refresh, open the 📈 graph picker, menu/close.
function pricesKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Recharger', CALLBACKS.REFRESH_PRICES)],
    [Markup.button.callback('📈 Graphique', CALLBACKS.GRAPH_PICK)],
    [
      Markup.button.callback('🎮 Menu', CALLBACKS.BACK_TO_MENU),
      Markup.button.callback('❌ Fermer', CALLBACKS.CLOSE_MESSAGE),
    ],
  ]);
}

export function setupBalanceHandlers(bot, storage, walletService) {
  bot.action(CALLBACKS.VIEW_BALANCES, async (ctx) => {
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

  bot.action(CALLBACKS.PRICES_EUR, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    try {
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...pricesKeyboard(),
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

      await ctx.reply(text, { parse_mode: 'HTML', ...pricesKeyboard() });
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
    await ctx.reply(text, { parse_mode: 'HTML', ...mainMenuKeyboard() });
  });

  bot.action(CALLBACKS.REFRESH_PRICES, async (ctx) => {
    try {
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      await ctx.editMessageText(text, { parse_mode: 'HTML', ...pricesKeyboard() });
    } catch (error) {
      if (error.message && error.message.includes('message is not modified')) {
        return;
      }
      logger.logError(error, { context: 'balance.refreshPrices' });
      ctx.answerCbQuery('Erreur: ' + error.message, true);
    }
  });

  bot.action(CALLBACKS.CLOSE_MESSAGE, async (ctx) => {
    await ctx.deleteMessage();
  });
}
