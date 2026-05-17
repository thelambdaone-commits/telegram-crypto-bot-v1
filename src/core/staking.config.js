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

export const AAVE_CHAIN_CONFIGS = {
  arb: {
    id: 'arb',
    chainId: 42161,
    name: 'Arbitrum',
    displayName: 'Arbitrum',
    llamaChain: 'Arbitrum',
    icon: '🔴',
    nativeSymbol: 'ETH',
    rpcKey: 'arb',
    poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    explorerTx: 'https://arbiscan.io/tx/',
    tokens: {
      USDC: {
        symbol: 'USDC',
        llamaSymbols: ['USDC'],
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        llamaSymbols: ['USDT', 'USD₮0', 'USDT0'],
        address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        decimals: 6,
      },
    },
  },
  matic: {
    id: 'matic',
    chainId: 137,
    name: 'Polygon',
    displayName: 'Polygon',
    llamaChain: 'Polygon',
    icon: '🟣',
    nativeSymbol: 'MATIC',
    rpcKey: 'matic',
    poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    explorerTx: 'https://polygonscan.com/tx/',
    tokens: {
      USDC: {
        symbol: 'USDC',
        llamaSymbols: ['USDC'],
        address: '0x3c499c542cef39e832b2a96aedc17e014a2fd9de',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        llamaSymbols: ['USDT', 'USDT0', 'USD₮0'],
        address: '0xc2132d05d31c914a87c6611c10748aeb04b58e93',
        decimals: 6,
      },
    },
  },
  op: {
    id: 'op',
    chainId: 10,
    name: 'Optimism',
    displayName: 'Optimism',
    llamaChain: 'OP Mainnet',
    icon: '🔵',
    nativeSymbol: 'ETH',
    rpcKey: 'op',
    poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    explorerTx: 'https://optimistic.etherscan.io/tx/',
    tokens: {
      USDC: {
        symbol: 'USDC',
        llamaSymbols: ['USDC'],
        address: '0x0b2c639c533813f1cb2e2e6a7ac7d7fc27c7fc8a',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        llamaSymbols: ['USDT'],
        address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
        decimals: 6,
      },
    },
  },
  base: {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    displayName: 'Base',
    llamaChain: 'Base',
    icon: '🌀',
    nativeSymbol: 'ETH',
    rpcKey: 'base',
    poolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    explorerTx: 'https://basescan.org/tx/',
    tokens: {
      USDC: {
        symbol: 'USDC',
        llamaSymbols: ['USDC'],
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        decimals: 6,
      },
    },
  },
  eth: {
    id: 'eth',
    chainId: 1,
    name: 'Ethereum',
    displayName: 'Ethereum',
    llamaChain: 'Ethereum',
    icon: '🔷',
    nativeSymbol: 'ETH',
    rpcKey: 'eth',
    poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    explorerTx: 'https://etherscan.io/tx/',
    tokens: {
      USDC: {
        symbol: 'USDC',
        llamaSymbols: ['USDC'],
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        llamaSymbols: ['USDT'],
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        decimals: 6,
      },
    },
  },
};

export const getAaveChain = (id) => AAVE_CHAIN_CONFIGS[id];
export const getAaveChains = () => Object.values(AAVE_CHAIN_CONFIGS);
export const getAaveToken = (chainId, symbol) => AAVE_CHAIN_CONFIGS[chainId]?.tokens?.[symbol];

export const ETH_STAKING_PROVIDERS = {
  lido: {
    id: 'lido',
    name: 'Lido',
    displayName: 'Lido',
    icon: '🏛️',
    chain: 'eth',
    depositToken: 'ETH',
    receiptToken: 'wstETH',
    stakingAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    tokenAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    underlyingAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    project: 'lido',
    sourceUrl: 'https://docs.lido.fi/deployed-contracts/',
    explorerTx: 'https://etherscan.io/tx/',
  },
  rocketpool: {
    id: 'rocketpool',
    name: 'Rocket Pool',
    displayName: 'Rocket Pool',
    icon: '🚀',
    chain: 'eth',
    depositToken: 'ETH',
    receiptToken: 'rETH',
    tokenAddress: '0xae78736Cd615f374D3085123A210448E74Fc6393',
    project: 'rocket-pool',
    sourceUrl: 'https://docs.rocketpool.net/guides/staking/via-l1.html',
    explorerTx: 'https://etherscan.io/tx/',
    directDepositEnabled: false,
    directWithdrawEnabled: false,
  },
  frax: {
    id: 'frax',
    name: 'Frax Ether',
    displayName: 'Frax',
    icon: '💠',
    chain: 'eth',
    depositToken: 'ETH',
    receiptToken: 'sfrxETH',
    stakingAddress: '0x7Bc6bad540453360F744666D625fec0ee1320cA3',
    tokenAddress: '0xac3E018457B222d93114458476f3E3416Abbe38F',
    underlyingAddress: '0x5e8422345238f34275888049021821e8e08caa1f',
    project: 'frax-ether',
    sourceUrl: 'https://docs.frax.com/protocol/assets/frxeth/addresses',
    explorerTx: 'https://etherscan.io/tx/',
  },
};

export const CURVE_LP_POOLS = {
  steth_eth: {
    id: 'steth_eth',
    name: 'stETH/ETH',
    icon: '🏛️',
    chain: 'eth',
    project: 'curve-dex',
    assets: ['stETH', 'ETH'],
    status: 'phase_2',
  },
  wsteth_eth: {
    id: 'wsteth_eth',
    name: 'wstETH/ETH',
    icon: '🔄',
    chain: 'eth',
    project: 'curve-dex',
    assets: ['wstETH', 'ETH'],
    status: 'phase_2',
  },
  frxeth_eth: {
    id: 'frxeth_eth',
    name: 'frxETH/ETH',
    icon: '💠',
    chain: 'eth',
    project: 'curve-dex',
    assets: ['frxETH', 'ETH'],
    status: 'phase_2',
  },
};

export const getEthStakingProvider = (id) => ETH_STAKING_PROVIDERS[id];
export const getEthStakingProviders = () => Object.values(ETH_STAKING_PROVIDERS);
export const getCurveLpPools = () => Object.values(CURVE_LP_POOLS);

export const getProvider = (id) => STAKING_PROVIDERS[id];

export const getAllProviders = () => Object.values(STAKING_PROVIDERS);

export const getProviderByMint = (mintAddress) => {
  return Object.values(STAKING_PROVIDERS).find(
    (p) => p.mintAddress.toLowerCase() === mintAddress.toLowerCase()
  );
};

export const SOL_DECIMALS = 9;
export const LAMPORTS_PER_SOL = 1_000_000_000;
