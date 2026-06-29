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
  return `${separator()}\n${emoji} <b>${title}</b>\n${separator()}`;
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

// Canonical chain → glyph map, now derived from the single CHAIN_REGISTRY.
// Re-exported here so existing `import { CHAIN_EMOJIS } from '.../formatters.js'`
// call sites keep working.
export { CHAIN_EMOJIS } from '../../shared/chains.js';

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
