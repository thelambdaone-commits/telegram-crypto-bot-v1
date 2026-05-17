/**
 * Chart Generation Service - Creates price charts for cryptocurrencies
 */
import { formatPriceUpdateDate } from './price.js';
import { COINGECKO_API, COIN_IDS, fetchWithFallback, COINGECKO_API_KEY } from './coingecko.js';

const width = 800;
const height = 400;
const GRAPH_USAGE = 'Usage : /graph btc 7|30|90|365|all';
const SUPPORTED_PERIODS = new Set(['7', '30', '90', '365', 'all']);
const PRICE_HISTORY_CACHE_TTL = 5 * 60 * 1000;
const PRICE_HISTORY_STALE_TTL = 60 * 60 * 1000;

let chartJSNodeCanvas = null;

async function getCanvas() {
  if (!chartJSNodeCanvas) {
    const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
    chartJSNodeCanvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: '#1a1a2e',
    });
  }
  return chartJSNodeCanvas;
}

const priceHistoryCache = new Map();
const priceHistoryInflight = new Map();

const COINGECKO_IDS = COIN_IDS;

const CHAIN_COLORS = {
  btc: { line: '#f7931a', fill: 'rgba(247, 147, 26, 0.2)' },
  eth: { line: '#627eea', fill: 'rgba(98, 126, 234, 0.2)' },
  sol: { line: '#9945ff', fill: 'rgba(153, 69, 255, 0.2)' },
  base: { line: '#0052ff', fill: 'rgba(0, 82, 255, 0.2)' },
  op: { line: '#ff0420', fill: 'rgba(255, 4, 32, 0.2)' },
  pol: { line: '#8247e5', fill: 'rgba(130, 71, 229, 0.2)' },
  usdc: { line: '#2775ca', fill: 'rgba(39, 117, 202, 0.2)' },
  usdt: { line: '#26a17b', fill: 'rgba(38, 161, 123, 0.2)' },
  ltc: { line: '#bfbbbb', fill: 'rgba(191, 187, 187, 0.2)' },
  bch: { line: '#8bc34a', fill: 'rgba(139, 195, 74, 0.2)' },
};

const CHAIN_NAMES = {
  btc: 'Bitcoin',
  eth: 'Ethereum',
  sol: 'Solana',
  base: 'Base (ETH)',
  op: 'Optimism',
  pol: 'Polygon',
  usdc: 'USD Coin',
  usdt: 'Tether',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
};

const SUPPORTED_TOKENS_LABEL = Object.keys(COINGECKO_IDS).join(', ');

function formatChartDate(timestamp, includeYear = false) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(timestamp));
}

function buildTickIndexSet(length, maxTicks = 5) {
  if (length <= maxTicks) {
    return new Set(Array.from({ length }, (_, index) => index));
  }

  const indexes = new Set();
  for (let tick = 0; tick < maxTicks; tick += 1) {
    indexes.add(Math.round((tick * (length - 1)) / (maxTicks - 1)));
  }

  indexes.add(0);
  indexes.add(length - 1);
  return indexes;
}

function formatPeriodLabel(days) {
  return days === 'max' ? 'historique complet' : `${days} jours`;
}

function formatEffectivePeriodLabel(days, isLimitedByPublicApi) {
  if (isLimitedByPublicApi) return '365 jours (limite API publique)';
  return formatPeriodLabel(days);
}

function getCacheKey(coinId, days) {
  return `${coinId}:${days}`;
}

function getCachedPriceHistory(coinId, days, allowStale = false) {
  const cached = priceHistoryCache.get(getCacheKey(coinId, days));
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt;
  const ttl = allowStale ? PRICE_HISTORY_STALE_TTL : PRICE_HISTORY_CACHE_TTL;
  return age <= ttl ? cached.prices : null;
}

function setCachedPriceHistory(coinId, days, prices) {
  priceHistoryCache.set(getCacheKey(coinId, days), {
    prices,
    fetchedAt: Date.now(),
  });
}

function resolveCoinInfo(symbol) {
  const normalizedSymbol = symbol.toLowerCase();

  if (!COINGECKO_IDS[normalizedSymbol]) {
    throw new Error(
      `Token invalide: ${symbol.toUpperCase()}. Tokens supportés: ${Object.keys(COINGECKO_IDS).join(', ')}`
    );
  }

  return {
    id: COINGECKO_IDS[normalizedSymbol],
    name: CHAIN_NAMES[normalizedSymbol],
    symbol: normalizedSymbol,
    color: CHAIN_COLORS[normalizedSymbol],
  };
}

/**
 * Fetch historical price data from CoinGecko
 */
async function fetchCoinGeckoMarketChart(coinId, days) {
  const cachedPrices = getCachedPriceHistory(coinId, days);
  if (cachedPrices) return cachedPrices;

  const cacheKey = getCacheKey(coinId, days);
  if (priceHistoryInflight.has(cacheKey)) {
    return priceHistoryInflight.get(cacheKey);
  }

  const url = `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=eur&days=${days}`;

  const request = (async () => {
    const response = await fetchWithFallback(url);
    if (response.ok) {
      const data = await response.json();
      setCachedPriceHistory(coinId, days, data.prices);
      return data.prices;
    }

    let details = '';
    let errorCode = null;
    try {
      const errorBody = await response.json();
      errorCode = errorBody?.error?.status?.error_code || errorBody?.status?.error_code || null;
      details =
        errorBody?.error?.status?.error_message ||
        errorBody?.status?.error_message ||
        errorBody?.error ||
        errorBody?.message ||
        '';
    } catch {
      details = await response.text().catch(() => '');
    }

    const stalePrices = response.status === 429 ? getCachedPriceHistory(coinId, days, true) : null;
    if (stalePrices) {
      return stalePrices;
    }

    const error = new Error(
      `Erreur API CoinGecko: ${response.status}${details ? ` - ${details}` : ''}`
    );
    error.status = response.status;
    error.code = errorCode;
    error.details = details;
    throw error;
  })();

  priceHistoryInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    priceHistoryInflight.delete(cacheKey);
  }
}

