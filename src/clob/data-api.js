const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }
  return response.json();
}

export async function resolvePolymarketProfile(address) {
  try {
    const url = `${GAMMA_API}/public-profile?address=${encodeURIComponent(address)}`;
    return await fetchJson(url, 'Profil Polymarket');
  } catch (error) {
    if (error.message.includes('HTTP 404')) {
      return null;
    }
    throw error;
  }
}

export async function resolvePolymarketUserAddress(address) {
  const profile = await resolvePolymarketProfile(address);
  return profile?.proxyWallet || address;
}

export async function getUserActivity(address, { limit = 100, type = 'TRADE' } = {}) {
  const userAddress = await resolvePolymarketUserAddress(address);
  const params = new URLSearchParams({
    user: userAddress,
    limit: String(limit),
    type,
    sortBy: 'TIMESTAMP',
    sortDirection: 'DESC',
  });
  const activity = await fetchJson(`${DATA_API}/activity?${params.toString()}`, 'Historique Polymarket');

  return {
    userAddress,
    activity: Array.isArray(activity) ? activity : [],
  };
}

export async function getUserPositions(address, { limit = 500, offset = 0, sizeThreshold = 0 } = {}) {
  const userAddress = await resolvePolymarketUserAddress(address);
  const params = new URLSearchParams({
    user: userAddress,
    limit: String(limit),
    offset: String(offset),
    sizeThreshold: String(sizeThreshold),
    sortBy: 'CASHPNL',
    sortDirection: 'DESC',
  });
  const positions = await fetchJson(`${DATA_API}/positions?${params.toString()}`, 'Positions Polymarket');

  return {
    userAddress,
    positions: Array.isArray(positions) ? positions : [],
  };
}

export async function getUserClosedPositions(address, { limit = 50, maxPages = 20 } = {}) {
  const userAddress = await resolvePolymarketUserAddress(address);
  const positions = [];

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      user: userAddress,
      limit: String(limit),
      offset: String(page * limit),
      sortBy: 'TIMESTAMP',
      sortDirection: 'DESC',
    });
    const pagePositions = await fetchJson(`${DATA_API}/closed-positions?${params.toString()}`, 'Positions cloturees Polymarket');
    const items = Array.isArray(pagePositions) ? pagePositions : [];
    positions.push(...items);
    if (items.length < limit) break;
  }

  return {
    userAddress,
    positions,
  };
}
