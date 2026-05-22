const KAMINO_API = 'https://api.kamino.finance';
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

const JUPITER_TOKENS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

import { config } from '../../core/config.js';
import { getAaveChains } from '../../core/staking.config.js';
import { logger } from '../../shared/logger.js';
import { aaveProvider } from './providers/registry.js';

const SOL_RPC = config.rpc.stakingSol || config.rpc.sol;

const PROTOCOL_INFO = {
  'aave-v3': {
    name: 'Aave V3',
    chain: 'Multi-chain',
    networkFeeDeposit: 0.02,
    networkFeeWithdraw: 0.02,
    slippage: 0,
    protocolFee: 0,
    url: 'https://app.aave.com',
  },
  kamino: {
    name: 'Kamino',
    chain: 'Solana',
    networkFeeDeposit: 0.01,
    networkFeeWithdraw: 0.01,
    slippage: 0,
    protocolFee: 0,
    url: 'https://app.kamino.finance/lend',
  },
  jupiter: {
    name: 'Jupiter Lend',
    chain: 'Solana',
    networkFeeDeposit: 0.01,
    networkFeeWithdraw: 0.01,
    slippage: 0.001,
    protocolFee: 0,
    url: 'https://jup.ag/lend',
  },
};

let apyCache = {
  aave: { data: null, lastUpdate: 0 },
  kamino: { data: null, lastUpdate: 0 },
  jupiter: { data: null, lastUpdate: 0 },
};
const CACHE_DURATION = 5 * 60 * 1000;

export class StakingService {
  static async getAaveApy() {
    if (apyCache.aave.data && Date.now() - apyCache.aave.lastUpdate < CACHE_DURATION) {
      return apyCache.aave.data;
    }

    try {
      const chains = {};
      const flat = {};

      for (const chain of getAaveChains()) {
        chains[chain.id] = {
          id: chain.id,
          name: chain.displayName,
          icon: chain.icon,
          tokens: {},
        };

        for (const token of Object.values(chain.tokens)) {
          try {
            const quote = await aaveProvider.quote({
              chainId: chain.id,
              symbol: token.symbol,
            });
            const entry = {
              apy: quote.apy,
              symbol: token.symbol,
              source: quote.apySource,
              chain: chain.id,
              chainName: chain.displayName,
            };
            chains[chain.id].tokens[token.symbol] = entry;
            const current = flat[token.symbol];
            if (!current || Number(entry.apy) > Number(current.apy)) {
              flat[token.symbol] = entry;
            }
          } catch (error) {
            logger.warn('Failed to fetch Aave APY', {
              chain: chain.id,
              symbol: token.symbol,
              error: error.message,
            });
          }
        }
      }

      const result = { tokens: flat, chains };
      apyCache.aave = { data: result, lastUpdate: Date.now() };
      return result;
    } catch (error) {
      logger.logError(error, { context: 'staking.getAaveApy' });
      return {
        tokens: {
          USDC: { apy: '1.65', symbol: 'USDC', chain: 'arb', chainName: 'Arbitrum' },
          USDT: { apy: '2.13', symbol: 'USDT', chain: 'arb', chainName: 'Arbitrum' },
        },
        chains: {},
      };
    }
  }

