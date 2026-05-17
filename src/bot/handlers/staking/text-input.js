/**
 * Staking text input handlers
 * Handle amount input for staking operations
 */

import { Markup } from 'telegraf';
import { JitoService } from '../../../modules/staking/jito.js';
import { aaveProvider, ethLstProvider } from '../../../modules/staking/providers/registry.js';
import { getAaveChain, getEthStakingProvider } from '../../../core/staking.config.js';
import {
  mainMenuKeyboard,
} from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import {
  dailyVolumeCheck,
  formatDailyLimitMessage,
  recordDailyVolume,
} from '../../middlewares/security.middleware.js';
import { formatEUR, getPricesEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';
import { formatAmount } from '../../../shared/formatters.js';

export function setupStakingTextInput(bot, storage, walletService, sessions) {
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    const state = sessions.getState(chatId);

    if (!state) return next();

    if (text?.startsWith('/')) {
      sessions.clearState(chatId);
      sessions.clearData(chatId);
      return next();
    }

    if (state === 'JITO_ENTER_AMOUNT') {
      await handleJitoEnterAmount(ctx, text, storage, walletService, sessions);
      return;
    }

    if (state === 'JITO_EXIT_FAST_AMOUNT') {
      await handleJitoExitFastAmount(ctx, text, storage, walletService, sessions);
      return;
    }

    if (state === 'JITO_EXIT_STANDARD_AMOUNT') {
      await handleJitoExitStandardAmount(ctx, text, storage, walletService, sessions);
      return;
    }

    if (state === 'JITO_UNSTAKE_MANUAL_ADDRESS') {
      await handleJitoUnstakeManualAddress(ctx, text, storage, sessions);
      return;
    }

    if (state === 'AAVE_DEPOSIT_AMOUNT') {
      await handleAaveAmount(ctx, text, storage, walletService, sessions, 'deposit');
      return;
    }

    if (state === 'AAVE_WITHDRAW_AMOUNT') {
      await handleAaveAmount(ctx, text, storage, walletService, sessions, 'withdraw');
      return;
    }

    if (state === 'ETH_STAKE_DEPOSIT_AMOUNT') {
      await handleEthStakeAmount(ctx, text, storage, walletService, sessions, 'deposit');
      return;
    }

    if (state === 'ETH_STAKE_WITHDRAW_AMOUNT') {
      await handleEthStakeAmount(ctx, text, storage, walletService, sessions, 'withdraw');
      return;
    }

    return next();
  });

  bot.action('cancel_staking', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    sessions.clearData(chatId);

    await ctx.editMessageText('❌ Opération annulée.', {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  });

  bot.action('confirm_jito_enter', async (ctx) => {
    await handleJitoEnterConfirm(ctx, storage, walletService, sessions);
  });

  bot.action('confirm_jito_exit_fast', async (ctx) => {
    await handleJitoExitFastConfirm(ctx, storage, walletService, sessions);
  });

  bot.action('confirm_jito_exit_standard', async (ctx) => {
    await handleJitoExitStandardConfirm(ctx, storage, walletService, sessions);
  });

  bot.action('confirm_aave_deposit', async (ctx) => {
    await handleAaveConfirm(ctx, storage, sessions, 'deposit');
  });

  bot.action('confirm_aave_withdraw', async (ctx) => {
    await handleAaveConfirm(ctx, storage, sessions, 'withdraw');
  });

  bot.action('confirm_eth_stake_deposit', async (ctx) => {
    await handleEthStakeConfirm(ctx, storage, sessions, 'deposit');
  });

  bot.action('confirm_eth_stake_withdraw', async (ctx) => {
    await handleEthStakeConfirm(ctx, storage, sessions, 'withdraw');
  });

  bot.action('jito_exit_manual', async (ctx) => {
    await handleJitoExitManual(ctx, storage, walletService, sessions);
  });

  bot.action(/^jito_exit_quick_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const percentage = parseInt(ctx.match[1], 10) / 100;
    await handleJitoExitQuickAmount(ctx, percentage, storage, walletService, sessions);
  });

  logger.info('Staking text input handlers initialized', { service: 'staking' });
}

