import { logger } from "../shared/logger.js"
import { config } from "./config.js"
import { formatEUR, convertToEUR } from "../shared/price.js"

/**
 * Deposit Monitor - Checks for new deposits and notifies admin
 * Stores last known balances and compares with current balances
 */
export class DepositMonitor {
  constructor(storage, walletService, bot) {
    this.storage = storage
    this.walletService = walletService
    this.bot = bot
    this.lastBalances = new Map() // chatId -> { walletId -> balance }
  }

  /**
   * Initialize monitor with current balances
   */
  async initialize() {
    try {
      const users = await this.storage.getAllUsers()
      
      // Helper: delay between requests to avoid rate limiting
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
      
      for (const user of users) {
        try {
          const balances = await this.walletService.getAllBalances(user.chatId)
          const userBalances = {}
          
          for (const wallet of balances) {
            if (wallet.balance && wallet.balance !== "Erreur") {
              userBalances[wallet.id] = Number.parseFloat(wallet.balance) || 0
            }
          }
          
          this.lastBalances.set(user.chatId, userBalances)
          
          // Wait 2s between users to avoid rate limiting
          await delay(2000)
        } catch (e) {
          // Silent fail - don't spam console
        }
      }
      
      console.log(`[DEPOSIT_MONITOR] Initialized with ${this.lastBalances.size} users`)
    } catch (e) {
      console.error("[DEPOSIT_MONITOR] Initialization error:", e.message)
    }
  }

  /**
   * Check for deposits (balance increases)
   */
  async checkDeposits() {
    try {
      const users = await this.storage.getAllUsers()
      
      // Helper: delay between requests to avoid rate limiting
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
      
      for (const user of users) {
        try {
          const balances = await this.walletService.getAllBalances(user.chatId)
          const oldBalances = this.lastBalances.get(user.chatId) || {}
          const newBalances = {}
          
          for (const wallet of balances) {
            if (wallet.balance && wallet.balance !== "Erreur") {
              const currentBalance = Number.parseFloat(wallet.balance) || 0
              newBalances[wallet.id] = currentBalance
              
              const oldBalance = oldBalances[wallet.id] || 0
              
              // Check if balance increased (deposit detected)
              if (currentBalance > oldBalance) {
                const depositAmount = currentBalance - oldBalance
                await this.notifyDeposit(user.chatId, wallet, depositAmount)
              }
            }
          }
          
          this.lastBalances.set(user.chatId, newBalances)
          
          // Wait 2s between users to avoid rate limiting
          await delay(2000)
        } catch (e) {
          // Silent fail - don't spam console
        }
      }
    } catch (e) {
      console.error("[DEPOSIT_MONITOR] Check error:", e.message)
    }
  }

  /**
   * Notify admin about deposit
   */
  async notifyDeposit(chatId, wallet, amount) {
    if (!config.adminChatId || config.adminChatId.length === 0) return

    try {
      const userData = await this.storage.loadUserData(chatId)
      const displayName = (userData.username ? `@${userData.username}` : userData.firstName || "N/A").replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
      
      // Get price conversion
      const { convertToEUR, formatEUR } = await import("../shared/price.js")
      const conversion = await convertToEUR(wallet.chain, amount)
      
      // Format date safely (no special Markdown chars)
      const now = new Date()
      const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      
      const message = `💰 *Depot Detecte*\n\n` +
          `👤 Utilisateur: ${displayName}\n` +
          `🆔 Chat ID: \`${chatId}\`\n` +
          `💼 Wallet: ${(wallet.label || 'N/A').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')}\n` +
          `⛓ Blockchain: ${wallet.chain.toUpperCase()}\n` +
          `📬 Adresse: \`${wallet.address}\`\n` +
          `💵 Montant: ${amount.toFixed(8)} ${wallet.chain.toUpperCase()}\n` +
          `💶 Valeur: ${formatEUR(conversion.valueEUR)}\n` +
          `📊 Nouveau solde: ${wallet.balance} ${wallet.chain.toUpperCase()}\n` +
          `📅 Date: ${dateStr}`;

      for (const adminId of config.adminChatId) {
        await this.bot.telegram.sendMessage(adminId, message, { parse_mode: "Markdown" })
          .catch(e => console.error(`[DEPOSIT_MONITOR] Failed to notify admin ${adminId}:`, e.message));
      }
      
      console.log(`[DEPOSIT_MONITOR] Notified ${config.adminChatId.length} admin(s) about deposit: ${amount} ${wallet.chain.toUpperCase()} for user ${chatId}`)
    } catch (e) {
      console.error("[DEPOSIT_MONITOR] Notification error:", e.message)
    }
  }

  /**
   * Start monitoring (check every 5 minutes)
   */
  start() {
    // Initial check
    this.initialize()
    
    // Check every 5 minutes
    setInterval(() => {
      this.checkDeposits()
    }, 5 * 60 * 1000)
    
    console.log("[DEPOSIT_MONITOR] Started - checking every 5 minutes")
  }
}
