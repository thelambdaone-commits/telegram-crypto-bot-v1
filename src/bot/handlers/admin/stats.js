import { adminExtendedKeyboard } from "../../keyboards/index.js"
import { safeAnswerCbQuery } from "../../utils.js"
import { isAdmin } from "../../middlewares/auth.middleware.js"
import { getPricesEUR, formatEUR } from "../../../shared/price.js"
import { config } from "../../../core/config.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"

export function setupAdminStats(bot, storage) {
  // Global stats
  bot.action("admin_stats", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    if (!isAdmin(chatId)) return

    try {
      const stats = await storage.getGlobalStats()
      const prices = await getPricesEUR().catch(() => ({ eth: 0, btc: 0, sol: 0 }))

      const { WalletService } = await import("../../../modules/wallet/wallet.service.js")
      const walletService = new WalletService(storage, config)
      
      const globalBalances = {}
      const users = await storage.getAllUsers()
      
      // Helper: fetch with timeout (5s per user max)
      const fetchWithTimeout = async (fn, timeoutMs = 5000) => {
        return Promise.race([
          fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
        ])
      }

      let failedFetches = 0
      
      for (const user of users) {
        try {
          const balances = await fetchWithTimeout(() => walletService.getAllBalances(user.chatId), 5000)
          for (const wallet of balances) {
            if (wallet.balance && wallet.balance !== "Erreur") {
              const balance = Number.parseFloat(wallet.balance)
              if (!isNaN(balance)) {
                globalBalances[wallet.chain] = (globalBalances[wallet.chain] || 0) + balance
              }
            }
          }
        } catch (e) {
          failedFetches++
        }
      }
      
      const chainEmojis = {
        eth: "🔷",
        btc: "₿",
        ltc: "◈",
        bch: "₿",
        sol: "◎",
        arb: "🔴",
        matic: "🟣",
        op: "🔵",
        base: "🟦",
      }

      let totalEUR = 0
      for (const [chain, balance] of Object.entries(globalBalances)) {
        if (prices[chain]) {
          totalEUR += balance * prices[chain]
        }
      }

      let text = `📊 *Statistiques Globales*\n\n`
      text += `👥 Utilisateurs : *${stats.userCount}*\n`
      text += `👛 Wallets : *${stats.totalWallets}*\n`
      text += `🔄 Transactions : *${stats.totalTransactions}*\n\n`
      
      text += `⛓ *Par blockchain :*\n`
      Object.entries(stats.walletsByChain || {}).sort((a,b) => b[1] - a[1]).forEach(([chain, count]) => {
        text += `${chainEmojis[chain] || "●"} ${chain.toUpperCase()} : ${count}\n`
      })
      
      text += `\n💰 *Solde global :*\n`
      Object.entries(globalBalances).sort((a,b) => b[1] - a[1]).forEach(([chain, balance]) => {
        const price = prices[chain] || 0
        const valueEUR = balance * price
        text += `${chainEmojis[chain] || "●"} ${chain.toUpperCase()} : ${balance.toFixed(balance < 0.1 ? 8 : 4)}`
        if (valueEUR > 0) {
          text += ` (${formatEUR(valueEUR)})`
        }
        text += `\n`
      })
      
      text += `\n💎 *Total Global : ${formatEUR(totalEUR)}*\n`
      
      if (failedFetches > 0) {
        text += `\n⚠️ _${failedFetches} user(s) non récupéré(s) (API timeout)_`
      }

      try {
        await ctx.editMessageText(text, {
          parse_mode: "Markdown",
          ...adminExtendedKeyboard(),
        })
      } catch (e) {
        // Ignore "message is not modified" error
        if (!e.message?.includes("message is not modified")) {
          throw e
        }
      }
    } catch (error) {
      try {
        await ctx.editMessageText(`❌ Erreur stats : ${error.message}`, {
          parse_mode: "Markdown",
          ...adminExtendedKeyboard(),
        })
      } catch (e) {}
    }
  })
}