async function handleEthStakeAmount(ctx, text, storage, walletService, sessions, action) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);
  const protocol = getEthStakingProvider(data?.protocolId);
  const walletId = data?.walletId;

  if (!protocol || !walletId) {
    sessions.clearState(chatId);
    sessions.clearData(chatId);
    return ctx.reply('❌ Session ETH staking expirée.', mainMenuKeyboard());
  }

  const cleaned = text.trim().replace(',', '.').toLowerCase();
  const isMax = action === 'withdraw' && ['max', 'tout', 'all', '100%'].includes(cleaned);
  const amount = isMax ? 0 : Number.parseFloat(cleaned);

  if (!isMax && (!Number.isFinite(amount) || amount <= 0)) {
    return ctx.reply(
      action === 'withdraw'
        ? '❌ Montant invalide. Entre un montant positif ou `max`.'
        : '❌ Montant invalide. Entre un montant positif en ETH.',
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet || wallet.isCorrupted) {
      throw new Error('Wallet introuvable ou clé illisible');
    }

    if (action === 'deposit') {
      const balance = await walletService.getBalance(chatId, walletId);
      const available = Number.parseFloat(balance.balance || '0');
      if (amount > available) {
        return ctx.reply(
          `❌ Solde ETH insuffisant.\n\nDisponible: *${formatAmount(available)} ETH*\nDemandé: *${formatAmount(amount)} ETH*`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    const quote = await ethLstProvider.quote({
      protocolId: protocol.id,
      amount: isMax ? 0 : amount,
    });

    if (action === 'deposit' && !quote.directDepositEnabled) {
      return ctx.reply(
        `❌ Dépôt direct désactivé pour ${protocol.displayName}.\n\nUtilise le front officiel ou un DEX avec liquidité ${protocol.receiptToken}.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true, ...mainMenuKeyboard() }
      );
    }

    sessions.updateData(chatId, { amount, max: isMax, quote });
    sessions.setState(
      chatId,
      action === 'deposit' ? 'ETH_STAKE_DEPOSIT_CONFIRM' : 'ETH_STAKE_WITHDRAW_CONFIRM'
    );

    const title = action === 'deposit' ? '⚡ Stake ETH' : '📤 Retrait ETH staking';
    const amountLabel = isMax ? `Tout le solde ${protocol.receiptToken}` : `${formatAmount(amount)} ${action === 'deposit' ? 'ETH' : protocol.receiptToken}`;

    await ctx.reply(
      `${title}\n\n` +
        `Provider: *${protocol.displayName}*\n` +
        `Token reçu: *${protocol.receiptToken}*\n` +
        `Montant: *${amountLabel}*\n` +
        `APY estimé: *${quote.apy}%*\n\n` +
        'Confirmer ?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '✅ Confirmer',
              action === 'deposit' ? 'confirm_eth_stake_deposit' : 'confirm_eth_stake_withdraw'
            ),
          ],
          [Markup.button.callback('❌ Annuler', 'cancel_staking')],
        ]),
      }
    );
  } catch (error) {
    logger.logError(error, { context: 'handleEthStakeAmount', chatId, action });
    return ctx.reply(`❌ Erreur ETH staking: ${error.message}`, mainMenuKeyboard());
  }
}

async function handleEthStakeConfirm(ctx, storage, sessions, action) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);
  const data = sessions.getData(chatId);
  const protocol = getEthStakingProvider(data?.protocolId);

  try {
    const wallet = await storage.getWalletWithKey(chatId, data?.walletId);
    if (!protocol || !wallet || wallet.isCorrupted) {
      throw new Error('Session ETH staking invalide ou wallet introuvable');
    }

    await ctx.editMessageText(`${Formatting.loading} *Transaction ETH staking en cours...*`, {
      parse_mode: 'Markdown',
    });

    if (action === 'deposit') {
      const volumeCheck = await dailyVolumeCheck(storage, chatId, data.amount, 'eth');
      if (!volumeCheck.allowed) {
        return ctx.editMessageText(formatDailyLimitMessage(volumeCheck, 'ETH'), {
          parse_mode: 'Markdown',
          ...mainMenuKeyboard(),
        });
      }
    }

    const result =
      action === 'deposit'
        ? await ethLstProvider.deposit({
            privateKey: wallet.privateKey,
            protocolId: protocol.id,
            amount: data.amount,
          })
        : await ethLstProvider.withdraw({
            privateKey: wallet.privateKey,
            protocolId: protocol.id,
            amount: data.amount,
            max: Boolean(data.max),
          });

    sessions.clearState(chatId);
    sessions.clearData(chatId);
    if (action === 'deposit') {
      await recordDailyVolume(storage, chatId, data.amount, 'eth');
    }

    await ctx.editMessageText(
      '✅ *Transaction confirmée*\n\n' +
        `Provider: *${protocol.displayName}*\n` +
        `Token: *${protocol.receiptToken}*\n` +
        `Montant: *${data.max ? 'max' : formatAmount(data.amount)}*\n` +
        `🔗 [Voir transaction](${result.explorerUrl})`,
      { parse_mode: 'Markdown', disable_web_page_preview: true, ...mainMenuKeyboard() }
    );
  } catch (error) {
    logger.logError(error, { context: 'handleEthStakeConfirm', chatId, action });
    await ctx.editMessageText(`❌ Erreur ETH staking: ${error.message}`, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  }
}

async function handleAaveAmount(ctx, text, storage, walletService, sessions, action) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);
  const chain = getAaveChain(data?.chainId);
  const tokenSymbol = data?.tokenSymbol;
  const walletId = data?.walletId;

  if (!chain || !tokenSymbol || !walletId) {
    sessions.clearState(chatId);
    sessions.clearData(chatId);
    return ctx.reply('❌ Session Aave expirée. Recommence depuis le menu staking.', mainMenuKeyboard());
  }

  const cleaned = text.trim().replace(',', '.').toLowerCase();
  const isMax = action === 'withdraw' && ['max', 'tout', 'all', '100%'].includes(cleaned);
  const amount = isMax ? 0 : Number.parseFloat(cleaned);

  if (!isMax && (!Number.isFinite(amount) || amount <= 0)) {
    return ctx.reply(
      action === 'withdraw'
        ? '❌ Montant invalide. Entre un montant positif ou `max`.'
        : '❌ Montant invalide. Entre un montant positif.',
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet || wallet.isCorrupted) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Wallet introuvable ou clé illisible.', mainMenuKeyboard());
    }

    if (action === 'deposit') {
      const balance = await walletService.getBalance(chatId, walletId, tokenSymbol);
      const available = Number.parseFloat(balance.balance || '0');
      if (amount > available) {
        return ctx.reply(
          `❌ Solde insuffisant.\n\nDisponible: *${formatAmount(available)} ${tokenSymbol}*\nDemandé: *${formatAmount(amount)} ${tokenSymbol}*`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    const quote = await aaveProvider.quote({
      chainId: chain.id,
      symbol: tokenSymbol,
      amount: isMax ? 0 : amount,
    });

    sessions.updateData(chatId, {
      amount,
      max: isMax,
      quote,
    });
    sessions.setState(chatId, action === 'deposit' ? 'AAVE_DEPOSIT_CONFIRM' : 'AAVE_WITHDRAW_CONFIRM');

    const title = action === 'deposit' ? '📥 Dépôt Aave V3' : '📤 Retrait Aave V3';
    const actionLabel = action === 'deposit' ? 'déposer' : 'retirer';
    const amountLabel = isMax ? `Tout le solde ${tokenSymbol}` : `${formatAmount(amount)} ${tokenSymbol}`;

    await ctx.reply(
      `${title}\n\n` +
        `Réseau: *${chain.displayName}*\n` +
        `Token: *${tokenSymbol}*\n` +
        `Montant: *${amountLabel}*\n` +
        `APY estimé: *${quote.apy}%* (${quote.apySource})\n\n` +
        `Confirmer ${actionLabel} sur Aave ?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmer', action === 'deposit' ? 'confirm_aave_deposit' : 'confirm_aave_withdraw')],
          [Markup.button.callback('❌ Annuler', 'cancel_staking')],
        ]),
      }
    );
  } catch (error) {
    logger.logError(error, { context: 'handleAaveAmount', chatId, action });
    return ctx.reply(`❌ Erreur Aave: ${error.message}`, mainMenuKeyboard());
  }
}

