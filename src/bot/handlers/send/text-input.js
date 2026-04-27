import { 
  mainMenuKeyboard, 
  amountTypeKeyboard, 
  quickAmountKeyboard, 
  feeSelectionKeyboard 
} from "../../keyboards/index.js"
import { detectChain } from "../../../shared/address-detector.js"
import { convertToEUR, formatEUR } from "../../../shared/price.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"
import { handleSendError } from "./helpers.js"

export function setupSendTextInput(bot, storage, walletService, sessions) {
  bot.on("text", async (ctx, next) => {
    const chatId = ctx.chat.id
    const state = sessions.getState(chatId)
    const text = ctx.message.text.trim()

    if (state === "ENTER_ADDRESS") {
      const detected = detectChain(text)
      const data = sessions.getData(chatId)

      // Pour les tokens SPL personnalisés sur Solana, utiliser "sol" pour la validation
      // Ne jamais utiliser le nom/symbole du token comme chaîne
      let validationChain = data.selectedChain;
      
      // Si selectedChain n'est pas une blockchain connue (ex: "DECIMALS"), forcer "sol"
      const validChains = ["eth", "btc", "ltc", "bch", "sol", "arb", "matic", "op", "base"];
      if (!validChains.includes(validationChain)) {
        validationChain = "sol";
      }

      if (detected !== validationChain) {
        return ctx.reply(
          `⚠️ *Adresse invalide*\n\nL'adresse saisie n'est pas une adresse ${validationChain.toUpperCase()} valide.`,
          { parse_mode: "Markdown" }
        )
      }

      sessions.setData(chatId, { ...data, toAddress: text })
      sessions.setState(chatId, "SELECT_AMOUNT_TYPE")

      return ctx.reply(`👉 *Vérification réussie*\n\nComment souhaites-tu saisir le montant ?`, {
        parse_mode: "Markdown",
        ...amountTypeKeyboard(),
      })
    }

    if (state === "ENTER_AMOUNT") {
      const data = sessions.getData(chatId)
      const amountStr = text.replace(",", ".")
      const inputAmount = Number.parseFloat(amountStr)

      if (Number.isNaN(inputAmount) || inputAmount <= 0) {
        return ctx.reply("⚠️ Montant invalide. Entre un nombre positif.")
      }

      try {
        let amount = inputAmount
        const tokenSymbol = data.selectedToken
        const displaySymbol = tokenSymbol || data.selectedChain.toUpperCase()

        if (data.amountType === "eur" && !tokenSymbol) {
          const conversion = await convertToEUR(data.selectedChain, 1)
          amount = inputAmount / conversion.rate
        }

        const balanceData = await walletService.getBalance(chatId, data.selectedWalletId, tokenSymbol)
        if (amount > Number.parseFloat(balanceData.balance)) {
          return ctx.reply(`💸 Solde insuffisant (${balanceData.balance} ${balanceData.symbol})`)
        }

        sessions.setData(chatId, { ...data, amount })
        
        const fees = await walletService.estimateFees(chatId, data.selectedWalletId, data.toAddress, amount, tokenSymbol)
        sessions.setData(chatId, { ...sessions.getData(chatId), fees })

        const amountEUR = tokenSymbol 
          ? await convertToEUR("usd", amount)
          : await convertToEUR(data.selectedChain, amount)

        ctx.reply(
          `✅ *Montant validé*\n\n` +
          `💰 Montant : *${amount.toFixed(8)} ${displaySymbol}*\n` +
          `💶 Valeur : ${formatEUR(amountEUR.valueEUR)}\n\n` +
          `Choisis la vitesse de transaction :`,
          {
            parse_mode: "Markdown",
            ...feeSelectionKeyboard("slow"),
          }
        )
        sessions.setState(chatId, "SELECT_FEE")
      } catch (error) {
        await handleSendError(ctx, error, mainMenuKeyboard)
      }
      return
    }

    if (state === "ENTER_ADDRESS_ANALYZE") {
      // Ignore commands and menu buttons
      if (text.startsWith("/") || ["💰 Mes Wallets", "💸 Envoyer", "🔍 Analyser", "🔐 Mes Clés", "📊 Cours EUR", "👑 Admin", "Stop", "Annuler", "Retour"].includes(text)) {
        sessions.setState(chatId, "IDLE")
        return next()
      }

      const { logger } = await import("../../../shared/logger.js")
      const chain = detectChain(text)
      if (!chain) {
        logger.warn("Invalid address provided for analysis", { address: text, chatId })
        return ctx.reply("⚠️ Adresse non reconnue (ETH, BTC, LTC, BCH, SOL, Arbitrum, Polygon, Optimism, Base acceptés).")
      }

      try {
        logger.info("Analyzing external address", { chain, address: text, chatId })
        
        const balanceData = await walletService.getPublicAddressBalance(chain, text)
        const conversion = await convertToEUR(chain, Number.parseFloat(balanceData.balance))

        sessions.setData(chatId, { analyzedAddress: text, analyzedChain: chain })

        let message = `🔍 *Analyse d'adresse*\n\n` +
          `⛓ Réseau : *${chain.toUpperCase()}*\n` +
          `📬 Adresse : \`${text}\`\n\n` +
          `💰 *Solde natif:* *${balanceData.balance} ${chain.toUpperCase()}*\n` +
          `💶 Valeur : ${formatEUR(conversion.valueEUR)}\n`

        const tokens = await walletService.getPublicAddressTokens(chain, text)
        
        if (tokens && tokens.length > 0) {
          const knownTokens = tokens.filter(t => t.isKnown)
          const unknownTokens = tokens.filter(t => !t.isKnown)
          
          if (knownTokens.length > 0) {
            message += `\n📦 *Tokens:*\n`
            for (const token of knownTokens) {
              const tokenConv = await convertToEUR(token.symbol.toLowerCase().includes('usd') ? 'usd' : 'sol', token.amount)
              message += `${token.icon} *${token.symbol}:* ${token.amount.toFixed(token.decimals <= 6 ? 2 : 6)} (${formatEUR(tokenConv.valueEUR)})\n`
            }
          }
          
          if (unknownTokens.length > 0) {
            message += `\n📦 *Fallback Tokens:*\n`
            for (const token of unknownTokens) {
              message += `${token.icon} *${token.symbol}:* ${token.amount.toFixed(token.decimals <= 6 ? 2 : 6)}\n`
              message += `   └ \`${token.mint}\`\n`
            }
          }
        }

        const { addressAnalyzedKeyboard } = await import("../../keyboards/index.js")
        ctx.reply(message, {
          parse_mode: "Markdown",
          ...addressAnalyzedKeyboard(chain),
        })
        sessions.setState(chatId, "IDLE")
        logger.info("Address analysis completed", { chain, address: text, balance: balanceData.balance, tokensCount: tokens?.length || 0, chatId })
      } catch (error) {
        logger.logError(error, { 
          context: "Address analysis", 
          chain, 
          address: text, 
          chatId 
        })
        ctx.reply(`❌ Erreur d'analyse : ${error.message}`)
      }
      return
    }

    return next()
  })
}
