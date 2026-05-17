import { Markup } from 'telegraf';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';

export function setupJitoEnterHandlers(bot, storage, walletService, sessions) {
  bot.action(/^jito_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const action = ctx.match[1];

    if (action === 'select') {
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === 'sol');

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking.",
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      if (solWallets.length === 1) {
        sessions.updateData(chatId, { walletId: solWallets[0].id, action: 'jito_enter' });
        sessions.setState(chatId, 'JITO_ENTER_AMOUNT');
        return ctx.editMessageText(
          '🔄 *Convertir SOL → JitoSOL*\n\n' +
            `Wallet: \`${solWallets[0].label || solWallets[0].address.slice(0, 8)}...\`\n\n` +
            'Entre le montant de SOL à convertir :\n\n' +
            '_Format: 1.5 SOL_',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
          }
        );
      }

      const buttons = solWallets.map((w, _i) => [
        Markup.button.callback(
          `${w.label || w.address.slice(0, 8)}...`,
          `jito_wallet_enter_${w.id}`
        ),
      ]);
      buttons.push([Markup.button.callback('↩️ Retour', 'jito_staking')]);

      await ctx.editMessageText('🔄 *Convertir SOL → JitoSOL*\n\nSélectionne ton wallet Solana :', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
      return;
    }

    const walletId = ctx.match[1];
    sessions.updateData(chatId, { walletId, action: 'jito_enter' });
    sessions.setState(chatId, 'JITO_ENTER_AMOUNT');

    await ctx.editMessageText(
      '🔄 *Convertir SOL → JitoSOL*\n\n' +
        'Entre le montant de SOL à convertir :\n\n' +
        '_Format: 1.5 SOL_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
      }
    );
  });

  bot.action(/^jito_wallet_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    sessions.updateData(chatId, { walletId, action: 'jito_enter' });
    sessions.setState(chatId, 'JITO_ENTER_AMOUNT');

    await ctx.editMessageText(
      '🔄 *Convertir SOL → JitoSOL*\n\n' +
        'Entre le montant de SOL à convertir :\n\n' +
        '_Format: 1.5 SOL_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
      }
    );
  });
}