async function handleAaveConfirm(ctx, storage, sessions, action) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  const data = sessions.getData(chatId);
  const chain = getAaveChain(data?.chainId);
  const tokenSymbol = data?.tokenSymbol;

  try {
    const wallet = await storage.getWalletWithKey(chatId, data?.walletId);
    if (!chain || !tokenSymbol || !wallet || wallet.isCorrupted) {
      throw new Error('Session Aave invalide ou wallet introuvable');
    }

    await ctx.editMessageText(`${Formatting.loading} *Transaction Aave en cours...*`, {
      parse_mode: 'Markdown',
    });

    if (action === 'deposit') {
      const volumeCheck = await dailyVolumeCheck(storage, chatId, data.amount, 'usd');
      if (!volumeCheck.allowed) {
        return ctx.editMessageText(formatDailyLimitMessage(volumeCheck, tokenSymbol), {
          parse_mode: 'Markdown',
          ...mainMenuKeyboard(),
        });
      }
    }

    const result =
      action === 'deposit'
        ? await aaveProvider.deposit({
            privateKey: wallet.privateKey,
            chainId: chain.id,
            symbol: tokenSymbol,
            amount: data.amount,
          })
        : await aaveProvider.withdraw({
            privateKey: wallet.privateKey,
            chainId: chain.id,
            symbol: tokenSymbol,
            amount: data.amount,
            max: Boolean(data.max),
          });

    sessions.clearState(chatId);
    sessions.clearData(chatId);
    if (action === 'deposit') {
      await recordDailyVolume(storage, chatId, data.amount, 'usd');
    }

    const doneLabel = action === 'deposit' ? 'Dépôt effectué' : 'Retrait effectué';
    await ctx.editMessageText(
      `✅ *${doneLabel}*\n\n` +
        `Réseau: *${chain.displayName}*\n` +
        `Token: *${tokenSymbol}*\n` +
        `Montant: *${data.max ? 'max' : formatAmount(data.amount)} ${tokenSymbol}*\n` +
        `🔗 [Voir transaction](${result.explorerUrl})`,
      { parse_mode: 'Markdown', disable_web_page_preview: true, ...mainMenuKeyboard() }
    );
  } catch (error) {
    logger.logError(error, { context: 'handleAaveConfirm', chatId, action });
    await ctx.editMessageText(`❌ Erreur Aave: ${error.message}`, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  }
}

