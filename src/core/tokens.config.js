/**
 * Token Configuration - Centralized registry for all supported tokens
 * Modular design - add new tokens/chains easily
 *
 * ⚠️ SECURITY-CRITICAL: every `address` (EVM) / `mint` (Solana) below is a
 * real on-chain contract. A wrong value = permanent loss of user funds.
 * All addresses are verified against official sources (Circle / Tether /
 * canonical block explorers) and are EIP-55 checksummed for EVM chains.
 * They are LOCKED by tests/tokens.config.test.js — do not edit by hand
 * without updating that test and re-verifying from the official source.
 *
 * `standard` is a human-facing network/standard tag used in the UI to make
 * the deposit network unambiguous (e.g. "USDT (ERC-20)", "USDT (Base)",
 * "USDT (SPL)"). `bridged: true` marks tokens with no native issuer
 * deployment on that chain (only a bridged contract exists).
 */

export const TOKEN_CONFIGS = {
  sol: {
    name: 'Solana',
    native: 'SOL',
    tokens: {
      mSOL: {
        mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
        decimals: 9,
        type: 'liquid-staking',
        icon: '💧',
        standard: 'SPL',
      },
      USDC: {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'SPL',
      },
      USDT: {
        mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'SPL',
      },
    },
  },
  eth: {
    name: 'Ethereum',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'ERC-20',
      },
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'ERC-20',
      },
      WBTC: {
        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
        standard: 'ERC-20',
      },
      DAI: {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'ERC-20',
      },
      LINK: {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        decimals: 18,
        type: 'token',
        icon: '🔗',
        standard: 'ERC-20',
      },
      UNI: {
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        decimals: 18,
        type: 'token',
        icon: '🦄',
        standard: 'ERC-20',
      },
    },
  },
  arb: {
    name: 'Arbitrum',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Arbitrum',
      },
      USDT: {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Arbitrum',
      },
      WBTC: {
        address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
        standard: 'Arbitrum',
        bridged: true,
      },
      DAI: {
        address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Arbitrum',
        bridged: true,
      },
      ARB: {
        address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        decimals: 18,
        type: 'governance',
        icon: '🔵',
        standard: 'Arbitrum',
      },
    },
  },
  op: {
    name: 'Optimism',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Optimism',
      },
      USDT: {
        address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Optimism',
      },
      OP: {
        address: '0x4200000000000000000000000000000000000042',
        decimals: 18,
        type: 'governance',
        icon: '🔴',
        standard: 'Optimism',
      },
      WBTC: {
        address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
        standard: 'Optimism',
        bridged: true,
      },
      DAI: {
        address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Optimism',
        bridged: true,
      },
    },
  },
  matic: {
    name: 'Polygon',
    native: 'MATIC',
    tokens: {
      USDC: {
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Polygon',
      },
      USDT: {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Polygon',
      },
      WBTC: {
        address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
        standard: 'Polygon',
        bridged: true,
      },
      DAI: {
        address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Polygon',
        bridged: true,
      },
    },
  },
  base: {
    name: 'Base',
    native: 'ETH',
    tokens: {
      USDC: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Base',
      },
      USDT: {
        address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Base',
        bridged: true,
      },
      DAI: {
        address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Base',
        bridged: true,
      },
    },
  },
  avax: {
    name: 'Avalanche',
    native: 'AVAX',
    tokens: {
      USDC: {
        address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Avalanche',
      },
      USDT: {
        address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Avalanche',
      },
      WBTC: {
        address: '0x50b7545627a5162F82A992c33b87aDc75187B218',
        decimals: 8,
        type: 'wrapped',
        icon: '₿',
        standard: 'Avalanche',
        bridged: true,
      },
      DAI: {
        address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
        decimals: 18,
        type: 'stablecoin',
        icon: '💵',
        standard: 'Avalanche',
        bridged: true,
      },
    },
  },
  trx: {
    name: 'Tron',
    native: 'TRX',
    tokens: {
      USDT: {
        address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'TRC-20',
      },
      USDC: {
        address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
        decimals: 6,
        type: 'stablecoin',
        icon: '💵',
        standard: 'TRC-20',
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
  xmr: {
    name: 'Monero',
    native: 'XMR',
    tokens: {},
  },
  zec: {
    name: 'Zcash',
    native: 'ZEC',
    tokens: {},
  },
  ton: {
    name: 'TON',
    native: 'TON',
    tokens: {},
  },
};

export const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  // Allowance/approve — used by the swap module to authorise the aggregator
  // router before an ERC-20 swap.
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
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

/**
 * Human-facing label for a token on a chain, e.g. "USDT (ERC-20)".
 * Falls back to the bare symbol when no standard tag is defined.
 */
export function getTokenLabel(chain, symbol) {
  const token = getTokenConfig(chain, symbol);
  if (!token) return symbol;
  return token.standard ? `${symbol} (${token.standard})` : symbol;
}

// Display icons for native coins (token icons live on the token entries).
const NATIVE_ICONS = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
  TRX: '🟥',
  MATIC: '⬡',
  AVAX: '🔺',
  LTC: 'Ł',
  BCH: '🅑',
  XMR: 'ɱ',
  ZEC: 'Ⓩ',
};

// Preferred display order for the deposit asset picker (anything not listed
// falls to the end, keeping the menu stable as new tokens are added).
const ASSET_DISPLAY_ORDER = [
  'BTC',
  'ETH',
  'SOL',
  'TRX',
  'USDT',
  'USDC',
  'MATIC',
  'AVAX',
  'LTC',
  'BCH',
  'XMR',
  'ZEC',
  'WBTC',
  'DAI',
  'OP',
  'ARB',
  'LINK',
  'UNI',
  'mSOL',
];

// Network display order — Ethereum-first (the canonical ERC-20), then its L2s,
// then the other major chains. Keeps the network picker intuitive instead of
// following object-insertion order.
const NETWORK_ORDER = [
  'eth',
  'arb',
  'op',
  'base',
  'matic',
  'avax',
  'sol',
  'trx',
  'btc',
  'ltc',
  'bch',
  'xmr',
  'zec',
];

/**
 * Every network on which a given asset can be received, derived from the
 * single TOKEN_CONFIGS source. Native coins and tokens are both covered.
 * Ordered for display (see NETWORK_ORDER).
 * @returns {Array<{chain, chainName, standard, isNative, bridged, decimals}>}
 */
export function getAssetNetworks(symbol) {
  const out = [];
  for (const [chain, cfg] of Object.entries(TOKEN_CONFIGS)) {
    if (cfg.native === symbol) {
      out.push({
        chain,
        chainName: cfg.name,
        standard: cfg.name,
        isNative: true,
        bridged: false,
        decimals: null,
      });
    }
    const token = cfg.tokens?.[symbol];
    if (token) {
      out.push({
        chain,
        chainName: cfg.name,
        standard: token.standard || cfg.name,
        isNative: false,
        bridged: !!token.bridged,
        decimals: token.decimals,
      });
    }
  }
  const rank = (c) => {
    const i = NETWORK_ORDER.indexOf(c);
    return i === -1 ? NETWORK_ORDER.length : i;
  };
  return out.sort((a, b) => rank(a.chain) - rank(b.chain));
}

/**
 * The full list of depositable assets (native coins + tokens), de-duplicated
 * by symbol and ordered for display.
 * @returns {Array<{symbol, icon, type}>}
 */
export function getDepositAssets() {
  const assets = new Map();
  for (const cfg of Object.values(TOKEN_CONFIGS)) {
    if (cfg.native && !assets.has(cfg.native)) {
      assets.set(cfg.native, {
        symbol: cfg.native,
        icon: NATIVE_ICONS[cfg.native] || '🔗',
        type: 'native',
      });
    }
    for (const [sym, token] of Object.entries(cfg.tokens || {})) {
      if (!assets.has(sym)) {
        assets.set(sym, { symbol: sym, icon: token.icon || '🪙', type: token.type || 'token' });
      }
    }
  }
  const rank = (s) => {
    const i = ASSET_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? ASSET_DISPLAY_ORDER.length : i;
  };
  return [...assets.values()].sort((a, b) => rank(a.symbol) - rank(b.symbol));
}
