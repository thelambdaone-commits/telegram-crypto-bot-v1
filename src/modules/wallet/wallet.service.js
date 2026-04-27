import { EthereumChain } from "../../providers/ethereum.js"
import { BitcoinChain } from "../../providers/bitcoin.js"
import { SolanaChain } from "../../providers/solana.js"
import { ArbitrumChain } from "../../providers/arbitrum.js"
import { LitecoinChain } from "../../providers/litecoin.js"
import { BitcoinCashChain } from "../../providers/bitcoincash.js"
import { PolygonChain } from "../../providers/polygon.js"
import { OptimismChain } from "../../providers/optimism.js"
import { BaseChain } from "../../providers/base.js"

export class WalletService {
  constructor(storage, config) {
    this.storage = storage
    this.chains = {
      eth: new EthereumChain(config.rpc.eth),
      btc: new BitcoinChain(config.rpc.btcApi),
      sol: new SolanaChain(config.rpc.sol),
      arb: new ArbitrumChain(config.rpc.arb),
      ltc: new LitecoinChain(config.rpc.ltcApi),
      bch: new BitcoinCashChain(config.rpc.bchApi),
      matic: new PolygonChain(config.rpc.matic),
      op: new OptimismChain(config.rpc.op),
      base: new BaseChain(config.rpc.base),
    }
  }

  /**
   * Create wallet - no passphrase
   */
  async createWallet(chatId, chain, label = null) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }

    const wallet = await chainHandler.createWallet()
    wallet.chain = chain
    wallet.label = label

    const savedWallet = await this.storage.addWallet(chatId, wallet)

    return {
      id: savedWallet.id,
      chain: savedWallet.chain,
      address: savedWallet.address,
      label: savedWallet.label,
    }
  }

  /**
   * Get balance for any public address (no wallet needed)
   */
  async getPublicAddressBalance(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }
    return await chainHandler.getBalance(address)
  }

  /**
   * Get all tokens for any public address (no wallet needed)
   */
  async getPublicAddressTokens(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }
    
    if (chain === "sol") {
      return await chainHandler.getAllTokensWithSymbols(address)
    }
    
    if (chainHandler.getAllTokens) {
      return await chainHandler.getAllTokens(address)
    }
    
    return []
  }

  /**
   * Get balances for all wallets
   */
  async getAllBalances(chatId) {
    const wallets = await this.storage.getWallets(chatId)
    const balances = []

    for (const wallet of wallets) {
      try {
        const chainHandler = this.chains[wallet.chain]
        const balance = await chainHandler.getBalance(wallet.address)
        balances.push({
          ...wallet,
          balance: balance.balance,
        })
      } catch (error) {
        balances.push({
          ...wallet,
          balance: "Erreur",
          error: error.message,
        })
      }
    }

    return balances
  }

  /**
   * Estimate transaction fees
   */
  async estimateFees(chatId, walletId, toAddress, amount, tokenSymbol = null) {
    const wallets = await this.storage.getWallets(chatId)
    const wallet = wallets.find((w) => w.id === walletId)

    if (!wallet) {
      throw new Error("Wallet non trouve")
    }

    const chainHandler = this.chains[wallet.chain]
    return await chainHandler.estimateFees(wallet.address, toAddress, amount, tokenSymbol)
  }

  /**
   * Get balance for wallet or token
   */
  async getBalance(chatId, walletId, tokenSymbol = null) {
    const wallets = await this.storage.getWallets(chatId)
    const wallet = wallets.find((w) => w.id === walletId)

    if (!wallet) {
      throw new Error("Wallet non trouve")
    }

    const chainHandler = this.chains[wallet.chain]
    return await chainHandler.getBalance(wallet.address, tokenSymbol)
  }

  /**
   * Send transaction - no passphrase
   */
  async sendTransaction(chatId, walletId, toAddress, amount, feeLevel, tokenSymbol = null) {
    const wallet = await this.storage.getWalletWithKey(chatId, walletId)

    if (!wallet) {
      throw new Error("Wallet non trouve")
    }

    const chainHandler = this.chains[wallet.chain]
    return await chainHandler.sendTransaction(wallet.privateKey, toAddress, amount, feeLevel, tokenSymbol)
  }

  /**
   * Import wallet from seed or private key
   */
  async importWallet(chatId, chain, type, input, label = null) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }

    let walletData
    if (type === "seed") {
      walletData = await chainHandler.importFromSeed(input)
    } else if (type === "key") {
      walletData = await chainHandler.importFromKey(input)
    } else {
      throw new Error("Type d'importation invalide")
    }

    walletData.chain = chain
    walletData.label = label || `Wallet ${chain.toUpperCase()}`

    const savedWallet = await this.storage.addWallet(chatId, walletData)

    return {
      id: savedWallet.id,
      chain: savedWallet.chain,
      address: savedWallet.address,
      label: savedWallet.label,
    }
  }

  /**
   * Validate address for a chain
   */
  validateAddress(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }
    return chainHandler.validateAddress(address)
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(chain, address, limit = 5) {
    const chainHandler = this.chains[chain.toLowerCase()]
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`)
    }

    try {
      return await chainHandler.getTransactionHistory(address, limit)
    } catch (error) {
      throw new Error(`Erreur lors de la recuperation de l'historique: ${error.message}`)
    }
  }
}
