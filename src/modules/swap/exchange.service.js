/**
 * ExchangeService — no-KYC cross-chain exchange via Trocador.
 *
 * Two paths, both no-KYC:
 *  - anonPayUrl(): KEYLESS. Builds a Trocador AnonPay link pre-filled with the
 *    pair + the user's own receiving address. The user opens it and completes a
 *    REAL exchange on Trocador (sends the source coin to a deposit address; the
 *    chosen coin lands at their address). No API key, no funds handled by us.
 *  - getQuote(): read-only rate preview via the /new_rate API. Needs
 *    TROCADOR_API_KEY. Optional enhancement; never moves funds.
 */
import { CHAIN_REGISTRY, CHAIN_EMOJIS } from '../../shared/chains.js';
import { TOKEN_CONFIGS } from '../../core/tokens.config.js';
import { config } from '../../core/config.js';
import * as trocador from './aggregators/trocador.aggregator.js';

// AnonPay hosted checkout. Keyless GET endpoint (docs: /en/anonpaydocumentation).
const ANONPAY_BASE = 'https://trocador.app/anonpay/';
// SimpleSwap: independent no-KYC exchanger, offered as a keyless fallback/compare
// link. Prefills from/to by base ticker (exact for native coins; tokens default
// to the provider's main network). No address prefill — Trocador stays primary.
const SIMPLESWAP_BASE = 'https://simpleswap.io/';

/**
 * Network labels Trocador uses, VERIFIED LIVE against the AnonPay endpoint
 * (every (ticker × network) below was confirmed to render the checkout instead
 * of "Invalid ticker_to/network_to or address parameter").
 * Trocador labels a coin by (ticker × network), and the label differs between a
 * chain's NATIVE coin and its TOKENS — and is frequently NOT "Mainnet":
 *   - native ETH = "ERC20", native BNB = "BEP20", native AVAX = "AVAXC",
 *     native ARB-chain ETH = "Arbitrum"; but Polygon tokens = "MATIC" while the
 *     native is ticker "pol" on "Mainnet" (see NATIVE_TICKER).
 * So we keep two maps:
 *   - CHAIN_NETWORK: the native coin's label per chain.
 *   - TOKEN_NETWORK: per-chain token overrides (by ticker, with a default).
 * A WRONG label here breaks the AnonPay link outright (Trocador rejects the
 * pair), so these are not cosmetic — keep them in sync with Trocador's catalog.
 */
export const CHAIN_NETWORK = {
  eth: 'ERC20',
  btc: 'Mainnet',
  sol: 'Mainnet',
  arb: 'Arbitrum',
  matic: 'Mainnet', // native Polygon = ticker "pol" (NATIVE_TICKER) on "Mainnet"
  op: 'Optimism',
  base: 'Base',
  avax: 'AVAXC',
  ltc: 'Mainnet',
  bch: 'Mainnet',
  xmr: 'Mainnet',
  zec: 'Mainnet',
  trx: 'Mainnet',
  ton: 'Mainnet',
  bsc: 'BEP20',
};

// Trocador tickers that differ from our native asset symbol (CHAIN_REGISTRY).
const NATIVE_TICKER = {
  matic: 'pol', // Polygon rebranded MATIC → POL; Trocador lists the native as "pol".
};

// Token (ERC-20/SPL/TRC-20/jetton) network label per chain. `default` applies to
// every token on that chain unless a ticker-specific entry overrides it. Chains
// absent here use the chain's native label (CHAIN_NETWORK) for their tokens too
// (arb→"Arbitrum", op→"Optimism", base→"Base", bsc→"BEP20").
export const TOKEN_NETWORK = {
  eth: { default: 'ERC20' },
  sol: { default: 'SOL' },
  trx: { default: 'TRC20' },
  ton: { default: 'TON' }, // jettons (USDT on TON); native TON stays "Mainnet"
  avax: { default: 'AVAXC' },
  matic: { default: 'MATIC' }, // Polygon tokens use "MATIC" (native uses "Mainnet")
};

// (chain → token tickers) Trocador does NOT list as a routable (ticker × network)
// pair — verified live. Excluded from the picker so it never shows a dead option:
//  - wrapped/native-elsewhere coins with no Trocador route (wSOL/mSOL/WETH-on-SOL,
//    SOL-on-ETH, WETH-on-BSC, USDT-on-Base, WBTC/DAI-on-Avalanche, USDC-on-Tron);
//  - ARB/OP governance tokens: Trocador only lists them on network "Mainnet"
//    (Ethereum-side), so routing them to an L2 address would deliver on the wrong
//    chain — excluded as a safety measure, not offered as an exchange target.
const UNSUPPORTED_TOKENS = {
  eth: ['sol'],
  trx: ['usdc'],
  sol: ['weth', 'msol', 'wsol'],
  bsc: ['weth'],
  arb: ['arb'],
  op: ['op'],
  base: ['usdt'],
  avax: ['wbtc', 'dai'],
};

