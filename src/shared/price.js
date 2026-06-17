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

    priceCache = {
      prices: {
        eth: data.ethereum?.eur || 0,
        btc: data.bitcoin?.eur || 0,
        sol: data.solana?.eur || 0,
        ltc: data.litecoin?.eur || 0,
        bch: data['bitcoin-cash']?.eur || 0,
        usdc: data['usd-coin']?.eur || 0,
        usdt: data.tether?.eur || 0,
        dai: data.dai?.eur || 0,
        wbtc: data['wrapped-bitcoin']?.eur || 0,
        matic: data['polygon-ecosystem-token']?.eur || 0,
        op: data.optimism?.eur || 0,
        base: data.ethereum?.eur || 0,
        avax: data['avalanche-2']?.eur || 0,
        trx: data.tron?.eur || 0,
        xmr: data.monero?.eur || 0,
        zec: data.zcash?.eur || 0,
      },
      lastUpdate: now,
    };

    return priceCache.prices;
  } catch (error) {
    // Return cached or zeros on error
    if (Object.keys(priceCache.prices).length > 0) {
      return priceCache.prices;
    }
    return { eth: 0, btc: 0, sol: 0, ltc: 0, bch: 0, usdc: 0, usdt: 0, matic: 0, op: 0, base: 0, xmr: 0, zec: 0 };
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
    '💹 Prix crypto\n\n' +
    '🏛️ L1 / Mainnets\n' +
    `₿ Bitcoin (BTC) : ${formatEUR(prices.btc)}\n` +
    `₿ Wrapped BTC (WBTC) : ${formatEUR(prices.wbtc || 0)}\n` +
    `Ξ Ethereum (ETH) : ${formatEUR(prices.eth)}\n` +
    `◎ Solana (SOL) : ${formatEUR(prices.sol)}\n` +
    `🔺 Avalanche (AVAX) : ${formatEUR(prices.avax || 0)}\n` +
    `🟥 Tron (TRX) : ${formatEUR(prices.trx || 0)}\n\n` +
    '⚡ L2 / Scaling\n' +
    `🟦 ETH on Base : ${formatEUR(prices.base)}\n` +
    `🔵 ETH on Arbitrum : ${formatEUR(prices.eth)}\n` +
    `🔴 Optimism (OP) : ${formatEUR(prices.op || 0)}\n` +
    `⬡ Polygon (POL) : ${formatEUR(prices.matic || 0)}\n\n` +
    '🏦 Stablecoins\n' +
    `💵 USD Coin (USDC) : ${formatEUR(prices.usdc)}\n` +
    `💵 Tether (USDT) : ${formatEUR(prices.usdt)}\n` +
    `💵 Dai (DAI) : ${formatEUR(prices.dai || 0)}\n\n` +
    '🪙 Legacy / Forks\n' +
    `Ł Litecoin (LTC) : ${formatEUR(prices.ltc)}\n` +
    `🅑 Bitcoin Cash (BCH) : ${formatEUR(prices.bch)}\n` +
    `ɱ Monero (XMR) : ${formatEUR(prices.xmr || 0)}\n` +
    `Ⓩ Zcash (ZEC) : ${formatEUR(prices.zec || 0)}\n\n` +
    `🕒 Mis à jour en temps réel le ${formatPriceUpdateDate(date)}`
  );
}
