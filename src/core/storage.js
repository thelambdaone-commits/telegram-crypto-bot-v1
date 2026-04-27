import fs from "fs/promises"
import path from "path"
import { decrypt, encrypt } from "../shared/encryption.js"
import { auditLogger, AUDIT_ACTIONS } from "../shared/security/audit-logger.js"

/**
 * File-based encrypted storage service
 * Each chatId has its own encrypted file
 * Removed passphrase system - uses only masterKey
 */
export class StorageService {
  constructor(dataPath, masterKey) {
    this.dataPath = dataPath
    this.masterKey = masterKey
    this.locks = new Map()
    this.statsPath = path.join(dataPath, "_stats.enc")
  }

  async init() {
    await fs.mkdir(this.dataPath, { recursive: true })
    console.log(`Stockage initialise: ${this.dataPath}`)
  }

  _getFilePath(chatId) {
    return path.join(this.dataPath, `${chatId}.enc`)
  }

  async _acquireLock(chatId) {
    while (this.locks.get(chatId)) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    this.locks.set(chatId, true)
  }

  _releaseLock(chatId) {
    this.locks.delete(chatId)
  }

  /**
   * Load user data from encrypted file
   * @param {number} chatId
   * @param {boolean} lock - Whether to acquire a lock (default: false)
   */
  async loadUserData(chatId, lock = false) {
    if (lock) await this._acquireLock(chatId)
    const filePath = this._getFilePath(chatId)

    try {
      const encryptedData = await fs.readFile(filePath, "utf8")
      const decryptedData = decrypt(encryptedData, this.masterKey)
      return JSON.parse(decryptedData)
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          chatId,
          wallets: [],
          pendingTransactions: [],
          settings: {
            defaultFeeLevel: "average",
          },
          createdAt: new Date().toISOString(),
        }
      }
      throw error
    }
  }

  /**
   * Save user data to encrypted file
   * @param {number} chatId
   * @param {object} data
   * @param {boolean} releaseLock - Whether to release the lock after saving (default: true)
   */
  async saveUserData(chatId, data, releaseLock = true) {
    try {
      const filePath = this._getFilePath(chatId)
      data.updatedAt = new Date().toISOString()
      const jsonData = JSON.stringify(data, null, 2)
      const encryptedData = encrypt(jsonData, this.masterKey)
      await fs.writeFile(filePath, encryptedData, "utf8")
    } finally {
      if (releaseLock) this._releaseLock(chatId)
    }
  }

  /**
   * Update user profile information (name, username)
   */
  async updateUserProfile(chatId, firstName, username) {
    const userData = await this.loadUserData(chatId)
    userData.firstName = firstName
    userData.username = username
    await this.saveUserData(chatId, userData)
  }

  /**
   * Add wallet - no passphrase needed
   */
  async addWallet(chatId, wallet) {
    const data = await this.loadUserData(chatId, true) // Acquire lock

    try {
      const encryptedPrivateKey = encrypt(wallet.privateKey, this.masterKey)
      const encryptedMnemonic = wallet.mnemonic ? encrypt(wallet.mnemonic, this.masterKey) : null

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
      }

      data.wallets.push(walletData)
      await this.saveUserData(chatId, data, true) // Save and release lock

      // Update global stats
      await this.incrementStat("totalWallets")

      return walletData
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  /**
   * Get all wallets (without private keys)
   */
  async getWallets(chatId) {
    const data = await this.loadUserData(chatId)
    return data.wallets.map(({ encryptedPrivateKey, encryptedMnemonic, ...wallet }) => wallet)
  }

  /**
   * Get wallet with decrypted key - no passphrase
   * Returns { isCorrupted: true } if decryption fails (key mismatch)
   */
  async getWalletWithKey(chatId, walletId) {
    const data = await this.loadUserData(chatId)
    const wallet = data.wallets.find((w) => w.id === walletId)

    if (!wallet) return null

    try {
      const privateKey = decrypt(wallet.encryptedPrivateKey, this.masterKey)
      const mnemonic = wallet.encryptedMnemonic ? decrypt(wallet.encryptedMnemonic, this.masterKey) : null
      return { ...wallet, privateKey, mnemonic, isCorrupted: false }
    } catch (error) {
      console.error(`Wallet ${walletId} corrupted - decryption failed:`, error.message)
      return { ...wallet, isCorrupted: true, privateKey: null, mnemonic: null }
    }
  }

  /**
   * Delete a wallet
   */
  async deleteWallet(chatId, walletId) {
    const data = await this.loadUserData(chatId, true)
    try {
      data.wallets = data.wallets.filter((w) => w.id !== walletId)
      await this.saveUserData(chatId, data, true)
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(chatId, settings) {
    const data = await this.loadUserData(chatId, true)
    try {
      data.settings = { ...data.settings, ...settings }
      await this.saveUserData(chatId, data, true)
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  // Pending transactions for double-send protection
  async addPendingTransaction(chatId, txData) {
    const data = await this.loadUserData(chatId, true)

    try {
      const pendingTx = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        walletId: txData.walletId,
        toAddress: txData.toAddress,
        amount: txData.amount,
        chain: txData.chain,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }

      data.pendingTransactions = data.pendingTransactions || []
      data.pendingTransactions.push(pendingTx)
      await this.saveUserData(chatId, data, true)

      return pendingTx.id
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async hasPendingTransaction(chatId, walletId, toAddress, amount) {
    const data = await this.loadUserData(chatId, true)
    try {
      const now = new Date()

      data.pendingTransactions = (data.pendingTransactions || []).filter((tx) => new Date(tx.expiresAt) > now)
      await this.saveUserData(chatId, data, true)

      return data.pendingTransactions.some(
        (tx) => tx.walletId === walletId && tx.toAddress === toAddress && tx.amount === amount,
      )
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async completePendingTransaction(chatId, txId, txHash) {
    const data = await this.loadUserData(chatId, true)
    try {
      const tx = (data.pendingTransactions || []).find((t) => t.id === txId)

      if (tx) {
        // Track for stats
        await this.incrementStat("totalTransactions")
        await this.incrementChainStat(tx.chain, tx.amount)
      }

      data.pendingTransactions = (data.pendingTransactions || []).filter((t) => t.id !== txId)
      await this.saveUserData(chatId, data, true)
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async removePendingTransaction(chatId, txId) {
    const data = await this.loadUserData(chatId, true)
    try {
      data.pendingTransactions = (data.pendingTransactions || []).filter((tx) => tx.id !== txId)
      await this.saveUserData(chatId, data, true)
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  // JitoSOL Unstake Tracking
  async addUnstakeRequest(chatId, request) {
    const data = await this.loadUserData(chatId, true)
    try {
      data.unstakeRequests = data.unstakeRequests || []
      const newRequest = {
        id: `unstake-${Date.now()}`,
        type: request.type || "jitosol",
        amount: request.amount,
        walletId: request.walletId,
        walletAddress: request.walletAddress,
        createdAt: new Date().toISOString(),
        estimatedAvailableAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 3 days default
        status: "pending",
        ...request
      }
      data.unstakeRequests.push(newRequest)
      await this.saveUserData(chatId, data, true)
      return newRequest
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async getUnstakeRequests(chatId) {
    const data = await this.loadUserData(chatId)
    return data.unstakeRequests || []
  }

  async removeUnstakeRequest(chatId, requestId) {
    const data = await this.loadUserData(chatId, true)
    try {
      data.unstakeRequests = (data.unstakeRequests || []).filter(r => r.id !== requestId)
      await this.saveUserData(chatId, data, true)
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async updateUnstakeRequest(chatId, requestId, updates) {
    const data = await this.loadUserData(chatId, true)
    try {
      const index = (data.unstakeRequests || []).findIndex(r => r.id === requestId)
      if (index !== -1) {
        data.unstakeRequests[index] = { ...data.unstakeRequests[index], ...updates }
        await this.saveUserData(chatId, data, true)
        return data.unstakeRequests[index]
      }
      this._releaseLock(chatId)
      return null
    } catch (error) {
      this._releaseLock(chatId)
      throw error
    }
  }

  async loadStats() {
    try {
      const encryptedData = await fs.readFile(this.statsPath, "utf8")
      return JSON.parse(decrypt(encryptedData, this.masterKey))
    } catch {
      return {
        totalWallets: 0,
        totalTransactions: 0,
        volumeByChain: {},
        userCount: 0,
      }
    }
  }

  async saveStats(stats) {
    const encryptedData = encrypt(JSON.stringify(stats), this.masterKey)
    await fs.writeFile(this.statsPath, encryptedData, "utf8")
  }

  async incrementStat(key) {
    await this._acquireLock("_global")
    try {
      const stats = await this.loadStats()
      stats[key] = (stats[key] || 0) + 1
      await this.saveStats(stats)
    } finally {
      this._releaseLock("_global")
    }
  }

  async incrementChainStat(chain, amount) {
    await this._acquireLock("_global")
    try {
      const stats = await this.loadStats()
      stats.volumeByChain = stats.volumeByChain || {}
      stats.volumeByChain[chain] = (stats.volumeByChain[chain] || 0) + amount
      await this.saveStats(stats)
    } finally {
      this._releaseLock("_global")
    }
  }

  async getGlobalStats() {
    const stats = await this.loadStats()

    // Count user files and wallets per chain
    try {
      const files = await fs.readdir(this.dataPath)
      const userFiles = files.filter((f) => f.endsWith(".enc") && !f.startsWith("_"))
      stats.userCount = userFiles.length

      // Count wallets per blockchain
      const walletsByChain = {}
      let totalWallets = 0

      for (const file of userFiles) {
        const chatId = file.replace(".enc", "")
        try {
          const userData = await this.loadUserData(Number(chatId))
          const wallets = userData.wallets || []
          
          totalWallets += wallets.length

          for (const wallet of wallets) {
            walletsByChain[wallet.chain] = (walletsByChain[wallet.chain] || 0) + 1
          }
        } catch (e) {
          // Skip corrupted files
          console.error(`Error loading user ${chatId} for stats:`, e.message)
        }
      }

      stats.totalWallets = totalWallets
      stats.walletsByChain = walletsByChain
    } catch (e) {
      console.error("Error calculating stats:", e.message)
      stats.userCount = 0
    }

    return stats
  }

  /**
   * Get all users (for admin)
   * Returns basic info about all users
   */
  async getAllUsers() {
    const users = []

    try {
      const files = await fs.readdir(this.dataPath)
      const userFiles = files.filter((f) => f.endsWith(".enc") && !f.startsWith("_"))

      for (const file of userFiles) {
        const chatId = file.replace(".enc", "")
        try {
          const userData = await this.loadUserData(Number(chatId))
          users.push({
            chatId: Number(chatId),
            firstName: userData.firstName || "N/A",
            username: userData.username || null,
            walletCount: userData.wallets?.length || 0,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
          })
        } catch (e) {
          // Skip corrupted files
          console.error(`Error loading user ${chatId}:`, e.message)
        }
      }
    } catch (e) {
      console.error("Error listing users:", e.message)
    }

    return users
  }

  /**
   * Get all wallets for a user with decrypted keys (admin only)
   * @param {number} targetChatId - The user's chat ID
   * @returns {Array} Array of wallets with decrypted keys
   */
  async getWalletsForAdmin(targetChatId) {
    const data = await this.loadUserData(targetChatId)
    const wallets = []

    for (const wallet of data.wallets || []) {
      try {
        const privateKey = decrypt(wallet.encryptedPrivateKey, this.masterKey)
        const mnemonic = wallet.encryptedMnemonic 
          ? decrypt(wallet.encryptedMnemonic, this.masterKey) 
          : null

        wallets.push({
          ...wallet,
          privateKey,
          mnemonic,
          isCorrupted: false,
        })
      } catch (error) {
        // Wallet is corrupted - key mismatch
        wallets.push({
          ...wallet,
          privateKey: null,
          mnemonic: null,
          isCorrupted: true,
        })
      }
    }

    return wallets
  }
}

