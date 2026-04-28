/**
 * Staking text input handlers
 * Handle amount input for staking operations
 */

import { Markup } from 'telegraf';
import { JitoService } from '../../../modules/staking/jito.js';
import { confirmationKeyboard, mainMenuKeyboard, stakingExitKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { formatEUR, getPricesEUR } from '../../../shared/price.js';

function formatAmount(amount) {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function setupStakingTextInput(bot, storage, walletService, sessions) {
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    const state = sessions.getState(chatId);

    if (!state) return;

    if (text?.startsWith('/')) {
      sessions.clearState(chatId);
      sessions.clearData(chatId);
      return;
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
  });

  bot.action('cancel_staking', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    sessions.clearData(chatId);

    await ctx.editMessageText(
      '❌ Opération annulée.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  });

  bot.action('confirm_jito_enter', async (ctx) => {
    await handleJitoEnterConfirm(ctx, storage, walletService, sessions);
  });

  bot.action('confirm_jito_exit_fast', async (ctx) => {
    await handleJitoExitFastConfirm(ctx, storage, walletService, sessions);
  });

  bot.action('jito_exit_manual', async (ctx) => {
    await handleJitoExitManual(ctx, storage, walletService, sessions);
  });

  bot.action(/^jito_exit_quick_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const percentage = parseInt(ctx.match[1], 10) / 100;
    await handleJitoExitQuickAmount(ctx, percentage, storage, walletService, sessions);
  });

  console.log('[STAKING_TEXT_INPUT] Loaded');
}

async function handleJitoExitQuickAmount(ctx, percentage, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const data = sessions.getData(chatId);

  if (!data || !data.walletId) {
    await ctx.reply('❌ Session expiree. Veuillez recommencer depuis le debut.', mainMenuKeyboard());
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
    const minReceived = quote.minReceived || (amountOut * 0.995);
    const estimatedValueEUR = amountOut * jitoPriceEur;

    sessions.setData(chatId, {
      ...data,
      amount: amount,
      quote: quote,
    });
    sessions.setState(chatId, 'JITO_EXIT_FAST_CONFIRM');

    const text = '📊 *Sortie rapide JitoSOL*\n\n' +
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
        [Markup.button.callback('❌ Annuler', 'jito_staking')]
      ])
    });
  } catch (error) {
    console.error('handleJitoExitQuickAmount error:', error);
    ctx.reply('❌ Erreur : ' + error.message, mainMenuKeyboard());
  }
}

async function handleJitoEnterAmount(ctx, text, storage, walletService, sessions) {
  const chatId = ctx.chat.id;

  const amount = parseFloat(text.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply(
      '❌ Montant invalide.\n\nEntre un montant positif en SOL (ex: 1.5)',
      { parse_mode: 'Markdown' }
    );
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

    sessions.setData(chatId, {
      ...data,
      amount: amount,
      quote: quote,
      wallet: wallet,
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
      'Le montant reçu peut varier légèrement au moment de l\'exécution.',
      { parse_mode: 'Markdown', ...keyboard }
    );
  } catch (error) {
    console.error('[JITO_ENTER_AMOUNT] Error:', error);
    await ctx.reply(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
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
      return ctx.editMessageText(
        '❌ Wallet non trouvé.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    await ctx.editMessageText(`${Formatting.loading} *Stake en cours...*`, { parse_mode: 'Markdown' });

    const result = await JitoService.enter(wallet.privateKey, amount);

    if (!result.success) {
      return ctx.editMessageText(
        `❌ Erreur: ${result.error}`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
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
  } catch (error) {
    console.error('[JITO_ENTER_CONFIRM] Error:', error);
    await ctx.editMessageText(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
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
    const minReceived = quote.minReceived || (amountOut * 0.995);
    const walletLabel = wallet?.label || wallet?.address?.slice(0, 8) + '...' || 'SOL';
    const estimatedValueEUR = amount * jitoPriceEur;

    sessions.setData(chatId, {
      ...data,
      amount: amount,
      quote: quote,
      wallet: wallet,
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
      'Le montant reçu peut varier légèrement au moment de l\'exécution.',
      { parse_mode: 'Markdown', ...keyboard }
    );
  } catch (error) {
    console.error('[JITO_EXIT_FAST_AMOUNT] Error:', error);
    await ctx.reply(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
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
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'jito_staking')]]) 
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
      return ctx.editMessageText(
        '❌ Wallet non trouvé.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    await ctx.editMessageText('⚡ *Swap en cours...*', { parse_mode: 'Markdown' });

    const result = await JitoService.exitFast(wallet.privateKey, amount);

    if (!result.success) {
      return ctx.editMessageText(
        `❌ Erreur: ${result.error}`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
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
    console.error('[JITO_EXIT_FAST_CONFIRM] Error:', error);
    await ctx.editMessageText(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
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
      return ctx.reply(`❌ Montant invalide ou solde insuffisant (${formatAmount(jitoBalance)} JitoSOL dispo).`);
    }

    const amountSOL = amount * (data.rateSol || 1.07);

    sessions.setData(chatId, { ...data, amount });
    sessions.setState(chatId, 'JITO_EXIT_STANDARD_CONFIRM');

    await ctx.reply(
      '⚠️ *Confirmation Unstake Standard*\n\n' +
      `📥 Montant à retirer : *${formatAmount(amount)} JitoSOL*\n` +
      `📤 Valeur estimée : *${formatAmount(amountSOL)} SOL*\n\n` +
      '• *Délai* : 2-3 jours (fin d\'epoch)\n\n' +
      'Confirmer l\'opération ?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmer l\'Unstake', 'confirm_jito_exit_standard')],
          [Markup.button.callback('❌ Annuler', 'jito_withdraw')]
        ])
      }
    );
  } catch (error) {
    console.error('[JITO_EXIT_STANDARD_AMOUNT] Error:', error);
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
    return ctx.reply('❌ Adresse invalide. Veuillez entrer une adresse Solana valide (Stake Account).');
  }

  if (text === data.walletAddress) {
    return ctx.reply('❌ Vous avez saisi votre propre adresse de Wallet.\n\nVeuillez saisir l\'adresse du **Stake Account** (qui est différente). Vous pouvez la trouver sur Solscan dans les détails de votre transaction d\'unstake.');
  }

  try {
    await storage.updateUnstakeRequest(chatId, requestId, { stakeAccountAddress: text });
    sessions.clearState(chatId);
    sessions.clearData(chatId);

    await ctx.reply(`✅ Adresse enregistrée !\n\nL'adresse \`${text}\` a été liée à votre demande d'unstake.\n\nVous pouvez maintenant retourner dans le menu de suivi pour réclamer vos SOL.`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('⏳ Retour au statut', `jito_unstake_status_${requestId}`)]])
    });
  } catch (error) {
    console.error('handleJitoUnstakeManualAddress error:', error);
    await ctx.reply(`❌ Erreur lors de l'enregistrement : ${error.message}`);
  }
}

const Formatting = {
  loading: '⏳',
  success: '✅',
  error: '❌',
};