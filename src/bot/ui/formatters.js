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
 * Emoji par chaîne
 */
export const CHAIN_EMOJIS = {
  eth: '🔷',
  btc: '🟠', 
  sol: '🟣'
};

/**
 * Nom de la chaîne
 */
export const CHAIN_NAMES = {
  eth: 'Ethereum',
  btc: 'Bitcoin',
  sol: 'Solana'
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

/**
 * Formate un solde USDC pour Polymarket
 * @param {string|number} rawBalance
 */
export function formatCollateralBalance(rawBalance) {
  if (rawBalance === null || rawBalance === undefined || rawBalance === '') return '0,00 USDC';
  const value = String(rawBalance);

  if (value.includes('.')) {
    const number = Number(value);
    return Number.isFinite(number) ? `${formatNumber(number, 2, 2)} USDC` : '0,00 USDC';
  }

  try {
    const raw = BigInt(value);
    const whole = raw / 1_000_000n;
    const fraction = raw % 1_000_000n;
    const decimal = `${whole}.${fraction.toString().padStart(6, '0')}`;
    return `${formatNumber(Number(decimal), 2, 2)} USDC`;
  } catch {
    return '0,00 USDC';
  }
}
