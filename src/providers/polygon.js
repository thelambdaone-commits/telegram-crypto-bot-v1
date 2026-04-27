import { TOKEN_CONFIGS } from "../core/tokens.config.js";
import { BaseProvider } from "./base.provider.js";
import { ethers } from "ethers";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export class PolygonChain extends BaseProvider {
  constructor(rpcUrl) {
    super("Polygon", "MATIC");
    this.rpcUrl = rpcUrl || "https://polygon-rpc.com";
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.tokenAddresses = TOKEN_CONFIGS.matic.tokens;
    this.explorer = "https://polygonscan.com";
  }

  getProvider() {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }
    return this.provider;
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
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: null,
    };
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && this.tokenAddresses[tokenSymbol]) {
      const tokenAddress = this.tokenAddresses[tokenSymbol];
      const provider = this.getProvider();
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(address);
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();
      
      return {
        balance: (balance / BigInt(10 ** decimals)).toString(),
        balanceWei: balance.toString(),
        symbol: symbol,
        isToken: true,
        tokenAddress: tokenAddress,
      };
    }

    const provider = this.getProvider();
    const balance = await provider.getBalance(address);
    return {
      balance: (balance / BigInt(1e18)).toString(),
      balanceWei: balance.toString(),
      symbol: this.symbol,
      isToken: false,
    };
  }

  async getAllTokens(address) {
    const results = []
    const provider = this.getProvider()
    
    for (const [symbol, tokenAddress] of Object.entries(this.tokenAddresses)) {
      try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
        const balance = await contract.balanceOf(address)
        const decimals = await contract.decimals()
        
        if (balance > 0n) {
          results.push({
            symbol,
            address: tokenAddress,
            amount: Number(balance) / Math.pow(10, decimals),
            decimals,
            icon: "💵",
            isKnown: true,
          })
        }
      } catch (error) {
        continue
      }
    }
    
    return results
  }

  async estimateFees(fromAddress, toAddress, amount, tokenSymbol = null) {
    const feeData = await this.provider.getFeeData();
    
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

  async sendTransaction(privateKey, toAddress, amount, feeLevel = "average", tokenSymbol = null) {
    const provider = this.getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    if (tokenSymbol && this.tokenAddresses[tokenSymbol]) {
      return await this.sendToken(wallet, toAddress, amount, feeLevel, tokenSymbol);
    }

    return await this.sendNative(wallet, toAddress, amount, feeLevel);
  }

  async sendNative(wallet, toAddress, amount, feeLevel = "average") {
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
      symbol: "MATIC",
      fee: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "success" : "failed",
    };
  }

  async sendToken(wallet, toAddress, amount, feeLevel, tokenSymbol) {
    const tokenAddress = this.tokenAddresses[tokenSymbol];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    const decimals = await tokenContract.decimals();
    const amountWei = ethers.parseUnits(amount.toString(), decimals);

    const fees = await this.estimateFees(wallet.address, toAddress, amount, tokenSymbol);
    const feeData = fees[feeLevel];

    const tx = await tokenContract.transfer(toAddress, amountWei, {
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
      symbol: tokenSymbol,
      tokenAddress: tokenAddress,
      fee: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "success" : "failed",
    };
  }

  async getGasPrice() {
    const provider = this.getProvider();
    const feeData = await provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0,
      maxFeePerGas: feeData.maxFeePerGas ? Number(feeData.maxFeePerGas) / 1e9 : 0,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? Number(feeData.maxPriorityFeePerGas) / 1e9 : 0,
    };
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

export default PolygonChain;