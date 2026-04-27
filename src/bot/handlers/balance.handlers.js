/**
 * Balance & Price Handlers
 */
import { Markup } from "telegraf"
import { mainMenuKeyboard, walletListKeyboard } from "../keyboards/index.js"

export function setupBalanceHandlers(bot, storage, walletService) {
  // Action: view_balances
  bot.action("view_balances", async (ctx) => {
    const chatId = ctx.chat.id
    await ctx.answerCbQuery().catch(() => {})
    
    const wallets = await storage.getWallets(chatId)
    if (wallets.length === 0) {
      return ctx.editMessageText("❌ Tu n'as pas encore de wallet.", mainMenuKeyboard()).catch(() => {})
    }

    const { convertToEUR, formatEUR } = await import("../../shared/price.js")
    
    let text = "💰 *Soldes de tes Wallets*\n\n"
    let totalEUR = 0
    
    for (const wallet of wallets) {
      try {
        const balance = await walletService.getBalance(chatId, wallet.id)
        const balanceNum = parseFloat(balance.balance) || 0
        
        let valueEUR = 0
        if (balanceNum > 0) {
          try {
            const conversion = await convertToEUR(wallet.chain, balanceNum)
            valueEUR = conversion.valueEUR || 0
            totalEUR += valueEUR
          } catch (e) {}
        }
        
        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `Solde: ${balance.balance} ${wallet.chain.toUpperCase()}`
        if (valueEUR > 0) {
          text += ` ≈ ${formatEUR(valueEUR)}`
        }
        text += `\n\n`
      } catch (error) {
        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `❌ Erreur de récupération\n\n`
      }
    }
    
    text += `━━━━━━━━━━━━\n`
    text += `💶 *Total :* ${formatEUR(totalEUR)}`

    ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...mainMenuKeyboard(),
    }).catch(() => {})
  })

  // Action: prices_eur
  bot.action("prices_eur", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {})
    
    try {
      const { getPricesEUR } = await import("../../shared/price.js")
      const prices = await getPricesEUR()

      const text = `📊 *Prix en EUR*\n\n` +
        `🔹 ETH: ${prices.eth.toFixed(2)} €\n` +
        `🔹 BTC: ${prices.btc.toFixed(2)} €\n` +
        `🔹 SOL: ${prices.sol.toFixed(2)} €\n` +
        `🔹 LTC: ${prices.ltc.toFixed(2)} €\n` +
        `🔹 BCH: ${prices.bch.toFixed(2)} €\n` +
        `💵 USDC: ${prices.usdc.toFixed(2)} €\n` +
        `💵 USDT: ${prices.usdt.toFixed(2)} €\n` +
        `🟣 MATIC: ${prices.matic?.toFixed(2) || 0} €\n` +
        `🔵 OP: ${prices.op?.toFixed(2) || 0} €\n` +
        `🟦 BASE (ETH): ${prices.base?.toFixed(2) || 0} €\n\n` +
        `_Mis a jour en temps reel_`

      ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...mainMenuKeyboard(),
      })
    } catch (error) {
      ctx.editMessageText("❌ Erreur lors de la récupération des prix.", mainMenuKeyboard())
    }
  })

  // Hears: 💰 Mes Wallets
  bot.hears("💰 Mes Wallets", async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id)
    ctx.reply("👛 *Tes Wallets*", {
      parse_mode: "Markdown",
      ...walletListKeyboard(wallets, "wallet_"),
    })
  })

  // Hears: 📊 Cours EUR
  bot.hears("📊 Cours EUR", async (ctx) => {
    try {
      const { getPricesEUR, formatEUR, clearPriceCache } = await import("../../shared/price.js")
      clearPriceCache()
      const prices = await getPricesEUR(true)

      const text = `💹 *Prix crypto*\n\n` +
        `🏛️ L1 / Mainnets\n` +
        `🟠 *Bitcoin (BTC)* : ${formatEUR(prices.btc)}\n` +
        `🔷 *Ethereum (ETH)* : ${formatEUR(prices.eth)}\n` +
        `🟣 *Solana (SOL)* : ${formatEUR(prices.sol)}\n\n` +
        `⚡ L2 / Scaling\n` +
        `🟦 *ETH on Base* : ${formatEUR(prices.base)}\n` +
        `🔵 *Optimism (OP)* : ${formatEUR(prices.op || 0)}\n` +
        `🟣 *Polygon (POL)* : ${formatEUR(prices.matic || 0)}\n\n` +
        `🏦 Stablecoins\n` +
        `💵 *USD Coin (USDC)* : ${formatEUR(prices.usdc)}\n` +
        `💵 *Tether (USDT)* : ${formatEUR(prices.usdt)}\n\n` +
        `🪙 Legacy / Forks\n` +
        `◈ *Litecoin (LTC)* : ${formatEUR(prices.ltc)}\n` +
        `₿ *Bitcoin Cash (BCH)* : ${formatEUR(prices.bch)}\n\n` +
        `🕒 Mis a jour en temps reel`

      await ctx.reply(text, { 
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Recharger", "refresh_prices")],
          [Markup.button.callback("❌ Fermer", "close_message")]
        ])
      })
    } catch (error) {
      ctx.reply("❌ Erreur lors de la recuperation des prix.")
    }
  })

  // Hears: 💵 Soldes
  bot.hears("💵 Soldes", async (ctx) => {
    const chatId = ctx.chat.id
    const wallets = await storage.getWallets(chatId)
    if (wallets.length === 0) {
      return ctx.reply("❌ Tu n'as pas encore de wallet.")
    }

    const { convertToEUR, formatEUR } = await import("../../shared/price.js")

    let text = "💰 *Soldes de tes Wallets*\n\n"
    let totalEUR = 0

    for (const wallet of wallets) {
      try {
        const balance = await walletService.getBalance(chatId, wallet.id)
        const balanceNum = parseFloat(balance.balance) || 0

        let valueEUR = 0
        if (balanceNum > 0) {
          try {
            const conversion = await convertToEUR(wallet.chain, balanceNum)
            valueEUR = conversion.valueEUR || 0
            totalEUR += valueEUR
          } catch (e) {}
        }

        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `Solde: ${balance.balance} ${wallet.chain.toUpperCase()}`
        if (valueEUR > 0) {
          text += ` ≈ ${formatEUR(valueEUR)}`
        }
        text += `\n\n`
      } catch (error) {
        text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `❌ Erreur de récupération\n\n`
      }
    }

    text += `━━━━━━━━━━━━\n`
    text += `💶 *Total :* ${formatEUR(totalEUR)}`

    await ctx.reply(text, { parse_mode: "Markdown" })
  })

  // Refresh prices button
  bot.action("refresh_prices", async (ctx) => {
    try {
      const { getPricesEUR, formatEUR, clearPriceCache } = await import("../../shared/price.js")
      clearPriceCache()
      const prices = await getPricesEUR(true)

      const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

      const text = `💹 *Prix crypto*\n\n` +
        `🏛️ L1 / Mainnets\n` +
        `🟠 *Bitcoin (BTC)* : ${formatEUR(prices.btc)}\n` +
        `🔷 *Ethereum (ETH)* : ${formatEUR(prices.eth)}\n` +
        `🟣 *Solana (SOL)* : ${formatEUR(prices.sol)}\n\n` +
        `⚡ L2 / Scaling\n` +
        `🟦 *ETH on Base* : ${formatEUR(prices.base)}\n` +
        `🔵 *Optimism (OP)* : ${formatEUR(prices.op || 0)}\n` +
        `🟣 *Polygon (POL)* : ${formatEUR(prices.matic || 0)}\n\n` +
        `🏦 Stablecoins\n` +
        `💵 *USD Coin (USDC)* : ${formatEUR(prices.usdc)}\n` +
        `💵 *Tether (USDT)* : ${formatEUR(prices.usdt)}\n\n` +
        `🪙 Legacy / Forks\n` +
        `◈ *Litecoin (LTC)* : ${formatEUR(prices.ltc)}\n` +
        `₿ *Bitcoin Cash (BCH)* : ${formatEUR(prices.bch)}\n\n` +
        `🕒 Mis a jour a ${now}`

      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Recharger", "refresh_prices")],
          [Markup.button.callback("❌ Fermer", "close_message")]
        ])
      })
    } catch (error) {
      if (error.message && error.message.includes("message is not modified")) {
        return
      }
      console.error("refresh_prices error:", error)
      ctx.answerCbQuery("Erreur: " + error.message, true)
    }
  })

  // Close message button
  bot.action("close_message", async (ctx) => {
    await ctx.deleteMessage()
  })
}
