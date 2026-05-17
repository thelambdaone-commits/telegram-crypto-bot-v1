import { ethers } from 'ethers';
import aavePoolAbi from '../abis/aave-pool.js';
import { config as appConfig } from '../../../core/config.js';
import { AAVE_CHAIN_CONFIGS, getAaveChain, getAaveChains } from '../../../core/staking.config.js';
import { logger } from '../../../shared/logger.js';
import { StakingProvider } from './base.provider.js';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

const RAY = 10n ** 27n;
const UINT256_MAX = (1n << 256n) - 1n;
const AAVE_POOL_INTERFACE = new ethers.Interface(aavePoolAbi);

function normalizeApy(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function rayToApy(rayValue) {
  const rate = Number(BigInt(rayValue || 0n)) / Number(RAY);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate * 100;
}

function amountToUnits(amount, decimals) {
  return ethers.parseUnits(String(amount), decimals);
}

function formatUnits(amount, decimals) {
  return Number(ethers.formatUnits(amount || 0n, decimals));
}

function normalizePoolSymbol(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replaceAll('₮', 'T')
    .replace(/[^A-Z0-9]/g, '');
}

export class AaveProvider extends StakingProvider {
  constructor(config = {}) {
    super('aave-v3', config);
    this.providers = new Map();
    this.apyCache = new Map();
    this.reserveCache = new Map();
    this.llamaPoolsCache = null;
  }

  getChainConfig(chainId) {
    const chain = getAaveChain(chainId);
    if (!chain) throw new Error(`Chaîne Aave non supportée: ${chainId}`);
    return chain;
  }

  getTokenConfig(chainId, symbol) {
    const chain = this.getChainConfig(chainId);
    const token = chain.tokens[symbol?.toUpperCase()];
    if (!token) throw new Error(`Token Aave non supporté sur ${chain.displayName}: ${symbol}`);
    return token;
  }

  getProvider(chainId) {
    if (!this.providers.has(chainId)) {
      const chain = this.getChainConfig(chainId);
      const rpcUrl = appConfig.rpc[chain.rpcKey];
      if (!rpcUrl) throw new Error(`RPC manquant pour ${chain.displayName}`);
      this.providers.set(chainId, new ethers.JsonRpcProvider(rpcUrl));
    }
    return this.providers.get(chainId);
  }

  getPool(chainId, signerOrProvider = this.getProvider(chainId)) {
    const chain = this.getChainConfig(chainId);
    return new ethers.Contract(chain.poolAddress, aavePoolAbi, signerOrProvider);
  }

  async rpcCall(chainId, method, params) {
    const chain = this.getChainConfig(chainId);
    const rpcUrl = appConfig.rpc[chain.rpcKey];
    if (!rpcUrl) throw new Error(`RPC manquant pour ${chain.displayName}`);

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'RPC error');
    return payload.result;
  }

  async getReserveData(chainId, symbol) {
    const chain = this.getChainConfig(chainId);
    const token = this.getTokenConfig(chainId, symbol);
    const cacheKey = `${chainId}:${symbol.toUpperCase()}`;
    const cached = this.reserveCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 60_000) return cached.data;

    const callData = AAVE_POOL_INTERFACE.encodeFunctionData('getReserveData', [token.address]);
    const raw = await this.rpcCall(chainId, 'eth_call', [
      { to: chain.poolAddress, data: callData },
      'latest',
    ]);
    const [data] = AAVE_POOL_INTERFACE.decodeFunctionResult('getReserveData', raw);
    const reserve = {
      chain: chain.id,
      symbol: token.symbol,
      aTokenAddress: data.aTokenAddress,
      liquidityRate: data.currentLiquidityRate,
      onChainApy: rayToApy(data.currentLiquidityRate),
    };

    this.reserveCache.set(cacheKey, { at: Date.now(), data: reserve });
    return reserve;
  }

  async getLlamaApy(chainId, symbol) {
    const cacheKey = `${chainId}:${symbol.toUpperCase()}`;
    const cached = this.apyCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.apy;

    const chain = this.getChainConfig(chainId);
    const token = this.getTokenConfig(chainId, symbol);
    const acceptedSymbols = new Set(
      [token.symbol, ...(token.llamaSymbols || [])].map((item) => normalizePoolSymbol(item))
    );

    try {
      const pools = await this.getLlamaPools();
      const matchingPools = pools.filter(
        (item) =>
          item.project === 'aave-v3' &&
          item.chain?.toLowerCase() === (chain.llamaChain || chain.name).toLowerCase() &&
          acceptedSymbols.has(normalizePoolSymbol(item.symbol))
      );
      const pool = matchingPools.sort((a, b) => Number(b.tvlUsd || 0) - Number(a.tvlUsd || 0))[0];
      const apy = normalizeApy(pool?.apy, null);
      if (apy !== null) {
        const result = {
          apy,
          apyBase: normalizeApy(pool?.apyBase, apy),
          tvlUsd: Number(pool?.tvlUsd || 0),
          poolId: pool?.pool || null,
          poolSymbol: pool?.symbol || token.symbol,
        };
        this.apyCache.set(cacheKey, { at: Date.now(), apy: result });
        return result;
      }
    } catch (error) {
      logger.warn('Failed to fetch Aave APY from DefiLlama', {
        chain: chainId,
        symbol,
        error: error.message,
      });
    }

    return null;
  }

  async getLlamaPools() {
    if (this.llamaPoolsCache && Date.now() - this.llamaPoolsCache.at < 5 * 60_000) {
      return this.llamaPoolsCache.pools;
    }

    const response = await fetch('https://yields.llama.fi/pools', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`llama HTTP ${response.status}`);
    const payload = await response.json();
    const pools = Array.isArray(payload?.data) ? payload.data : [];
    this.llamaPoolsCache = { at: Date.now(), pools };
    return pools;
  }

  async quote({ chainId, symbol, amount = 0 }) {
    const token = this.getTokenConfig(chainId, symbol);
    const llama = await this.getLlamaApy(chainId, token.symbol);
    let reserve = null;
    try {
      reserve = await this.getReserveData(chainId, token.symbol);
    } catch (error) {
      logger.warn('Aave reserve data unavailable', {
        chain: chainId,
        symbol: token.symbol,
        error: error.message,
      });
    }

    const apy = llama?.apy ?? reserve?.onChainApy ?? 0;
    const amountNum = Number(amount) || 0;

    return {
      provider: this.id,
      chain: chainId,
      symbol: token.symbol,
      amount: amountNum,
      apy: Number(apy || 0).toFixed(2),
      apyBase: Number(llama?.apyBase ?? apy ?? 0).toFixed(2),
      apySource: llama !== null ? 'llama.fi' : reserve ? 'on-chain' : 'unavailable',
      tvlUsd: llama?.tvlUsd || 0,
      poolSymbol: llama?.poolSymbol || token.symbol,
      estimatedYearlyYield: amountNum > 0 ? (amountNum * Number(apy || 0)) / 100 : 0,
      aTokenAddress: reserve?.aTokenAddress || null,
      onChainAvailable: Boolean(reserve),
    };
  }

  async deposit({ privateKey, chainId, symbol, amount }) {
    const chain = this.getChainConfig(chainId);
    const token = this.getTokenConfig(chainId, symbol);
    const provider = this.getProvider(chainId);
    const wallet = new ethers.Wallet(privateKey, provider);
    const pool = this.getPool(chainId, wallet);
    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, wallet);
    const parsedAmount = amountToUnits(amount, token.decimals);

    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance < parsedAmount) {
      throw new Error(`Solde ${token.symbol} insuffisant sur ${chain.displayName}`);
    }

    const allowance = await tokenContract.allowance(wallet.address, chain.poolAddress);
    let approveHash = null;
    if (allowance < parsedAmount) {
      const approveTx = await tokenContract.approve(chain.poolAddress, parsedAmount);
      approveHash = approveTx.hash;
      await approveTx.wait();
    }

    const supplyTx = await pool.supply(token.address, parsedAmount, wallet.address, 0);
    const receipt = await supplyTx.wait();

    return {
      success: true,
      chain: chain.id,
      symbol: token.symbol,
      amount: Number(amount),
      approveHash,
      txHash: supplyTx.hash,
      explorerUrl: `${chain.explorerTx}${supplyTx.hash}`,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  }

  async withdraw({ privateKey, chainId, symbol, amount, max = false }) {
    const chain = this.getChainConfig(chainId);
    const token = this.getTokenConfig(chainId, symbol);
    const provider = this.getProvider(chainId);
    const wallet = new ethers.Wallet(privateKey, provider);
    const pool = this.getPool(chainId, wallet);
    const parsedAmount = max ? UINT256_MAX : amountToUnits(amount, token.decimals);

    const tx = await pool.withdraw(token.address, parsedAmount, wallet.address);
    const receipt = await tx.wait();

    return {
      success: true,
      chain: chain.id,
      symbol: token.symbol,
      amount: max ? 'max' : Number(amount),
      txHash: tx.hash,
      explorerUrl: `${chain.explorerTx}${tx.hash}`,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  }

  async getPositions(address, chainId = null) {
    const chains = chainId ? [this.getChainConfig(chainId)] : getAaveChains();
    const positions = [];

    for (const chain of chains) {
      const provider = this.getProvider(chain.id);
      for (const token of Object.values(chain.tokens)) {
        try {
          const reserve = await this.getReserveData(chain.id, token.symbol);
          const aToken = new ethers.Contract(reserve.aTokenAddress, ERC20_ABI, provider);
          const balance = await aToken.balanceOf(address);
          const amount = formatUnits(balance, token.decimals);
          if (amount > 0.000001) {
            const quote = await this.quote({ chainId: chain.id, symbol: token.symbol, amount });
            positions.push({
              chain: chain.id,
              chainName: chain.displayName,
              symbol: token.symbol,
              amount,
              aTokenBalance: balance.toString(),
              aTokenAddress: reserve.aTokenAddress,
              apy: quote.apy,
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch Aave position', {
            chain: chain.id,
            symbol: token.symbol,
            error: error.message,
          });
        }
      }
    }

    return positions;
  }

  getSupportedChains() {
    return Object.values(AAVE_CHAIN_CONFIGS);
  }
}

export const aaveProvider = new AaveProvider();
export default aaveProvider;
