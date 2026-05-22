import { Markup } from 'telegraf';
import { JitoService } from '../../../../modules/staking/jito.js';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { formatEUR, getPricesEUR } from '../../../../shared/price.js';
import { logger } from '../../../../shared/logger.js';
import { syncJitoUnstakes } from './sync.js';
import { sendWalletKeysFile } from '../../wallet/key-file.js';
import {
  formatStakingWalletLabel,
  getPreferredStakingWallet,
  getSolWallets,
  setPreferredStakingWallet,
  stakingWalletSelectionKeyboard,
} from '../wallet-selection.js';

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
      const solWallets = await getSolWallets(storage, chatId);

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking JitoSOL.",
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      let solWallet = await getPreferredStakingWallet(storage, sessions, chatId, solWallets);

      if (!solWallet) {
        if (solWallets.length > 1) {
          return ctx.editMessageText(
            '💎 *JitoSOL - Sélection du Wallet*\n\n' +
              'Choisissez le wallet Solana à utiliser. Le wallet marqué ⭐ sera repris automatiquement ensuite.',
            {
              parse_mode: 'Markdown',
              ...stakingWalletSelectionKeyboard({
                wallets: solWallets,
                activeWalletId: sessions.getData(chatId)?.stakingWalletId,
                callbackPrefix: 'jito_select_wallet',
                backCallback: 'liquid_staking_menu',
              }),
            }
          );
        }
        solWallet = solWallets[0];
        await setPreferredStakingWallet(storage, sessions, chatId, solWallet.id);
        await sendJitoWalletKeys(ctx, storage, chatId, solWallet.id);
      }

      const balanceResult = await JitoService.getBalance(solWallet.address);
      const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
      const rateSol = balanceResult.success ? balanceResult.rateSol : 1.127;
      const valueSOL = jitoBalance * rateSol;

      const apyResult = await JitoService.getApy();
      const apy = apyResult.success ? `${apyResult.apy.toFixed(2)}%` : 'N/A';

      const prices = await getPricesEUR();
      const solPrice = prices.sol || 0;
      const jitoValueEUR = valueSOL * solPrice;

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
        keyboardRows.push([Markup.button.callback('⭐ Changer wallet', 'jito_wallet_selection')]);
      }

      keyboardRows.push([Markup.button.callback('↩️ Retour', 'liquid_staking_menu')]);

      const keyboard = Markup.inlineKeyboard(keyboardRows);

      await ctx.editMessageText(
        '🥇 *JitoSOL - Liquid Staking*\n' +
          '━━━━━━━━━━━━\n' +
          `💰 *Solde* : \`${jitoBalance.toFixed(6)}\` JitoSOL\n` +
          `📊 *Équivalent* : \`${valueSOL.toFixed(6)}\` SOL\n` +
          `💶 *Estimation* : \`${formatEUR(jitoValueEUR)}\`\n` +
          '━━━━━━━━━━━━\n' +
          '📊 *Détails Techniques*\n' +
          `Taux : \`1 JitoSOL = ${rateSol.toFixed(4)} SOL\`\n` +
          `APY Actuel : *${apy}*\n\n` +
          `⭐ Wallet : \`${solWallet.label || solWallet.address.slice(0, 8)}...\`\n\n` +
          '_Le solde est en JitoSOL. L’équivalent SOL est calculé avec le taux actuel. Le gain personnel nécessite l’historique du dépôt._',
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
          callbackPrefix: 'jito_select_wallet',
          backCallback: 'jito_staking',
        }),
      }
    );
  });

  bot.action(/^jito_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    await setPreferredStakingWallet(storage, sessions, chatId, walletId);
    await sendJitoWalletKeys(ctx, storage, chatId, walletId);
    const wallet = await storage.getWalletById(chatId, walletId);
    const walletLabel = wallet ? formatStakingWalletLabel(wallet) : `Wallet ${walletId}`;

    await ctx.editMessageText(
      '✅ *Wallet actif mis à jour*\n\n' +
        `⭐ ${walletLabel}\n\n` +
        'Il sera utilisé automatiquement pour JitoSOL et Marinade.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➡️ Retour au Menu Jito', 'jito_staking')],
        ]),
      }
    );
  });
}
