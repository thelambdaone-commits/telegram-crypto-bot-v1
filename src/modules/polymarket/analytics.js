/**
 * Polymarket Analytics & Calculations
 * Extracted from UI handlers for better modularity
 */

export const POLYMARKET_TRADE_THEMES = [
  {
    id: 'politics',
    label: '🗳️ Politique',
    keywords: ['politic', 'election', 'president', 'trump', 'biden'],
  },
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
  const lots = new Map();
  let realizedPnl = 0;
  let realizedTradeCount = 0;
  let unmatchedSellCount = 0;

  const sortedTrades = [...(trades || [])].sort(
    (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
  );

  for (const trade of sortedTrades) {
    const size = Math.abs(firstNumber(trade, ['size', 'amount']) || 0);
    const price = firstNumber(trade, ['price', 'avgPrice']);
    if (size <= 0 || price === null) continue;

    const key = [
      trade.sourceAddress || '',
      trade.market || trade.title || trade.asset_id || trade.id || '',
      trade.outcome || '',
    ].join('|');
    const side = String(trade.side || '').toUpperCase();

    if (side === 'BUY') {
      const existing = lots.get(key) || [];
      existing.push({ remaining: size, price });
      lots.set(key, existing);
      continue;
    }

    if (side !== 'SELL') continue;

    let remaining = size;
    const existing = lots.get(key) || [];

    while (remaining > 0 && existing.length > 0) {
      const lot = existing[0];
      const matched = Math.min(remaining, lot.remaining);
      realizedPnl += matched * (price - lot.price);
      lot.remaining -= matched;
      remaining -= matched;
      if (lot.remaining <= 1e-12) existing.shift();
    }

    if (remaining > 1e-12) unmatchedSellCount++;
    else realizedTradeCount++;

    lots.set(key, existing);
  }

  return { realizedPnl, realizedTradeCount, unmatchedSellCount };
}

export function calculatePortfolioPnl(positions) {
  const items = (positions || []).map((pos) => {
    const size = Math.abs(firstNumber(pos, ['size', 'balance']) || 0);
    const currentValue =
      firstNumber(pos, ['currentValue', 'value']) ?? size * (firstNumber(pos, ['price']) || 0);
    const costBasis =
      firstNumber(pos, ['costBasis', 'initialValue']) ??
      size * (firstNumber(pos, ['avgPrice']) || 0);
    const pnl = currentValue - costBasis;
    return { title: pos.title || 'Position', size, currentValue, costBasis, pnl };
  });

  const currentValue = items.reduce((sum, i) => sum + i.currentValue, 0);
  const costBasis = items.reduce((sum, i) => sum + i.costBasis, 0);
  const unrealizedPnl = items.reduce((sum, i) => sum + i.pnl, 0);
  const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

  return {
    positionCount: items.length,
    currentValue,
    totalValue: currentValue,
    costBasis,
    unrealizedPnl,
    totalPnl: unrealizedPnl,
    pnlPercent,
    items,
  };
}

export function calculatePolymarketTradeVolume(trades) {
  return (trades || []).reduce((sum, trade) => {
    const size = Math.abs(firstNumber(trade, ['size', 'amount']) || 0);
    const price = firstNumber(trade, ['price', 'avgPrice']);
    return price === null ? sum : sum + size * price;
  }, 0);
}

export function calculateOfficialPortfolioPnl(openPositions = [], closedPositions = []) {
  const openItems = openPositions.map((position) => {
    const size = Math.abs(firstNumber(position, ['size', 'balance']) || 0);
    const currentValue =
      firstNumber(position, ['currentValue', 'value']) ??
      size * (firstNumber(position, ['price']) || 0);
    const costBasis =
      firstNumber(position, ['costBasis', 'initialValue']) ??
      size * (firstNumber(position, ['avgPrice']) || 0);
    const cashPnl = firstNumber(position, ['cashPnl', 'unrealizedPnl']);
    const pnl = cashPnl ?? currentValue - costBasis;
    return {
      title: position.title || position.market || 'Position',
      size,
      currentValue,
      costBasis,
      pnl,
    };
  });

  const currentValue = openItems.reduce((sum, item) => sum + item.currentValue, 0);
  const costBasis = openItems.reduce((sum, item) => sum + item.costBasis, 0);
  const unrealizedPnl = openItems.reduce((sum, item) => sum + item.pnl, 0);
  const realizedPnl =
    openPositions.reduce(
      (sum, position) => sum + (firstNumber(position, ['realizedPnl']) || 0),
      0
    ) +
    closedPositions.reduce(
      (sum, position) => sum + (firstNumber(position, ['realizedPnl', 'cashPnl']) || 0),
      0
    );
  const totalPnl = unrealizedPnl + realizedPnl;
  const pnlPercent = costBasis > 0 ? (totalPnl / costBasis) * 100 : 0;

  return {
    positionCount: openItems.length,
    closedPositionCount: closedPositions.length,
    currentValue,
    totalValue: currentValue,
    costBasis,
    unrealizedPnl,
    realizedPnl,
    totalPnl,
    pnlPercent,
    items: openItems,
  };
}

export function getPolymarketTradeThemes() {
  return [...POLYMARKET_TRADE_THEMES];
}

export function filterPolymarketTradesByTheme(trades, themeId) {
  const theme = POLYMARKET_TRADE_THEMES.find((item) => item.id === themeId);
  if (!theme) return [];

  return (trades || []).filter((trade) => {
    const tags = Array.isArray(trade.tags)
      ? trade.tags.map((tag) => [tag.label, tag.name, tag.slug].filter(Boolean).join(' ')).join(' ')
      : '';
    const haystack = [trade.title, trade.market, trade.question, trade.category, trade.event, tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return theme.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  });
}
