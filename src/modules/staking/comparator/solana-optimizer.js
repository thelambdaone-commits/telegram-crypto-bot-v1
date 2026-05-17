import { getJitoOpportunity } from '../../../providers/staking/solana/jito.provider.js';
import { getMarinadeOpportunity } from '../../../providers/staking/solana/marinade.provider.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = null;

export class SolanaStakingOptimizer {
  static async getOpportunities({ force = false } = {}) {
    if (!force && cache && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
      return cache.opportunities;
    }

    const opportunities = await Promise.all([getMarinadeOpportunity(), getJitoOpportunity()]);
    opportunities.sort((a, b) => Number(b.apy || 0) - Number(a.apy || 0));

    cache = {
      updatedAt: Date.now(),
      opportunities,
    };

    return opportunities;
  }

  static getCacheInfo() {
    return {
      updatedAt: cache?.updatedAt || null,
      ttlMs: CACHE_TTL_MS,
      size: cache?.opportunities?.length || 0,
    };
  }
}

export default SolanaStakingOptimizer;
