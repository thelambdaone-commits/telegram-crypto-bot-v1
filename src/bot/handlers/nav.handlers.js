/**
 * Navigation & Shared Handlers
 */
import {
  mainMenuKeyboard,
  walletListKeyboard,
  cancelKeyboard,
  chainSelectionKeyboard,
} from '../keyboards/index.js';
import { safeEditMessage } from '../utils.js';
import { logger } from '../../shared/logger.js';
import { getFullHelpText } from '../ui/index.js';

export function setupNavigationHandlers(bot, storage, walletService, sessions) {
  // Action: back_to_menu
  bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery().catch((err) => logger.debug('back_to_menu answerCbQuery failed', { error: err.message }));
    await safeEditMessage(ctx, '🏠 *Menu Principal*', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Action: cancel
  bot.action('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    await ctx.answerCbQuery('Opération annulée').catch((err) => logger.debug('cancel answerCbQuery failed', { error: err.message }));
    await safeEditMessage(ctx, '❌ *Opération annulée*', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Action: close_menu
  bot.action('close_menu', async (ctx) => {
    await ctx.answerCbQuery('Menu fermé').catch((err) => logger.debug('close_menu answerCbQuery failed', { error: err.message }));
    try {
      await ctx.deleteMessage();
    } catch (e) {
      logger.debug('close_menu deleteMessage failed', { error: e.message });
    }
  });

  // Action: help_menu
  bot.action('help_menu', async (ctx) => {
    await ctx.answerCbQuery().catch((err) => logger.debug('help_menu answerCbQuery failed', { error: err.message }));
    await safeEditMessage(ctx, getFullHelpText(), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Hears: Envoyer
  bot.hears(['💸 Envoyer', '📡 Envoyer', '📤 Envoyer'], async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id);
    if (wallets.length === 0) return ctx.reply("❌ Tu n'as pas encore de wallet.");
    ctx.reply('📡 *Envoyer des fonds*\n\nDepuis quel wallet ?', {
      parse_mode: 'Markdown',
      ...walletListKeyboard(wallets, 'send_from_'),
    });
  });

  // Hears: Analyser
  bot.hears(['🔍 Analyser', '🔎 Analyser'], async (ctx) => {
    sessions.setState(ctx.chat.id, 'ENTER_ADDRESS_ANALYZE');
    ctx.reply(
      "🔎 *Analyse d'adresse*\n\nEntre une adresse publique (ETH, BTC, LTC, BCH, SOL, ARB, MATIC, OP, BASE, AVAX) pour voir son solde et tous ses tokens.",
      {
        parse_mode: 'Markdown',
        ...cancelKeyboard(),
      }
    );
  });

  // Hears: ➕ Nouveau (anciens libellés conservés pour compat)
  bot.hears(['➕ Nouveau', '➕ Nouveau Wallet', '🆕 Nouveau Wallet'], async (ctx) => {
    ctx.reply('➕ *Créer un nouveau wallet*\n\nChoisis le réseau :', {
      parse_mode: 'Markdown',
      ...chainSelectionKeyboard('chain_'),
    });
  });

  // Hears: help buttons
  bot.hears(['❓ Aide', '🆘 Help', '🆘 Aide'], async (ctx) => {
    await ctx.reply(getFullHelpText(), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  // Hears: ❌ Fermer
  bot.hears('❌ Fermer', async (ctx) => {
    sessions.clearState(ctx.chat.id);
    await ctx.reply('❌ Menu fermé.', { reply_markup: { remove_keyboard: true } });
  });
}