function networkFor(chain, ticker, isToken) {
  if (!isToken) return CHAIN_NETWORK[chain];
  const t = TOKEN_NETWORK[chain];
  return (t && (t[ticker] || t.default)) || CHAIN_NETWORK[chain];
}

// Exchange-only assets that aren't wallet assets, so they're NOT in TOKEN_CONFIGS
// (the TON wallet provider holds native Toncoin only, no jettons). Quotable here
// because to Trocador a jetton is just a (ticker, network) pair.
// Only USDT exists on the TON network in Trocador's list (network "Toncoin").
// USDC and DAI on TON have NO Trocador route (verified against its coin list), so
// they're intentionally omitted — listing them would be a dead option.
const EXTRA_COINS = {
  usdt_ton: { ticker: 'usdt', network: 'TON', symbol: 'USDT', emoji: '💎', name: 'USDT · TON', walletChain: 'ton' },
};

/**
 * Build the exchange coin map from what the bot already supports: each chain's
 * native coin (CHAIN_REGISTRY) + every configured token (TOKEN_CONFIGS), plus the
 * exchange-only EXTRA_COINS. Auto-syncs when a token is added to TOKEN_CONFIGS.
 * Keys: native = chain key (`eth`); token = `<ticker>_<chain>` (`usdt_eth`).
 */
function buildCoins() {
  const coins = {};
  for (const chain of Object.keys(CHAIN_NETWORK)) {
    const meta = CHAIN_REGISTRY[chain] || {};
    const native = meta.native || chain.toUpperCase();
    const emoji = CHAIN_EMOJIS[chain] || '●';
    const nativeTicker = NATIVE_TICKER[chain] || native.toLowerCase();
    coins[chain] = {
      ticker: nativeTicker,
      network: networkFor(chain, nativeTicker, false),
      symbol: native,
      emoji,
      name: meta.name || chain.toUpperCase(),
      walletChain: chain, // chain whose wallet address receives this coin
    };
    for (const sym of Object.keys(TOKEN_CONFIGS[chain]?.tokens || {})) {
      if (UNSUPPORTED_TOKENS[chain]?.includes(sym.toLowerCase())) continue;
      coins[`${sym.toLowerCase()}_${chain}`] = {
        ticker: sym.toLowerCase(),
        network: networkFor(chain, sym.toLowerCase(), true),
        symbol: sym.toUpperCase(),
        emoji,
        name: `${sym.toUpperCase()} · ${meta.name || chain.toUpperCase()}`,
        walletChain: chain, // a token is received at the chain's native address
      };
    }
  }
  return { ...coins, ...EXTRA_COINS };
}

export const TROCADOR_COINS = buildCoins();

function symbolFor(chain) {
  return TROCADOR_COINS[chain]?.symbol || CHAIN_REGISTRY[chain]?.native || chain.toUpperCase();
}

// Display order + glyph for the symbol picker: natives → stablecoins → tokens.
// Optional polish only: a new token added to TOKEN_CONFIGS still appears in the
// picker automatically — it just sorts last with a generic 🪙 until listed here.
const SYMBOL_ORDER = [
  'BTC', 'ETH', 'SOL', 'TON', 'TRX', 'BNB', 'AVAX', 'MATIC', 'LTC', 'BCH', 'XMR', 'ZEC',
  'USDT', 'USDC', 'DAI', 'WBTC', 'WETH', 'LINK', 'UNI', 'ARB', 'OP', 'MSOL',
];
const SYMBOL_EMOJI = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', TON: '💎', TRX: '🟥', BNB: '🟡', AVAX: '🔺', MATIC: '⬡',
  LTC: 'Ł', BCH: '🅑', XMR: 'ɱ', ZEC: 'Ⓩ', USDT: '💵', USDC: '💵', DAI: '💵',
  WBTC: '₿', WETH: 'Ξ', LINK: '🔗', UNI: '🦄', ARB: '🔵', OP: '🔴', MSOL: '💧',
};

export class ExchangeService {
  constructor(aggregator = trocador) {
    this.aggregator = aggregator;
  }

  /** Whether quotes can run (API key present). */
  isConfigured() {
    return this.aggregator.hasApiKey();
  }

  /** Coins we can quote, for building the pickers. */
  listChains() {
    return Object.entries(TROCADOR_COINS).map(([chain, c]) => ({
      chain,
      symbol: symbolFor(chain),
      name: c.name || CHAIN_REGISTRY[chain]?.name || chain.toUpperCase(),
      emoji: c.emoji || CHAIN_EMOJIS[chain] || '●',
    }));
  }

  isSupported(chain) {
    return Boolean(TROCADOR_COINS[chain]);
  }

