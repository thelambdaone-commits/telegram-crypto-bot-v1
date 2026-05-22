/**
 * Marinade Staking Handler for Telegram
 * Handle Marinade (mSOL) staking operations
 */

import { Markup } from 'telegraf';
import { MarinadeService } from '../../../modules/staking/marinade.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { formatEUR, getPricesEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';
import {
  getPreferredStakingWallet,
  getSolWallets,
  setPreferredStakingWallet,
  stakingWalletSelectionKeyboard,
} from './wallet-selection.js';

export function setupMarinadeHandlers(bot, storage, _walletService, sessions) {
  // Show Marinade staking menu
  bot.action('marinade_staking', async (ctx) => {
    await safeAnswerCbQuery(ctx);

    try {
      const chatId = ctx.chat.id;
      const solWallets = await getSolWallets(storage, chatId);

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking Marinade.",
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      const solWallet = await getPreferredStakingWallet(storage, sessions, chatId, solWallets);
      if (!solWallet) {
        return ctx.editMessageText(
          '🥈 *Marinade - Sélection du Wallet*\n\n' +
            'Choisissez le wallet Solana à utiliser. Le wallet marqué ⭐ sera repris automatiquement ensuite.',
          {
            parse_mode: 'Markdown',
            ...stakingWalletSelectionKeyboard({
              wallets: solWallets,
              activeWalletId: sessions?.getData(chatId)?.stakingWalletId,
              callbackPrefix: 'marinade_select_wallet',
              backCallback: 'liquid_staking_menu',
            }),
          }
        );
      }

      await setPreferredStakingWallet(storage, sessions, chatId, solWallet.id);

      // Get mSOL balance
      const balanceResult = await MarinadeService.getBalance(solWallet.address);
      const mSolBalance = balanceResult.success ? balanceResult.balance : 0;

      // Get APY
      const apyResult = await MarinadeService.getApy();
      const apy = apyResult.success ? `${apyResult.apy.toFixed(2)}%` : 'N/A';

      // Get SOL price
      const prices = await getPricesEUR();
      const solPrice = prices.sol || 0;
      const mSolValueEUR = mSolBalance * solPrice;

      const tokenLabel = 'mSOL';
      const symbol = tokenLabel;

      // Build menu
      const keyboardRows = [
        [Markup.button.callback(`🔄 SOL → ${tokenLabel}`, `marinade_enter_${solWallet.id}`)],
        [
          Markup.button.callback('⚡ Sortie rapide', `marinade_exit_fast_${solWallet.id}`),
          Markup.button.callback('⏳ Sortie standard', `marinade_exit_standard_${solWallet.id}`),
        ],
      ];

      if (solWallets.length > 1) {
        keyboardRows.push([
          Markup.button.callback('⭐ Changer wallet', 'marinade_wallet_selection'),
        ]);
      }

      keyboardRows.push([Markup.button.callback('↩️ Retour', 'liquid_staking_menu')]);
      const keyboard = Markup.inlineKeyboard(keyboardRows);

      await ctx.editMessageText(
        '🥈 *Marinade*\n\n' +
          `💰 Solde ${tokenLabel} : *${mSolBalance.toFixed(4)} ${symbol}*\n` +
          `💶 Valeur : ${formatEUR(mSolValueEUR)}\n` +
          `📊 APY estimée : *${apy}*\n` +
          `⭐ Wallet : \`${solWallet.label || solWallet.address.slice(0, 8)}...\`\n\n` +
          '_Sortie rapide : swap immediate vers SOL (via Jupiter)\n' +
          'Sortie standard : delayed unstake avec claim necessaire_',
        {
          parse_mode: 'Markdown',
          ...keyboard,
        }
      );
    } catch (error) {
      logger.logError(error, { context: 'marinade_staking_menu', chatId: ctx.chat.id });
      ctx.editMessageText(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }
  });

  bot.action('marinade_wallet_selection', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const solWallets = await getSolWallets(storage, chatId);
    const activeWallet = await getPreferredStakingWallet(storage, sessions, chatId, solWallets);

    await ctx.editMessageText(
      '⭐ *Wallet Solana actif*\n\n' +
        'Choisissez le wallet à utiliser pour JitoSOL et Marinade. Le wallet actif est marqué ⭐.',
      {
        parse_mode: 'Markdown',
        ...stakingWalletSelectionKeyboard({
          wallets: solWallets,
          activeWalletId: activeWallet?.id,
          callbackPrefix: 'marinade_select_wallet',
          backCallback: 'marinade_staking',
        }),
      }
    );
  });

  bot.action(/^marinade_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    await setPreferredStakingWallet(storage, sessions, chatId, ctx.match[1]);

    await ctx.editMessageText(
      '✅ *Wallet actif mis à jour*\n\nIl sera utilisé automatiquement pour JitoSOL et Marinade.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➡️ Retour au Menu Marinade', 'marinade_staking')],
        ]),
      }
    );
  });

  // Enter Marinade (SOL -> mSOL)
  bot.action(/^marinade_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await setPreferredStakingWallet(storage, sessions, ctx.chat.id, ctx.match[1]);

    await ctx.editMessageText(
      '🔄 *Sol -> Marinade (mSOL)*\n\n' +
        'Entre le montant de SOL a staker :\n\n' +
        '_Utilise le format: 1.5 SOL_',
      { parse_mode: 'Markdown' }
    );
  });

  // Exit Fast (mSOL -> SOL swap)
  bot.action(/^marinade_exit_fast_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await setPreferredStakingWallet(storage, sessions, ctx.chat.id, ctx.match[1]);

    await ctx.editMessageText(
      '⚡ *Sortie rapide - mSOL -> SOL*\n\n' +
        'La sortie rapide utilise un swap via Jupiter.\n' +
        '_Frais environ 0.5% de spread_\n\n' +
        'Entre le montant de mSOL a convertir :',
      { parse_mode: 'Markdown' }
    );
  });

  // Exit Standard (delayed unstake)
  bot.action(/^marinade_exit_standard_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await setPreferredStakingWallet(storage, sessions, ctx.chat.id, ctx.match[1]);

    await ctx.editMessageText(
      '⏳ *Sortie standard - mSOL -> SOL*\n\n' +
        'La sortie standard utilise le delayed unstake Marinade.\n' +
        '_Delai: ~1 epoch (~2-3 jours)\n' +
        'Requiert un claim apres delai_\n\n' +
        'Entre le montant de mSOL a unstaker :',
      { parse_mode: 'Markdown' }
    );
  });

  // Claim pending exit
  bot.action(/^marinade_claim_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);

    await ctx.editMessageText(
      '💸 *Claim Marinade en attente*\n\n' + 'Recherche des claims disponibles...',
      { parse_mode: 'Markdown' }
    );
  });

  logger.info('Marinade handlers initialized', { service: 'staking' });
}
