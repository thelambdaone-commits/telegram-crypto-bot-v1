import { Markup } from 'telegraf';
import {
  walletListKeyboard,
  feeSelectionKeyboard,
  confirmationKeyboard,
  mainMenuKeyboard,
  tokenSelectionKeyboard,
  chainHasTokens,
  addressAnalyzedKeyboard,
  cancelKeyboard,
} from '../../keyboards/index.js';
import { safeAnswerCbQuery, safeEditMessage, escapeHtml } from '../../utils.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { convertToEUR, formatEUR } from '../../../shared/price.js';
import { formatCryptoAmount } from '../../ui/formatters.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';
import { formatTxDetails, handleSendError } from './helpers.js';
import { CALLBACKS, CALLBACK_REGEX } from '../../constants/callbacks.js';
import { getTransactionExplorerUrl } from '../../../shared/explorer.js';

export function setupSendActions(bot, storage, walletService, sessions) {
  // Send funds menu - Step 1: Select source wallet
  bot.action(CALLBACKS.SEND_FUNDS, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.editMessageText(`<b>${escapeHtml(MESSAGES.noWallets)}</b>`, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }

    ctx.editMessageText(
      `${EMOJIS.send} <b>Envoyer des fonds</b>\n\nDepuis quel wallet veux-tu envoyer ?`,
      {
        parse_mode: 'HTML',
        ...walletListKeyboard(wallets, 'send_from_'),
      }
    );
  });

  // Select source wallet - Step 2: Check if token selection is needed
  bot.action(CALLBACK_REGEX.SEND_FROM, async (ctx) => {
    const walletId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      return ctx.editMessageText('😕 Wallet non trouvé', mainMenuKeyboard());
    }

    sessions.setData(chatId, { selectedWalletId: walletId, selectedChain: wallet.chain });

    // Any chain that has tokens (USDC/USDT/…) offers a token choice; native-only
    // chains (BTC, LTC, XMR, …) go straight to the address step.
    if (chainHasTokens(wallet.chain)) {
      ctx.editMessageText(`🚀 <b>Envoi depuis ${escapeHtml(wallet.label)}</b>\n\nSélectionne le token à envoyer :`, {
        parse_mode: 'HTML',
        ...tokenSelectionKeyboard(wallet.chain),
      });
    } else {
      // Native-only chains: go directly to address
      sessions.setState(chatId, 'ENTER_ADDRESS');
      ctx.editMessageText(
        `🚀 <b>Envoi depuis ${escapeHtml(wallet.label)}</b>\n\nColle l'adresse du destinataire :`,
        {
          parse_mode: 'HTML',
          ...cancelKeyboard(),
        }
      );
    }
  });

  // Token selected for Arbitrum
  bot.action(CALLBACK_REGEX.TOKEN_SELECT, async (ctx) => {
    const chain = ctx.match[1];
    const token = ctx.match[2];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    sessions.updateData(chatId, {
      selectedChain: chain,
      selectedToken: token === 'native' ? null : token,
    });
    sessions.setState(chatId, 'ENTER_ADDRESS');

    const chainSymbol = chain.toUpperCase();
    const tokenLabel = token === 'native' ? chainSymbol : token;

    ctx.editMessageText(
      `🚀 <b>Envoi ${escapeHtml(tokenLabel)} depuis ${chainSymbol}</b>\n\nColle l'adresse du destinataire :`,
      {
        parse_mode: 'HTML',
        ...cancelKeyboard(),
      }
    );
  });

  // Action for "Send to analyzed address" - address is stored in session
  bot.action(CALLBACK_REGEX.SEND_TO_ANALYZED, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const sessionData = sessions.getData(chatId);
    const address = sessionData?.analyzedAddress;

    if (!address) {
      return ctx.editMessageText(
        '⚠️ Adresse non trouvée. Réanalyse une adresse.',
        mainMenuKeyboard()
      );
    }

    const wallets = await storage.getWallets(chatId);
    const matchingWallets = wallets.filter((w) => w.chain === chain);

    if (matchingWallets.length === 0) {
      return ctx.editMessageText(
        `⚠️ <b>Aucun wallet ${chain.toUpperCase()}</b>\n\n` +
          `Tu n'as pas encore de wallet ${chain.toUpperCase()} pour envoyer à cette adresse.\n\n` +
          "Crées-en un d'abord !",
        { parse_mode: 'HTML', ...mainMenuKeyboard() }
      );
    }

    sessions.updateData(chatId, { toAddress: address, selectedChain: chain });

    ctx.editMessageText(
      `📬 <b>Envoyer à :</b>\n<code>${address}</code>\n\nDepuis quel wallet ${chain.toUpperCase()} ?`,
      {
        parse_mode: 'HTML',
        ...walletListKeyboard(matchingWallets, 'send_analyzed_from_'),
      }
    );
  });

  // Back from history view: restore the analysis page in place.
  // Registered BEFORE the regex below so "analyze_history_back" isn't captured as a chain.
  bot.action(CALLBACK_REGEX.ANALYZE_HISTORY_BACK, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
    if (!data?.analyzedMessage) {
      return safeEditMessage(ctx, '⚠️ Analyse expirée. Réanalyse une adresse.', mainMenuKeyboard());
    }

    // `analyzedMessage` is produced (as HTML) by send/text-input.js;
    // keep its parse_mode in sync with that producer.
    await safeEditMessage(ctx, data.analyzedMessage, {
      parse_mode: 'HTML',
      ...addressAnalyzedKeyboard(data.analyzedChain, data.analyzedAddress),
    });
  });

  // Transaction history for an analyzed address - replaces the analysis page in place
  bot.action(CALLBACK_REGEX.ANALYZE_HISTORY, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const sessionData = sessions.getData(chatId);
    const address = sessionData?.analyzedAddress;

    const backKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('↩️ Retour', 'analyze_history_back')],
    ]);

    if (!address) {
      return safeEditMessage(ctx, '⚠️ Adresse non trouvée. Réanalyse une adresse.', mainMenuKeyboard());
    }

    await safeEditMessage(ctx, '🔍 Recherche des transactions...', { parse_mode: 'HTML' });
    try {
      const txHistory = await walletService.getTransactionHistory(chain, address, 5);

      if (!txHistory || txHistory.length === 0) {
        return safeEditMessage(ctx, '📜 Aucune transaction trouvée.', {
          parse_mode: 'HTML',
          ...backKeyboard,
        });
      }

      let text = `📜 <b>${txHistory.length} dernières transactions (${chain.toUpperCase()})</b>\n\n`;
      for (const tx of txHistory) {
        const direction = tx.type === 'in' ? '📥' : '📤';
        const date = new Date(tx.timestamp).toLocaleDateString('fr-FR');
        text += `${direction} <b>${escapeHtml(formatCryptoAmount(tx.amount, chain))}</b>\n`;
        text += `📅 ${date}\n`;
        text += `🔗 <code>${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}</code>\n\n`;
      }

      await safeEditMessage(ctx, text, { parse_mode: 'HTML', ...backKeyboard });
    } catch (error) {
      await safeEditMessage(ctx, `❌ Impossible de récupérer l'historique : ${escapeHtml(error.message)}`, {
        parse_mode: 'HTML',
        ...backKeyboard,
      });
    }
  });

  // Select quick amount (All or 50%)
  bot.action(CALLBACK_REGEX.QUICK_AMOUNT, async (ctx) => {
    const type = ctx.match[1]; // all or 50
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
    const tokenSymbol = data.selectedToken;

    try {
      // Estimate fees first to calculate max sendable
      const fees = await walletService.estimateFees(
        chatId,
        data.selectedWalletId,
        data.toAddress,
        0.001,
        tokenSymbol
      );
      const estimatedFee = fees.slow.estimatedFee || fees.slow.feeSOL || 0;

      // Reserve the LARGEST tier fee, not the slow one: the user still picks the
      // speed after this step, and estimateAndValidate() re-checks the balance
      // against the `average` tier. Subtracting only the slow fee here makes
      // `amount + average_fee` overshoot the balance and trips a false
      // "Solde insuffisant" on every "Tout envoyer". Math.max keeps it correct
      // whatever tier ends up being selected/validated.
      const solReserveLamports = Math.max(
        Number(fees.slow?.fee) || 0,
        Number(fees.average?.fee) || 0,
        Number(fees.fast?.fee) || 0,
        5000
      );

      const balance = data.currentBalance;
      let amount;
      // True "send everything" sweep (0 dust). Only set for native SOL, where
      // the provider can compute the exact fee and leave the wallet at 0.
      let isMaxSend = false;

      if (type === 'all') {
        if (data.selectedChain === 'sol' && !tokenSymbol && data.currentBalanceLamports) {
          // Provisional sweep estimate (balance − base fee); the exact amount
          // for the chosen speed is locked in the fee_ handler, and the provider
          // does the authoritative balance − exact-fee sweep at broadcast.
          const amountLamports = Math.max(0, Number(data.currentBalanceLamports) - 5000);
          amount = amountLamports / 1e9;
          isMaxSend = true;
        } else if (tokenSymbol) {
          amount = balance;
        } else {
          amount = Math.max(0, balance - Number.parseFloat(estimatedFee));
        }
      } else if (type === '50') {
        if (data.selectedChain === 'sol' && !tokenSymbol && data.currentBalanceLamports) {
          const amountLamports = Math.max(
            0,
            Math.floor(Number(data.currentBalanceLamports) * 0.5) - solReserveLamports
          );
          amount = amountLamports / 1e9;
        } else if (tokenSymbol) {
          amount = balance * 0.5;
        } else {
          amount = Math.max(0, balance * 0.5 - Number.parseFloat(estimatedFee) * 0.5);
        }
      }

      if (amount <= 0) {
        const symbol = tokenSymbol || data.selectedChain.toUpperCase();
        return ctx.editMessageText(
          `💸 Solde insuffisant pour couvrir les frais.\n\nFrais estimés : ${escapeHtml(String(estimatedFee))} ${escapeHtml(symbol)}`,
          { parse_mode: 'HTML', ...mainMenuKeyboard() }
        );
      }

      sessions.updateData(chatId, { amount, isMaxSend });

      const actualFees = await walletService.estimateFees(
        chatId,
        data.selectedWalletId,
        data.toAddress,
        amount,
        tokenSymbol
      );
      sessions.updateData(chatId, { fees: actualFees });

      const displaySymbol = tokenSymbol || data.selectedChain.toUpperCase();
      const amountEUR = tokenSymbol
        ? await convertToEUR('usd', amount)
        : await convertToEUR(data.selectedChain, amount);

      ctx.editMessageText(
        '✨ <b>Montant sélectionné</b>\n\n' +
          `${type === 'all' ? '💯 Tout envoyer' : '50% du solde'}\n` +
          `💰 Montant : <b>${amount.toFixed(8)} ${escapeHtml(displaySymbol)}</b>\n` +
          `💶 Valeur : ${escapeHtml(formatEUR(amountEUR.valueEUR))}\n\n` +
          'Choisis la vitesse de transaction :',
        {
          parse_mode: 'HTML',
          ...feeSelectionKeyboard('slow'),
        }
      );
      sessions.setState(chatId, 'SELECT_FEE');
    } catch (error) {
      await handleSendError(ctx, error, mainMenuKeyboard);
    }
  });

  // Manual amount selection action
  bot.action(CALLBACKS.MANUAL_AMOUNT, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
    const label = data.amountType === 'native' ? data.selectedChain.toUpperCase() : 'Euros';

    ctx.editMessageText(
      '⌨️ <b>Saisie du montant</b>\n\n' + `Combien souhaites-tu envoyer (${escapeHtml(label)}) ?`,
      { parse_mode: 'HTML', ...cancelKeyboard() }
    );
    sessions.setState(chatId, 'ENTER_AMOUNT');
  });

  // Fee selection
  bot.action(CALLBACK_REGEX.FEE_SELECTION, async (ctx) => {
    const feeLevel = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
    const actualFeeLevel = feeLevel === 'auto' ? 'slow' : feeLevel;
    sessions.updateData(chatId, { feeLevel: actualFeeLevel });

    // For a SOL sweep, lock the amount to the exact balance − fee for the chosen
    // speed so the confirmation shows precisely what's sent (0 dust remainder).
    if (data.isMaxSend && data.selectedChain === 'sol' && !data.selectedToken) {
      try {
        const max = await walletService.getMaxSendable(
          chatId,
          data.selectedWalletId,
          actualFeeLevel
        );
        if (max && max.lamports > 0) {
          sessions.updateData(chatId, { amount: max.amount });
          data.amount = max.amount;
        }
      } catch {
        // Keep the provisional amount; the provider still sweeps exactly at send.
      }
    }

    const text = await formatTxDetails(data, actualFeeLevel);

    sessions.setState(chatId, 'CONFIRM_SEND');
    ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...confirmationKeyboard(),
    });
  });

  // Confirm send
  bot.action(CALLBACKS.CONFIRM_SEND, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
    const tokenSymbol = data.selectedToken;
    let pendingTxId;

    try {
      pendingTxId = await storage.addPendingTransaction(chatId, {
        walletId: data.selectedWalletId,
        toAddress: data.toAddress,
        amount: data.amount,
        chain: data.selectedChain,
        token: tokenSymbol,
      });

      await ctx.editMessageText(`${EMOJIS.loading} <b>Transaction en cours...</b>`, {
        parse_mode: 'HTML',
      });

      const sendMax = !!data.isMaxSend && data.selectedChain === 'sol' && !tokenSymbol;
      const result = await walletService.sendTransaction(
        chatId,
        data.selectedWalletId,
        data.toAddress,
        data.amount,
        data.feeLevel,
        tokenSymbol,
        { sendMax }
      );

      await storage.completePendingTransaction(chatId, pendingTxId, result.hash);

      auditLogger.log(AUDIT_ACTIONS.SEND_TX, chatId, {
        chain: data.selectedChain,
        token: tokenSymbol,
        amount: data.amount,
        toAddress: data.toAddress,
        txHash: result.hash,
      });

      const chain = data.selectedChain;
      const txUrl = getTransactionExplorerUrl(chain, result.hash);
      const hashUrl = txUrl || `https://blockchain.com/btc/tx/${result.hash}`;

      const symbol = result.symbol || data.selectedChain.toUpperCase();
      await ctx.editMessageText(
        `${EMOJIS.success} <b>Bravo ! Transaction envoyée</b>\n\n` +
          `💰 Montant: ${data.amount} ${escapeHtml(symbol)}\n` +
          `🔗 <a href="${hashUrl}">Voir sur l'explorateur</a>`,
        { parse_mode: 'HTML', disable_web_page_preview: true, ...mainMenuKeyboard() }
      );

      sessions.clearData(chatId);
      sessions.setState(chatId, 'IDLE');
    } catch (error) {
      if (pendingTxId) {
        await storage.removePendingTransaction(chatId, pendingTxId);
      }
      await handleSendError(ctx, error, mainMenuKeyboard);
    }
  });
}
