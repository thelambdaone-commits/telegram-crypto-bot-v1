/**
 * Shared CoinGecko Configuration and Utils
 */
import { logger } from './logger.js';

export const COINGECKO_API = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

export const COINGECKO_API_KEY =
  process.env.COINGECKO_API_KEY ||
  process.env.COINGECKO_DEMO_API_KEY ||
  process.env.CG_DEMO_API_KEY ||
  process.env.CG_API_KEY;

export const COINGECKO_API_KEY_HEADER = process.env.COINGECKO_API_KEY_HEADER || 'x-cg-demo-api-key';

/**
 * Build headers for CoinGecko API requests
 * @returns {Object} Headers object
 */
export function buildHeaders() {
  const headers = { 'accept': 'application/json' };
  if (COINGECKO_API_KEY) {
    headers[COINGECKO_API_KEY_HEADER] = COINGECKO_API_KEY;
  }
  return headers;
}

/**
 * Fetch with automatic fallback to public API if authenticated call fails
 */
export async function fetchWithFallback(url, options = {}) {
  const authHeaders = buildHeaders();
  
  // Attempt 1: With API Key
  if (COINGECKO_API_KEY) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...options.headers, ...authHeaders }
      });
      
      if (response.ok) return response;
      
      // If unauthorized (401) or forbidden (403), the key might be invalid.
      // If rate limited (429), the public API might also be limited, but we try anyway.
      if (response.status !== 401 && response.status !== 403 && response.status !== 429) {
        return response; // Return other errors (404, 500) directly
      }
    } catch (error) {
      logger.warn('Authenticated fetch failed', { error: error.message });
    }
  }

  // Attempt 2: Fallback to Public API (no auth header)
  const publicHeaders = { 'accept': 'application/json' };
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...publicHeaders }
  });
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
  dai: 'dai',
  wbtc: 'wrapped-bitcoin',
  link: 'chainlink',
  uni: 'uniswap',
  matic: 'polygon-ecosystem-token',
  pol: 'polygon-ecosystem-token',
  op: 'optimism',
  base: 'ethereum',
  avax: 'avalanche-2',
  xmr: 'monero',
  zec: 'zcash',
  trx: 'tron',
  ton: 'the-open-network',
  arb: 'arbitrum',
  msol: 'msol',
  bsc: 'binancecoin',
  bnb: 'binancecoin',
  weth: 'weth',
  wsol: 'solana', // Wrapped SOL tracks SOL 1:1
};
