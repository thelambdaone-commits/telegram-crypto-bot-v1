import { mainMenuKeyboard } from '../../keyboards/index.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';

export function setupWalletTextInput(bot, storage, walletService, sessions) {
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const state = sessions.getState(chatId);
    const text = ctx.message.text.trim();

    if (!state?.startsWith('IMPORT_')) return next();

    // Delete sensitive input message
    try {
      await ctx.deleteMessage();
    } catch (e) {}

    const chain = state.split('_').pop().toLowerCase();
    const type = state.includes('_KEY_') ? 'key' : 'seed';

    try {
      const loadingMsg = await ctx.reply(`${EMOJIS.loading} Importation de ton wallet ${chain.toUpperCase()}...`);
      
      const wallet = await walletService.importWallet(chatId, chain, type, text);
      
      auditLogger.log(AUDIT_ACTIONS.IMPORT_WALLET || 'IMPORT_WALLET', chatId, {
        chain,
        type,
        walletId: wallet.id,
        address: wallet.address
      });

      sessions.setState(chatId, 'IDLE');
      sessions.clearData(chatId);

      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      
      return ctx.reply(
        '✅ *Wallet Importé avec succès !*\n\n' +
        `⛓ Réseau : *${chain.toUpperCase()}*\n` +
        `🏷 Nom : ${wallet.label}\n` +
        `📬 Adresse : \`${wallet.address}\`\n\n` +
        '_Ton wallet est maintenant prêt à être utilisé._',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    } catch (error) {
      return ctx.reply(`❌ Erreur d'importation : ${error.message}\n\nVérifie ta ${type === 'key' ? 'clé privée' : 'phrase de récupération'} et réessaie.`, mainMenuKeyboard());
    }
  });
}
