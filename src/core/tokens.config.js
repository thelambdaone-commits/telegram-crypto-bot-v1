/**
 * Token Configuration - Centralized registry for all supported tokens
 * Modular design - add new tokens/chains easily
 */

export const TOKEN_CONFIGS = {
  sol: {
    name: 'Solana',
    native: 'SOL',
    tokens: {
      JitoSOL: {
        mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
        decimals: 9,
        type: 'liquid-staking',
        icon: '🥇',
      },
      mSOL: {
        mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
        decimals: 9,
        type: 'liquid-staking',
        icon: '🥈',
      },
      USDC: {
        mint: 'EPjFWdd5AufqSSBfM6ZUhZ1yq1J1B9o1M9xFvq7K7xyz',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  eth: {
    name: 'Ethereum',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      WBTC: {
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
      },
      DAI: {
        address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  arb: {
    name: 'Arbitrum',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        address: '0xfd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  op: {
    name: 'Optimism',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0x0b2c639c533813f1cb2e2e6a7ac7d7fc27c7fc8a',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        address: '0x4200000000000000000000000000000000000006',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  matic: {
    name: 'Polygon',
    native: 'MATIC',
    tokens: {
      USDC: {
        address: '0x3c499c542cef39e832b2a96aedc17e014a2fd9de',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        address: '0xc2132d05d31c914a87c6611c10748aeb04b58e93',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  base: {
    name: 'Base',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0x4ed4e862860bedbc957758f444b32ea15ef592cd7',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
      USDT: {
        address: '0xfde4c48c1bc15cfb3da3e1a1dcb0b643e4c0f5f2',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
      },
    },
  },
  btc: {
    name: 'Bitcoin',
    native: 'BTC',
    tokens: {},
  },
  ltc: {
    name: 'Litecoin',
    native: 'LTC',
    tokens: {},
  },
  bch: {
    name: 'Bitcoin Cash',
    native: 'BCH',
    tokens: {},
  },
};

export const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export function getTokenConfig(chain, symbol) {
  return TOKEN_CONFIGS[chain]?.tokens?.[symbol] || null;
}

export function getAllTokensForChain(chain) {
  return TOKEN_CONFIGS[chain]?.tokens || {};
}

export function getNativeSymbol(chain) {
  return TOKEN_CONFIGS[chain]?.native || chain.toUpperCase();
}

export function getAllChains() {
  return Object.keys(TOKEN_CONFIGS);
}