import { ethers } from 'ethers';
import { BaseProvider } from './base.provider.js';
import { TOKEN_CONFIGS, ERC20_ABI } from '../core/tokens.config.js';
import { withTimeout } from '../shared/rpc-timeout.js';

export class EvmBaseProvider extends BaseProvider {
  constructor(config) {
    super(config.name, config.symbol);
    this.nativeSymbol = config.nativeSymbol || config.symbol;
    this.rpcUrl = config.rpcUrl;
    this.tokenConfigKey = config.tokenConfigKey;
    this.explorer = config.explorer || null;
    this._provider = null;
    this.tokenAddresses = TOKEN_CONFIGS[this.tokenConfigKey]?.tokens || {};
  }

  getProvider() {
    if (!this._provider) {
      this._provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }
    return this._provider;
  }

  async createWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
    };
  }

  async importFromSeed(seedPhrase) {
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: seedPhrase,
    };
  }

  async importFromKey(privateKey) {
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: null,
    };
  }

  async getBalance(address, tokenSymbol = null) {
    const provider = this.getProvider();

    if (tokenSymbol && this.tokenAddresses[tokenSymbol]) {
      const token = this.tokenAddresses[tokenSymbol];
      const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const balance = await withTimeout(tokenContract.balanceOf(address), 10000);
      const decimals = await withTimeout(tokenContract.decimals(), 10000);
      const symbol = await withTimeout(tokenContract.symbol(), 10000);

      return {
        balance: (balance / BigInt(10 ** decimals)).toString(),
        balanceWei: balance.toString(),
        symbol,
        isToken: true,
        tokenAddress: token.address,
      };
    }

    const balance = await withTimeout(provider.getBalance(address), 15000);
    return {
      balance: (balance / BigInt(10n ** 18n)).toString(),
      balanceWei: balance.toString(),
      symbol: this.symbol,
      isToken: false,
    };
  }

  async getAllTokens(address) {
    const provider = this.getProvider();

    const results = await Promise.all(
      Object.entries(this.tokenAddresses).map(async ([symbol, token]) => {
        try {
          const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
          const [balance, decimals] = await Promise.all([
            withTimeout(contract.balanceOf(address), 10000),
            withTimeout(contract.decimals(), 10000),
          ]);

          if (balance > 0n) {
            return {
              symbol,
              address: token.address,
              amount: Number(balance) / Math.pow(10, decimals),
              decimals,
              icon: token.icon || '💵',
              isKnown: true,
            };
          }
        } catch {
          // skip tokens that fail
        }
        return null;
      })
    );

    return results.filter(Boolean);
  }

  async estimateFees(fromAddress, toAddress, amount, tokenSymbol = null) {
    const provider = this.getProvider();
    const feeData = await withTimeout(provider.getFeeData(), 15000);

    const isToken = tokenSymbol && this.tokenAddresses[tokenSymbol];
    const gasLimit = isToken ? 65000n : 21000n;

    const levels = {
      slow: {
        maxFeePerGas: (feeData.maxFeePerGas * 80n) / 100n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 80n) / 100n,
      },
      average: {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      },
      fast: {
        maxFeePerGas: (feeData.maxFeePerGas * 120n) / 100n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n,
      },
    };

    const fees = {};
    for (const [level, data] of Object.entries(levels)) {
      const estimatedFee = gasLimit * data.maxFeePerGas;
      fees[level] = {
        gasLimit: gasLimit.toString(),
        maxFeePerGas: data.maxFeePerGas.toString(),
        maxPriorityFeePerGas: data.maxPriorityFeePerGas.toString(),
        estimatedFee: ethers.formatEther(estimatedFee),
        estimatedFeeWei: estimatedFee.toString(),
        gasPriceGwei: Number(data.maxFeePerGas) / 1e9,
      };
    }

    return fees;
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = 'average', tokenSymbol = null) {
    const provider = this.getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    if (tokenSymbol && this.tokenAddresses[tokenSymbol]) {
      return await this.sendToken(wallet, toAddress, amount, feeLevel, tokenSymbol);
    }

    return await this.sendNative(wallet, toAddress, amount, feeLevel);
  }

  async sendNative(wallet, toAddress, amount, feeLevel = 'average') {
    const fees = await this.estimateFees(wallet.address, toAddress, amount);
    const feeData = fees[feeLevel];

    const tx = await withTimeout(
      wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount.toString()),
        maxFeePerGas: BigInt(feeData.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(feeData.maxPriorityFeePerGas),
        gasLimit: BigInt(feeData.gasLimit),
      }),
      30000
    );

    const receipt = await withTimeout(tx.wait(), 60000);

    return {
      hash: tx.hash,
      from: wallet.address,
      to: toAddress,
      amount: amount.toString(),
      symbol: this.nativeSymbol,
      fee: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
    };
  }

  async sendToken(wallet, toAddress, amount, feeLevel, tokenSymbol) {
    const token = this.tokenAddresses[tokenSymbol];
    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, wallet);

    const decimals = await tokenContract.decimals();
    const amountWei = ethers.parseUnits(amount.toString(), decimals);

    const fees = await this.estimateFees(wallet.address, toAddress, amount, tokenSymbol);
    const feeData = fees[feeLevel];

    const tx = await withTimeout(
      tokenContract.transfer(toAddress, amountWei, {
        maxFeePerGas: BigInt(feeData.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(feeData.maxPriorityFeePerGas),
        gasLimit: BigInt(feeData.gasLimit),
      }),
      30000
    );

    const receipt = await withTimeout(tx.wait(), 60000);

    return {
      hash: tx.hash,
      from: wallet.address,
      to: toAddress,
      amount: amount.toString(),
      symbol: tokenSymbol,
      tokenAddress: token.address,
      fee: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
    };
  }

  async getGasPrice() {
    const provider = this.getProvider();
    const feeData = await provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0,
      maxFeePerGas: feeData.maxFeePerGas ? Number(feeData.maxFeePerGas) / 1e9 : 0,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? Number(feeData.maxPriorityFeePerGas) / 1e9
        : 0,
    };
  }

  async getTransactionHistory(address, limit = 5) {
    try {
      const explorerApiUrl = this.getExplorerApiUrl();
      if (!explorerApiUrl) return [];

      const response = await fetch(
        `${explorerApiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`
      );
      const data = await response.json();
      if (data.status !== '1' || !data.result?.length) {
        return [];
      }
      return data.result.map((tx) => ({
        hash: tx.hash,
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'out' : 'in',
        amount: (Number(tx.value) / 1e18).toFixed(6),
        timestamp: Number(tx.timeStamp) * 1000,
      }));
    } catch (error) {
      return [];
    }
  }

  getExplorerApiUrl() {
    const explorers = {
      eth: 'https://api.etherscan.io/api',
      arb: 'https://api.arbiscan.io/api',
      matic: 'https://api.polygonscan.com/api',
      op: 'https://api-optimistic.etherscan.io/api',
      base: 'https://api.basescan.org/api',
    };
    return explorers[this.tokenConfigKey] || null;
  }

  validateAddress(address) {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  getTokenAddresses() {
    return this.tokenAddresses;
  }
}

export default EvmBaseProvider;
