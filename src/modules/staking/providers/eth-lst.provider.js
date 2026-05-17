import { ethers } from 'ethers';
import {
  ETH_STAKING_PROVIDERS,
  getEthStakingProvider,
  getEthStakingProviders,
} from '../../../core/staking.config.js';
import { config as appConfig } from '../../../core/config.js';
import { logger } from '../../../shared/logger.js';
import { StakingProvider } from './base.provider.js';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const WSTETH_ABI = [
  ...ERC20_ABI,
  'function stEthPerToken() view returns (uint256)',
  'function getWstETHByStETH(uint256 _stETHAmount) view returns (uint256)',
  'function unwrap(uint256 _wstETHAmount) returns (uint256)',
];

const SFRXETH_ABI = [
  ...ERC20_ABI,
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
];

const FRAX_ROUTER_ABI = ['function submitAndDeposit(address recipient) payable returns (uint256)'];

function formatEth(value) {
  return Number(ethers.formatEther(value || 0n));
}

export class EthLstProvider extends StakingProvider {
  constructor(config = {}) {
    super('eth-lst', config);
    this._provider = null;
    this.apyCache = new Map();
  }

  getProvider() {
    if (!this._provider) {
      this._provider = new ethers.JsonRpcProvider(appConfig.rpc.eth);
    }
    return this._provider;
  }

  getProtocol(protocolId) {
    const protocol = getEthStakingProvider(protocolId);
    if (!protocol) throw new Error(`ETH staking provider non supporté: ${protocolId}`);
    return protocol;
  }

  async getApy(protocolId) {
    const protocol = this.getProtocol(protocolId);
    const cached = this.apyCache.get(protocolId);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.apy;

    try {
      const response = await fetch('https://yields.llama.fi/pools', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`llama HTTP ${response.status}`);
      const payload = await response.json();
      const pools = Array.isArray(payload?.data) ? payload.data : [];
      const pool = pools.find(
        (item) =>
          item.project === protocol.project &&
          item.chain?.toLowerCase() === 'ethereum' &&
          item.symbol?.toUpperCase().includes(protocol.receiptToken.toUpperCase().replace('WSTETH', 'STETH'))
      );
      const apy = Number(pool?.apy);
      if (Number.isFinite(apy)) {
        this.apyCache.set(protocolId, { at: Date.now(), apy });
        return apy;
      }
    } catch (error) {
      logger.warn('Failed to fetch ETH staking APY', {
        protocol: protocolId,
        error: error.message,
      });
    }

    return 0;
  }

  async quote({ protocolId, amount = 0 }) {
    const protocol = this.getProtocol(protocolId);
    const amountWei = ethers.parseEther(String(amount || 0));
    let estimatedReceived = Number(amount || 0);

    if (protocolId === 'lido' && amountWei > 0n) {
      const contract = new ethers.Contract(protocol.tokenAddress, WSTETH_ABI, this.getProvider());
      estimatedReceived = formatEth(await contract.getWstETHByStETH(amountWei));
    }

    const apy = await this.getApy(protocolId);
    return {
      provider: this.id,
      protocol: protocol.id,
      name: protocol.displayName,
      symbol: protocol.receiptToken,
      amount: Number(amount || 0),
      estimatedReceived,
      apy: apy.toFixed(2),
      source: apy > 0 ? 'llama.fi' : 'fallback',
      directDepositEnabled: protocol.directDepositEnabled !== false,
    };
  }

  async deposit({ privateKey, protocolId, amount }) {
    const protocol = this.getProtocol(protocolId);
    if (protocol.directDepositEnabled === false) {
      throw new Error(`${protocol.displayName} nécessite un swap ou le front officiel pour le dépôt direct.`);
    }

    const wallet = new ethers.Wallet(privateKey, this.getProvider());
    const value = ethers.parseEther(String(amount));
    let tx;

    if (protocolId === 'lido') {
      tx = await wallet.sendTransaction({ to: protocol.stakingAddress, value });
    } else if (protocolId === 'frax') {
      const router = new ethers.Contract(protocol.stakingAddress, FRAX_ROUTER_ABI, wallet);
      tx = await router.submitAndDeposit(wallet.address, { value });
    } else {
      throw new Error(`Dépôt non implémenté pour ${protocol.displayName}`);
    }

    const receipt = await tx.wait();
    return {
      success: true,
      protocol: protocol.id,
      symbol: protocol.receiptToken,
      amount: Number(amount),
      txHash: tx.hash,
      explorerUrl: `${protocol.explorerTx}${tx.hash}`,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  }

  async withdraw({ privateKey, protocolId, amount, max = false }) {
    const protocol = this.getProtocol(protocolId);
    const wallet = new ethers.Wallet(privateKey, this.getProvider());
    const token = new ethers.Contract(
      protocol.tokenAddress,
      protocolId === 'frax' ? SFRXETH_ABI : WSTETH_ABI,
      wallet
    );
    const balance = await token.balanceOf(wallet.address);
    const amountWei = max ? balance : ethers.parseEther(String(amount));

    if (amountWei <= 0n || amountWei > balance) {
      throw new Error(`Solde ${protocol.receiptToken} insuffisant`);
    }

    let tx;
    if (protocolId === 'lido') {
      tx = await token.unwrap(amountWei);
    } else if (protocolId === 'frax') {
      tx = await token.redeem(amountWei, wallet.address, wallet.address);
    } else {
      throw new Error(`Retrait direct non implémenté pour ${protocol.displayName}`);
    }

    const receipt = await tx.wait();
    return {
      success: true,
      protocol: protocol.id,
      symbol: protocol.receiptToken,
      amount: max ? 'max' : Number(amount),
      txHash: tx.hash,
      explorerUrl: `${protocol.explorerTx}${tx.hash}`,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  }

  async getPositions(address) {
    const positions = [];
    const provider = this.getProvider();

    for (const protocol of getEthStakingProviders()) {
      try {
        const token = new ethers.Contract(protocol.tokenAddress, ERC20_ABI, provider);
        const [balance, decimals] = await Promise.all([
          token.balanceOf(address),
          token.decimals().catch(() => 18),
        ]);
        const amount = Number(ethers.formatUnits(balance, decimals));
        if (amount > 0.000001) {
          const quote = await this.quote({ protocolId: protocol.id, amount });
          positions.push({
            protocol: protocol.id,
            name: protocol.displayName,
            symbol: protocol.receiptToken,
            amount,
            apy: quote.apy,
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch ETH staking position', {
          protocol: protocol.id,
          error: error.message,
        });
      }
    }

    return positions;
  }

  getSupportedProtocols() {
    return Object.values(ETH_STAKING_PROVIDERS);
  }
}

export const ethLstProvider = new EthLstProvider();
export default ethLstProvider;
