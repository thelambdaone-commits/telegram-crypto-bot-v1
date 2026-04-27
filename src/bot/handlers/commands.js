/**
 * Slash Commands Handler - All /commands in French with a fun tone 🎮
 */
import { Markup } from "telegraf"
import { mainMenuKeyboard, walletListKeyboard, mainReplyKeyboard } from "../keyboards/index.js"
import { detectChain } from "../../shared/address-detector.js"
import { getPricesEUR, formatEUR, convertToEUR } from "../../shared/price.js"
import { generatePriceChart, parsePeriod } from "../../shared/chart.js"
import { isAdmin } from "../middlewares/auth.middleware.js"
import { config } from "../../core/config.js"
import { getFullHelpText } from "../ui/index.js"

export function setupCommands(bot, storage, walletService, sessions) {
  
  // ═══════════════════════════════════════════════════════════════
  // 🆘 /help - Menu d'aide complet
  // ═══════════════════════════════════════════════════════════════
  bot.command("help", async (ctx) => {
    await ctx.reply(getFullHelpText(), { 
      parse_mode: "Markdown",
      ...mainReplyKeyboard()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 👛 /wallet - Affiche la liste des wallets
  // ═══════════════════════════════════════════════════════════════
  bot.command("wallet", async (ctx) => {
    const chatId = ctx.chat.id
    const wallets = await storage.getWallets(chatId)

    if (wallets.length === 0) {
      return ctx.reply(
        "😅 *Oups !* Tu n'as pas encore de wallet.\n\n" +
        "💡 Utilise `/gen eth`, `/gen btc` ou `/gen sol` pour en créer un !",
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      )
    }

    let text = "👛 *Tes Wallets*\n\n"
    
    for (const wallet of wallets) {
      const chainEmoji = { eth: "🔷", btc: "🟠", sol: "🟣" }[wallet.chain] || "💎"
      try {
        const balance = await walletService.getBalance(chatId, wallet.id)
        text += `${chainEmoji} *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `📬 \`${wallet.address}\`\n`
        text += `💰 Solde: *${balance.balance} ${wallet.chain.toUpperCase()}*\n\n`
      } catch (e) {
        text += `${chainEmoji} *${wallet.label}* (${wallet.chain.toUpperCase()})\n`
        text += `📬 \`${wallet.address}\`\n`
        text += `💰 Solde: _Erreur de récupération_\n\n`
      }
    }

    await ctx.reply(text, { 
      parse_mode: "Markdown",
      ...walletListKeyboard(wallets, "wallet_")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 🆕 /gen - Génère un nouveau wallet
  // ═══════════════════════════════════════════════════════════════
  bot.command("gen", async (ctx) => {
    const chatId = ctx.chat.id
    const args = ctx.message.text.split(" ").slice(1)
    
    if (args.length === 0) {
      return ctx.reply(
        "🎲 *Génération de Wallet*\n\n" +
        "Utilise cette commande avec le réseau souhaité :\n\n" +
        "• `/gen eth` — Ethereum 🔷\n" +
        "• `/gen btc` — Bitcoin 🟠\n" +
        "• `/gen sol` — Solana 🟣",
        { parse_mode: "Markdown" }
      )
    }

    const chain = args[0].toLowerCase()
    if (!["eth", "btc", "sol"].includes(chain)) {
      return ctx.reply(
        "❌ *Réseau non supporté !*\n\n" +
        "Choisis parmi : `eth`, `btc`, `sol`",
        { parse_mode: "Markdown" }
      )
    }

    const chainNames = { eth: "Ethereum 🔷", btc: "Bitcoin 🟠", sol: "Solana 🟣" }
    const loadingMsg = await ctx.reply(`⏳ Génération de ton wallet ${chainNames[chain]}...`)

    try {
      const wallet = await walletService.createWallet(chatId, chain)
      const fullWallet = await storage.getWalletWithKey(chatId, wallet.id)

      let message = `🎉 *Wallet ${chainNames[chain]} créé !*\n\n`
      message += `🏷 *Nom :* ${wallet.label}\n`
      message += `📬 *Adresse :*\n\`${fullWallet.address}\`\n\n`
      
      if (fullWallet.mnemonic) {
        message += `🔐 *Phrase de récupération :*\n\`${fullWallet.mnemonic}\`\n\n`
      }
      
      message += `⚠️ *IMPORTANT :* Sauvegarde bien cette phrase ! Elle ne sera plus affichée.\n\n`
      message += `🕐 _Ce message sera supprimé dans 60 secondes._`

      try {
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id)
      } catch (e) {}
      
      const sentMsg = await ctx.reply(message, { 
        parse_mode: "Markdown",
        ...mainReplyKeyboard()
      })

      // Auto-delete after 60s for security
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id)
          ctx.reply("🔒 _Message de sécurité supprimé._", { parse_mode: "Markdown" })
        } catch (e) {}
      }, 60000)

    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id)
      } catch (e) {}
      ctx.reply(`❌ Oups ! Erreur : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 💰 /bal - Vérifie le solde d'une adresse
  // ═══════════════════════════════════════════════════════════════
  bot.command("bal", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length < 2) {
      return ctx.reply(
        "💰 *Verification de solde*\n\n" +
        "Utilisation : `/bal <reseau> <adresse>`\n\n" +
        "Exemples :\n" +
        "• `/bal eth 0x123...abc`\n" +
        "• `/bal btc bc1q...xyz`\n" +
        "• `/bal ltc LgZY...xyz`\n" +
        "• `/bal bch qpzr...xyz`\n" +
        "• `/bal sol 5Yfk...123`\n" +
        "• `/bal matic 0x123...abc`\n" +
        "• `/bal op 0x123...abc`\n" +
        "• `/bal base 0x123...abc`",
        { parse_mode: "Markdown" }
      )
    }

    const network = args[0].toLowerCase()
    const address = args[1]

    if (!["eth", "btc", "ltc", "bch", "sol", "arb", "matic", "op", "base"].includes(network)) {
      return ctx.reply("❌ Reseau non supporte ! Choisis : `eth`, `btc`, `ltc`, `bch`, `sol`, `arb`, `matic`, `op`, `base`", { parse_mode: "Markdown" })
    }

    const loadingMsg = await ctx.reply("🔍 Recherche du solde...")

    try {
      const balanceData = await walletService.getPublicAddressBalance(network, address)
      const conversion = await convertToEUR(network, Number.parseFloat(balanceData.balance))
      
      const chainEmoji = { eth: "🔷", btc: "🟠", ltc: "◈", bch: "₿", sol: "🟣", arb: "🔴", matic: "🟣", op: "🔵", base: "🟦" }[network]
      
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      
      await ctx.reply(
        `${chainEmoji} *Solde ${network.toUpperCase()}*\n\n` +
        `📬 Adresse : \`${address.slice(0, 8)}...${address.slice(-6)}\`\n` +
        `💰 Solde : *${balanceData.balance} ${network.toUpperCase()}*\n` +
        `💶 Valeur : *${formatEUR(conversion.valueEUR)}*`,
        { parse_mode: "Markdown" }
      )
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer le solde : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 📤 /send - Envoie des cryptos
  // ═══════════════════════════════════════════════════════════════
  bot.command("send", async (ctx) => {
    const chatId = ctx.chat.id
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length < 3) {
      return ctx.reply(
        "💸 *Envoi de cryptos*\n\n" +
        "Utilisation : `/send <réseau> <adresse> <montant>`\n\n" +
        "Exemples :\n" +
        "• `/send eth 0x123...abc 0.1`\n" +
        "• `/send btc bc1q...xyz 0.005`\n" +
        "• `/send sol 5Yfk...123 2.5`\n\n" +
        "💡 Pour un envoi plus guidé, utilise le bouton *💸 Envoyer* du menu !",
        { parse_mode: "Markdown" }
      )
    }

    const network = args[0].toLowerCase()
    const toAddress = args[1]
    const amount = Number.parseFloat(args[2].replace(",", "."))

    if (!["eth", "btc", "sol"].includes(network)) {
      return ctx.reply("❌ Réseau non supporté ! Choisis : `eth`, `btc`, `sol`", { parse_mode: "Markdown" })
    }

    if (Number.isNaN(amount) || amount <= 0) {
      return ctx.reply("❌ Montant invalide ! Entre un nombre positif.")
    }

    // Find user's wallet for this network
    const wallets = await storage.getWallets(chatId)
    const wallet = wallets.find(w => w.chain === network)

    if (!wallet) {
      return ctx.reply(
        `❌ Tu n'as pas de wallet ${network.toUpperCase()} !\n\n` +
        `Crée-en un avec \`/gen ${network}\``,
        { parse_mode: "Markdown" }
      )
    }

    // Store in session and redirect to confirmation flow
    sessions.setData(chatId, {
      selectedWalletId: wallet.id,
      selectedChain: network,
      toAddress: toAddress,
      amount: amount,
      amountType: "native"
    })
    sessions.setState(chatId, "SELECT_FEE")

    // Get balance and fees
    try {
      const balanceData = await walletService.getBalance(chatId, wallet.id)
      const fees = await walletService.estimateFees(chatId, wallet.id, toAddress, amount)
      
      sessions.setData(chatId, { 
        ...sessions.getData(chatId), 
        fees,
        currentBalance: Number.parseFloat(balanceData.balance)
      })

      const conversion = await convertToEUR(network, amount)
      
      const { feeSelectionKeyboard } = await import("../keyboards/index.js")
      
      await ctx.reply(
        `💸 *Préparation de l'envoi*\n\n` +
        `📤 De : ${wallet.label}\n` +
        `📥 Vers : \`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}\`\n` +
        `💰 Montant : *${amount} ${network.toUpperCase()}*\n` +
        `💶 Valeur : ${formatEUR(conversion.valueEUR)}\n` +
        `📊 Solde dispo : ${balanceData.balance} ${network.toUpperCase()}\n\n` +
        `Choisis la vitesse de transaction :`,
        { parse_mode: "Markdown", ...feeSelectionKeyboard("slow") }
      )
    } catch (error) {
      sessions.clearState(chatId)
      ctx.reply(`❌ Erreur : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 📜 /tx - Historique des transactions
  // ═══════════════════════════════════════════════════════════════
  bot.command("tx", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length < 2) {
      return ctx.reply(
        "📜 *Historique des transactions*\n\n" +
        "Utilisation : `/tx <réseau> <adresse> [limite]`\n\n" +
        "Exemples :\n" +
        "• `/tx eth 0x123...abc` — 5 dernières TX\n" +
        "• `/tx sol 5Yfk...123 10` — 10 dernières TX",
        { parse_mode: "Markdown" }
      )
    }

    const network = args[0].toLowerCase()
    const address = args[1]
    const limit = Math.min(Number.parseInt(args[2]) || 5, 20)

    if (!["eth", "btc", "sol"].includes(network)) {
      return ctx.reply("❌ Réseau non supporté ! Choisis : `eth`, `btc`, `sol`", { parse_mode: "Markdown" })
    }

    const loadingMsg = await ctx.reply("🔍 Recherche des transactions...")

    try {
      const txHistory = await walletService.getTransactionHistory(network, address, limit)
      
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      
      if (!txHistory || txHistory.length === 0) {
        return ctx.reply(
          `📜 *Historique ${network.toUpperCase()}*\n\n` +
          `Aucune transaction trouvée pour cette adresse.`,
          { parse_mode: "Markdown" }
        )
      }

      let text = `📜 *${txHistory.length} dernières transactions (${network.toUpperCase()})*\n\n`
      
      for (const tx of txHistory.slice(0, limit)) {
        const direction = tx.type === "in" ? "📥" : "📤"
        const date = new Date(tx.timestamp).toLocaleDateString("fr-FR")
        text += `${direction} *${tx.amount} ${network.toUpperCase()}*\n`
        text += `📅 ${date}\n`
        text += `🔗 \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n\n`
      }

      await ctx.reply(text, { parse_mode: "Markdown" })
      
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer l'historique : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // ⛽ /gas - Prix du gas / frais de transaction
  // ═══════════════════════════════════════════════════════════════
  bot.command("gas", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)
    const chain = args[0]?.toLowerCase()

    const loadingMsg = await ctx.reply("⛽ Récupération des frais de transaction...")

    try {
      const { ethers } = await import("ethers")

      // Helper functions for each chain
      const getEthFees = async () => {
        const ethProvider = new ethers.JsonRpcProvider(config.rpc?.eth || "https://eth.llamarpc.com")
        const feeData = await ethProvider.getFeeData()
        const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0
        const maxFee = feeData.maxFeePerGas ? Number(feeData.maxFeePerGas) / 1e9 : 0
        const priorityFee = feeData.maxPriorityFeePerGas ? Number(feeData.maxPriorityFeePerGas) / 1e9 : 0
        let level = "🟢 Bas"
        if (gasPrice > 30) level = "🟡 Moyen"
        if (gasPrice > 80) level = "🔴 Élevé"
        return { gasPrice, maxFee, priorityFee, level }
      }

      const getBtcFees = async () => {
        const btcResponse = await fetch("https://mempool.space/api/v1/fees/recommended")
        const fees = await btcResponse.json()
        let level = "🟢 Bas"
        if (fees.fastestFee > 50) level = "🟡 Moyen"
        if (fees.fastestFee > 100) level = "🔴 Élevé"
        return { ...fees, level }
      }

      const getSolFees = async () => {
        const solResponse = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getRecentPrioritizationFees",
            params: [],
          }),
        })
        const solData = await solResponse.json()
        let priorityFee = 5000
        if (solData.result?.length > 0) {
          const fees = solData.result.map(f => f.prioritizationFee).filter(f => f > 0)
          priorityFee = fees.length > 0 ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 5000
        }
        let level = "🟢 Bas"
        if (priorityFee > 10000) level = "🟡 Moyen"
        if (priorityFee > 50000) level = "🔴 Élevé"
        return { priorityFee, level }
      }

      const getLtcFees = async () => {
        try {
          const response = await fetch("https://mempool.space/litecoin/api/v1/fees/recommended")
          const fees = await response.json()
          let level = "🟢 Bas"
          if (fees.fastestFee > 50) level = "🟡 Moyen"
          if (fees.fastestFee > 100) level = "🔴 Élevé"
          return { ...fees, level }
        } catch (e) {
          return { fastestFee: 10, halfHourFee: 5, hourFee: 1, level: "🟢 Bas" }
        }
      }

      const getBchFees = async () => {
        // BCH utilise des frais fixes (~0.00001 BCH par transaction)
        return { fastestFee: 1, halfHourFee: 1, hourFee: 1, level: "🟢 Bas" }
      }

      const getL2Fees = async (rpcUrl) => {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl)
          const feeData = await provider.getFeeData()
          const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0
          const maxFee = feeData.maxFeePerGas ? Number(feeData.maxFeePerGas) / 1e9 : 0
          const priorityFee = feeData.maxPriorityFeePerGas ? Number(feeData.maxPriorityFeePerGas) / 1e9 : 0
          let level = "🟢 Bas"
          if (gasPrice > 30) level = "🟡 Moyen"
          if (gasPrice > 80) level = "🔴 Eleve"
          return { gasPrice, maxFee, priorityFee, level }
        } catch (e) {
          return { gasPrice: 0.01, maxFee: 0.01, priorityFee: 0.001, level: "🟢 Bas" }
        }
      }

      const getPolygonFees = () => getL2Fees("https://polygon-rpc.com")
      const getOptimismFees = () => getL2Fees("https://mainnet.optimism.io")
      const getBaseFees = () => getL2Fees("https://mainnet.base.org")

      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)

      // Specific chain requested
      if (chain === "eth") {
        const eth = await getEthFees()
        
        // Calculer le coût en EUR pour un transfert simple (21000 gas)
        const typicalGasUnits = 21000
        let eurCost = null
        try {
          const prices = await getPricesEUR()
          // Coût en ETH = gasPrice (Gwei) * gasUnits / 1_000_000_000
          eurCost = (eth.gasPrice * typicalGasUnits / 1_000_000_000) * prices.eth
        } catch (e) {}
        
        const eurInfo = eurCost !== null ? ` (~${formatEUR(eurCost)})` : ""
        
        return ctx.reply(
          `🔷 *Frais Ethereum* ${eth.level}\n\n` +
          `💨 Gas Price : *${eth.gasPrice.toFixed(2)} Gwei*${eurInfo}\n` +
          `🚀 Max Fee : *${eth.maxFee.toFixed(2)} Gwei*\n` +
          `💎 Priority : *${eth.priorityFee.toFixed(2)} Gwei*\n\n` +
          `💡 _Moins de 20 Gwei = bon moment pour transférer !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "btc") {
        const btc = await getBtcFees()
        
        // Calculer le coût en EUR pour une transaction typique (~140 vB)
        const typicalTxSize = 140 // vBytes for a typical 1-in, 2-out transaction
        let eurPrices = { fast: null, medium: null, slow: null, eco: null }
        try {
          const prices = await getPricesEUR()
          const btcPriceEUR = prices.btc
          // Coût en BTC = (sat/vB * vB) / 100_000_000
          eurPrices.fast = (btc.fastestFee * typicalTxSize / 100_000_000) * btcPriceEUR
          eurPrices.medium = (btc.halfHourFee * typicalTxSize / 100_000_000) * btcPriceEUR
          eurPrices.slow = (btc.hourFee * typicalTxSize / 100_000_000) * btcPriceEUR
          eurPrices.eco = ((btc.economyFee || btc.hourFee) * typicalTxSize / 100_000_000) * btcPriceEUR
        } catch (e) {}
        
        const formatFeeEUR = (eur) => eur !== null ? ` (~${formatEUR(eur)})` : ""
        
        return ctx.reply(
          `🟠 *Frais Bitcoin* ${btc.level}\n\n` +
          `⚡ Rapide (~10min) : *${btc.fastestFee} sat/vB*${formatFeeEUR(eurPrices.fast)}\n` +
          `🕐 Moyen (~30min) : *${btc.halfHourFee} sat/vB*${formatFeeEUR(eurPrices.medium)}\n` +
          `🐢 Lent (~1h) : *${btc.hourFee} sat/vB*${formatFeeEUR(eurPrices.slow)}\n` +
          `💤 Économique : *${btc.economyFee || btc.hourFee} sat/vB*${formatFeeEUR(eurPrices.eco)}\n\n` +
          `💡 _Moins de 10 sat/vB = très économique !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "sol") {
        const sol = await getSolFees()
        
        // Calculer le coût en EUR (base fee + priority fee)
        const baseFee = 5000 // lamports
        let eurCost = null
        try {
          const prices = await getPricesEUR()
          // Coût en SOL = (baseFee + priorityFee) / 1_000_000_000
          eurCost = ((baseFee + sol.priorityFee) / 1_000_000_000) * prices.sol
        } catch (e) {}
        
        const eurInfo = eurCost !== null ? ` (~${formatEUR(eurCost)})` : ""
        
        return ctx.reply(
          `🟣 *Frais Solana* ${sol.level}\n\n` +
          `💎 Priority Fee : *${sol.priorityFee.toLocaleString()} µ◎*\n` +
          `💰 Base Fee : *5000 lamports*${eurInfo}\n\n` +
          `💡 _Solana est généralement très peu cher !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "ltc") {
        const ltc = await getLtcFees()
        
        return ctx.reply(
          `◈ *Frais Litecoin* ${ltc.level}\n\n` +
          `⚡ Rapide (~10min) : *${ltc.fastestFee} sat/vB*\n` +
          `🕐 Moyen (~30min) : *${ltc.halfHourFee} sat/vB*\n` +
          `🐢 Lent (~1h) : *${ltc.hourFee} sat/vB*\n\n` +
          `💡 _Similaire à Bitcoin, mais plus économique !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "bch") {
        const bch = await getBchFees()
        
        return ctx.reply(
          `₿ *Frais Bitcoin Cash*\n\n` +
          `💰 Frais fixes : *0.00001 BCH*\n` +
          `📦 Par transaction (~225 octets)\n\n` +
          `💡 _Tres economique pour les micro-transactions !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "matic") {
        const matic = await getPolygonFees()
        
        return ctx.reply(
          `🟣 *Frais Polygon* ${matic.level}\n\n` +
          `💨 Gas Price : *${matic.gasPrice.toFixed(2)} Gwei*\n` +
          `🚀 Max Fee : *${matic.maxFee.toFixed(2)} Gwei*\n\n` +
          `💡 _Polygon est tres bon marche !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "op") {
        const op = await getOptimismFees()
        
        return ctx.reply(
          `🔵 *Frais Optimism* ${op.level}\n\n` +
          `💨 Gas Price : *${op.gasPrice.toFixed(2)} Gwei*\n` +
          `🚀 Max Fee : *${op.maxFee.toFixed(2)} Gwei*\n\n` +
          `💡 _Optimism est tres bon marche !_`,
          { parse_mode: "Markdown" }
        )
      }

      if (chain === "base") {
        const baseChain = await getBaseFees()
        
        return ctx.reply(
          `🟦 *Frais Base* ${baseChain.level}\n\n` +
          `💨 Gas Price : *${baseChain.gasPrice.toFixed(2)} Gwei*\n` +
          `🚀 Max Fee : *${baseChain.maxFee.toFixed(2)} Gwei*\n\n` +
          `💡 _Base est tres bon marche !_`,
          { parse_mode: "Markdown" }
        )
      }

      // No argument = show all
      const [eth, btc, ltc, bch, sol, matic, op, baseChain] = await Promise.all([
        getEthFees().catch(() => ({ gasPrice: 0, maxFee: 0, level: "❓" })),
        getBtcFees().catch(() => ({ fastestFee: 0, halfHourFee: 0, hourFee: 0, level: "❓" })),
        getLtcFees().catch(() => ({ fastestFee: 0, halfHourFee: 0, hourFee: 0, level: "❓" })),
        getBchFees().catch(() => ({ fastestFee: 1, level: "🟢 Bas" })),
        getSolFees().catch(() => ({ priorityFee: 5000, level: "🟢 Bas" })),
        getPolygonFees().catch(() => ({ gasPrice: 0.01, maxFee: 0.01, level: "🟢 Bas" })),
        getOptimismFees().catch(() => ({ gasPrice: 0.001, maxFee: 0.001, level: "🟢 Bas" })),
        getBaseFees().catch(() => ({ gasPrice: 0.001, maxFee: 0.001, level: "🟢 Bas" }))
      ])

      await ctx.reply(
        `⛽ *Frais de Transaction*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🔷 *Ethereum* ${eth.level}\n` +
        `💨 Gas : *${eth.gasPrice.toFixed(1)} Gwei*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🟠 *Bitcoin* ${btc.level}\n` +
        `⚡ Rapide : *${btc.fastestFee} sat/vB*\n\n` +
        `━━━━━━━━━━━━\n` +
        `◈ *Litecoin* ${ltc.level}\n` +
        `⚡ Rapide : *${ltc.fastestFee} sat/vB*\n\n` +
        `━━━━━━━━━━━━\n` +
        `₿ *Bitcoin Cash*\n` +
        `💰 Frais : *0.00001 BCH*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🟣 *Solana* ${sol.level}\n` +
        `💎 Priority : *${sol.priorityFee.toLocaleString()} µ◎*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🟣 *Polygon* ${matic.level}\n` +
        `💨 Gas : *${matic.gasPrice.toFixed(2)} Gwei*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🔵 *Optimism* ${op.level}\n` +
        `💨 Gas : *${op.gasPrice.toFixed(2)} Gwei*\n\n` +
        `━━━━━━━━━━━━\n` +
        `🟦 *Base* ${baseChain.level}\n` +
        `💨 Gas : *${baseChain.gasPrice.toFixed(2)} Gwei*\n\n` +
        `_Utilise_ \`/gas eth|btc|ltc|bch|sol|matic|op|base\` _pour les detalhes_`,
        { parse_mode: "Markdown" }
      )
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer les frais : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 💹 /price - Prix des cryptos
  // ═══════════════════════════════════════════════════════════════
  bot.command("price", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length === 0) {
      // Show all prices
      const loadingMsg = await ctx.reply("💹 Recuperation des prix...")

      try {
        const prices = await getPricesEUR()
        
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
        
        await ctx.reply(
          `💹 *Prix des Cryptos en EUR*\n\n` +
          `🔷 *Ethereum (ETH)* : ${formatEUR(prices.eth)}\n` +
          `🟠 *Bitcoin (BTC)* : ${formatEUR(prices.btc)}\n` +
          `🟣 *Solana (SOL)* : ${formatEUR(prices.sol)}\n` +
          `◈ *Litecoin (LTC)* : ${formatEUR(prices.ltc)}\n` +
          `₿ *Bitcoin Cash (BCH)* : ${formatEUR(prices.bch)}\n` +
          `💵 *USDC* : ${formatEUR(prices.usdc)}\n` +
          `💵 *USDT* : ${formatEUR(prices.usdt)}\n` +
          `🟣 *Polygon (MATIC)* : ${formatEUR(prices.matic || 0)}\n` +
          `🔵 *Optimism (OP)* : ${formatEUR(prices.op || 0)}\n` +
          `🟦 *Base (ETH)* : ${formatEUR(prices.base || 0)}\n\n` +
          `_Mis a jour via CoinGecko_`,
          { parse_mode: "Markdown" }
        )
      } catch (error) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
        } catch (e) {}
        ctx.reply(`❌ Erreur : ${error.message}`)
      }
      return
    }

    const crypto = args[0].toLowerCase()
    if (!["eth", "btc", "sol", "ltc", "bch", "usdc", "usdt", "matic", "op", "base"].includes(crypto)) {
      return ctx.reply(
        "💹 *Prix d'une crypto*\n\n" +
        "Utilisation : `/price <crypto>`\n\n" +
        "Cryptos: eth, btc, sol, ltc, bch, usdc, usdt, matic, op, base\n\n" +
        "Ou juste `/price` pour voir tous les prix !",
        { parse_mode: "Markdown" }
      )
    }

    try {
      const prices = await getPricesEUR()
      const price = prices[crypto]
      const names = { 
        eth: "Ethereum 🔷", 
        btc: "Bitcoin 🟠", 
        sol: "Solana 🟣",
        ltc: "Litecoin ◈",
        bch: "Bitcoin Cash ₿",
        usdc: "USD Coin 💵",
        usdt: "Tether 💵",
        matic: "Polygon 🟣",
        op: "Optimism 🔵",
        base: "Base (ETH) 🟦"
      }
      
      await ctx.reply(
        `💹 *${names[crypto]}*\n\n` +
        `Prix actuel : *${formatEUR(price || 0)}*\n\n` +
        `_Donnees CoinGecko_`,
        { parse_mode: "Markdown" }
      )
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 📚 /learn - Leçon éducative : COIN vs TOKEN
  // ═══════════════════════════════════════════════════════════════
  bot.command("learn", async (ctx) => {
    await ctx.reply(
      "📌 *Coin vs Token*\n\n" +
      "Comprendre cette distinction est essentiel pour ne pas se tromper dans ses investissements.\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "1️⃣ *Coins* 🪙\n" +
      "✔️ Possedent leur blockchain native.\n" +
      "✔️ Exemples :\n" +
      "  • Bitcoin (BTC) 🟠\n" +
      "  • Ethereum (ETH) 🔷\n" +
      "  • Solana (SOL) 🟣\n" +
      "  • Litecoin (LTC) ◈\n" +
      "  • Bitcoin Cash (BCH) ₿\n" +
      "✔️ Role : Servir de monnaie et payer les frais du reseau.\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "2️⃣ *Tokens* 🎫\n" +
      "✔️ Dependent d'une blockchain hote (souvent Ethereum, Solana, etc.).\n" +
      "✔️ Exemples :\n" +
      "  • SHIB, UNI, SAND (utilite)\n" +
      "  • USDC, USDT (stablecoins) 💵\n" +
      "✔️ Role : Representer une utilite, un droit, ou un acces a un service.\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "💵 *Stablecoins* 💵\n" +
      "✔️ Tokens indexes sur une devise (USD, EUR).\n" +
      "✔️ Exemples : USDC, USDT, EUROC.\n" +
      "✔️ Objectif : 1 token = 1 USD (ou autre) (en theorie).\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "🟣 *Layer 2 (L2)* \n" +
      "Les Layer 2 sont des blockchains construites sur Ethereum qui offrent :\n" +
      "  • Frais de transaction tres bas (jusqu'a 100x moins cher)\n" +
      "  • Transactions plus rapides\n" +
      "  • Meme securite que Ethereum\n\n" +
      "L2 supportes :\n" +
      "  • Polygon (MATIC) 🟣 - tres bon marche\n" +
      "  • Optimism (OP) 🔵 - OP Stack\n" +
      "  • Base 🟦 - Cree par Coinbase\n\n" +
      "✅ Ces reseaux utilisent la meme adresse Ethereum (0x...)\n" +
      "✅ Vous pouvez utiliser votre cle privee ETH existante\n" +
      "✅ Votre seed phrase genere la meme adresse sur ces L2\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "⚠️ *Dependance systemique*\n" +
      "✔️ Les tokens heritent la securite et la disponibilite de la blockchain qui les heberge.\n" +
      "✔️ Hard fork, congestion ou arret du reseau → impact direct sur les tokens.\n" +
      "✔️ Leur valeur est derivee de l'infrastructure, de la liquidite et de la gouvernance de la L1/L2.",
{ parse_mode: "Markdown" }
    )
  })

  // 🔗 /chains - Liste des blockchains supportées
  bot.command("chains", async (ctx) => {
    await ctx.reply(
      "🔗 *Blockchains supportees*\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "*Layer 1*\n" +
      "🔷 Ethereum (ETH) - blockchain principale\n" +
      "🟠 Bitcoin (BTC) - blockchain Bitcoin\n" +
      "◈ Litecoin (LTC) - fork de Bitcoin\n" +
      "₿ Bitcoin Cash (BCH) - fork de Bitcoin\n" +
      "🟣 Solana (SOL) - blockchain independante\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "*Layer 2 (Ethereum)*\n" +
      "🔴 Arbitrum - L2 Ethereum, staking USDC/USDT\n" +
      "🟣 Polygon - L2 Ethereum tres bon marche\n" +
      "🔵 Optimism - L2 OP Stack\n" +
      "🟦 Base - L2 Coinbase\n\n" +
      "━━━━━━━━━━━━\n\n" +
      "*Info importante*\n" +
      "Les L2 (Arbitrum, Polygon, Optimism, Base) utilisent la meme adresse Ethereum (0x...).\n" +
      "Vous pouvez utiliser votre cle privee ETH sur tous ces reseaux.\n" +
      "Votre seed phrase genere la meme adresse sur ETH + tous les L2.\n\n" +
      "Tapez /learn pour en savoir plus sur les Layer 2.",
      { parse_mode: "Markdown" }
    )
  })

  // ═══════════════════════════════════════════════════════════════
  // 📊 /graph - Graphique des prix d'une crypto
  // ═══════════════════════════════════════════════════════════════
  bot.command("graph", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length === 0) {
      return ctx.reply(
        "📊 *Graphique des Prix*\n\n" +
        "Utilisation : `/graph <crypto> [période]`\n\n" +
        "*Cryptos supportées :*\n" +
        "• `btc`, `eth`, `sol`, `ltc`, `bch`\n" +
        "• `usdc`, `usdt`, `matic`, `op`, `jitosol`\n\n" +
        "*Périodes disponibles :*\n" +
        "• `7` ou `7j` — 7 jours\n" +
        "• `30` ou `30j` — 30 jours (défaut)\n" +
        "• `90` ou `90j` — 90 jours\n" +
        "• `1an` ou `365` — 1 an\n\n" +
        "*Exemples :*\n" +
        "• `/graph btc` — Bitcoin sur 30 jours\n" +
        "• `/graph eth 7` — Ethereum sur 7 jours\n" +
        "• `/graph sol 1an` — Solana sur 1 an\n" +
        "• `/graph usdc` — USDC sur 30 jours",
        { parse_mode: "Markdown" }
      )
    }

    let crypto = args[0].toLowerCase()
    if (crypto === "base") crypto = "eth"
    
    const period = args[1] || "30"
    const days = parsePeriod(period)

    const supported = ["btc", "eth", "sol", "ltc", "bch", "usdc", "usdt", "matic", "op", "jitosol"]
    if (!supported.includes(crypto)) {
      return ctx.reply(
        "❌ *Crypto non supportée !*\n\n" +
        "Choisis parmi : " + supported.map(s => "`" + s + "`").join(", "),
        { parse_mode: "Markdown" }
      )
    }

    const chainNames = { 
      btc: "Bitcoin 🟠", 
      eth: "Ethereum 🔷", 
      sol: "Solana 🟣",
      ltc: "Litecoin ◈",
      bch: "Bitcoin Cash ₿",
      usdc: "USD Coin 💵",
      usdt: "Tether 💵",
      matic: "Polygon 🟣",
      op: "Optimism 🔵",
      jitosol: "Jito Staked SOL 🧪"
    }
    const loadingMsg = await ctx.reply(`📊 Génération du graphique ${chainNames[crypto]} sur ${days} jours...`)

    try {
      const { buffer, stats } = await generatePriceChart(crypto, days)

      // Delete loading message
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      } catch (e) {}

      // Format caption
      const changeEmoji = stats.isPositive ? "📈" : "📉"
      const changeColor = stats.isPositive ? "+" : ""
      
      const caption = 
        `${changeEmoji} *${chainNames[crypto]}* — ${days} jours\n\n` +
        `💰 Prix actuel : *€${stats.currentPrice.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}*\n` +
        `📊 Variation : *${changeColor}${stats.priceChange.toFixed(2)}%*\n` +
        `🔻 Min : €${stats.minPrice.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\n` +
        `🔺 Max : €${stats.maxPrice.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`

      // Send image
      await ctx.replyWithPhoto(
        { source: buffer },
        { caption, parse_mode: "Markdown" }
      )

    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      } catch (e) {}
      ctx.reply(`❌ Erreur lors de la génération du graphique : ${error.message}`)
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 🔢 /unit - Conversion des unités crypto
  // ═══════════════════════════════════════════════════════════════
  bot.command("unit", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1)

    if (args.length < 2) {
      return ctx.reply(
        `🔢 *Conversion d'Unités Crypto*\n\n` +
        `Utilisation : \`/unit <montant> <unité>\`\n\n` +
        `━━━━━━━━━━━━\n` +
        `🟠 *Bitcoin (BTC)*\n` +
        `• 1 BTC = 100 000 000 satoshis\n\n` +
        `◈ *Litecoin (LTC)*\n` +
        `• 1 LTC = 100 000 000 litoshis\n\n` +
        `₿ *Bitcoin Cash (BCH)*\n` +
        `• 1 BCH = 100 000 000 satoshis\n\n` +
        `🔷 *Ethereum (ETH)*\n` +
        `• 1 ETH = 1 000 000 000 gwei\n\n` +
        `🟣 *Solana (SOL)*\n` +
        `• 1 SOL = 1 000 000 000 lamports\n\n` +
        `💵 *Stablecoins (USDC/USDT)*\n` +
        `• 1 USDC/USDT = 100 cents\n\n` +
        `━━━━━━━━━━━━\n` +
        `*Exemples :*\n` +
        `• \`/unit 1 btc\` → satoshis\n` +
        `• \`/unit 250000000 satoshi\` → BTC\n` +
        `• \`/unit 0.5 eth\` → gwei\n` +
        `• \`/unit 4200000000 gwei\` → ETH\n` +
        `• \`/unit 2 sol\` → lamports\n` +
        `• \`/unit 1500000000 lamport\` → SOL\n` +
        `• \`/unit 100 usdc\` → cents`,
        { parse_mode: "Markdown" }
      )
    }

    const amount = Number.parseFloat(args[0].replace(",", "."))
    const unit = args[1].toLowerCase().replace(/s$/, "")

    if (Number.isNaN(amount)) {
      return ctx.reply("❌ Montant invalide ! Entre un nombre valide.")
    }

    let result = ""

    // BTC conversions
    if (unit === "btc") {
      const satoshis = amount * 100_000_000
      result = `🟠 *${amount.toLocaleString("fr-FR")} BTC* = *${satoshis.toLocaleString("fr-FR")} satoshis*`
    } 
    else if (unit === "satoshi" || unit === "sat") {
      const btc = amount / 100_000_000
      result = `🟠 *${amount.toLocaleString("fr-FR")} satoshis* = *${btc.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} BTC*`
    }
    // LTC conversions
    else if (unit === "ltc") {
      const litoshis = amount * 100_000_000
      result = `◈ *${amount.toLocaleString("fr-FR")} LTC* = *${litoshis.toLocaleString("fr-FR")} litoshis*`
    }
    else if (unit === "litoshi") {
      const ltc = amount / 100_000_000
      result = `◈ *${amount.toLocaleString("fr-FR")} litoshis* = *${ltc.toLocaleString("fr-FR", { maximumFractionDigits: 8 })} LTC*`
    }
    // BCH conversions
    else if (unit === "bch") {
      const satoshis = amount * 100_000_000
      result = `₿ *${amount.toLocaleString("fr-FR")} BCH* = *${satoshis.toLocaleString("fr-FR")} satoshis*`
    }
    // ETH conversions
    else if (unit === "eth") {
      const gwei = amount * 1_000_000_000
      result = `🔷 *${amount.toLocaleString("fr-FR")} ETH* = *${gwei.toLocaleString("fr-FR")} gwei*`
    }
    else if (unit === "gwei") {
      const eth = amount / 1_000_000_000
      result = `🔷 *${amount.toLocaleString("fr-FR")} gwei* = *${eth.toLocaleString("fr-FR", { maximumFractionDigits: 9 })} ETH*`
    }
    else if (unit === "wei") {
      const eth = amount / 1_000_000_000_000_000_000
      result = `🔷 *${amount.toLocaleString("fr-FR")} wei* = *${eth.toLocaleString("fr-FR", { maximumFractionDigits: 18 })} ETH*`
    }
    // SOL conversions
    else if (unit === "sol") {
      const lamports = amount * 1_000_000_000
      result = `🟣 *${amount.toLocaleString("fr-FR")} SOL* = *${lamports.toLocaleString("fr-FR")} lamports*`
    }
    else if (unit === "lamport") {
      const sol = amount / 1_000_000_000
      result = `🟣 *${amount.toLocaleString("fr-FR")} lamports* = *${sol.toLocaleString("fr-FR", { maximumFractionDigits: 9 })} SOL*`
    }
    // USDC conversions
    else if (unit === "usdc") {
      const cents = amount * 100
      result = `💵 *${amount.toLocaleString("fr-FR")} USDC* = *${cents.toLocaleString("fr-FR")} cents*`
    }
    else if (unit === "cent") {
      const usdc = amount / 100
      result = `💵 *${amount.toLocaleString("fr-FR")} cents* = *${usdc.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} USDC*`
    }
    // USDT conversions
    else if (unit === "usdt") {
      const cents = amount * 100
      result = `💵 *${amount.toLocaleString("fr-FR")} USDT* = *${cents.toLocaleString("fr-FR")} cents*`
    }
    else {
      return ctx.reply(
        `❌ *Unité non reconnue !*\n\n` +
        `Unités supportées :\n` +
        `• \`btc\`, \`satoshi\`\n` +
        `• \`ltc\`, \`litoshi\`\n` +
        `• \`bch\`, \`satoshi\`\n` +
        `• \`eth\`, \`gwei\`, \`wei\`\n` +
        `• \`sol\`, \`lamport\`\n` +
        `• \`usdc\`, \`cent\`\n` +
        `• \`usdt\`, \`cent\``,
        { parse_mode: "Markdown" }
      )
    }

    await ctx.reply(`🔢 *Conversion*\n\n${result}`, { parse_mode: "Markdown" })
  })
}
