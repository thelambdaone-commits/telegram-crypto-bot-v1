import { Markup } from 'telegraf';
import { ExchangeService } from '../../../modules/swap/exchange.service.js';
import {
  exchangeSymbolKeyboard,
  exchangeNetworkKeyboard,
  exchangeLinkKeyboard,
} from '../../keyboards/exchange.keyboards.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { CALLBACKS, CALLBACK_REGEX } from '../../constants/callbacks.js';
import { safeAnswerCbQuery, safeEditMessage } from '../../../shared/utils/telegram.js';
import { CHAIN_REGISTRY } from '../../../shared/chains.js';
import { getPricesEUR } from '../../../shared/price.js';
import { fr } from '../../messages/fr.js';
import { logger } from '../../../shared/logger.js';

// Trim a number to a readable, locale-free string.
const fmt = (n) => String(Number(Number(n).toPrecision(6)));

/**
 * No-KYC cross-chain exchange — KEYLESS via Trocador AnonPay.
 * Two-step pickers (coin → network) keep keyboards small. Reachable from the
 * main menu OR from a wallet (which pre-selects that wallet's coin as "from").
 * Before the link, a best-effort quote + network fee are shown. No funds handled.
 */
export function setupExchangeHandlers(bot, storage, walletService, sessions) {
  const exchange = new ExchangeService();

  const showFromSymbols = (ctx) =>
    safeEditMessage(ctx, fr.exchange.pickFrom, {
      parse_mode: 'HTML',
      ...exchangeSymbolKeyboard(exchange.listSymbols(), 'exch_fs_'),
    });

  // Show ALL symbols (incl. the from-symbol): same-symbol cross-network bridges
  // like USDT-ETH → USDT-TRON are a primary no-KYC use case. The exact from-coin
  // is excluded later, at the network step.
  const showToSymbols = (ctx, fromKey, intro) =>
    safeEditMessage(ctx, intro || fr.exchange.pickTo(exchange.symbolOf(fromKey)), {
      parse_mode: 'HTML',
      ...exchangeSymbolKeyboard(exchange.listSymbols(), 'exch_ts_'),
    });

  // Best-effort "devis + frais" lines. Never throws — the link must always show.
  async function quoteLines(chatId, fromKey, toKey, fromWallet, toAddress) {
    const lines = [];
    const fromSym = exchange.symbolOf(fromKey);
    const toSym = exchange.symbolOf(toKey);

    // Network fee to send the source coin to the deposit address. The fee is
    // paid in the from-wallet CHAIN's native coin (e.g. ETH for a USDT_eth send),
    // not the token symbol — label it with that native symbol.
    try {
      if (fromWallet) {
        // For a token source, estimate the actual token-transfer fee (costs more
        // than a bare native send); still paid in (and labelled with) the native.
        const tokenSym = fromKey !== exchange.walletChainFor(fromKey) ? fromSym : null;
        const fees = await walletService.estimateFees(chatId, fromWallet.id, toAddress, 0.001, tokenSym);
        const fee = fees?.average?.estimatedFee || fees?.average?.feeSOL || fees?.average?.feeTON;
        const feeSym = CHAIN_REGISTRY[fromWallet.chain]?.native || fromSym;
        if (fee && Number.isFinite(Number(fee))) lines.push(fr.exchange.netFee(fmt(fee), feeSym));
      }
    } catch (e) {
      logger.debug('[Exchange] fee estimate failed', { error: e.message });
    }

    // Quote: exact Trocador rate if an API key is set, else a market estimate
    // from our own EUR prices (keyless).
    let devis = null;
    if (exchange.isConfigured()) {
      try {
        const q = await exchange.getQuote(fromKey, toKey, 1);
        devis = fr.exchange.quoteExact(fromSym, fmt(q.amountOut), toSym, q.provider);
      } catch (e) {
        logger.debug('[Exchange] live quote failed', { error: e.message });
      }
    }
    if (!devis) {
      try {
        const prices = await getPricesEUR();
        const pf = prices[fromSym.toLowerCase()];
        const pt = prices[toSym.toLowerCase()];
        if (pf > 0 && pt > 0) devis = fr.exchange.quoteMarket(fromSym, fmt(pf / pt), toSym);
      } catch (e) {
        logger.debug('[Exchange] market estimate failed', { error: e.message });
      }
    }
    if (devis) lines.push(devis);
    return lines;
  }

  // Resolve the user's own receiving address, show the quote, hand back the link.
  async function finalize(ctx, fromKey, toKey) {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);
    const toChain = exchange.walletChainFor(toKey);
    const receiveWallet = wallets.find((w) => w.chain === toChain && !w.isCorrupted);
    if (!receiveWallet?.address) {
      const chainName = CHAIN_REGISTRY[toChain]?.name || String(toChain).toUpperCase();
      sessions.clearData(chatId);
      return safeEditMessage(ctx, fr.exchange.noWallet(chainName), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Nouveau wallet', CALLBACKS.CREATE_WALLET)],
          [Markup.button.callback('🏠 Menu', CALLBACKS.BACK_TO_MENU)],
        ]),
      });
    }

    let url;
    let altUrl;
    try {
      url = exchange.anonPayUrl({ fromKey, toKey, address: receiveWallet.address });
      altUrl = exchange.simpleSwapUrl({ fromKey, toKey });
    } catch (err) {
      logger.warn('[Exchange] link build failed', { error: err.message });
      sessions.clearData(chatId);
      return safeEditMessage(ctx, `👻 ${err.message}`, { parse_mode: 'HTML', ...mainMenuKeyboard() });
    }

    const fromChain = exchange.walletChainFor(fromKey);
    const fromWallet = wallets.find((w) => w.chain === fromChain && !w.isCorrupted);
    const lines = await quoteLines(chatId, fromKey, toKey, fromWallet, receiveWallet.address);

    sessions.clearData(chatId);
    const body =
      fr.exchange.ready(exchange.symbolOf(fromKey), exchange.symbolOf(toKey)) +
      (lines.length ? `\n\n${lines.join('\n')}` : '');
    await safeEditMessage(ctx, body, {
      parse_mode: 'HTML',
      ...exchangeLinkKeyboard(url, fr.exchange.openButton, altUrl),
    });
  }

  // Entry / "another pair" (main menu).
  bot.action(CALLBACKS.EXCHANGE, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    sessions.clearState(ctx.chat.id);
    sessions.clearData(ctx.chat.id);
    await showFromSymbols(ctx);
  });

  // Entry from a wallet: that wallet's coin is the "from" → jump to the to-step.
  bot.action(CALLBACK_REGEX.EXCHANGE_WALLET, async (ctx) => {
    const walletId = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    const wallet = (await storage.getWallets(ctx.chat.id)).find((w) => w.id === walletId);
    if (!wallet || !exchange.isSupported(wallet.chain)) return showFromSymbols(ctx);
    sessions.setData(ctx.chat.id, { exchangeFrom: wallet.chain });
    await showToSymbols(ctx, wallet.chain, fr.exchange.fromWallet(exchange.symbolOf(wallet.chain)));
  });

  // Step 1: chose the source coin symbol → network step, or straight to step 2.
  bot.action(CALLBACK_REGEX.EXCHANGE_FROM_SYM, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const coins = exchange.coinsForSymbol(ctx.match[1]);
    if (!coins.length) return showFromSymbols(ctx);
    if (coins.length === 1) {
      sessions.setData(ctx.chat.id, { exchangeFrom: coins[0].key });
      return showToSymbols(ctx, coins[0].key);
    }
    await safeEditMessage(ctx, fr.exchange.pickFromNet(ctx.match[1].toUpperCase()), {
      parse_mode: 'HTML',
      ...exchangeNetworkKeyboard(coins, 'exch_from_'),
    });
  });

  // Source network chosen → step 2.
  bot.action(CALLBACK_REGEX.EXCHANGE_FROM, async (ctx) => {
    const fromKey = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    if (!exchange.isSupported(fromKey)) return showFromSymbols(ctx);
    sessions.setData(ctx.chat.id, { exchangeFrom: fromKey });
    await showToSymbols(ctx, fromKey);
  });

  // Step 2: chose the destination symbol → network step, or finalize.
  bot.action(CALLBACK_REGEX.EXCHANGE_TO_SYM, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const fromKey = sessions.getData(ctx.chat.id)?.exchangeFrom;
    if (!fromKey) return showFromSymbols(ctx);
    // Exclude the exact from-coin (same coin+network can't be exchanged), but
    // keep its other networks so same-symbol bridges work.
    const coins = exchange.coinsForSymbol(ctx.match[1]).filter((c) => c.key !== fromKey);
    if (!coins.length) return showToSymbols(ctx, fromKey); // only network was the source itself
    if (coins.length === 1) return finalize(ctx, fromKey, coins[0].key);
    await safeEditMessage(ctx, fr.exchange.pickToNet(ctx.match[1].toUpperCase()), {
      parse_mode: 'HTML',
      ...exchangeNetworkKeyboard(coins, 'exch_to_'),
    });
  });

  // Destination network chosen → finalize.
  bot.action(CALLBACK_REGEX.EXCHANGE_TO, async (ctx) => {
    const toKey = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    const fromKey = sessions.getData(ctx.chat.id)?.exchangeFrom;
    if (!fromKey || !exchange.isSupported(toKey)) return showFromSymbols(ctx);
    await finalize(ctx, fromKey, toKey);
  });
}