async function handleJitoExitQuickAmount(ctx, percentage, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);

  if (!data || !data.walletId) {
    await ctx.reply(
      '❌ Session expiree. Veuillez recommencer depuis le debut.',
      mainMenuKeyboard()
    );
    return;
  }

  const jitoBalance = Number(data.jitoBalance);
  if (!jitoBalance || jitoBalance <= 0) {
    await ctx.reply('❌ Solde JitoSOL introuvable.', mainMenuKeyboard());
    return;
  }

  const amount = Number((jitoBalance * percentage).toFixed(6));
  if (amount <= 0) {
    await ctx.reply('❌ Montant invalide.', mainMenuKeyboard());
    return;
  }

  try {
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;

    const quote = await JitoService.quoteExitFast(amount);
    const feeSOL = quote.fee || 0.000005;
    const priceImpact = quote.priceImpact !== undefined ? quote.priceImpact : 0;
    const amountOut = quote.amountOut || amount;
    const minReceived = quote.minReceived || amountOut * 0.995;
    const estimatedValueEUR = amountOut * jitoPriceEur;

    sessions.updateData(chatId, {
      amount: amount,
      quote: quote,
    });
    sessions.setState(chatId, 'JITO_EXIT_FAST_CONFIRM');

    const text =
      '📊 *Sortie rapide JitoSOL*\n\n' +
      `Montant envoye : *${formatAmount(amount)} JitoSOL*\n` +
      `Estimation recue : *${formatAmount(amountOut)} SOL*\n` +
      `Minimum recu : *${formatAmount(minReceived)} SOL*\n\n` +
      `⛽ Frais reseau : *${feeSOL.toFixed(6)} SOL*\n` +
      `📉 Impact de prix : *${priceImpact.toFixed(2)}%*\n` +
      `💶 Valeur estimee : *${formatEUR(estimatedValueEUR)}*\n\n` +
      'Confirmer la conversion ?';

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmer', 'confirm_jito_exit_fast')],
        [Markup.button.callback('❌ Annuler', 'jito_staking')],
      ]),
    });
    } catch (error) {
      logger.logError(error, { context: 'handleJitoExitQuickAmount', chatId });
      ctx.reply('❌ Erreur : ' + error.message, mainMenuKeyboard());
    }
}

