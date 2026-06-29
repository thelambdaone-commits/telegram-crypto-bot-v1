/**
 * Montant UI → unités entières (base units), sans flottant.
 *
 * Reco officielle Solana : ne jamais utiliser de `float` pour les montants de
 * transaction. On convertit immédiatement la valeur saisie en plus petite unité
 * entière (lamports pour SOL, base units pour un token SPL) et, en cas
 * d'excès de précision, on **arrondit vers le bas** (round down) pour éviter
 * tout transfert excédentaire. La même logique est valable pour les autres
 * chaînes à unités entières (wei, satoshis, …).
 */

/**
 * Développe une éventuelle notation scientifique (`1e-7`, `2.5E3`) en chaîne
 * décimale simple, sans repasser par `Number` (donc sans erreur de flottant).
 * @param {string} s
 * @returns {string}
 */
function expandScientific(s) {
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return s;
  const [, sign, int, frac = '', expStr] = m;
  const exp = Number.parseInt(expStr, 10);
  const digits = int + frac;
  const pointPos = int.length + exp;
  let out;
  if (pointPos <= 0) {
    out = '0.' + '0'.repeat(-pointPos) + digits;
  } else if (pointPos >= digits.length) {
    out = digits + '0'.repeat(pointPos - digits.length);
  } else {
    out = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return sign + out;
}

/**
 * Convertit un montant UI (chaîne ou nombre) en unités entières, arrondi VERS
 * LE BAS, en pur BigInt — aucune multiplication flottante.
 *
 * @param {string|number} amount   ex. "0.01551"
 * @param {number} decimals        décimales du token (9 pour SOL, 6 pour USDC…)
 * @returns {bigint}               ex. 15510n pour ("0.01551", 6)
 * @throws si le montant ou `decimals` est invalide / négatif
 */
export function uiToBaseUnits(amount, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`decimals invalide: ${decimals}`);
  }
  let str = String(amount).trim().replace(',', '.');
  if (/[eE]/.test(str)) str = expandScientific(str);
  if (str.startsWith('+')) str = str.slice(1);
  if (str.startsWith('-')) {
    throw new Error(`Montant négatif: ${amount}`);
  }
  if (!/^\d*\.?\d*$/.test(str) || str === '' || str === '.') {
    throw new Error(`Montant invalide: ${amount}`);
  }
  const [whole, frac = ''] = str.split('.');
  // On tronque la partie fractionnaire à `decimals` → arrondi vers le bas.
  const fracScaled = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracScaled || '0');
}
