import {
  mainMenuKeyboard,
  walletListKeyboard,
  walletActionsKeyboard,
  corruptedWalletKeyboard,
} from '../../keyboards/index.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { safeAnswerCbQuery, scheduleSecureDelete, escapeHtml } from '../../utils.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
import { logger } from '../../../shared/logger.js';
import { generateAddressQR } from '../../../shared/qr.js';
import { CHAIN_EMOJIS, truncateAddress } from '../../ui/formatters.js';
import { Markup } from 'telegraf';

export function setupKeysHandlers(bot, storage, walletService) {
  // View keys menu
  bot.action('view_keys', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.editMessageText(`<b>${escapeHtml(MESSAGES.noWallets)}</b>`, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }

    ctx.editMessageText(
      `${EMOJIS.lock} <b>Sauvegarder tes clés</b>\n\nSélectionne un wallet pour voir ses informations secrètes.\n\n⚠️ <i>Ne partage jamais ces clés avec personne.</i>`,
      {
        parse_mode: 'HTML',
        ...walletListKeyboard(wallets, 'keys_'),
      }
    );
  });

  bot.hears('🔐 Mes Clés', async (ctx) => {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.reply(`<b>${escapeHtml(MESSAGES.noWallets)}</b>`, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }

    ctx.reply(
      `${EMOJIS.lock} <b>Sauvegarder tes clés</b>\n\nSélectionne un wallet pour voir ses informations secrètes.\n\n⚠️ <i>Ne partage jamais ces clés avec personne.</i>`,
      {
        parse_mode: 'HTML',
        ...walletListKeyboard(wallets, 'keys_'),
      }
    );
  });

  // Select wallet for keys
  bot.action(/^keys_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
    }

    ctx.editMessageText(
      `📑 <b>${escapeHtml(wallet.label)}</b>\n\nAdresse :\n<code>${wallet.address}</code>\n\nQue souhaites-tu afficher ?`,
      {
        parse_mode: 'HTML',
        ...walletActionsKeyboard(walletId),
      }
    );
  });

  // Copy address action
  bot.action(/^copy_addr_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx, '✅ Adresse copiée !');

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (wallet) {
      ctx.reply(`<code>${wallet.address}</code>\n\n<i>Appuie sur l'adresse pour la copier si besoin.</i>`, {
        parse_mode: 'HTML',
      });
    }
  });

  // QR code of the address (coin logo centered)
  bot.action(/^qr_addr_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.reply('😕 Wallet non trouvé');
    }

    try {
      const buffer = await generateAddressQR(wallet.address, wallet.chain);
      await ctx.replyWithPhoto(
        { source: buffer },
        {
          caption: `📷 <b>${escapeHtml(wallet.label)}</b>\n${wallet.chain.toUpperCase()}\n<code>${wallet.address}</code>`,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Retour', `qr_back_${walletId}`)],
          ]),
        }
      );
    } catch (e) {
      logger.logError(e, { context: 'qr_addr', walletId });
      await ctx.reply('❌ Impossible de générer le QR code.');
    }
  });

  // Back from QR: remove the QR photo (wallet menu stays above it)
  bot.action(/^qr_back_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    try {
      await ctx.deleteMessage();
    } catch (e) {
      logger.debug('qr_back deleteMessage failed', { error: e.message });
    }
  });

  // View seed phrase
  bot.action(/^view_seed_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const isAuthorizedGroup =
      (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && isAdmin(ctx.chat.id);
    if (ctx.chat.type !== 'private' && !isAuthorizedGroup) {
      return ctx.reply(
        "❌ Cette action n'est disponible qu'en message privé ou canal admin autorisé."
      );
    }

    try {
      const wallet = await storage.getWalletWithKey(chatId, walletId);

      if (!wallet) {
        return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
      }

      if (wallet.isCorrupted) {
        return ctx.editMessageText(
          '⚠️ <b>Wallet corrompu</b>\n\nLa clé de chiffrement a changé. Les données ne peuvent plus être récupérées.\n\n<i>Supprime ce wallet et recrées-en un.</i>',
          { parse_mode: 'HTML', ...corruptedWalletKeyboard(walletId) }
        );
      }

      if (!wallet.mnemonic) {
        return ctx.editMessageText(
          'ℹ️ Pas de seed phrase pour ce wallet (importé via clé privée).',
          {
            parse_mode: 'HTML',
            ...mainMenuKeyboard(),
          }
        );
      }

      auditLogger.log(AUDIT_ACTIONS.VIEW_SEED, chatId, { walletId, chain: wallet.chain });

      const message =
        '🔐 <b>Phrase de Récupération</b>\n\n' +
        `<code>${escapeHtml(wallet.mnemonic)}</code>\n\n` +
        '⚠️ <b>IMPORTANT :</b> Garde cette phrase secrète ! Elle donne accès à tes fonds.\n\n' +
        '🕐 Ce message sera supprimé dans 30 secondes.';

      const sentMsg = await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });

      scheduleSecureDelete(ctx, `seed_${chatId}`, sentMsg.message_id, 30000);
    } catch (error) {
      logger.logError(error, { context: 'view_seed', chatId });
      return ctx.reply(`❌ Erreur lors de la récupération de la phrase : ${error.message}`, mainMenuKeyboard());
    }
  });

  // View private key
  bot.action(/^view_privkey_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const isAuthorizedGroup =
      (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && isAdmin(ctx.chat.id);
    if (ctx.chat.type !== 'private' && !isAuthorizedGroup) {
      return ctx.reply(
        "❌ Cette action n'est disponible qu'en message privé ou canal admin autorisé."
      );
    }

    try {
      const wallet = await storage.getWalletWithKey(chatId, walletId);

      if (!wallet) {
        return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
      }

      if (wallet.isCorrupted) {
        return ctx.editMessageText(
          '⚠️ <b>Wallet corrompu</b>\n\nLa clé de chiffrement a changé. Les données ne peuvent plus être récupérées.\n\n<i>Supprime ce wallet et recrées-en un.</i>',
          { parse_mode: 'HTML', ...corruptedWalletKeyboard(walletId) }
        );
      }

      auditLogger.log(AUDIT_ACTIONS.VIEW_PRIVKEY, chatId, { walletId, chain: wallet.chain });

      const message =
        '🔑 <b>Clé Privée</b>\n\n' +
        `<code>${escapeHtml(wallet.privateKey)}</code>\n\n` +
        '⚠️ <b>ATTENTION :</b> Cette clé donne un accès TOTAL à tes fonds ! Ne la partage jamais.\n\n' +
        '🕐 Ce message sera supprimé dans 30 secondes.';

      const sentMsg = await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });

      scheduleSecureDelete(ctx, `privkey_${chatId}`, sentMsg.message_id, 30000);
    } catch (error) {
      logger.logError(error, { context: 'view_privkey', chatId });
      return ctx.reply(`❌ Erreur lors de la récupération de la clé : ${error.message}`, mainMenuKeyboard());
    }
  });

  // View wallet transaction history
  bot.action(/^wallet_history_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    try {
      const wallets = await storage.getWallets(chatId);
      const wallet = wallets.find((w) => w.id === walletId);

      if (!wallet) {
        return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
      }

      // Show loading message
      await ctx.editMessageText(
        `📜 <b>Chargement de l'historique...</b>\n\n⏳ Récupération des transactions pour ${escapeHtml(wallet.label)}...`,
        {
          parse_mode: 'HTML',
        }
      );

      const txHistory = await walletService.getTransactionHistory(wallet.chain, wallet.address, 10);

      if (!txHistory || txHistory.length === 0) {
        return ctx.editMessageText(
          `📜 <b>Historique de ${escapeHtml(wallet.label)}</b>\n\n` + 'Aucune transaction trouvée pour ce wallet.',
          {
            parse_mode: 'HTML',
            ...walletActionsKeyboard(walletId),
          }
        );
      }

      const chainEmoji = CHAIN_EMOJIS[wallet.chain] || '💎';
      const chainSymbol = wallet.chain.toUpperCase();

      let text = `${chainEmoji} <b>Historique — ${escapeHtml(wallet.label)}</b>\n`;
      text += `<code>${truncateAddress(wallet.address)}</code>\n\n`;

      for (const tx of txHistory) {
        // Direction emoji and label
        const directionEmoji = tx.type === 'in' ? '⬇️' : tx.type === 'out' ? '⬆️' : '🔄';
        const directionLabel = tx.type === 'in' ? 'Entrant' : tx.type === 'out' ? 'Sortant' : 'TX';

        // Format amount
        const amountDisplay =
          tx.amount && tx.amount !== '—' && tx.amount !== '0' ? `${tx.amount} ${chainSymbol}` : '';

        // Format date
        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        // Short hash
        const shortHash = truncateAddress(tx.hash, 10, 8);

        // One line per info - clean format
        text += `${directionEmoji} <b>${directionLabel}</b> · ${escapeHtml(amountDisplay)}\n`;
        text += `🕑 ${dateStr} ${timeStr}\n`;
        text += `🔗 <code>${shortHash}</code>\n\n`;
      }

      text += `<i>${txHistory.length} transaction(s)</i>`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...walletActionsKeyboard(walletId),
      });
    } catch (error) {
      logger.logError(error, { context: 'wallet_history', chatId, walletId });
      return ctx.editMessageText(
        `❌ <b>Erreur</b>\n\nImpossible de récupérer l'historique : ${escapeHtml(error.message)}`,
        {
          parse_mode: 'HTML',
          ...walletActionsKeyboard(walletId),
        }
      );
    }
  });
}
