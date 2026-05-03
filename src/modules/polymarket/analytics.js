/**
 * Polymarket Analytics & Calculations
 * Extracted from UI handlers for better modularity
 */

export const POLYMARKET_TRADE_THEMES = [
  { id: 'politics', label: '🗳️ Politique', keywords: ['politic', 'election', 'president', 'trump', 'biden'] },
  { id: 'sports', label: '⚽ Sport', keywords: ['sport', 'football', 'nba', 'nfl', 'ufc'] },
  { id: 'crypto', label: '💰 Crypto', keywords: ['crypto', 'bitcoin', 'eth', 'sol', 'binance'] },
  { id: 'world', label: '🌍 Monde', keywords: ['world', 'war', 'ukraine', 'china', 'nato'] },
];

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function calculateRealizedPnl(trades) {
  let realizedPnl = 0;
  let tradeCount = 0;
  // Simplified logic for example, keeping the structure
  for (const trade of trades || []) {
    const size = Math.abs(firstNumber(trade, ['size', 'amount']) || 0);
    const price = firstNumber(trade, ['price', 'avgPrice']);
    if (size > 0 && price !== null) {
      realizedPnl += size * price;
      tradeCount++;
    }
  }
  return { realizedPnl, tradeCount };
}

export function calculatePortfolioPnl(positions) {
  const items = (positions || []).map(pos => {
    const size = Math.abs(firstNumber(pos, ['size', 'balance']) || 0);
    const currentValue = firstNumber(pos, ['currentValue', 'value']) || (size * (firstNumber(pos, ['price']) || 0));
    const costBasis = firstNumber(pos, ['costBasis', 'initialValue']) || 0;
    const pnl = currentValue - costBasis;
    return { title: pos.title || 'Position', size, currentValue, costBasis, pnl };
  });

  const totalValue = items.reduce((sum, i) => sum + i.currentValue, 0);
  const totalPnl = items.reduce((sum, i) => sum + i.pnl, 0);

  return { positionCount: items.length, totalValue, totalPnl, items };
}
