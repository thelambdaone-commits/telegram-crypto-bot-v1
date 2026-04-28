import { walletListKeyboard, mainMenuKeyboard, walletActionsKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';

export function setupWalletList(bot, storage, walletService) {
  // List wallets
  bot.action('list_wallets', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.editMessageText(`🔍 *${MESSAGES.noWallets}*\n\nCrée ton premier wallet pour commencer !`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    let text = `${EMOJIS.wallet} *Tes Portefeuilles*\n\n`;
    wallets.forEach((w) => {
      text += `🔸 *${w.label}*\n`;
      text += `\`${w.address}\`\n\n`;
    });

    ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...walletListKeyboard(wallets),
    });
  });

  // Click on specific wallet -> show details with balance
  // WalletIds have format: chain-timestamp (e.g., sol-1737339000000)
  bot.action(/^wallet_((eth|btc|sol|arb|matic|op|base|ltc|bch|doge)-\d+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
    }

    const chainEmojis = {
      eth: '🔷',
      btc: '₿',
      ltc: '◈',
      bch: '₿',
      sol: '◎',
      arb: '🔴',
      matic: '🟣',
      op: '🔵',
      base: '🟦',
    };
    const chainEmoji = chainEmojis[wallet.chain] || '💎';

    // Show loading first
    await ctx.editMessageText(
      `${chainEmoji} *${wallet.label}*\n\n⏳ Chargement du solde...`,
      { parse_mode: 'Markdown' }
    );

    // Fetch balance
    let balanceText = '_Erreur de récupération_';
    let balanceEUR = '';
    try {
      const balance = await walletService.getBalance(chatId, walletId);
      balanceText = `*${balance.balance} ${wallet.chain.toUpperCase()}*`;
      
      // Get EUR value
      const { convertToEUR, formatEUR } = await import('../../../shared/price.js');
      const conversion = await convertToEUR(wallet.chain, Number.parseFloat(balance.balance));
      balanceEUR = ` (${formatEUR(conversion.valueEUR)})`;
    } catch (e) {}

    ctx.editMessageText(
      `${chainEmoji} *${wallet.label}*\n\n` +
      `⛓ Réseau: ${wallet.chain.toUpperCase()}\n` +
      `📬 Adresse:\n\`${wallet.address}\`\n` +
      `💰 Solde: ${balanceText}${balanceEUR}\n\n` +
      'Que veux-tu faire ?',
      {
        parse_mode: 'Markdown',
        ...walletActionsKeyboard(walletId),
      }
    );
  });
}