  /**
   * Unique coin symbols for the first (compact) picker, sorted natives →
   * stablecoins → tokens. Each carries its network count and, when there is only
   * one network, the direct coin key (so the network step is skipped).
   */
  listSymbols() {
    const bySymbol = new Map();
    for (const [key, c] of Object.entries(TROCADOR_COINS)) {
      if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, []);
      bySymbol.get(c.symbol).push(key);
    }
    const rank = (s) => {
      const i = SYMBOL_ORDER.indexOf(s);
      return i === -1 ? SYMBOL_ORDER.length : i;
    };
    return [...bySymbol.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([symbol, keys]) => ({
        symbol,
        emoji: SYMBOL_EMOJI[symbol] || '🪙',
        count: keys.length,
        singleKey: keys.length === 1 ? keys[0] : null,
      }));
  }

  /** Coin keys for a symbol, with the friendly chain name/emoji for the network step. */
  coinsForSymbol(symbol) {
    const sym = String(symbol).toUpperCase();
    return Object.entries(TROCADOR_COINS)
      .filter(([, c]) => c.symbol === sym)
      .map(([key, c]) => ({
        key,
        chainName: CHAIN_REGISTRY[c.walletChain]?.name || String(c.walletChain).toUpperCase(),
        emoji: CHAIN_EMOJIS[c.walletChain] || c.emoji || '●',
      }));
  }

  /** The wallet chain whose address receives a given exchange coin. */
  walletChainFor(key) {
    return TROCADOR_COINS[key]?.walletChain || null;
  }

  /** Display symbol for a coin key (e.g. 'usdt_eth' → 'USDT'). */
  symbolOf(key) {
    return TROCADOR_COINS[key]?.symbol || null;
  }

  /**
   * Build a keyless Trocador AnonPay link for a real no-KYC exchange. The user
   * opens it, sends the source coin to the shown deposit address, and receives
   * `toKey` at `address` (their own wallet). No API key, no funds handled here.
   * @param {{ fromKey: string, toKey: string, address: string }} p
   */
  anonPayUrl({ fromKey, toKey, address }) {
    const from = TROCADOR_COINS[fromKey];
    const to = TROCADOR_COINS[toKey];
    if (!from || !to) throw new Error('Crypto inconnue');
    if (fromKey === toKey) throw new Error('Choisis deux cryptos différentes.');
    if (!address) throw new Error('Adresse de réception manquante');

    const params = new URLSearchParams({
      ticker_to: to.ticker,
      network_to: to.network,
      address,
      ticker_from: from.ticker,
      network_from: from.network,
      bgcolor: 'True',
    });
    // TON receivers (native + jettons) require a memo/comment param; AnonPay
    // rejects the link with "Missing Memo Parameter" otherwise. "0" = no memo.
    if (to.walletChain === 'ton') params.set('memo', '0');
    const ref = config.exchange?.trocadorRef;
    if (ref) params.set('ref', ref);
    return `${ANONPAY_BASE}?${params.toString()}`;
  }

  /**
   * Keyless SimpleSwap link (independent no-KYC provider) as a fallback/compare
   * option. Prefills from/to by base ticker; no address prefill.
   */
  simpleSwapUrl({ fromKey, toKey }) {
    const from = TROCADOR_COINS[fromKey];
    const to = TROCADOR_COINS[toKey];
    if (!from || !to) throw new Error('Crypto inconnue');
    const params = new URLSearchParams({ from: from.ticker, to: to.ticker });
    return `${SIMPLESWAP_BASE}?${params.toString()}`;
  }

  /**
   * Read-only cross-chain quote.
   * @returns {Promise<{ fromChain, toChain, fromSymbol, toSymbol, amountIn,
   *   amountOut, rate, provider, rateMode }>}
   */
  async getQuote(fromChain, toChain, amountHuman) {
    const from = TROCADOR_COINS[fromChain];
    const to = TROCADOR_COINS[toChain];
    if (!from) throw new Error(`Échange non supporté pour ${String(fromChain).toUpperCase()}`);
    if (!to) throw new Error(`Échange non supporté pour ${String(toChain).toUpperCase()}`);
    if (fromChain === toChain) throw new Error('Choisis deux cryptos différentes.');

    const amount = Number.parseFloat(String(amountHuman).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');

    const rate = await this.aggregator.getRate({
      tickerFrom: from.ticker,
      networkFrom: from.network,
      tickerTo: to.ticker,
      networkTo: to.network,
      amountFrom: amount,
    });

    return {
      fromChain,
      toChain,
      fromSymbol: symbolFor(fromChain),
      toSymbol: symbolFor(toChain),
      amountIn: amount,
      amountOut: rate.amountTo,
      rate: rate.amountTo / amount,
      provider: rate.provider,
      rateMode: rate.rateMode,
    };
  }
}
