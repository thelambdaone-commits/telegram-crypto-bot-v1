/**
 * Marinade Staking Handler for Telegram
 * Handle Marinade (mSOL) staking operations
 */

import { Markup } from 'telegraf';
import { MarinadeService } from '../../../modules/staking/marinade.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { formatEUR, getPricesEUR } from '../../../shared/price.js';

export function setupMarinadeHandlers(bot, storage, walletService) {
  // Show Marinade staking menu
  bot.action('marinade_staking', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    
    try {
      const chatId = ctx.chat.id;
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === 'sol');

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          '❌ Tu n\'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking Marinade.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      const solWallet = solWallets[0];
      
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
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(`🔄 SOL → ${tokenLabel}`, `marinade_enter_${solWallet.id}`),
        ],
        [
          Markup.button.callback('⚡ Sortie rapide', `marinade_exit_fast_${solWallet.id}`),
          Markup.button.callback('⏳ Sortie standard', `marinade_exit_standard_${solWallet.id}`),
        ],
        [
          Markup.button.callback('↩️ Retour', 'liquid_staking_menu'),
        ],
      ]);

      await ctx.editMessageText(
        '🥈 *Marinade*\n\n' +
        `💰 Solde ${tokenLabel} : *${mSolBalance.toFixed(4)} ${symbol}*\n` +
        `💶 Valeur : ${formatEUR(mSolValueEUR)}\n` +
        `📊 APY estimee : *${apy}*\n\n` +
        '_Sortie rapide : swap immediate vers SOL (via Jupiter)\n' +
        'Sortie standard : delayed unstake avec claim necessaire_',
        {
          parse_mode: 'Markdown',
          ...keyboard,
        }
      );
    } catch (error) {
      console.error('Marinade staking menu error:', error);
      ctx.editMessageText(
        `❌ Erreur: ${error.message}`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }
  });

  // Enter Marinade (SOL -> mSOL)
  bot.action(/^marinade_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const walletId = ctx.match[1];
    
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
    const walletId = ctx.match[1];
    
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
    const walletId = ctx.match[1];
    
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
      '💸 *Claim Marinade en attente*\n\n' +
      'Recherche des claims disponibles...',
      { parse_mode: 'Markdown' }
    );
  });

  console.log('[MARINADE_HANDLERS] Loaded');
}