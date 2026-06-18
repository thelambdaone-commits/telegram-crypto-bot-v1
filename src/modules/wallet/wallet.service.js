import { EthereumChain } from '../../providers/ethereum.js';
import { BitcoinChain } from '../../providers/bitcoin.js';
import { SolanaChain } from '../../providers/solana.js';
import { ArbitrumChain } from '../../providers/arbitrum.js';
import { LitecoinChain } from '../../providers/litecoin.js';
import { BitcoinCashChain } from '../../providers/bitcoincash.js';
import { PolygonChain } from '../../providers/polygon.js';
import { OptimismChain } from '../../providers/optimism.js';
import { BaseChain } from '../../providers/base.js';
import { BscChain } from '../../providers/bsc.js';
import { AvalancheChain } from '../../providers/avalanche.js';
import { MoneroChain } from '../../providers/monero.js';
import { ZcashChain } from '../../providers/zcash.js';
import { TronChain } from '../../providers/tron.js';
import { TonChain } from '../../providers/ton.js';
import { TransactionError, ERROR_CODES } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import * as bip39 from 'bip39';

// Chains derivable from a SINGLE BIP39 seed. The six EVM chains share one
// address (same derivation), but each is registered so the user gets a usable
// wallet on every network. Ordered for display (EVM first, grouped).
const FIRST_WALLET_CHAINS = [
  'eth',
  'arb',
  'matic',
  'op',
  'base',
  'avax',
  'bsc',
  'btc',
  'ltc',
  'bch',
  'sol',
  'trx',
  'zec',
  'ton',
];

export class WalletService {
  constructor(storage, config) {
    this.storage = storage;
    this.chains = {
      eth: new EthereumChain(config.rpc.eth),
      btc: new BitcoinChain(config.rpc.btcApi),
      sol: new SolanaChain(config.rpc.sol, config.rpc.solFallbacks),
      arb: new ArbitrumChain(config.rpc.arb),
      ltc: new LitecoinChain(config.rpc.ltcApi),
      bch: new BitcoinCashChain(config.rpc.bchApi),
      matic: new PolygonChain(config.rpc.matic),
      op: new OptimismChain(config.rpc.op),
      base: new BaseChain(config.rpc.base),
      bsc: new BscChain(config.rpc.bsc),
      avax: new AvalancheChain(config.rpc.avax),
      xmr: new MoneroChain(config.rpc.xmrDaemon, config.rpc.xmrWalletRpc, config.rpc.xmrWalletAuth),
      zec: new ZcashChain(config.rpc.zecApi, config.rpc.zecRpc, config.rpc.zecRpcAuth),
      trx: new TronChain(config.rpc.trx, config.rpc.tronApiKey),
      ton: new TonChain(config.rpc.ton, config.rpc.tonApiKey),
    };
  }

  async getNextWalletLabel(chatId, chain) {
    const normalizedChain = chain.toLowerCase();
    const prefix = `Wallet ${normalizedChain.toUpperCase()}`;
    const wallets = await this.storage.getWallets(chatId);
    const usedNumbers = new Set();

    for (const wallet of wallets) {
      if (wallet.chain !== normalizedChain) continue;
      if (wallet.label === prefix) {
        usedNumbers.add(1);
        continue;
      }

      const match = wallet.label?.match(new RegExp(`^${prefix} (\\d+)$`));
      if (match) {
        usedNumbers.add(Number(match[1]));
      }
    }

    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    return `${prefix} ${nextNumber}`;
  }

