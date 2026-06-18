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

export function formatCryptoPricesEUR(prices, date = new Date()) {
  return (
    '💹 Prix en euros\n\n' +
    '🏛️ L1 / Mainnets\n' +
    `₿ Bitcoin (BTC) : ${formatEUR(prices.btc)}\n` +
    `₿ Wrapped BTC (WBTC) : ${formatEUR(prices.wbtc || 0)}\n` +
    `Ξ Ethereum (ETH) : ${formatEUR(prices.eth)}\n` +
    `◎ Solana (SOL) : ${formatEUR(prices.sol)}\n` +
    `🔺 Avalanche (AVAX) : ${formatEUR(prices.avax || 0)}\n` +
    `🟥 Tron (TRX) : ${formatEUR(prices.trx || 0)}\n` +
    `💎 TON (TON) : ${formatEUR(prices.ton || 0)}\n\n` +
    '⚡ L2 / Scaling\n' +
    `🟦 ETH on Base : ${formatEUR(prices.base)}\n` +
    `🔵 ETH on Arbitrum : ${formatEUR(prices.eth)}\n` +
    `🔴 Optimism (OP) : ${formatEUR(prices.op || 0)}\n` +
    `⬡ Polygon (POL) : ${formatEUR(prices.matic || 0)}\n\n` +
    '🏦 Stablecoins\n' +
    `💵 USD Coin (USDC) : ${formatEUR(prices.usdc)}\n` +
    `💵 Tether (USDT) : ${formatEUR(prices.usdt)}\n` +
    `💵 Dai (DAI) : ${formatEUR(prices.dai || 0)}\n\n` +
    '🎫 Tokens\n' +
    `🔗 Chainlink (LINK) : ${formatEUR(prices.link || 0)}\n` +
    `🦄 Uniswap (UNI) : ${formatEUR(prices.uni || 0)}\n` +
    `🔵 Arbitrum (ARB) : ${formatEUR(prices.arb || 0)}\n` +
    `💧 Marinade SOL (mSOL) : ${formatEUR(prices.msol || 0)}\n\n` +
    '🪙 Legacy / Forks\n' +
    `Ł Litecoin (LTC) : ${formatEUR(prices.ltc)}\n` +
    `🅑 Bitcoin Cash (BCH) : ${formatEUR(prices.bch)}\n` +
    `ɱ Monero (XMR) : ${formatEUR(prices.xmr || 0)}\n` +
    `Ⓩ Zcash (ZEC) : ${formatEUR(prices.zec || 0)}\n\n` +
    `🕒 Mis à jour en temps réel le ${formatPriceUpdateDate(date)}`
  );
}
