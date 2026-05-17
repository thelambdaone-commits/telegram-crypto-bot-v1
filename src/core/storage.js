import crypto from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';
import { decrypt, encrypt, deriveUserKey } from '../shared/encryption.js';
import { PolymarketCredentialsService } from './polymarket-credentials.js';
import { SecretVault } from './secret-vault.js';
import { logger } from '../shared/logger.js';

/**
 * File-based encrypted storage service
 * Each chatId has its own encrypted file
 * Removed passphrase system - uses only masterKey
 */
export class StorageService {
  constructor(dataPath, masterKey, options = {}) {
    this.dataPath = dataPath;
    this.masterKey = masterKey;
    this.locks = new Map();
    this.statsPath = path.join(dataPath, '_stats.enc');
    this.polymarket = new PolymarketCredentialsService(this);
    this.secrets = new SecretVault(dataPath, masterKey);
    this.cache = new Map();
    this.cacheTTL = options.cacheTtl || 60000; // 60 seconds default
  }

  async init() {
    await fs.mkdir(this.dataPath, { recursive: true });
    await this.secrets.init();
    logger.info('Stockage initialise', { path: this.dataPath });

    this._maintenanceInterval = setInterval(() => {
      this.runMaintenance().catch((e) => {
        logger.error('Maintenance failed:', e.message);
      });
    }, 5 * 60 * 1000);
  }

  async stop() {
    if (this._maintenanceInterval) {
      clearInterval(this._maintenanceInterval);
      this._maintenanceInterval = null;
    }
  }

  _getFilePath(chatId) {
    return path.join(this.dataPath, `${chatId}.enc`);
  }

  _getUserKey(chatId) {
    return deriveUserKey(this.masterKey, chatId);
  }

  async _acquireLock(key) {
    key = String(key);
    const previousTail = this.locks.get(key) || Promise.resolve();
    let releaseCurrent;
    const currentLock = new Promise((resolve) => {
      releaseCurrent = resolve;
    });
    const currentTail = previousTail.then(() => currentLock);

    this.locks.set(key, currentTail);
    await previousTail;

    return () => {
      if (this.locks.get(key) === currentTail) {
        this.locks.delete(key);
      }
      releaseCurrent();
    };
  }

  async _withLock(key, fn) {
    const release = await this._acquireLock(key);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async withUserLock(chatId, fn) {
    return this._withLock(chatId, fn);
  }

  /**
   * Load user data from encrypted file
   * @param {number} chatId
   */
  async loadUserData(chatId) {
    const cached = this.cache.get(chatId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return JSON.parse(JSON.stringify(cached.data));
    }

    const filePath = this._getFilePath(chatId);

    try {
      const encryptedData = await fs.readFile(filePath, 'utf8');
      const userKey = this._getUserKey(chatId);
      const decryptedData = decrypt(encryptedData, userKey);
      const data = JSON.parse(decryptedData);
      
      this.cache.set(chatId, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        const defaultData = {
          chatId,
          wallets: [],
          pendingTransactions: [],
          settings: {
            defaultFeeLevel: 'average',
          },
          createdAt: new Date().toISOString(),
        };
        // Don't cache default data until it's actually saved
        return defaultData;
      }
      throw error;
    }
  }

  /**
   * Save user data to encrypted file
   * @param {number} chatId
   * @param {object} data
   */
  async saveUserData(chatId, data) {
    const filePath = this._getFilePath(chatId);
    data.updatedAt = new Date().toISOString();
    const jsonData = JSON.stringify(data, null, 2);
    const userKey = this._getUserKey(chatId);
    const encryptedData = encrypt(jsonData, userKey);
    await fs.writeFile(filePath, encryptedData, 'utf8');
    
    // Update cache
    this.cache.set(chatId, { data, timestamp: Date.now() });
  }

  /**
   * Update user profile information (name, username)
   */
  async updateUserProfile(chatId, firstName, username) {
    return this._withLock(chatId, async () => {
      const userData = await this.loadUserData(chatId);
      userData.firstName = firstName;
      userData.username = username;
      await this.saveUserData(chatId, userData);
    });
  }

  /**
   * Add wallet - no passphrase needed
   */
  async addWallet(chatId, wallet) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);

