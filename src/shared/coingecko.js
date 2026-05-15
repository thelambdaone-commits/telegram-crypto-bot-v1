/**
 * Shared CoinGecko Configuration and Utils
 */
export const COINGECKO_API = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

export const COINGECKO_API_KEY =
  process.env.COINGECKO_API_KEY ||
  process.env.COINGECKO_DEMO_API_KEY ||
  process.env.CG_DEMO_API_KEY;

export const COINGECKO_API_KEY_HEADER = process.env.COINGECKO_API_KEY_HEADER || 'x-cg-demo-api-key';

/**
 * Build headers for CoinGecko API requests
 * @returns {Object} Headers object
 */
export function buildHeaders() {
  const headers = { accept: 'application/json' };
  if (COINGECKO_API_KEY) {
    headers[COINGECKO_API_KEY_HEADER] = COINGECKO_API_KEY;
  }
  return headers;
}

/**
 * Map of internal chain/token symbols to CoinGecko IDs
 */
export const COIN_IDS = {
  eth: 'ethereum',
  btc: 'bitcoin',
  sol: 'solana',
  ltc: 'litecoin',
  bch: 'bitcoin-cash',
  usdc: 'usd-coin',
  usdt: 'tether',
  matic: 'polygon-ecosystem-token',
  pol: 'polygon-ecosystem-token',
  op: 'optimism',
  base: 'ethereum',
  jitosol: 'jito-staked-sol',
};
