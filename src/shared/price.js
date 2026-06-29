/**
 * Crypto price service using CoinGecko API
 * EUR only as per requirements
 */
import {
  COINGECKO_API,
  COIN_IDS,
  fetchWithFallback,
} from './coingecko.js';

let priceCache = {
  prices: {},
  lastUpdate: 0,
};

const CACHE_TTL = 60000; // 1 minute

/**
 * Clear price cache to force refresh
 */
export function clearPriceCache() {
  priceCache = { prices: {}, lastUpdate: 0 };
}

/**
 * Fetch current prices in EUR
 * @param {boolean} force - Force refresh, ignoring cache
 */
export async function getPricesEUR(force = false) {
  const now = Date.now();

  // Return cached prices if fresh (unless force is true)
  if (
    !force &&
    now - priceCache.lastUpdate < CACHE_TTL &&
    Object.keys(priceCache.prices).length > 0
  ) {
    return priceCache.prices;
  }

  try {
    const ids = Object.values(COIN_IDS).join(',');
    const response = await fetchWithFallback(`${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=eur`);

    if (!response.ok) {
      throw new Error('Erreur API CoinGecko');
    }

    const data = await response.json();

    // Derive every price key straight from COIN_IDS so the map can never drift
    // from the supported-coin list (add a coin to COIN_IDS → it gets a price).
    const prices = {};
    for (const [key, id] of Object.entries(COIN_IDS)) {
      prices[key] = data[id]?.eur || 0;
    }

    priceCache = { prices, lastUpdate: now };
    return priceCache.prices;
  } catch (error) {
    // Return cached or zeros on error
    if (Object.keys(priceCache.prices).length > 0) {
      return priceCache.prices;
    }
    return Object.fromEntries(Object.keys(COIN_IDS).map((k) => [k, 0]));
  }
}

/**
 * Convert crypto amount to EUR
 */
export async function convertToEUR(chain, amount) {
  const prices = await getPricesEUR();

  // Map L2 chains to ETH price if they use ETH as native currency
  let priceKey = chain;
  if (['arb', 'op', 'base'].includes(chain)) {
    priceKey = 'eth';
  }

  const price = prices[priceKey] || 0;
  return {
    amount,
    chain,
    priceEUR: price,
    valueEUR: amount * price,
  };
}

/**
 * Format EUR amount (with more decimals for small amounts)
 */
export function formatEUR(amount) {
  // Pour les petits montants, afficher plus de décimales
  const decimals = amount >= 0.01 ? 2 : amount >= 0.0001 ? 4 : 5;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatPriceUpdateDate(date = new Date()) {
  const datePart = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  }).format(date);

  return `${datePart} à ${timePart}`;
}

/**
 * Single source of truth for the price list AND the graph picker grid. Each coin
 * is `[priceKey, emoji, label]`. Every COIN_IDS key must appear here OR in
 * PRICE_ALIASES — enforced by tests/price.test.js — so a coin can never be priced
 * but hidden, and a new coin shows up everywhere at once.
 */
export const PRICE_GROUPS = [
  ['🏛️ L1 / Mainnets', [
    ['btc', '₿', 'Bitcoin (BTC)'],
    ['wbtc', '₿', 'Wrapped BTC (WBTC)'],
    ['eth', 'Ξ', 'Ethereum (ETH)'],
    ['sol', '◎', 'Solana (SOL)'],
    ['avax', '🔺', 'Avalanche (AVAX)'],
    ['trx', '🟥', 'Tron (TRX)'],
    ['ton', '💎', 'TON (TON)'],
    ['bnb', '🟡', 'BNB (BNB)'],
  ]],
  ['⚡ L2 / Scaling', [
    ['base', '🟦', 'ETH on Base'],
    ['eth', '🔵', 'ETH on Arbitrum'],
    ['op', '🔴', 'Optimism (OP)'],
    ['matic', '⬡', 'Polygon (POL)'],
  ]],
  ['🏦 Stablecoins', [
    ['usdc', '💵', 'USD Coin (USDC)'],
    ['usdt', '💵', 'Tether (USDT)'],
    ['dai', '💵', 'Dai (DAI)'],
  ]],
  ['🎫 Tokens', [
    ['weth', 'Ξ', 'Wrapped ETH (WETH)'],
    ['link', '🔗', 'Chainlink (LINK)'],
    ['uni', '🦄', 'Uniswap (UNI)'],
    ['arb', '🔵', 'Arbitrum (ARB)'],
    ['msol', '💧', 'Marinade SOL (mSOL)'],
    ['wsol', '◎', 'Wrapped SOL (wSOL)'],
  ]],
  ['🪙 Legacy / Forks', [
    ['ltc', 'Ł', 'Litecoin (LTC)'],
    ['bch', '🅑', 'Bitcoin Cash (BCH)'],
    ['xmr', 'ɱ', 'Monero (XMR)'],
    ['zec', 'Ⓩ', 'Zcash (ZEC)'],
  ]],
];

// COIN_IDS keys that share a CoinGecko id with a coin already shown (rendered via
// its twin, so intentionally not in PRICE_GROUPS): pol≡matic, bsc≡bnb.
export const PRICE_ALIASES = new Set(['pol', 'bsc']);

// Sent with parse_mode: 'HTML' — the title and group headers are bold. Coin
// labels/values are static (no HTML-special chars), so no escaping needed.
export function formatCryptoPricesEUR(prices, date = new Date()) {
  const body = PRICE_GROUPS.map(
    ([title, coins]) =>
      `<b>${title}</b>\n` + coins.map(([key, emoji, label]) => `${emoji} ${label} : ${formatEUR(prices[key] || 0)}`).join('\n')
  ).join('\n\n');
  return `<b>💹 Prix en euros</b>\n\n${body}\n\n🕒 Mis à jour en temps réel le ${formatPriceUpdateDate(date)}`;
}