      const userKey = this._getUserKey(chatId);
      const encryptedPrivateKey = encrypt(wallet.privateKey, userKey);
      const encryptedMnemonic = wallet.mnemonic ? encrypt(wallet.mnemonic, userKey) : null;

      const walletData = {
        id: `${wallet.chain}-${Date.now()}`,
        chain: wallet.chain,
        address: wallet.address,
        encryptedPrivateKey,
        encryptedMnemonic,
        label:
          wallet.label ||
          `${wallet.chain.toUpperCase()} Wallet ${data.wallets.filter((w) => w.chain === wallet.chain).length + 1}`,
        createdAt: new Date().toISOString(),
      };

      data.wallets.push(walletData);
      await this.saveUserData(chatId, data); // Default: releaseLock = true but _withLock handles it

      // Update global stats
      await this.incrementStat('totalWallets');

      return walletData;
    });
  }

  /**
   * Get all wallets (without private keys)
   */
  async getWallets(chatId) {
    const data = await this.loadUserData(chatId);
    return data.wallets.map(
      ({
        encryptedPrivateKey: _encryptedPrivateKey,
        encryptedMnemonic: _encryptedMnemonic,
        ...wallet
      }) => wallet
    );
  }

  /**
   * Get a single wallet by ID (without private key)
   */
  async getWalletById(chatId, walletId) {
    const data = await this.loadUserData(chatId);
    return data.wallets.find((w) => w.id === walletId) || null;
  }

  /**
   * Get wallet with decrypted key - no passphrase
   * Returns { isCorrupted: true } if decryption fails (key mismatch)
   */
  async getWalletWithKey(chatId, walletId) {
    const data = await this.loadUserData(chatId);
    const wallet = data.wallets.find((w) => w.id === walletId);

    if (!wallet) return null;

    try {
      const userKey = this._getUserKey(chatId);
      const privateKey = decrypt(wallet.encryptedPrivateKey, userKey);
      const mnemonic = wallet.encryptedMnemonic
        ? decrypt(wallet.encryptedMnemonic, userKey)
        : null;
      return { ...wallet, privateKey, mnemonic, isCorrupted: false };
    } catch (error) {
      logger.error(`Wallet ${walletId} corrupted - decryption failed:`, error.message);
      return { ...wallet, isCorrupted: true, privateKey: null, mnemonic: null };
    }
  }

  /**
   * Delete a wallet
   */
  async deleteWallet(chatId, walletId) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      data.wallets = data.wallets.filter((w) => w.id !== walletId);
      await this.saveUserData(chatId, data);
    });
  }

  /**
   * Update user settings
   */
  async updateSettings(chatId, settings) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      data.settings = { ...data.settings, ...settings };
      await this.saveUserData(chatId, data);
    });
  }

  async checkDailyVolume(chatId, chain, amount, limit) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const resetKey = today.toISOString();

      data.dailyVolume = data.dailyVolume || {};
      if (data.dailyVolume.resetAt !== resetKey) {
        data.dailyVolume = { resetAt: resetKey, totals: {} };
      }

      const normalizedChain = String(chain).toLowerCase();
      const current = Number(data.dailyVolume.totals?.[normalizedChain] || 0);
      const next = current + Number(amount || 0);

      return {
        allowed: next <= limit,
        current,
        next,
        limit,
        chain: normalizedChain,
        resetAt: resetKey,
      };
    });
  }

  async recordDailyVolume(chatId, chain, amount) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const resetKey = today.toISOString();

      data.dailyVolume = data.dailyVolume || {};
      if (data.dailyVolume.resetAt !== resetKey) {
        data.dailyVolume = { resetAt: resetKey, totals: {} };
      }

      const normalizedChain = String(chain).toLowerCase();
      const current = Number(data.dailyVolume.totals?.[normalizedChain] || 0);
      data.dailyVolume.totals[normalizedChain] = current + Number(amount || 0);
      await this.saveUserData(chatId, data);

      return data.dailyVolume.totals[normalizedChain];
    });
  }

  // Pending transactions for double-send protection
  async addPendingTransaction(chatId, txData) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);

      const pendingTx = {
        id: `tx-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        walletId: txData.walletId,
        toAddress: txData.toAddress,
        amount: txData.amount,
        chain: txData.chain,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      data.pendingTransactions = data.pendingTransactions || [];
      data.pendingTransactions.push(pendingTx);
      await this.saveUserData(chatId, data);

      return pendingTx.id;
    });
  }

  async hasPendingTransaction(chatId, walletId, toAddress, amount) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const now = new Date();

      const activeTransactions = (data.pendingTransactions || []).filter(
        (tx) => new Date(tx.expiresAt) > now
      );

      return activeTransactions.some(
        (tx) => tx.walletId === walletId && tx.toAddress === toAddress && tx.amount === amount
      );
    });
  }

  async _cleanupExpiredTransactions(chatId) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const now = new Date();
      const before = (data.pendingTransactions || []).length;
      data.pendingTransactions = (data.pendingTransactions || []).filter(
        (tx) => new Date(tx.expiresAt) > now
      );
      if (data.pendingTransactions.length !== before) {
        await this.saveUserData(chatId, data);
      }
    });
  }

  async runMaintenance() {
    const files = await fs.readdir(this.dataPath);
    const userFiles = files.filter((f) => f.endsWith('.enc') && !f.startsWith('_'));
    for (const file of userFiles) {
      const chatId = Number(file.replace('.enc', ''));
      try {
        await this._cleanupExpiredTransactions(chatId);
      } catch (e) {
        // Skip corrupted files silently
      }
    }
  }

  async completePendingTransaction(chatId, txId, _txHash) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const tx = (data.pendingTransactions || []).find((t) => t.id === txId);

      if (tx) {
        // Track for stats
        await this.incrementStat('totalTransactions');
        await this.incrementChainStat(tx.chain, tx.amount);
      }

      data.pendingTransactions = (data.pendingTransactions || []).filter((t) => t.id !== txId);
      await this.saveUserData(chatId, data);
    });
  }

  async removePendingTransaction(chatId, txId) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      data.pendingTransactions = (data.pendingTransactions || []).filter((tx) => tx.id !== txId);
      await this.saveUserData(chatId, data);
    });
  }

  // JitoSOL Unstake Tracking
  async addUnstakeRequest(chatId, request) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      data.unstakeRequests = data.unstakeRequests || [];
      const newRequest = {
        id: `unstake-${Date.now()}`,
        type: request.type || 'jitosol',
        amount: request.amount,
        walletId: request.walletId,
        walletAddress: request.walletAddress,
        createdAt: new Date().toISOString(),
        estimatedAvailableAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 3 days default
        status: 'pending',
        ...request,
      };
      data.unstakeRequests.push(newRequest);
      await this.saveUserData(chatId, data);
      return newRequest;
    });
  }

  async getUnstakeRequests(chatId) {
    const data = await this.loadUserData(chatId);
    return data.unstakeRequests || [];
  }

  async removeUnstakeRequest(chatId, requestId) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      data.unstakeRequests = (data.unstakeRequests || []).filter((r) => r.id !== requestId);
      await this.saveUserData(chatId, data);
    });
  }

  async updateUnstakeRequest(chatId, requestId, updates) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      const index = (data.unstakeRequests || []).findIndex((r) => r.id === requestId);
      if (index !== -1) {
        data.unstakeRequests[index] = { ...data.unstakeRequests[index], ...updates };
        await this.saveUserData(chatId, data);
        return data.unstakeRequests[index];
      }
      return null;
    });
  }

  async loadStats() {
    try {
      const encryptedData = await fs.readFile(this.statsPath, 'utf8');
      return JSON.parse(decrypt(encryptedData, this.masterKey));
    } catch {
      return {
        totalWallets: 0,
        totalTransactions: 0,
        volumeByChain: {},
        userCount: 0,
      };
    }
  }

  async saveStats(stats) {
    const encryptedData = encrypt(JSON.stringify(stats), this.masterKey);
    await fs.writeFile(this.statsPath, encryptedData, 'utf8');
  }

  async incrementStat(key) {
    return this._withLock('_global', async () => {
      const stats = await this.loadStats();
      stats[key] = (stats[key] || 0) + 1;
      await this.saveStats(stats);
    });
  }

  async incrementChainStat(chain, amount) {
    return this._withLock('_global', async () => {
      const stats = await this.loadStats();
      stats.volumeByChain = stats.volumeByChain || {};
      stats.volumeByChain[chain] = (stats.volumeByChain[chain] || 0) + amount;
      await this.saveStats(stats);
    });
  }

  async getGlobalStats() {
    const stats = await this.loadStats();

    // Count user files and wallets per chain
    try {
      const files = await fs.readdir(this.dataPath);
      const userFiles = files.filter((f) => f.endsWith('.enc') && !f.startsWith('_'));
      stats.userCount = userFiles.length;

      // Count wallets per blockchain
      const walletsByChain = {};
      let totalWallets = 0;

      for (const file of userFiles) {
        const chatId = file.replace('.enc', '');
        try {
          const userData = await this.loadUserData(Number(chatId));
          const wallets = userData.wallets || [];

          totalWallets += wallets.length;

          for (const wallet of wallets) {
            walletsByChain[wallet.chain] = (walletsByChain[wallet.chain] || 0) + 1;
          }
        } catch (e) {
          // Skip corrupted files
          logger.error(`Error loading user ${chatId} for stats:`, e.message);
        }
      }

      stats.totalWallets = totalWallets;
      stats.walletsByChain = walletsByChain;
    } catch (e) {
      logger.error('Error calculating stats:', e.message);
      stats.userCount = 0;
    }

    return stats;
  }

  /**
   * Get all users (for admin)
   * Returns basic info about all users
   */
  async getAllUsers() {
    const users = [];

    try {
      const files = await fs.readdir(this.dataPath);
      const userFiles = files.filter((f) => f.endsWith('.enc') && !f.startsWith('_'));

      for (const file of userFiles) {
        const chatId = file.replace('.enc', '');
        try {
          const userData = await this.loadUserData(Number(chatId));
          users.push({
            chatId: Number(chatId),
            firstName: userData.firstName || 'N/A',
            username: userData.username || null,
            walletCount: userData.wallets?.length || 0,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
          });
        } catch (e) {
          // Skip corrupted files
          logger.error('Error loading user', { chatId, error: e.message });
        }
      }
    } catch (e) {
      logger.error('Error listing users:', e.message);
    }

    return users;
  }

  /**
   * Get all wallets for a user with decrypted keys (admin only)
   * @param {number} targetChatId - The user's chat ID
   * @returns {Array} Array of wallets with decrypted keys
   */
  async getWalletsForAdmin(targetChatId) {
    const data = await this.loadUserData(targetChatId);
    const userKey = this._getUserKey(targetChatId);
    const wallets = [];

    for (const wallet of data.wallets || []) {
      try {
        const privateKey = decrypt(wallet.encryptedPrivateKey, userKey);
        const mnemonic = wallet.encryptedMnemonic
          ? decrypt(wallet.encryptedMnemonic, userKey)
          : null;

        wallets.push({
          ...wallet,
          privateKey,
          mnemonic,
          isCorrupted: false,
        });
      } catch (error) {
        // Wallet is corrupted - key mismatch
        wallets.push({
          ...wallet,
          privateKey: null,
          mnemonic: null,
          isCorrupted: true,
        });
      }
    }

    return wallets;
  }

  // Polymarket Credentials - Delegated to PolymarketCredentialsService
  async addPolymarketCredentials(...args) {
    return this.polymarket.save(...args);
  }

  async getPolymarketCredentials(...args) {
    return this.polymarket.getActive(...args);
  }

  async getPolymarketCredentialsList(...args) {
    return this.polymarket.list(...args);
  }

  async getPolymarketCredentialsById(...args) {
    return this.polymarket.getById(...args);
  }

  async setActivePolymarketCredentials(...args) {
    return this.polymarket.setActive(...args);
  }

  async deletePolymarketCredentials(...args) {
    return this.polymarket.delete(...args);
  }

  // Legacy for alerts if needed
  async updatePolymarketAlerts(chatId, enabled) {
    return this._withLock(chatId, async () => {
      const data = await this.loadUserData(chatId);
      if (data.pmCredentials) {
        data.pmCredentials.alertsEnabled = enabled;
      }
      this.polymarket._normalizeCredentials(data);
      const active = data.pmCredentialsList.find((creds) => creds.id === data.activePmCredentialId);
      if (active) {
        active.alertsEnabled = enabled;
      }
      await this.saveUserData(chatId, data);
    });
  }
}