async function handleJitoEnterAmount(ctx, text, storage, walletService, sessions) {
  const chatId = ctx.chat.id;

  const amount = parseFloat(text.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Montant invalide.\n\nEntre un montant positif en SOL (ex: 1.5)', {
      parse_mode: 'Markdown',
    });
  }

  try {
    const data = sessions.getData(chatId);
    const walletId = data.walletId;
    const wallet = await storage.getWalletWithKey(chatId, walletId);

    if (!wallet) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Wallet non trouvé.', mainMenuKeyboard());
    }

    const solBalance = await walletService.getBalance(chatId, walletId);
    const balanceNum = parseFloat(solBalance.balance);

    if (amount > balanceNum) {
      return ctx.reply(
        `❌ Solde insuffisant.\n\nSolde actuel: ${formatAmount(balanceNum)} SOL\nMontant demandé: ${formatAmount(amount)} SOL`,
        { parse_mode: 'Markdown' }
      );
    }

    const quote = await JitoService.quoteEnter(amount);
    const prices = await getPricesEUR();
    const solPrice = prices.sol || 0;
    const jitoPriceEur = prices.jitosol || 0;
    const feeSOL = quote.fee || 0.000005;
    const totalFeeEUR = feeSOL * solPrice;
    const slippage = quote.priceImpact !== undefined ? `${quote.priceImpact.toFixed(2)}%` : 'N/A';
    const walletLabel = wallet?.label || wallet?.address?.slice(0, 8) + '...' || 'SOL';

    sessions.updateData(chatId, {
      amount: amount,
      quote: quote,
      walletId: wallet.id,
    });

    sessions.setState(chatId, 'JITO_ENTER_CONFIRM');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmer', 'confirm_jito_enter')],
      [Markup.button.callback('❌ Annuler', 'jito_staking')],
    ]);

    const networkFee = '0.000005';

    const amountOutDisplay = quote.amountOut.toFixed(6).replace(/\.?0+$/, '');
    const estimatedValueEUR = quote.amountOut * jitoPriceEur;

    await ctx.reply(
      '🔄 *Conversion SOL → JitoSOL*\n\n' +
        `💼 Wallet: *${walletLabel}*\n` +
        `📥 Montant envoyé: *${formatAmount(amount)} SOL*\n` +
        `📤 Montant estimé reçu: *${amountOutDisplay} JitoSOL*\n\n` +
        `⛽ Frais réseau: *${networkFee} SOL*\n` +
        `📉 Impact de prix: *${slippage}*\n\n` +
        `💶 Valeur estimée: ${formatEUR(estimatedValueEUR)}\n\n` +
        '━━━━━━━━━━━━\n\n' +
        '⚠️ Vérifiez le montant avant confirmation. La transaction ne pourra pas être annulée.\n' +
        "Le montant reçu peut varier légèrement au moment de l'exécution.",
      { parse_mode: 'Markdown', ...keyboard }
    );
    } catch (error) {
      logger.logError(error, { context: 'handleJitoEnterAmount', chatId });
      await ctx.reply(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
      sessions.clearState(chatId);
    }
}

