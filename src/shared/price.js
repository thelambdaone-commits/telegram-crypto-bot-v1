/**
 * Crypto price service using CoinGecko API
 * EUR only as per requirements
 */
const COINGECKO_API = "https://api.coingecko.com/api/v3"

const COIN_IDS = {
  eth: "ethereum",
  btc: "bitcoin",
  sol: "solana",
  ltc: "litecoin",
  bch: "bitcoin-cash",
  usdc: "usd-coin",
  usdt: "tether",
  matic: "polygon-ecosystem-token",
  op: "optimism",
  base: "ethereum",
  jitosol: "jito-staked-sol",
}

let priceCache = {
  prices: {},
  lastUpdate: 0,
}

const CACHE_TTL = 60000 // 1 minute

/**
 * Clear price cache to force refresh
 */
export function clearPriceCache() {
  priceCache = { prices: {}, lastUpdate: 0 }
}

/**
 * Fetch current prices in EUR
 * @param {boolean} force - Force refresh, ignoring cache
 */
export async function getPricesEUR(force = false) {
  const now = Date.now()

  // Return cached prices if fresh (unless force is true)
  if (!force && now - priceCache.lastUpdate < CACHE_TTL && Object.keys(priceCache.prices).length > 0) {
    return priceCache.prices
  }

  try {
    const ids = Object.values(COIN_IDS).join(",")
    const response = await fetch(`${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=eur`)

    if (!response.ok) {
      throw new Error("Erreur API CoinGecko")
    }

    const data = await response.json()

    priceCache = {
      prices: {
        eth: data.ethereum?.eur || 0,
        btc: data.bitcoin?.eur || 0,
        sol: data.solana?.eur || 0,
        ltc: data.litecoin?.eur || 0,
        bch: data["bitcoin-cash"]?.eur || 0,
        usdc: data["usd-coin"]?.eur || 0,
        usdt: data.tether?.eur || 0,
        matic: data["polygon-ecosystem-token"]?.eur || 0,
        op: data.optimism?.eur || 0,
        base: data.ethereum?.eur || 0,
        jitosol: data["jito-staked-sol"]?.eur || 0,
      },
      lastUpdate: now,
    }

    return priceCache.prices
  } catch (error) {
    // Return cached or zeros on error
    if (Object.keys(priceCache.prices).length > 0) {
      return priceCache.prices
    }
    return { eth: 0, btc: 0, sol: 0, ltc: 0, bch: 0, usdc: 0, usdt: 0, matic: 0, op: 0, base: 0 }
  }
}

/**
 * Convert crypto amount to EUR
 */
export async function convertToEUR(chain, amount) {
  const prices = await getPricesEUR()
  
  // Map L2 chains to ETH price if they use ETH as native currency
  let priceKey = chain
  if (["arb", "op", "base"].includes(chain)) {
    priceKey = "eth"
  }
  
  const price = prices[priceKey] || 0
  return {
    amount,
    chain,
    priceEUR: price,
    valueEUR: amount * price,
  }
}

/**
 * Format EUR amount (with more decimals for small amounts)
 */
export function formatEUR(amount) {
  // Pour les petits montants, afficher plus de décimales
  const decimals = amount >= 0.01 ? 2 : amount >= 0.0001 ? 4 : 5
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}
