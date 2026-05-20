import { Markup } from 'telegraf';
import { JitoService } from '../../../../modules/staking/jito.js';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { formatEUR, getPricesEUR } from '../../../../shared/price.js';
import { logger } from '../../../../shared/logger.js';
import { syncJitoUnstakes } from './sync.js';
import { sendWalletKeysFile } from '../../wallet/key-file.js';

async function sendJitoWalletKeys(ctx, storage, chatId, walletId) {
  const wallet = await storage.getWalletWithKey(chatId, walletId);
  if (!wallet || wallet.isCorrupted) {
    throw new Error('Wallet JitoSOL introuvable ou corrompu');
  }

  await sendWalletKeysFile(ctx, wallet, storage, { scope: 'jitosol' });
}

export function setupJitoMenuHandlers(bot, storage, walletService, sessions) {
  bot.action('jito_staking', async (ctx) => {
    await safeAnswerCbQuery(ctx);

    try {
      const chatId = ctx.chat.id;
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === 'sol');

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking JitoSOL.",
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      const solWalletId = sessions.getData(chatId)?.stakingWalletId;
      let solWallet;

      if (solWalletId) {
        solWallet = solWallets.find((w) => w.id === solWalletId);
      }

      if (!solWallet) {
        if (solWallets.length > 1) {
          const buttons = solWallets.map((w) => [
            Markup.button.callback(
              `${w.label || w.address.slice(0, 8)}...`,
              `jito_select_wallet_${w.id}`
            ),
          ]);
          buttons.push([Markup.button.callback('↩️ Retour', 'liquid_staking_menu')]);

          return ctx.editMessageText(
            '💎 *JitoSOL - Sélection du Wallet*\n\n' +
              'Plusieurs wallets Solana détectés. Lequel souhaitez-vous utiliser ?',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
          );
        }
        solWallet = solWallets[0];
        sessions.updateData(chatId, { stakingWalletId: solWallet.id });
        await sendJitoWalletKeys(ctx, storage, chatId, solWallet.id);
      }

      const balanceResult = await JitoService.getBalance(solWallet.address);
      const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
      const rateSol = balanceResult.success ? balanceResult.rateSol : 1.127;
      const valueSOL = jitoBalance * rateSol;
      const initialSOL = jitoBalance;
      const gainsSOL = valueSOL - initialSOL;

      const apyResult = await JitoService.getApy();
      const apy = apyResult.success ? `${apyResult.apy.toFixed(2)}%` : 'N/A';

      const prices = await getPricesEUR();
      const solPrice = prices.sol || 0;
      const jitoValueEUR = valueSOL * solPrice;
      const gainsEUR = gainsSOL * solPrice;

      const keyboardRows = [
        [Markup.button.callback('🔄 Déposer (SOL → JitoSOL)', 'jito_enter_select')],
        [Markup.button.callback('💸 Retirer (JitoSOL → SOL)', 'jito_withdraw')],
      ];

      await syncJitoUnstakes(chatId, storage);

      const unstakeRequests = await storage.getUnstakeRequests(chatId);
      const pendingUnstakes = unstakeRequests.filter((r) => r.walletAddress === solWallet.address);

      if (pendingUnstakes.length > 0) {
        const callbackData =
          pendingUnstakes.length === 1
            ? `jito_unstake_status_${pendingUnstakes[0].id}`
            : 'jito_unstake_list';
        keyboardRows.push([
          Markup.button.callback(`⏳ Suivre mon Unstake (${pendingUnstakes.length})`, callbackData),
        ]);
      }

      if (solWallets.length > 1) {
        keyboardRows.push([
          Markup.button.callback('💳 Changer de wallet', 'jito_wallet_selection'),
        ]);
      }

      keyboardRows.push([Markup.button.callback('↩️ Retour', 'liquid_staking_menu')]);

      const keyboard = Markup.inlineKeyboard(keyboardRows);

      await ctx.editMessageText(
        '🥇 *JitoSOL - Liquid Staking*\n' +
          '━━━━━━━━━━━━\n' +
          `💰 *Solde* : \`${jitoBalance.toFixed(6)}\` JitoSOL\n` +
          `📊 *Valeur* : \`${valueSOL.toFixed(6)}\` SOL\n` +
          `💶 *Estimation* : \`${formatEUR(jitoValueEUR)}\`\n` +
          '━━━━━━━━━━━━\n' +
          '📈 *Performances*\n' +
          `Gain Total : \`+${gainsSOL.toFixed(6)}\` SOL\n` +
          `Yield (est.) : \`+${formatEUR(gainsEUR)}\`\n` +
          '━━━━━━━━━━━━\n' +
          '📊 *Détails Techniques*\n' +
          `Taux : \`1 JitoSOL = ${rateSol.toFixed(4)} SOL\`\n` +
          `APY Actuel : *${apy}*\n\n` +
          '_Le rendement est automatiquement ajouté à la valeur du token (LST)._',
        {
          parse_mode: 'Markdown',
          ...keyboard,
        }
      );
    } catch (error) {
      if (error.message && error.message.includes('message is not modified')) {
        return;
      }
      logger.logError(error, { context: 'jito_staking_menu', chatId: ctx.chat.id });
      ctx.editMessageText(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }
  });

  bot.action('jito_wallet_selection', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === 'sol');

    const buttons = solWallets.map((w) => [
      Markup.button.callback(
        `${w.label || w.address.slice(0, 8)}...`,
        `jito_select_wallet_${w.id}`
      ),
    ]);
    buttons.push([Markup.button.callback('↩️ Retour', 'jito_staking')]);

    await ctx.editMessageText(
      '💳 *Sélection du Wallet Solana*\n\nChoisissez le wallet à utiliser pour JitoSOL :',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  bot.action(/^jito_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    sessions.setData(chatId, { ...sessions.getData(chatId), stakingWalletId: walletId });
    await sendJitoWalletKeys(ctx, storage, chatId, walletId);

    await ctx.editMessageText(
      '✅ *Wallet sélectionné*\n\nLe bot va maintenant utiliser ce wallet pour JitoSOL.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➡️ Retour au Menu Jito', 'jito_staking')],
        ]),
      }
    );
  });
}