async function handleJitoEnterConfirm(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  try {
    const data = sessions.getData(chatId);
    const walletId = data.walletId;
    const amount = data.amount;

    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      return ctx.editMessageText('❌ Wallet non trouvé.', {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    await ctx.editMessageText(`${Formatting.loading} *Stake en cours...*`, {
      parse_mode: 'Markdown',
    });

    const volumeCheck = await dailyVolumeCheck(storage, chatId, amount, 'sol');
    if (!volumeCheck.allowed) {
      return ctx.editMessageText(formatDailyLimitMessage(volumeCheck, 'SOL'), {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    const result = await JitoService.enter(wallet.privateKey, amount);

    if (!result.success) {
      return ctx.editMessageText(`❌ Erreur: ${result.error}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    const prices = await getPricesEUR();
    const solPrice = prices.sol || 0;
    const newBalance = await walletService.getBalance(chatId, walletId);
    const jitoBalanceResult = await JitoService.getBalance(wallet.address);

    await ctx.editMessageText(
      '✅ *Stake réussi!*\n\n' +
        `💰 Staked: ${formatAmount(amount)} SOL\n` +
        `📤 Reçu: ${formatAmount(result.amountOut)} JitoSOL\n` +
        `🔗 [Voir transaction](https://solscan.io/tx/${result.txHash})\n\n` +
        `💰 Nouveau solde SOL: ${formatAmount(parseFloat(newBalance.balance))}\n` +
        `📤 Solde JitoSOL: ${formatAmount(jitoBalanceResult.balance)}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true, ...mainMenuKeyboard() }
    );

    sessions.clearData(chatId);
    sessions.clearState(chatId);
    await recordDailyVolume(storage, chatId, amount, 'sol');
    } catch (error) {
      logger.logError(error, { context: 'handleJitoEnterConfirm', chatId });
      await ctx.editMessageText(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
      sessions.clearState(chatId);
    }
}

async function handleJitoExitFastAmount(ctx, text, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);
  const walletId = data.walletId;
  const jitoBalance = data.jitoBalance || 0;

  try {
    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Wallet non trouvé.', mainMenuKeyboard());
    }

    const cleanedText = text.trim().replace(',', '.');
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;

    let amount = 0;
    let inputLabel = '';

    // Check for EUR input (e.g., "10€", "10 €", "10")
    if (cleanedText.includes('€') || !cleanedText.includes('%')) {
      const eurMatch = cleanedText.replace(/[€$]/g, '').trim();
      const eurAmount = parseFloat(eurMatch);

      if (!isNaN(eurAmount) && eurAmount > 0 && !cleanedText.includes('%')) {
        // EUR input
        amount = eurAmount / jitoPriceEur;
        inputLabel = `${eurAmount}€ → ${formatAmount(amount)} JitoSOL`;
      } else if (isNaN(eurAmount) || eurAmount <= 0) {
        // Try as pure number (crypto input)
        const cryptoAmount = parseFloat(cleanedText);
        if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
          return ctx.reply(
            '❌ Montant invalide.\n\nEntre un montant positif :\n• \`0.10\` → 0.10 JitoSOL\n• \`10€\` → ~10€ en JitoSOL\n• \`50%\` → 50% du solde',
            { parse_mode: 'Markdown' }
          );
        }
        amount = cryptoAmount;
        inputLabel = `${formatAmount(amount)} JitoSOL`;
      }
    }

    // Check for percentage input (e.g., "50%", "100%")
    if (cleanedText.includes('%')) {
      const pctMatch = cleanedText.replace('%', '').trim();
      const percentage = parseFloat(pctMatch);

      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return ctx.reply(
          '❌ Pourcentage invalide.\n\nEntre un pourcentage entre 1 et 100 :\n• \`25%\` → 25% du solde\n• \`50%\` → 50% du solde\n• \`100%\` → tout le solde',
          { parse_mode: 'Markdown' }
        );
      }

      amount = jitoBalance * (percentage / 100);
      inputLabel = `${percentage}% du solde → ${formatAmount(amount)} JitoSOL`;
    }

    // If still no amount, try as pure crypto number
    if (amount === 0) {
      const cryptoAmount = parseFloat(cleanedText);
      if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
        return ctx.reply(
          '❌ Montant invalide.\n\nEntre un montant positif :\n• \`0.10\` → 0.10 JitoSOL\n• \`10€\` → ~10€ en JitoSOL\n• \`50%\` → 50% du solde',
          { parse_mode: 'Markdown' }
        );
      }
      amount = cryptoAmount;
      inputLabel = `${formatAmount(amount)} JitoSOL`;
    }

    if (amount > jitoBalance) {
      return ctx.reply(
        `❌ Solde JitoSOL insuffisant.\n\nSolde actuel: ${formatAmount(jitoBalance)} JitoSOL\nMontant demandé: ${formatAmount(amount)} JitoSOL\n\n` +
          'Utilise un pourcentage (ex: `50%`) ou un montant inférieur.',
        { parse_mode: 'Markdown' }
      );
    }

    const quote = await JitoService.quoteExitFast(amount);
    const feeSOL = quote.fee || 0.000005;
    const priceImpact = quote.priceImpact !== undefined ? quote.priceImpact : 0;
    const amountOut = quote.amountOut || 0;
    const minReceived = quote.minReceived || amountOut * 0.995;
    const walletLabel = wallet?.label || wallet?.address?.slice(0, 8) + '...' || 'SOL';
    const estimatedValueEUR = amount * jitoPriceEur;

    sessions.updateData(chatId, {
      amount: amount,
      quote: quote,
      walletId: wallet.id,
    });

    sessions.setState(chatId, 'JITO_EXIT_FAST_CONFIRM');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmer', 'confirm_jito_exit_fast')],
      [Markup.button.callback('❌ Annuler', 'jito_staking')],
    ]);

    const amountOutDisplay = amountOut.toFixed(6).replace(/\.?0+$/, '');

    await ctx.reply(
      '⚡ *Conversion JitoSOL → SOL*\n\n' +
        `💼 Wallet: *${walletLabel}*\n` +
        `📥 Montant envoyé: *${formatAmount(amount)} JitoSOL*\n` +
        `(~${formatEUR(estimatedValueEUR)})\n` +
        `📤 Montant estimé reçu: *${amountOutDisplay} SOL*\n` +
        `📉 Minimum reçu: *${formatAmount(minReceived)} SOL*\n\n` +
        `⛽ Frais réseau: *${feeSOL.toFixed(6)} SOL*\n` +
        `📉 Impact de prix: *${priceImpact.toFixed(2)}%*\n\n` +
        '━━━━━━━━━━━━\n\n' +
        '⚠️ Vérifiez le montant avant confirmation. La transaction ne pourra pas être annulée.\n' +
        "Le montant reçu peut varier légèrement au moment de l'exécution.",
      { parse_mode: 'Markdown', ...keyboard }
    );
    } catch (error) {
      logger.logError(error, { context: 'handleJitoExitFastAmount', chatId });
      await ctx.reply(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
      sessions.clearState(chatId);
    }
}

async function handleJitoExitManual(ctx, storage, walletService, sessions) {
  await safeAnswerCbQuery(ctx);
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);
  const jitoBalance = data.jitoBalance || 0;

  await ctx.reply(
    '✏️ *Saisie manuelle JitoSOL*\n\n' +
      `Votre solde : *${formatAmount(jitoBalance)} JitoSOL*\n\n` +
      'Entrez le montant que vous souhaitez retirer (en JitoSOL ou en €) :\n\n' +
      '_Exemple: 0.05 ou 10€_',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'jito_staking')]]),
    }
  );
}

async function handleJitoExitFastConfirm(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  try {
    const data = sessions.getData(chatId);
    const walletId = data.walletId;
    const amount = data.amount;

    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      return ctx.editMessageText('❌ Wallet non trouvé.', {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    await ctx.editMessageText('⚡ *Swap en cours...*', { parse_mode: 'Markdown' });

    const result = await JitoService.exitFast(wallet.privateKey, amount);

    if (!result.success) {
      return ctx.editMessageText(`❌ Erreur: ${result.error}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    const prices = await getPricesEUR();
    const newBalance = await walletService.getBalance(chatId, walletId);
    const jitoBalanceResult = await JitoService.getBalance(wallet.address);

    await ctx.editMessageText(
      '✅ *Swap réussi!*\n\n' +
        `💰 Converti: ${formatAmount(amount)} JitoSOL\n` +
        `📤 Reçu: ${formatAmount(result.amountOut)} SOL\n` +
        `🔗 [Voir transaction](https://solscan.io/tx/${result.txHash})\n\n` +
        `💰 Nouveau solde SOL: ${formatAmount(parseFloat(newBalance.balance))}\n` +
        `📤 Solde JitoSOL: ${formatAmount(jitoBalanceResult.balance)}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true, ...mainMenuKeyboard() }
    );

    sessions.clearData(chatId);
    sessions.clearState(chatId);
    } catch (error) {
      logger.logError(error, { context: 'handleJitoExitFastConfirm', chatId });
      await ctx.editMessageText(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
      sessions.clearState(chatId);
    }
}

async function handleJitoExitStandardConfirm(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  try {
    const data = sessions.getData(chatId);
    const walletId = data.walletId;
    const amount = data.amount;

    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      return ctx.editMessageText('❌ Wallet non trouvé.', {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    await ctx.editMessageText('⏳ *Unstake en cours...*', { parse_mode: 'Markdown' });

    const result = await JitoService.exitStandard(wallet.privateKey, amount);

    if (!result.success) {
      return ctx.editMessageText(`❌ Erreur: ${result.error}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    const stakeAddress = result.stakeAccountAddress || 'Inconnue';

    const request = await storage.addUnstakeRequest(chatId, {
      type: 'jitosol',
      amount,
      walletId,
      walletAddress: wallet.address,
      stakeAccountAddress: stakeAddress,
      txHash: result.txHash,
      rateSol: data.rateSol || 1.07,
      status: 'pending',
      createdAt: new Date().toISOString(),
      estimatedAvailableAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await ctx.editMessageText(
      '✅ *Unstake initié avec succès !*\n\n' +
        `📥 Montant: *${formatAmount(amount)} JitoSOL*\n` +
        `🏦 Compte de stake: \`${stakeAddress}\`\n` +
        '⏳ *Délai estimé:* ~2-3 jours (fin d\'epoch)\n\n' +
        '📌 *Prochaine étape:*\n' +
        "Une fois l'epoch terminée, utilise le menu Jito\n" +
        'pour réclamer tes SOL via "Claim Unstake".\n\n' +
        `🔗 [Voir transaction](https://solscan.io/tx/${result.txHash})`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏳ Suivre mon Unstake', `jito_unstake_status_${request.id}`)],
        ]),
      }
    );

    sessions.clearData(chatId);
    sessions.clearState(chatId);
  } catch (error) {
    logger.logError(error, { context: 'handleJitoExitStandardConfirm', chatId });
    await ctx.editMessageText(`❌ Erreur: ${error.message}`, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
    sessions.clearState(chatId);
  }
}

async function handleJitoExitStandardAmount(ctx, text, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);
  const jitoBalance = data.jitoBalance || 0;

  try {
    const cleanedText = text.trim().replace(',', '.');
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;

    let amount = 0;

    // Check for EUR input
    if (cleanedText.includes('€') || !cleanedText.includes('%')) {
      const eurMatch = cleanedText.replace(/[€$]/g, '').trim();
      const eurAmount = parseFloat(eurMatch);

      if (!isNaN(eurAmount) && eurAmount > 0 && !cleanedText.includes('%')) {
        amount = eurAmount / jitoPriceEur;
      } else if (isNaN(eurAmount) || eurAmount <= 0) {
        const cryptoAmount = parseFloat(cleanedText);
        if (!isNaN(cryptoAmount) && cryptoAmount > 0) {
          amount = cryptoAmount;
        }
      }
    }

    // Check for percentage
    if (cleanedText.includes('%')) {
      const pctMatch = cleanedText.replace('%', '').trim();
      const percentage = parseFloat(pctMatch);
      if (!isNaN(percentage) && percentage > 0 && percentage <= 100) {
        amount = jitoBalance * (percentage / 100);
      }
    }

    if (amount <= 0 || amount > jitoBalance) {
      return ctx.reply(
        `❌ Montant invalide ou solde insuffisant (${formatAmount(jitoBalance)} JitoSOL dispo).`
      );
    }

    const amountSOL = amount * (data.rateSol || 1.07);

    sessions.updateData(chatId, { amount });
    sessions.setState(chatId, 'JITO_EXIT_STANDARD_CONFIRM');

    await ctx.reply(
      '⚠️ *Confirmation Unstake Standard*\n\n' +
        `📥 Montant à retirer : *${formatAmount(amount)} JitoSOL*\n` +
        `📤 Valeur estimée : *${formatAmount(amountSOL)} SOL*\n\n` +
        "• *Délai* : 2-3 jours (fin d'epoch)\n\n" +
        "Confirmer l'opération ?",
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirmer l'Unstake", 'confirm_jito_exit_standard')],
          [Markup.button.callback('❌ Annuler', 'jito_withdraw')],
        ]),
      }
    );
    } catch (error) {
      logger.logError(error, { context: 'handleJitoExitStandardAmount', chatId });
      await ctx.reply(`❌ Erreur: ${error.message}`);
    }
}

async function handleJitoUnstakeManualAddress(ctx, text, storage, sessions) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);

  if (!data || !data.requestId) {
    return ctx.reply('❌ Session expirée.', mainMenuKeyboard());
  }

  const requestId = data.requestId;

  if (!text || text.length < 32) {
    return ctx.reply(
      '❌ Adresse invalide. Veuillez entrer une adresse Solana valide (Stake Account).'
    );
  }

  if (text === data.walletAddress) {
    return ctx.reply(
      "❌ Vous avez saisi votre propre adresse de Wallet.\n\nVeuillez saisir l'adresse du **Stake Account** (qui est différente). Vous pouvez la trouver sur Solscan dans les détails de votre transaction d'unstake."
    );
  }

  try {
    await storage.updateUnstakeRequest(chatId, requestId, { stakeAccountAddress: text });
    sessions.clearState(chatId);
    sessions.clearData(chatId);

    await ctx.reply(
      `✅ Adresse enregistrée !\n\nL'adresse \`${text}\` a été liée à votre demande d'unstake.\n\nVous pouvez maintenant retourner dans le menu de suivi pour réclamer vos SOL.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏳ Retour au statut', `jito_unstake_status_${requestId}`)],
        ]),
      }
    );
    } catch (error) {
      logger.logError(error, { context: 'handleJitoUnstakeManualAddress', chatId });
      await ctx.reply(`❌ Erreur lors de l'enregistrement : ${error.message}`);
    }
}

const Formatting = {
  loading: '⏳',
  success: '✅',
  error: '❌',
};
