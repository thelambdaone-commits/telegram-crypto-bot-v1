import { Markup } from 'telegraf';
import { JitoService } from '../../../../modules/staking/jito.js';
import { mainMenuKeyboard, jitoUnstakeStatusKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { syncJitoUnstakes } from './sync.js';
import { formatAmount } from '../../../../shared/formatters.js';
import { logger } from '../../../../shared/logger.js';

export function setupJitoUnstakeHandlers(bot, storage, walletService, sessions) {
  bot.action('jito_unstake_list', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;

    await syncJitoUnstakes(chatId, storage);

    const requests = await storage.getUnstakeRequests(chatId);

    if (requests.length === 0) {
      return ctx.editMessageText("❌ Aucune demande d'unstake en cours.", {
        ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Retour', 'jito_staking')]]),
      });
    }

    const buttons = requests.map((r, i) => [
      Markup.button.callback(
        `🔹 Unstake #${i + 1} (${formatAmount(r.amount)} JitoSOL)`,
        `jito_unstake_status_${r.id}`
      ),
    ]);

    buttons.push([Markup.button.callback('↩️ Retour', 'jito_staking')]);

    await ctx.editMessageText(
      "⏳ *Vos demandes d'Unstake*\n\n" +
        `Vous avez *${requests.length}* demandes en cours de traitement par Jito.\n\n` +
        'Sélectionnez une demande pour voir les détails ou la réclamer :',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      }
    );
  });

  bot.action(/^jito_unstake_status_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];

    await ctx.editMessageText('⏳ *Synchronisation avec la blockchain Solana...*', {
      parse_mode: 'Markdown',
    });

    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find((r) => r.id === requestId);

      if (!request) {
        const wallets = await storage.getWallets(chatId);
        const solWallet = wallets.find((w) => w.chain === 'sol');

        if (solWallet) {
          const blockchainExits = await JitoService.getPendingStandardExits(solWallet.address);
          if (blockchainExits.success && blockchainExits.pending.length > 0) {
            let importedCount = 0;
            let lastNewRequestId = null;

            for (const exit of blockchainExits.pending) {
              const alreadyTracked = requests.some((r) => r.stakeAccountAddress === exit.address);
              if (!alreadyTracked) {
                const newRequest = await storage.addUnstakeRequest(chatId, {
                  amount: exit.amountSOL / 1.07,
                  walletId: solWallet.id,
                  walletAddress: solWallet.address,
                  stakeAccountAddress: exit.address,
                  status: exit.status,
                  label: 'Blockchain Auto-Import',
                });
                lastNewRequestId = newRequest.id;
                importedCount++;
              }
            }

            if (importedCount > 0) {
              return ctx.editMessageText(
                `✅ ${importedCount} demande(s) récupérée(s) de la blockchain.\n\nRéessayez d'ouvrir le menu.`,
                {
                  ...Markup.inlineKeyboard([
                    [
                      Markup.button.callback(
                        '➡️ Retour',
                        importedCount === 1
                          ? `jito_unstake_status_${lastNewRequestId}`
                          : 'jito_staking'
                      ),
                    ],
                  ]),
                }
              );
            }
          }
        }
        return ctx.editMessageText('❌ Demande non trouvée.', mainMenuKeyboard());
      }

      const blockchainStatus = await JitoService.getPendingStandardExits(
        request.walletAddress,
        request.stakeAccountAddress
      );
      let canClaim = false;
      let timerText = '';

      if (blockchainStatus.success && blockchainStatus.pending.length > 0) {
        const matching =
          blockchainStatus.pending.find((p) => p.address === request.stakeAccountAddress) ||
          blockchainStatus.pending[0];

        if (!request.stakeAccountAddress && matching.address) {
          await storage.updateUnstakeRequest(chatId, request.id, {
            stakeAccountAddress: matching.address,
            status: matching.status,
            estimatedAvailableAt: matching.estimatedAvailableAt,
          });
          request.stakeAccountAddress = matching.address;
        }

        if (matching.status === 'ready') {
          canClaim = true;
        } else {
          const now = new Date();
          const availableAt = new Date(
            matching.estimatedAvailableAt || request.estimatedAvailableAt
          );
          const diffMs = availableAt - now;
          canClaim = diffMs <= 0;

          if (!canClaim) {
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (days === 0 && hours === 0 && minutes === 0) {
              timerText = 'Quelques instants...';
            } else {
              timerText = `${days}j ${hours}h ${minutes}m`;
            }
          }
        }
      } else {
        const now = new Date();
        const availableAt = new Date(request.estimatedAvailableAt);
        const diffMs = availableAt - now;
        canClaim = diffMs <= 0;
        if (!canClaim) {
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

          if (days === 0 && hours === 0 && minutes === 0) {
            timerText = 'Quelques instants...';
          } else {
            timerText = `${days}j ${hours}h ${minutes}m`;
          }
        }
      }

      const amountSOL = request.amount * (request.rateSol || 1.07);

      const currentEpoch =
        blockchainStatus.success && blockchainStatus.epochInfo
          ? blockchainStatus.epochInfo.epoch
          : 'N/A';

      await ctx.editMessageText(
        '⏳ *Statut de votre Unstake*\n' +
          '━━━━━━━━━━━━\n' +
          `📥 *Montant* : \`${formatAmount(request.amount)}\` JitoSOL\n` +
          `📤 *Valeur* : \`${formatAmount(amountSOL)}\` SOL\n` +
          `💼 *Wallet* : \`${request.walletAddress.slice(0, 8)}...\`\n` +
          `⛓ *Stake Acc* : ${request.stakeAccountAddress ? `\`${request.stakeAccountAddress}\`` : '_Non détecté_'}\n` +
          '━━━━━━━━━━━━\n' +
          '📊 *Progression*\n' +
          `Statut : *${canClaim ? '✅ Prêt à être réclamé' : '⛓ Désactivation en cours'}*\n` +
          `Disponibilité : ${canClaim ? '*Maintenant*' : `\`${timerText}\``}\n` +
          `Epoch Actuelle : \`${currentEpoch}\`\n` +
          '━━━━━━━━━━━━\n\n' +
          (canClaim
            ? '✅ *Vos SOL sont prêts !*\n\nCliquez sur le bouton ci-dessous pour les transférer immédiatement vers votre wallet.'
            : "💡 *Note* : Le retrait standard n'est pas automatique. Une fois le délai écoulé, un bouton **Réclamer** apparaîtra ici pour vous permettre de récupérer vos SOL.") +
          (!request.stakeAccountAddress
            ? "\n\n⚠️ *Attention* : Le bot ne trouve pas votre compte de stake sur la blockchain. Si vous l'avez, vous pouvez le saisir manuellement."
            : '') +
          (request.stakeAccountAddress === request.walletAddress
            ? '\n\n❌ *Erreur détectée* : Vous avez lié votre adresse de Wallet au lieu de votre compte de Stake. Utilisez le bouton ci-dessous pour corriger.'
            : ''),
        {
          parse_mode: 'Markdown',
          ...jitoUnstakeStatusKeyboard(
            requestId,
            canClaim,
            !!request.stakeAccountAddress && request.stakeAccountAddress !== request.walletAddress
          ),
        }
      );
    } catch (error) {
      logger.logError(error, { context: 'jito.unstake.sync' });
      ctx.editMessageText(`❌ Erreur de synchronisation: ${error.message}`, mainMenuKeyboard());
    }
  });

  bot.action(/^jito_claim_unstake_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];

    await ctx.editMessageText('⏳ *Extraction des SOL depuis la blockchain...*');

    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find((r) => r.id === requestId);

      if (!request) throw new Error('Demande non trouvée.');

      if (!request.stakeAccountAddress || request.stakeAccountAddress === 'UNKNOWN') {
        throw new Error(
          "L'adresse du compte de stake est manquante. Veuillez rafraîchir le menu pour synchroniser avec la blockchain."
        );
      }

      const wallet = await storage.getWalletWithKey(chatId, request.walletId);

      const result = await JitoService.claimExitStandard(
        wallet.privateKey,
        request.stakeAccountAddress
      );

      if (result.success) {
        await storage.removeUnstakeRequest(chatId, requestId);
        await ctx.editMessageText(
          '✅ *SOL récupérés avec succès !*\n\n' +
            'Les SOL ont été transférés vers votre wallet.\n\n' +
            `🔗 [Voir la transaction](https://solscan.io/tx/${result.txHash})`,
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      } else {
        if (result.error && result.error.includes('not yet deactivated')) {
          return ctx.answerCbQuery(
            "⚠️ Le compte n'est pas encore totalement désactivé par le réseau.",
            { show_alert: true }
          );
        }
        throw new Error(result.error || 'Échec du retrait');
      }
    } catch (error) {
      logger.logError(error, { context: 'jito.unstake.claim' });
      ctx.reply(
        `❌ Erreur lors du retrait : ${error.message}\n\nAssurez-vous que l'epoch est bien terminée.`
      );
    }
  });

  bot.action(/^jito_unstake_manual_sync_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];
    const requests = await storage.getUnstakeRequests(chatId);
    const request = requests.find((r) => r.id === requestId);

    sessions.setData(chatId, { requestId, walletAddress: request?.walletAddress });
    sessions.setState(chatId, 'JITO_UNSTAKE_MANUAL_ADDRESS');

    await ctx.editMessageText(
      "✏️ *Saisie manuelle de l'adresse*\n\nVeuillez copier et coller l'adresse de votre **Stake Account** (vous pouvez la trouver sur Solscan dans l'historique de votre wallet) :",
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Annuler', `jito_unstake_status_${requestId}`)],
        ]),
      }
    );
  });

  bot.action(/^jito_unstake_auto_repair_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];

    await ctx.editMessageText('🔍 *Recherche de votre compte sur la blockchain...*', {
      parse_mode: 'Markdown',
    });

    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find((r) => r.id === requestId);
      if (!request) throw new Error('Demande non trouvée');

      const blockchainExits = await JitoService.getPendingStandardExits(request.walletAddress);

      if (blockchainExits.success && blockchainExits.pending.length > 0) {
        const found = blockchainExits.pending[0].address;
        await storage.updateUnstakeRequest(chatId, requestId, { stakeAccountAddress: found });

        await ctx.reply(
          `✅ Compte de stake détecté : \`${found}\`\n\nIl a été lié à votre demande. Vous pouvez maintenant retourner au statut pour réclamer vos SOL.`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⏳ Voir le statut', `jito_unstake_status_${requestId}`)],
            ]),
          }
        );
      } else {
        await ctx.reply(
          "❌ Aucun compte de stake n'a été détecté pour votre wallet.\n\nAssurez-vous que l'opération a bien été faite sur la blockchain (il peut y avoir un délai de quelques minutes).",
          {
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '✏️ Saisir manuellement',
                  `jito_unstake_manual_sync_${requestId}`
                ),
              ],
            ]),
          }
        );
      }
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });

  bot.action('jito_unstake_pending_info', async (ctx) => {
    await ctx.answerCbQuery(
      "⏳ Le protocole Jito libère les fonds à la fin de l'epoch (tous les 2-3 jours).",
      { show_alert: true }
    );
  });

  bot.action(/^jito_unstake_delete_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    try {
      await storage.removeUnstakeRequest(ctx.chat.id, requestId);
      await ctx.editMessageText(
        '🗑 *Demande supprimée.*\n\nVous pouvez maintenant en lancer une nouvelle qui sera réelle.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Menu JitoSOL', 'jito_staking')]]),
        }
      );
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });
}
