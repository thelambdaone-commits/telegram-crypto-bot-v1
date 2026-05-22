import { liquidStakingKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { handleStakeCommand, handleYieldCommand } from './display.js';
import { handleCalcCommand } from './calculator.js';
import { setupJitoHandlers } from './jito.js';
import { setupMarinadeHandlers } from './marinade.js';
import { setupAaveHandlers } from './providers/aave.js';
import { setupEthStakingHandlers } from './providers/eth-staking.js';
import { setupStakingOptimizerHandlers } from './optimizer.js';
import { setupStakingTextInput } from './text-input.js';
import {
  getPreferredStakingWallet,
  getSolWallets,
  setPreferredStakingWallet,
  stakingWalletSelectionKeyboard,
} from './wallet-selection.js';

export function setupStakingHandlers(bot, storage, walletService, sessions) {
  setupStakingOptimizerHandlers(bot, storage, walletService, sessions);
  setupAaveHandlers(bot, storage, walletService, sessions);
  setupEthStakingHandlers(bot, storage, walletService, sessions);
  setupJitoHandlers(bot, storage, walletService, sessions);
  setupMarinadeHandlers(bot, storage, walletService, sessions);
  setupStakingTextInput(bot, storage, walletService, sessions);

  bot.command('stake', async (ctx) => {
    await handleStakeCommand(ctx, storage);
  });

  bot.command('yield', async (ctx) => {
    await handleYieldCommand(ctx, storage, walletService);
  });

  bot.command('calc', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    await handleCalcCommand(ctx, args);
  });

  bot.hears('📈 Staking', async (ctx) => {
    await handleStakeCommand(ctx, storage);
  });

  bot.action('staking_yield', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleYieldCommand(ctx, storage, walletService);
  });

  bot.action('staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleStakeCommand(ctx, storage, { edit: true });
  });

  bot.action('liquid_staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const chatId = ctx.chat.id;
    const solWallets = await getSolWallets(storage, chatId);
    const activeWallet = await getPreferredStakingWallet(storage, sessions, chatId, solWallets);
    const activeWalletText = activeWallet
      ? `\n\n⭐ *Wallet actif* : \`${activeWallet.label || activeWallet.address.slice(0, 8)}...\`\n` +
        '_Utilisé automatiquement pour JitoSOL et Marinade._'
      : solWallets.length > 1
        ? '\n\n⭐ Sélectionnez un wallet une seule fois. Il restera actif pour JitoSOL et Marinade.'
        : '';

    await ctx.editMessageText(
      '📈 *Liquid Staking Solana*\n\n' +
        'Stakez votre SOL et recevez des tokens liquides.\n\n' +
        '🥇 *JitoSOL* - Rendement élevé\n' +
        '🥈 *Marinade* - Équilibre\n\n' +
        '_Les deux offrent une sortie rapide_' +
        activeWalletText,
      { parse_mode: 'Markdown', ...liquidStakingKeyboard() }
    );
  });

  bot.action('staking_wallet_selection', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const solWallets = await getSolWallets(storage, chatId);

    if (solWallets.length === 0) {
      return ctx.editMessageText(
        "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le liquid staking.",
        { parse_mode: 'Markdown', ...liquidStakingKeyboard() }
      );
    }

    const activeWallet = await getPreferredStakingWallet(storage, sessions, chatId, solWallets);
    return ctx.editMessageText(
      '⭐ *Wallet Solana actif*\n\n' +
        'Choisissez le wallet à utiliser automatiquement pour JitoSOL et Marinade.',
      {
        parse_mode: 'Markdown',
        ...stakingWalletSelectionKeyboard({
          wallets: solWallets,
          activeWalletId: activeWallet?.id,
          callbackPrefix: 'staking_select_wallet',
          backCallback: 'liquid_staking_menu',
        }),
      }
    );
  });

  bot.action(/^staking_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await setPreferredStakingWallet(storage, sessions, ctx.chat.id, ctx.match[1]);
    await ctx.editMessageText(
      '✅ *Wallet actif mis à jour*\n\nIl sera utilisé automatiquement pour JitoSOL et Marinade.',
      {
        parse_mode: 'Markdown',
        ...liquidStakingKeyboard(),
      }
    );
  });
}
