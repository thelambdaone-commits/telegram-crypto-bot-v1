import { ethers } from 'ethers';
import { BaseProvider } from './base.provider.js';
import { TOKEN_CONFIGS } from '../core/tokens.config.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class EthereumChain extends BaseProvider {
  constructor(rpcUrl) {
    super('Ethereum', 'ETH');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.tokenAddresses = TOKEN_CONFIGS.eth.tokens;
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
    // Ensure the private key has 0x prefix
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: null,
    };
  }

  async getBalance(address) {
    const balance = await this.provider.getBalance(address);
    const ethBalance = ethers.formatEther(balance);

    return {
      balance: ethBalance,
      balanceWei: balance.toString(),
      symbol: this.symbol,
    };
  }

  async getAllTokens(address) {
    const results = [];
    
    for (const [symbol, config] of Object.entries(this.tokenAddresses)) {
      try {
        const contract = new ethers.Contract(config.address, ERC20_ABI, this.provider);
        const balance = await contract.balanceOf(address);
        const decimals = await contract.decimals();
        
        if (balance > 0n) {
          results.push({
            symbol,
            address: config.address,
            amount: Number(balance) / Math.pow(10, decimals),
            decimals,
            icon: config.icon,
            isKnown: true,
          });
        }
      } catch (error) {
        continue;
      }
    }
    
    return results;
  }

  async estimateFees(fromAddress, toAddress, amount) {
    const feeData = await this.provider.getFeeData();
    const gasLimit = 21000n; // Standard ETH transfer

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
      };
    }

    return fees;
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = 'average') {
    const wallet = new ethers.Wallet(privateKey, this.provider);
    const fees = await this.estimateFees(wallet.address, toAddress, amount);
    const feeData = fees[feeLevel];

    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount.toString()),
      maxFeePerGas: BigInt(feeData.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(feeData.maxPriorityFeePerGas),
      gasLimit: BigInt(feeData.gasLimit),
    });

    const receipt = await tx.wait();

    return {
      hash: tx.hash,
      from: wallet.address,
      to: toAddress,
      amount: amount.toString(),
      fee: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
    };
  }

  async getTransactionHistory(address, limit = 5) {
    try {
      // Etherscan API (free tier)
      const response = await fetch(
        `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`
      );
      const data = await response.json();
      if (data.status !== '1' || !data.result?.length) {
        return [];
      }
      return data.result.map(tx => ({
        hash: tx.hash,
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'out' : 'in',
        amount: (Number(tx.value) / 1e18).toFixed(6),
        timestamp: Number(tx.timeStamp) * 1000,
      }));
    } catch (error) {
      return [];
    }
  }

  validateAddress(address) {
    return ethers.isAddress(address);
  }
}
