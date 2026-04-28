/**
 * Navigation & Shared Handlers
 */
import { mainMenuKeyboard, walletListKeyboard, cancelKeyboard, chainSelectionKeyboard } from '../keyboards/index.js';

export function setupNavigationHandlers(bot, storage, walletService, sessions) {
  // Action: back_to_menu
  bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.editMessageText('🏠 *Menu Principal*', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Action: cancel
  bot.action('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    await ctx.answerCbQuery('Opération annulée').catch(() => {});
    ctx.editMessageText('❌ *Opération annulée*', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Action: close_menu
  bot.action('close_menu', async (ctx) => {
    await ctx.answerCbQuery('Menu fermé').catch(() => {});
    try {
      await ctx.deleteMessage();
    } catch (e) {}
  });

  // Hears: 💸 Envoyer
  bot.hears('💸 Envoyer', async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id);
    if (wallets.length === 0) return ctx.reply('❌ Tu n\'as pas encore de wallet.');
    ctx.reply('💸 *Envoyer des fonds*\n\nDepuis quel wallet ?', {
      parse_mode: 'Markdown',
      ...walletListKeyboard(wallets, 'send_from_'),
    });
  });

  // Hears: 🔍 Analyser
  bot.hears('🔍 Analyser', async (ctx) => {
    sessions.setState(ctx.chat.id, 'ENTER_ADDRESS_ANALYZE');
    ctx.reply('🔍 *Analyse d\'adresse*\n\nEntre une adresse publique (ETH, BTC, LTC, BCH, SOL, ARB, MATIC, OP, BASE) pour voir son solde et tous ses tokens.', { 
      parse_mode: 'Markdown',
      ...cancelKeyboard()
    });
  });

  // Hears: ➕ Nouveau Wallet
  bot.hears('➕ Nouveau Wallet', async (ctx) => {
    ctx.reply('➕ *Créer un nouveau wallet*\n\nChoisis le réseau :', {
      parse_mode: 'Markdown',
      ...chainSelectionKeyboard('chain_')
    });
  });

  // Hears: ❓ Aide
  bot.hears('❓ Aide', async (ctx) => {
    const { getHelpText } = await import('../ui/index.js');
    await ctx.reply(getHelpText(), { parse_mode: 'Markdown' });
  });
}