  /**
   * Create wallet - no passphrase
   */
  async createWallet(chatId, chain, label = null) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }

    const wallet = await chainHandler.createWallet();
    wallet.chain = chain;
    wallet.label = label;

    const savedWallet = await this.storage.addWallet(chatId, wallet);

    return {
      id: savedWallet.id,
      chain: savedWallet.chain,
      address: savedWallet.address,
      label: savedWallet.label,
    };
  }

  /**
   * First-contact provisioning. Generates ONE BIP39 seed and derives a wallet
   * on every BIP39-compatible chain (the six EVM chains share a single
   * address), then adds a Monero wallet — Monero uses its own 25-word seed and
   * cannot share the BIP39 phrase. Pure local key derivation, no RPC, so
   * creating the full set stays fast.
   *
   * @param {string|number} chatId
   * @returns {Promise<{ mnemonic: string, wallets: Array<{chain:string,address:string,privateKey:string,mnemonic:string,label:string,shared:boolean}> }>}
   */
  async createInitialWallets(chatId) {
    const mnemonic = bip39.generateMnemonic();
    const wallets = [];

    for (const chain of FIRST_WALLET_CHAINS) {
      const chainHandler = this.chains[chain];
      if (!chainHandler) continue;

      const walletData = await chainHandler.importFromSeed(mnemonic);
      walletData.chain = chain;
      walletData.label = await this.getNextWalletLabel(chatId, chain);
      const saved = await this.storage.addWallet(chatId, walletData);

      wallets.push({
        chain,
        address: saved.address,
        privateKey: walletData.privateKey,
        mnemonic,
        label: saved.label,
        shared: true,
      });
    }

    // Monero uses an independent 25-word seed (not BIP39). Isolated so a
    // Monero module hiccup can never block onboarding of the BIP39 chains.
    try {
      const xmrData = await this.chains.xmr.createWallet();
      xmrData.chain = 'xmr';
      xmrData.label = await this.getNextWalletLabel(chatId, 'xmr');
      const saved = await this.storage.addWallet(chatId, xmrData);

      wallets.push({
        chain: 'xmr',
        address: saved.address,
        privateKey: xmrData.privateKey,
        mnemonic: xmrData.mnemonic,
        label: saved.label,
        shared: false,
      });
    } catch (error) {
      logger.warn('[INIT] Monero wallet skipped during onboarding', {
        chatId,
        error: error.message,
      });
    }

    return { mnemonic, wallets };
  }

  /**
   * Get balance for any public address (no wallet needed)
   */
  async getPublicAddressBalance(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }
    return await chainHandler.getBalance(address);
  }

  /**
   * Get all tokens for any public address (no wallet needed)
   */
  async getPublicAddressTokens(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }

    if (chain === 'sol') {
      return await chainHandler.getAllTokensWithSymbols(address);
    }

    if (chainHandler.getAllTokens) {
      return await chainHandler.getAllTokens(address);
    }

    return [];
  }

  /**
   * Get balances for all wallets
   */
  async getAllBalances(chatId) {
    const wallets = await this.storage.getWallets(chatId);

    return Promise.all(
      wallets.map(async (wallet) => {
        try {
          const chainHandler = this.chains[wallet.chain];
          const balance = await chainHandler.getBalance(wallet.address);
          return {
            ...wallet,
            balance: balance.balance,
          };
        } catch (error) {
          return {
            ...wallet,
            balance: 'Erreur',
            error: error.message,
          };
        }
      })
    );
  }

  /**
   * Estimate transaction fees
   */
  async estimateFees(chatId, walletId, toAddress, amount, tokenSymbol = null) {
    const wallets = await this.storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      throw new Error('Wallet non trouve');
    }

    const chainHandler = this.chains[wallet.chain];
    return await chainHandler.estimateFees(wallet.address, toAddress, amount, tokenSymbol);
  }

  /**
   * Get balance for wallet or token
   */
  async getBalance(chatId, walletId, tokenSymbol = null) {
    const wallets = await this.storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      throw new Error('Wallet non trouve');
    }

    const chainHandler = this.chains[wallet.chain];
    return await chainHandler.getBalance(wallet.address, tokenSymbol);
  }

  /**
   * Pre-flight validation before sending a transaction
   */
  async estimateAndValidate(chatId, walletId, toAddress, amount, tokenSymbol = null) {
    const wallet = await this.storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      throw new Error('Wallet non trouve');
    }

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new TransactionError('Montant invalide', {
        code: ERROR_CODES.INVALID_AMOUNT,
        chain: wallet.chain,
      });
    }

    if (parsedAmount > 1e15) {
      throw new TransactionError('Montant excessif', {
        code: ERROR_CODES.INVALID_AMOUNT,
        chain: wallet.chain,
      });
    }

    const chainHandler = this.chains[wallet.chain];

    // Validate destination address
    if (!chainHandler.validateAddress(toAddress)) {
      throw new TransactionError('Adresse de destination invalide', {
        code: ERROR_CODES.INVALID_ADDRESS,
        chain: wallet.chain,
      });
    }

    // Estimate fees for pre-flight
    const fees = await chainHandler.estimateFees(wallet.address, toAddress, amount, tokenSymbol);

    // Check balance sufficiency
    const balance = await chainHandler.getBalance(wallet.address, tokenSymbol);
    const balanceNum = Number.parseFloat(balance.balance);
    if (parsedAmount > balanceNum) {
      throw new TransactionError('Solde insuffisant', {
        code: ERROR_CODES.INSUFFICIENT_FUNDS,
        chain: wallet.chain,
      });
    }

    return {
      wallet,
      chainHandler,
      fees,
      balance,
      parsedAmount,
      isValid: true,
    };
  }

  /**
   * Send transaction with pre-flight validation
   */
  async sendTransaction(chatId, walletId, toAddress, amount, feeLevel = 'average', tokenSymbol = null) {
    const { wallet, chainHandler } = await this.estimateAndValidate(
      chatId, walletId, toAddress, amount, tokenSymbol
    );

    return await chainHandler.sendTransaction(
      wallet.privateKey,
      toAddress,
      amount,
      feeLevel,
      tokenSymbol
    );
  }

  /**
   * Import wallet from seed or private key
   */
  async importWallet(chatId, chain, type, input, label = null) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }

    let walletData;
    if (type === 'seed') {
      walletData = await chainHandler.importFromSeed(input);
    } else if (type === 'key') {
      walletData = await chainHandler.importFromKey(input);
    } else {
      throw new Error("Type d'importation invalide");
    }

    walletData.chain = chain;
    walletData.label = label || (await this.getNextWalletLabel(chatId, chain));

    const savedWallet = await this.storage.addWallet(chatId, walletData);

    return {
      id: savedWallet.id,
      chain: savedWallet.chain,
      address: savedWallet.address,
      label: savedWallet.label,
    };
  }

  /**
   * Validate address for a chain
   */
  validateAddress(chain, address) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }
    return chainHandler.validateAddress(address);
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(chain, address, limit = 5) {
    const chainHandler = this.chains[chain.toLowerCase()];
    if (!chainHandler) {
      throw new Error(`Blockchain non supportee: ${chain}`);
    }

    try {
      return await chainHandler.getTransactionHistory(address, limit);
    } catch (error) {
      throw new Error(`Erreur lors de la recuperation de l'historique: ${error.message}`);
    }
  }
}
