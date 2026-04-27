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
