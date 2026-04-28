/**
 * Staking Providers Configuration
 * Registry for all liquid staking providers on Solana
 */

export const STAKING_PROVIDERS = {
  jito: {
    id: 'jito',
    name: 'JitoSOL',
    displayName: 'JitoSOL',
    symbol: 'JitoSOL',
    mintAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    decimals: 9,
    chain: 'sol',
    description: 'Liquid staking Solana with high yield',
    icon: '🥇',
    apySource: 'jito',
  },
  marinade: {
    id: 'marinade',
    name: 'Marinade',
    displayName: 'Marinade',
    symbol: 'mSOL',
    mintAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    decimals: 9,
    chain: 'sol',
    description: 'Liquid staking Marinade with balanced yields',
    icon: '🥈',
    apySource: 'marinade',
  },
};

export const getProvider = (id) => STAKING_PROVIDERS[id];

export const getAllProviders = () => Object.values(STAKING_PROVIDERS);

export const getProviderByMint = (mintAddress) => {
  return Object.values(STAKING_PROVIDERS).find(
    (p) => p.mintAddress.toLowerCase() === mintAddress.toLowerCase()
  );
};

export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000;