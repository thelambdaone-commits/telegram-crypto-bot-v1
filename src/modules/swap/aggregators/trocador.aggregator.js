/**
 * Trocador aggregator adapter — no-KYC cross-chain exchange (CakeWallet-style).
 *
 * Unlike the KyberSwap adapter (on-chain, same-chain, EVM only), Trocador is an
 * aggregator of no-KYC instant exchanges: it returns the best rate across many
 * partners and supports cross-chain pairs (e.g. BTC → XMR, ETH → SOL).
 *
 * This module is READ-ONLY: it only fetches a rate (`new_rate`). It never
 * creates a trade or moves funds — that is a separate, gated step (not built
 * yet). An API key is required even for quotes (confirmed against the live API).
 *
 * Contract verified live (2026-06): base `https://trocador.app/api`, header
 * `API-Key: <key>`, GET `/new_rate` with ticker_from/network_from/ticker_to/
 * network_to/amount_from/payment. Docs: https://trocador.app/en/apidoc/
 */
import { config } from '../../../core/config.js';
import { fetchWithTor } from '../../../shared/tor-proxy.js';
import { logger } from '../../../shared/logger.js';

const TIMEOUT_MS = 15000;

export function hasApiKey() {
  return Boolean(config.exchange?.trocadorApiKey);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Privacy coins benefit from Tor; fetchWithTor falls back to plain fetch
    // when no TOR_PROXY_URL is configured.
    const res = await fetchWithTor(url, {
      signal: controller.signal,
      headers: { 'API-Key': config.exchange.trocadorApiKey, Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json.error || `Trocador HTTP ${res.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read-only best-rate quote for a cross-chain (or same-chain) pair.
 *
 * @param {object} p
 * @param {string} p.tickerFrom   e.g. 'btc'
 * @param {string} p.networkFrom  Trocador network label, e.g. 'Mainnet'
 * @param {string} p.tickerTo     e.g. 'xmr'
 * @param {string} p.networkTo    Trocador network label
 * @param {number|string} p.amountFrom  human amount of the source coin
 * @returns {Promise<{ amountTo: number, provider: string, tradeId: string|null,
 *                      rateMode: string|null, raw: object }>}
 */
export async function getRate({ tickerFrom, networkFrom, tickerTo, networkTo, amountFrom }) {
  if (!hasApiKey()) {
    throw new Error('TROCADOR_API_KEY non configurée — échange indisponible.');
  }

  const params = new URLSearchParams({
    ticker_from: String(tickerFrom).toLowerCase(),
    network_from: networkFrom,
    ticker_to: String(tickerTo).toLowerCase(),
    network_to: networkTo,
    amount_from: String(amountFrom),
    payment: 'False',
  });

  const json = await fetchJson(`${config.exchange.trocadorBaseUrl}/new_rate?${params}`);

  const amountTo = Number(json.amount_to);
  if (!Number.isFinite(amountTo) || amountTo <= 0) {
    logger.warn('[Trocador] quote sans amount_to exploitable', { provider: json.provider });
    throw new Error('Aucun taux disponible pour cette paire.');
  }

  return {
    amountTo,
    provider: json.provider || 'inconnu',
    tradeId: json.trade_id || null,
    rateMode: json.fixed === true ? 'fixe' : json.fixed === false ? 'flottant' : null,
    raw: json,
  };
}
