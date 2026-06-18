import {
  walletListKeyboard,
  mainMenuKeyboard,
  walletActionsKeyboard,
} from '../../keyboards/index.js';
import { safeAnswerCbQuery, escapeHtml } from '../../utils.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';
import { convertToEUR, formatEUR } from '../../../shared/price.js';
import { CHAIN_EMOJIS } from '../../ui/formatters.js';

export function setupWalletList(bot, storage, walletService) {
  // List wallets
  bot.action('list_wallets', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.editMessageText(
        `🔍 <b>${escapeHtml(MESSAGES.noWallets)}</b>\n\nCrée ton premier wallet pour commencer !`,
        {
          parse_mode: 'HTML',
          ...mainMenuKeyboard(),
        }
      );
    }

    let text = `${EMOJIS.wallet} <b>Tes Portefeuilles</b>\n\n`;
    wallets.forEach((w) => {
      text += `🔸 <b>${escapeHtml(w.label)}</b>\n`;
      text += `<code>${w.address}</code>\n\n`;
    });

    ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...walletListKeyboard(wallets),
    });
  });

  // Click on specific wallet -> show details with balance
  // WalletIds have format: chain-timestamp (e.g., sol-1737339000000)
  // Wallet ids are `<chain>-<timestamp>-<uuid8>` (storage), so match the chain
  // prefix + anything — but NOT `wallet_history_…` (no '-' right after the word).
  bot.action(/^wallet_([a-z]+-.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
    }

    const chainEmoji = CHAIN_EMOJIS[wallet.chain] || '💎';

    // Show loading first
    await ctx.editMessageText(
      `${chainEmoji} <b>${escapeHtml(wallet.label)}</b>\n\n⏳ Chargement du solde...`,
      {
        parse_mode: 'HTML',
      }
    );

    // Fetch balance
    let balanceText = '<i>Erreur de récupération</i>';
    let balanceEUR = '';
    try {
      const balance = await walletService.getBalance(chatId, walletId);
      balanceText = `<b>${escapeHtml(balance.balance)} ${escapeHtml(balance.symbol || wallet.chain.toUpperCase())}</b>`;

      // Get EUR value
      const conversion = await convertToEUR(wallet.chain, Number.parseFloat(balance.balance));
      balanceEUR = ` (${formatEUR(conversion.valueEUR)})`;
    } catch (e) {}

    ctx.editMessageText(
      `${chainEmoji} <b>${escapeHtml(wallet.label)}</b>\n\n` +
        `⛓ Réseau: ${wallet.chain.toUpperCase()}\n` +
        `📬 Adresse:\n<code>${wallet.address}</code>\n` +
        `💰 Solde: ${balanceText}${balanceEUR}\n\n` +
        'Que veux-tu faire ?',
      {
        parse_mode: 'HTML',
        ...walletActionsKeyboard(walletId),
      }
    );
  });
}
