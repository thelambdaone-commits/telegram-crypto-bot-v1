/**
 * Balance & Price Handlers
 */
import { Markup } from 'telegraf';
import { mainMenuKeyboard, walletListKeyboard } from '../keyboards/index.js';

export function setupBalanceHandlers(bot, storage, walletService) {
  // Action: view_balances
  bot.action('view_balances', async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery().catch(() => {});

    const wallets = await storage.getWallets(chatId);
    if (wallets.length === 0) {
      return ctx
        .editMessageText("❌ Tu n'as pas encore de wallet.", mainMenuKeyboard())
        .catch(() => {});
    }

    const { convertToEUR, formatEUR } = await import('../../shared/price.js');

    let text = '💰 *Soldes de tes Wallets*\n\n';
    let totalEUR = 0;

    for (const wallet of wallets) {
      try {
        const balance = await walletService.getBalance(chatId, wallet.id);
        const balanceNum = parseFloat(balance.balance) || 0;

        let valueEUR = 0;
        if (balanceNum > 0) {
          try {
            const conversion = await convertToEUR(wallet.chain, balanceNum);
            valueEUR = conversion.valueEUR || 0;
            totalEUR += valueEUR;
          } catch {
            // Keep balance display available even if EUR conversion fails.
          }
        }

        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += `Solde: ${balance.balance} ${wallet.chain.toUpperCase()}`;
        if (valueEUR > 0) {
          text += ` ≈ ${formatEUR(valueEUR)}`;
        }
        text += '\n\n';
      } catch (error) {
        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += '❌ Erreur de récupération\n\n';
      }
    }

    text += '━━━━━━━━━━━━\n';
    text += `💶 *Total :* ${formatEUR(totalEUR)}`;

    ctx
      .editMessageText(text, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      })
      .catch(() => {});
  });

  // Action: prices_eur
  bot.action('prices_eur', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    try {
      const { getPricesEUR, formatCryptoPricesEUR, clearPriceCache } =
        await import('../../shared/price.js');
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

  // Hears: 💰 Mes Wallets
  bot.hears('💰 Mes Wallets', async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id);
    ctx.reply('👛 *Tes Wallets*', {
      parse_mode: 'Markdown',
      ...walletListKeyboard(wallets, 'wallet_'),
    });
  });

  // Hears: 📊 Cours EUR
  bot.hears('📊 Cours EUR', async (ctx) => {
    try {
      const { getPricesEUR, formatCryptoPricesEUR, clearPriceCache } =
        await import('../../shared/price.js');
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      await ctx.reply(text, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Recharger', 'refresh_prices')],
          [Markup.button.callback('❌ Fermer', 'close_message')],
        ]),
      });
    } catch (error) {
      ctx.reply('❌ Erreur lors de la recuperation des prix.');
    }
  });

  // Hears: 💵 Soldes
  bot.hears('💵 Soldes', async (ctx) => {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);
    if (wallets.length === 0) {
      return ctx.reply("❌ Tu n'as pas encore de wallet.");
    }

    const { convertToEUR, formatEUR } = await import('../../shared/price.js');

    let text = '💰 *Soldes de tes Wallets*\n\n';
    let totalEUR = 0;

    for (const wallet of wallets) {
      try {
        const balance = await walletService.getBalance(chatId, wallet.id);
        const balanceNum = parseFloat(balance.balance) || 0;

        let valueEUR = 0;
        if (balanceNum > 0) {
          try {
            const conversion = await convertToEUR(wallet.chain, balanceNum);
            valueEUR = conversion.valueEUR || 0;
            totalEUR += valueEUR;
          } catch {
            // Keep balance display available even if EUR conversion fails.
          }
        }

        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += `Solde: ${balance.balance} ${wallet.chain.toUpperCase()}`;
        if (valueEUR > 0) {
          text += ` ≈ ${formatEUR(valueEUR)}`;
        }
        text += '\n\n';
      } catch (error) {
        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += '❌ Erreur de récupération\n\n';
      }
    }

    text += '━━━━━━━━━━━━\n';
    text += `💶 *Total :* ${formatEUR(totalEUR)}`;

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // Refresh prices button
  bot.action('refresh_prices', async (ctx) => {
    try {
      const { getPricesEUR, formatCryptoPricesEUR, clearPriceCache } =
        await import('../../shared/price.js');
      clearPriceCache();
      const prices = await getPricesEUR(true);
      const text = formatCryptoPricesEUR(prices);

      await ctx.editMessageText(text, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Recharger', 'refresh_prices')],
          [Markup.button.callback('❌ Fermer', 'close_message')],
        ]),
      });
    } catch (error) {
      if (error.message && error.message.includes('message is not modified')) {
        return;
      }
      console.error('refresh_prices error:', error);
      ctx.answerCbQuery('Erreur: ' + error.message, true);
    }
  });

  // Close message button
  bot.action('close_message', async (ctx) => {
    await ctx.deleteMessage();
  });
}
