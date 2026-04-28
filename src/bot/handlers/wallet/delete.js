import { deleteConfirmKeyboard, mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';

export function setupWalletDelete(bot, storage) {
  // Delete wallet - confirmation
  bot.action(/^delete_wallet_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
    }

    ctx.editMessageText(
      '🗑️ *Supprimer ce wallet ?*\n\n' +
        `*${wallet.label}*\n` +
        `\`${wallet.address}\`\n\n` +
        '⚠️ _Assure-toi d\'avoir sauvegardé tes clés avant de confirmer._',
      {
        parse_mode: 'Markdown',
        ...deleteConfirmKeyboard(walletId),
      }
    );
  });

  // Confirm delete
  bot.action(/^confirm_delete_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    try {
      await storage.deleteWallet(chatId, walletId);

      auditLogger.log(AUDIT_ACTIONS.DELETE_WALLET, chatId, { walletId });

      return ctx.editMessageText('✅ Wallet supprimé avec succès.', mainMenuKeyboard());
    } catch (error) {
      return ctx.editMessageText(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
    }
  });
}
