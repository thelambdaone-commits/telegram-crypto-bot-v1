/**
 * UI Formatters - Fonctions utilitaires pour le formatage mobile-friendly
 * @module ui/formatters
 */

/**
 * Séparateur court optimisé pour mobile
 * @returns {string}
 */
export function separator() {
  return '───────────';
}

/**
 * Titre de section formaté avec séparateur
 * @param {string} emoji
 * @param {string} title
 * @returns {string}
 */
export function sectionTitle(emoji, title) {
  return `${separator()}\n${emoji} *${title}*\n${separator()}`;
}

/**
 * Formate une adresse crypto de manière lisible
 * @param {string} address
 * @param {number} start - caractères au début
 * @param {number} end - caractères à la fin
 * @returns {string}
 */
export function truncateAddress(address, start = 8, end = 6) {
  if (!address || address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * Canonical chain → symbol map. Single source of truth for the whole bot:
 * native coins use their real typographic symbol, EVM L2s use their brand
 * colour. Arbitrum = blue, Optimism = red (official charts). Import this
 * instead of redefining a local map.
 */
export const CHAIN_EMOJIS = {
  eth: 'Ξ',
  btc: '₿',
  ltc: 'Ł',
  bch: '🅑',
  sol: '◎',
  arb: '🔵',
  matic: '⬡',
  op: '🔴',
  base: '🟦',
  avax: '🔺',
  trx: '🟥',
  xmr: 'ɱ',
  zec: 'Ⓩ',
};

/**
 * Nom de la chaîne
 */
export const CHAIN_NAMES = {
  eth: 'Ethereum',
  btc: 'Bitcoin',
  sol: 'Solana',
  arb: 'Arbitrum',
  matic: 'Polygon',
  op: 'Optimism',
  base: 'Base',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
};

/**
 * Formate un nombre avec la locale française
 * @param {number} amount
 * @param {number} minDecimals
 * @param {number} maxDecimals
 */
export function formatNumber(amount, minDecimals = 2, maxDecimals = 6) {
  if (amount === null || amount === undefined) return '0,00';
  return Number(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Formate un montant crypto avec son symbole
 * @param {number} amount
 * @param {string} symbol
 */
export function formatCryptoAmount(amount, symbol) {
  if (amount === null || amount === undefined) return `0 ${symbol.toUpperCase()}`;
  return `${formatNumber(amount, 2, 6)} ${symbol.toUpperCase()}`;
}