async function fetchPriceHistory(coinId, days) {
  if (days === 'max' && !COINGECKO_API_KEY) {
    const prices = await fetchCoinGeckoMarketChart(coinId, 365);
    return { prices, effectiveDays: 365, isLimitedByPublicApi: true };
  }

  try {
    const prices = await fetchCoinGeckoMarketChart(coinId, days);
    return { prices, effectiveDays: days, isLimitedByPublicApi: false };
  } catch (error) {
    const isPublicApiMaxRangeLimit =
      days === 'max' &&
      error.status === 401 &&
      (error.code === 10012 || error.details?.toLowerCase().includes('past 365 days'));

    if (!isPublicApiMaxRangeLimit) {
      if (error.status === 401) {
        throw new Error(
          'CoinGecko refuse la requête (401). Configure COINGECKO_API_KEY dans .env ' +
            'ou vérifie que COINGECKO_API_KEY_HEADER vaut x-cg-demo-api-key pour une clé demo.'
        );
      }
      if (error.status === 429) {
        throw new Error('CoinGecko limite temporairement les requêtes. Réessaie dans une minute.');
      }
      throw error;
    }

    const prices = await fetchCoinGeckoMarketChart(coinId, 365);
    return { prices, effectiveDays: 365, isLimitedByPublicApi: true };
  }
}

/**
 * Generate a price chart image
 */
export async function generatePriceChart(chain, days) {
  const chainLower = chain.toLowerCase();
  const coinInfo = resolveCoinInfo(chainLower);

  // Fetch price data
  const {
    prices: priceData,
    effectiveDays,
    isLimitedByPublicApi,
  } = await fetchPriceHistory(coinInfo.id, days);
  if (!Array.isArray(priceData) || priceData.length < 2) {
    throw new Error(`Données insuffisantes pour ${chain.toUpperCase()}`);
  }

  // Prepare data for chart
  const includeYearInLabels = effectiveDays === 'max' || Number(effectiveDays) >= 365;
  const generatedAt = new Date();
  const labels = priceData.map(([timestamp]) => formatChartDate(timestamp, includeYearInLabels));
  const prices = priceData.map(([, price]) => price);
  const tickLabelIndexes = buildTickIndexSet(labels.length);

  // Calculate min/max for better visualization
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceChange = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  const isPositive = priceChange >= 0;
  const periodLabel = formatEffectivePeriodLabel(effectiveDays, isLimitedByPublicApi);

  const configuration = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${coinInfo.name} (EUR)`,
          data: prices,
          borderColor: coinInfo.color.line,
          backgroundColor: (context) => {
            const { chart } = context;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(247, 147, 26, 0.22)';

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(247, 147, 26, 0.42)');
            gradient.addColorStop(0.7, 'rgba(247, 147, 26, 0.12)');
            gradient.addColorStop(1, 'rgba(247, 147, 26, 0)');
            return gradient;
          },
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#f8fafc',
            font: { size: 14, weight: 'bold' },
          },
        },
        title: {
          display: true,
          text: `${coinInfo.name} - ${periodLabel} (${isPositive ? '+' : ''}${priceChange.toFixed(2)}%)`,
          color: isPositive ? '#00ff88' : '#ff4444',
          font: { size: 18, weight: 'bold' },
        },
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            color: '#cbd5e1',
            maxRotation: 0,
            padding: 8,
            callback: (_value, index) => (tickLabelIndexes.has(index) ? labels[index] : ''),
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          ticks: {
            color: '#cbd5e1',
            padding: 8,
            callback: (value) => `€${value.toLocaleString('fr-FR')}`,
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
          min: minPrice * 0.98,
          max: maxPrice * 1.02,
        },
      },
    },
  };

  // Generate chart as PNG buffer
  const canvas = await getCanvas();
  const imageBuffer = await canvas.renderToBuffer(configuration);

  return {
    buffer: imageBuffer,
    stats: {
      chain: chainLower,
      days,
      effectiveDays,
      isLimitedByPublicApi,
      periodLabel,
      generatedAt,
      generatedAtLabel: formatPriceUpdateDate(generatedAt),
      currentPrice: prices[prices.length - 1],
      minPrice,
      maxPrice,
      priceChange,
      isPositive,
    },
  };
}

/**
 * Parse period string to days
 */
export function parsePeriod(period) {
  const normalizedPeriod = period?.toLowerCase();
  if (!SUPPORTED_PERIODS.has(normalizedPeriod)) return null;
  if (normalizedPeriod === 'all') return 'max';
  return Number(normalizedPeriod);
}

export function parseGraphCommand(text) {
  const args = text.trim().split(/\s+/).slice(1);
  if (args.length !== 2) {
    return { ok: false, error: GRAPH_USAGE };
  }

  const [symbol, period] = args;
  const normalizedSymbol = symbol.toLowerCase();
  if (!COINGECKO_IDS[normalizedSymbol]) {
    return {
      ok: false,
      error: `Token invalide: ${symbol.toUpperCase()}. Tokens supportés: ${SUPPORTED_TOKENS_LABEL}\n${GRAPH_USAGE}`,
    };
  }

  const days = parsePeriod(period);
  if (!days) {
    return { ok: false, error: GRAPH_USAGE };
  }

  return { ok: true, symbol: normalizedSymbol, days };
}