  static async getKaminoApy() {
    if (apyCache.kamino.data && Date.now() - apyCache.kamino.lastUpdate < CACHE_DURATION) {
      return apyCache.kamino.data;
    }

    try {
      const response = await fetch(
        `${KAMINO_API}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) throw new Error('API error');

      const data = await response.json();

      const usdcReserve = data.find((r) => r.mint === JUPITER_TOKENS.USDC);

      if (usdcReserve && usdcReserve.supplyApy) {
        const result = {
          USDC: {
            apy: (parseFloat(usdcReserve.supplyApy) * 100).toFixed(2),
            tvlUsd: parseFloat(usdcReserve.totalSupply) / 1e6,
            symbol: 'USDC',
          },
        };
        apyCache.kamino = { data: result, lastUpdate: Date.now() };
        return result;
      }
    } catch (error) {
      logger.warn('Kamino APY unavailable, using fallback estimate', {
        error: error.message,
      });
    }

    const result = { USDC: { apy: '3.80', symbol: 'USDC' } };
    apyCache.kamino = { data: result, lastUpdate: Date.now() };
    return result;
  }

  static async getJupiterApy() {
    if (apyCache.jupiter.data && Date.now() - apyCache.jupiter.lastUpdate < CACHE_DURATION) {
      return apyCache.jupiter.data;
    }

    const result = {
      USDC: { apy: '5.20', symbol: 'USDC' },
      USDT: { apy: '4.80', symbol: 'USDT' },
    };
    apyCache.jupiter = { data: result, lastUpdate: Date.now() };
    return result;
  }

  static async getAllApy() {
    const [aave, kamino, jupiter] = await Promise.all([
      this.getAaveApy(),
      this.getKaminoApy(),
      this.getJupiterApy(),
    ]);

    return {
      aave: { ...PROTOCOL_INFO['aave-v3'], ...aave },
      kamino: { ...PROTOCOL_INFO.kamino, tokens: kamino },
      jupiter: { ...PROTOCOL_INFO.jupiter, tokens: jupiter },
    };
  }

  static calculateYield(amount, apy, months) {
    const numAmount = parseFloat(amount);
    const numApy = parseFloat(apy);
    if (isNaN(numAmount) || isNaN(numApy)) return 0;
    return ((numAmount * numApy) / 100 / 12) * months;
  }

  static calculateProfit({ amount, apy, months, protocol }) {
    const numAmount = parseFloat(amount);
    const numApy = parseFloat(apy);

    if (isNaN(numAmount) || isNaN(numApy)) {
      return {
        grossYield: 0,
        totalFees: 0,
        netProfit: 0,
        breakdown: {
          depositFee: 0,
          withdrawFee: 0,
          slippageCost: 0,
          slippagePercent: 0,
        },
        roi: 0,
      };
    }

    const protocolInfo = PROTOCOL_INFO[protocol] || PROTOCOL_INFO['aave-v3'];

    const grossYield = ((numAmount * numApy) / 100 / 12) * months;

    const depositFee = protocolInfo.networkFeeDeposit;
    const withdrawFee = protocolInfo.networkFeeWithdraw;
    const slippagePercent = protocolInfo.slippage;
    const slippageCost = numAmount * slippagePercent;
    const totalFees = depositFee + withdrawFee + slippageCost;

    const netProfit = grossYield - totalFees;
    const roi = months > 0 ? (netProfit / numAmount) * 100 : 0;

    return {
      grossYield,
      totalFees,
      netProfit,
      breakdown: {
        depositFee,
        withdrawFee,
        slippageCost,
        slippagePercent: slippagePercent * 100,
      },
      roi: roi.toFixed(2),
    };
  }

  static formatCurrency(value, currency = '$') {
    return `${currency}${value.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  static async getUserAavePosition(address, chain = 'arbitrum') {
    try {
      const chainId = chain === 'arbitrum' ? 'arb' : chain;
      const positions = await aaveProvider.getPositions(address, chainId);
      return Object.fromEntries(
        positions.map((position) => [
          `${position.chain}:${position.symbol}`,
          {
            amount: position.amount.toFixed(2),
            aTokenBalance: position.aTokenBalance,
            symbol: position.symbol,
            chain: position.chain,
            chainName: position.chainName,
            decimals: 6,
            protocol: 'aave-v3',
          },
        ])
      );
    } catch (error) {
      logger.logError(error, { context: 'staking.getUserAavePosition', address });
      return {};
    }
  }

  static async getUserKaminoPosition(address) {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(SOL_RPC, { commitment: 'confirmed' });

      const userPubkey = new PublicKey(address);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const kTokens = [];
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed.info;
        if (info.tokenAmount.uiAmount > 0.001) {
          let symbol = info.mint === JUPITER_TOKENS.USDC ? 'KUSDC' : info.mint.slice(0, 6);
          kTokens.push({
            mint: info.mint,
            amount: info.tokenAmount.uiAmount,
            symbol,
            source: 'kamino',
            protocol: 'kamino',
          });
        }
      }

      return { tokens: kTokens };
    } catch (error) {
      logger.logError(error, { context: 'staking.getUserKaminoPosition', address });
      return { tokens: [] };
    }
  }

  static async getUserJupiterPosition(address) {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(SOL_RPC, { commitment: 'confirmed' });
      const userPubkey = new PublicKey(address);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const jTokens = [];
      for (const account of tokenAccounts.value) {
        const info = account.account.data.parsed.info;
        if (info.tokenAmount.uiAmount > 0.001) {
          let symbol = info.mint;
          if (info.mint === JUPITER_TOKENS.USDC) symbol = 'jlUSDC';
          else if (info.mint === JUPITER_TOKENS.USDT) symbol = 'jlUSDT';

          jTokens.push({
            mint: info.mint,
            amount: info.tokenAmount.uiAmount,
            symbol,
            source: 'jupiter',
            protocol: 'jupiter',
          });
        }
      }

      return { tokens: jTokens };
    } catch (error) {
      logger.logError(error, { context: 'staking.getUserJupiterPosition', address });
      return { tokens: [] };
    }
  }

  static formatApy(apy) {
    const num = parseFloat(apy);
    if (isNaN(num)) return 'N/A';
    return num.toFixed(2) + '%';
  }

  static calculateMonthlyYield(amount, apy) {
    return this.calculateYield(amount, apy, 1);
  }

  static getDepositUrl(protocol, _symbol) {
    return PROTOCOL_INFO[protocol]?.url || 'https://app.aave.com';
  }

  static getProtocols() {
    return PROTOCOL_INFO;
  }
}

export default StakingService;
