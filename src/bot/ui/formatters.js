/**
 * UI Formatters - Fonctions utilitaires pour le formatage mobile-friendly
 * @module ui/formatters
 */

/**
 * Séparateur court optimisé pour mobile
 * @returns {string}
 */
export function separator() {
  return "───────────"
}

/**
 * Titre de section formaté avec séparateur
 * @param {string} emoji 
 * @param {string} title 
 * @returns {string}
 */
export function sectionTitle(emoji, title) {
  return `${separator()}\n${emoji} *${title}*\n${separator()}`
}

/**
 * Formate une adresse crypto de manière lisible
 * @param {string} address 
 * @param {number} start - caractères au début
 * @param {number} end - caractères à la fin
 * @returns {string}
 */
export function truncateAddress(address, start = 8, end = 6) {
  if (!address || address.length <= start + end + 3) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

/**
 * Emoji par chaîne
 */
export const CHAIN_EMOJIS = {
  eth: "🔷",
  btc: "🟠", 
  sol: "🟣"
}

/**
 * Nom de la chaîne
 */
export const CHAIN_NAMES = {
  eth: "Ethereum",
  btc: "Bitcoin",
  sol: "Solana"
}
