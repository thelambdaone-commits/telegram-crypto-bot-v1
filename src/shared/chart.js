/**
 * Chart Generation Service - Creates price charts for cryptocurrencies
 */
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const width = 800;
const height = 400;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour: '#1a1a2e',
});

const COINGECKO_IDS = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  ltc: 'litecoin',
  bch: 'bitcoin-cash',
  usdc: 'usd-coin',
  usdt: 'tether',
  matic: 'polygon-ecosystem-token',
  op: 'optimism',
  jitosol: 'jito-staked-sol',
};

const CHAIN_COLORS = {
  btc: { line: '#f7931a', fill: 'rgba(247, 147, 26, 0.2)' },
  eth: { line: '#627eea', fill: 'rgba(98, 126, 234, 0.2)' },
  sol: { line: '#9945ff', fill: 'rgba(153, 69, 255, 0.2)' },
  ltc: { line: '#bfbbbb', fill: 'rgba(191, 187, 187, 0.2)' },
  bch: { line: '#8bc34a', fill: 'rgba(139, 195, 74, 0.2)' },
  usdc: { line: '#2775ca', fill: 'rgba(39, 117, 202, 0.2)' },
  usdt: { line: '#26a17b', fill: 'rgba(38, 161, 123, 0.2)' },
  matic: { line: '#8247e5', fill: 'rgba(130, 71, 229, 0.2)' },
  op: { line: '#ff0420', fill: 'rgba(255, 4, 32, 0.2)' },
  jitosol: { line: '#3ccec0', fill: 'rgba(60, 206, 192, 0.2)' },
};

const CHAIN_NAMES = {
  btc: 'Bitcoin',
  eth: 'Ethereum',
  sol: 'Solana',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
  usdc: 'USD Coin',
  usdt: 'Tether',
  matic: 'Polygon',
  op: 'Optimism',
  jitosol: 'Jito Staked SOL',
};

/**
 * Fetch historical price data from CoinGecko
 */
async function fetchPriceHistory(chain, days) {
  const coinId = COINGECKO_IDS[chain];
  if (!coinId) throw new Error(`Crypto non supportée: ${chain}`);

  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=eur&days=${days}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur API CoinGecko: ${response.status}`);
  }

  const data = await response.json();
  return data.prices; // Array of [timestamp, price]
}

/**
 * Generate a price chart image
 */
export async function generatePriceChart(chain, days) {
  const chainLower = chain.toLowerCase();

  if (!COINGECKO_IDS[chainLower]) {
    throw new Error('Crypto non supportée. Utilise: btc, eth, sol');
  }

  // Fetch price data
  const priceData = await fetchPriceHistory(chainLower, days);

  // Prepare data for chart
  const labels = priceData.map(([timestamp]) => {
    const date = new Date(timestamp);
    if (days <= 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    } else if (days <= 30) {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    }
  });

  const prices = priceData.map(([, price]) => price);

  // Calculate min/max for better visualization
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceChange = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  const isPositive = priceChange >= 0;

  // Reduce labels for readability
  const step = Math.ceil(labels.length / 10);
  const reducedLabels = labels.map((label, i) => (i % step === 0 ? label : ''));

  const colors = CHAIN_COLORS[chainLower];

  const configuration = {
    type: 'line',
    data: {
      labels: reducedLabels,
      datasets: [
        {
          label: `${CHAIN_NAMES[chainLower]} (EUR)`,
          data: prices,
          borderColor: colors.line,
          backgroundColor: colors.fill,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#ffffff',
            font: { size: 14, weight: 'bold' },
          },
        },
        title: {
          display: true,
          text: `${CHAIN_NAMES[chainLower]} - ${days} jours (${isPositive ? '+' : ''}${priceChange.toFixed(2)}%)`,
          color: isPositive ? '#00ff88' : '#ff4444',
          font: { size: 18, weight: 'bold' },
        },
      },
      scales: {
        x: {
          ticks: { color: '#888888', maxRotation: 45 },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
        },
        y: {
          ticks: {
            color: '#888888',
            callback: (value) => `€${value.toLocaleString('fr-FR')}`,
          },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          min: minPrice * 0.98,
          max: maxPrice * 1.02,
        },
      },
    },
  };

  // Generate chart as PNG buffer
  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);

  return {
    buffer: imageBuffer,
    stats: {
      chain: chainLower,
      days,
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
  const periodMap = {
    '7': 7,
    '7j': 7,
    '30': 30,
    '30j': 30,
    '90': 90,
    '90j': 90,
    '1an': 365,
    '365': 365,
    '1y': 365,
  };

  return periodMap[period?.toLowerCase()] || 30;
}
