import { Markup } from 'telegraf';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import {
  getPreferredStakingWallet,
  getSolWallets,
  setPreferredStakingWallet,
  stakingWalletSelectionKeyboard,
} from '../wallet-selection.js';

export function setupJitoEnterHandlers(bot, storage, walletService, sessions) {
  bot.action(/^jito_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const action = ctx.match[1];

    if (action === 'select') {
      const solWallets = await getSolWallets(storage, chatId);

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking.",
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      const preferredWallet = await getPreferredStakingWallet(
        storage,
        sessions,
        chatId,
        solWallets
      );

      if (preferredWallet) {
        await setPreferredStakingWallet(storage, sessions, chatId, preferredWallet.id);
        sessions.updateData(chatId, { walletId: preferredWallet.id, action: 'jito_enter' });
        sessions.setState(chatId, 'JITO_ENTER_AMOUNT');
        return ctx.editMessageText(
          '🔄 *Convertir SOL → JitoSOL*\n\n' +
            `⭐ Wallet: \`${preferredWallet.label || preferredWallet.address.slice(0, 8)}...\`\n\n` +
            'Entre le montant de SOL à convertir :\n\n' +
            '_Format: 1.5 SOL_',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
          }
        );
      }

      await ctx.editMessageText(
        '🔄 *Convertir SOL → JitoSOL*\n\n' +
          'Sélectionne ton wallet Solana. Il restera actif pour les prochaines opérations :',
        {
          parse_mode: 'Markdown',
          ...stakingWalletSelectionKeyboard({
            wallets: solWallets,
            activeWalletId: sessions.getData(chatId)?.stakingWalletId,
            callbackPrefix: 'jito_wallet_enter',
            backCallback: 'jito_staking',
          }),
        }
      );
      return;
    }

    const walletId = ctx.match[1];
    await setPreferredStakingWallet(storage, sessions, chatId, walletId);
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

    await setPreferredStakingWallet(storage, sessions, chatId, walletId);
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
