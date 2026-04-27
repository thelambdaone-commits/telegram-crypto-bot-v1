import { 
  walletListKeyboard, 
  feeSelectionKeyboard, 
  confirmationKeyboard, 
  mainMenuKeyboard,
  quickAmountKeyboard,
  tokenSelectionKeyboard
} from "../../keyboards/index.js"
import { safeAnswerCbQuery } from "../../utils.js"
import { auditLogger, AUDIT_ACTIONS } from "../../../shared/security/audit-logger.js"
import { convertToEUR, formatEUR } from "../../../shared/price.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"
import { formatTxDetails, handleSendError } from "./helpers.js"

export function setupSendActions(bot, storage, walletService, sessions) {
  // Send funds menu - Step 1: Select source wallet
  bot.action("send_funds", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const wallets = await storage.getWallets(chatId)

    if (wallets.length === 0) {
      return ctx.editMessageText(`*${MESSAGES.noWallets}*`, {
        parse_mode: "Markdown",
        ...mainMenuKeyboard(),
      })
    }

    ctx.editMessageText(`${EMOJIS.send} *Envoyer des fonds*\n\nDepuis quel wallet veux-tu envoyer ?`, {
      parse_mode: "Markdown",
      ...walletListKeyboard(wallets, "send_from_"),
    })
  })

  // Select source wallet - Step 2: Check if token selection is needed
  bot.action(/^send_from_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const wallets = await storage.getWallets(chatId)
    const wallet = wallets.find((w) => w.id === walletId)

    if (!wallet) {
      return ctx.editMessageText("😕 Wallet non trouvé", mainMenuKeyboard())
    }

    sessions.setData(chatId, { selectedWalletId: walletId, selectedChain: wallet.chain })

    // If Arbitrum, show token selection
    if (wallet.chain === "arb") {
      ctx.editMessageText(`🚀 *Envoi depuis ${wallet.label}*\n\nSélectionne le token à envoyer :`, {
        parse_mode: "Markdown",
        ...tokenSelectionKeyboard(wallet.chain),
      })
    } else {
      // Other chains: go directly to address
      sessions.setState(chatId, "ENTER_ADDRESS")
      const { Markup } = await import("telegraf")
      const cancelKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("❌ Annuler", "cancel")]
      ])
      ctx.editMessageText(`🚀 *Envoi depuis ${wallet.label}*\n\nColle l'adresse du destinataire :`, { 
        parse_mode: "Markdown",
        ...cancelKeyboard
      })
    }
  })

  // Token selected for Arbitrum
  bot.action(/^token_(.+)$/, async (ctx) => {
    const match = ctx.match[1]
    const [chain, token] = match.split("_")
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    sessions.setData(chatId, { 
      ...data, 
      selectedChain: chain,
      selectedToken: token === "native" ? null : token 
    })
    sessions.setState(chatId, "ENTER_ADDRESS")

    const chainSymbol = chain.toUpperCase()
    const tokenLabel = token === "native" ? chainSymbol : token
    const { Markup } = await import("telegraf")
    const cancelKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback("❌ Annuler", "cancel")]
    ])

    ctx.editMessageText(`🚀 *Envoi ${tokenLabel} depuis ${chainSymbol}*\n\nColle l'adresse du destinataire :`, {
      parse_mode: "Markdown",
      ...cancelKeyboard
    })
  })

  // Action for "Send to analyzed address" - address is stored in session
  bot.action(/^send_to_analyzed_(.+)$/, async (ctx) => {
    const chain = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const sessionData = sessions.getData(chatId)
    const address = sessionData?.analyzedAddress

    if (!address) {
      return ctx.editMessageText("⚠️ Adresse non trouvée. Réanalyse une adresse.", mainMenuKeyboard())
    }

    const wallets = await storage.getWallets(chatId)
    const matchingWallets = wallets.filter((w) => w.chain === chain)

    if (matchingWallets.length === 0) {
      return ctx.editMessageText(
        `⚠️ *Aucun wallet ${chain.toUpperCase()}*\n\n` +
          `Tu n'as pas encore de wallet ${chain.toUpperCase()} pour envoyer à cette adresse.\n\n` +
          `Crées-en un d'abord !`,
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      )
    }

    sessions.setData(chatId, { ...sessionData, toAddress: address, selectedChain: chain })

    ctx.editMessageText(`📬 *Envoyer à :*\n\`${address}\`\n\nDepuis quel wallet ${chain.toUpperCase()} ?`, {
      parse_mode: "Markdown",
      ...walletListKeyboard(matchingWallets, "send_analyzed_from_"),
    })
  })

  // Select quick amount (All or 50%)
  bot.action(/^quick_amount_(.+)$/, async (ctx) => {
    const type = ctx.match[1] // all or 50
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    const tokenSymbol = data.selectedToken
    
    try {
      // Estimate fees first to calculate max sendable
      const fees = await walletService.estimateFees(chatId, data.selectedWalletId, data.toAddress, 0.001, tokenSymbol)
      const estimatedFee = fees.slow.estimatedFee || fees.slow.feeSOL || 0
      
      const balance = data.currentBalance
      let amount
      
      if (type === "all") {
        if (data.selectedChain === "sol" && data.currentBalanceLamports) {
          const feeLamports = fees.slow.fee || 5000
          const amountLamports = Math.max(0, Number(data.currentBalanceLamports) - feeLamports)
          amount = amountLamports / 1e9
        } else if (tokenSymbol) {
          amount = balance
        } else {
          amount = Math.max(0, balance - Number.parseFloat(estimatedFee))
        }
      } else if (type === "50") {
        if (data.selectedChain === "sol" && data.currentBalanceLamports) {
          const feeLamports = fees.slow.fee || 5000
          const amountLamports = Math.max(0, Math.floor(Number(data.currentBalanceLamports) * 0.5) - Math.floor(feeLamports * 0.5))
          amount = amountLamports / 1e9
        } else if (tokenSymbol) {
          amount = balance * 0.5
        } else {
          amount = Math.max(0, (balance * 0.5) - (Number.parseFloat(estimatedFee) * 0.5))
        }
      }
      
      if (amount <= 0) {
        const symbol = tokenSymbol || data.selectedChain.toUpperCase()
        return ctx.editMessageText(
          `💸 Solde insuffisant pour couvrir les frais.\n\nFrais estimés : ${estimatedFee} ${symbol}`,
          { parse_mode: "Markdown", ...mainMenuKeyboard() }
        )
      }
      
      sessions.setData(chatId, { ...data, amount })
      
      const actualFees = await walletService.estimateFees(chatId, data.selectedWalletId, data.toAddress, amount, tokenSymbol)
      sessions.setData(chatId, { ...sessions.getData(chatId), fees: actualFees })
      
      const displaySymbol = tokenSymbol || data.selectedChain.toUpperCase()
      const amountEUR = tokenSymbol ? await convertToEUR("usd", amount) : await convertToEUR(data.selectedChain, amount)
      
      ctx.editMessageText(
        `✨ *Montant sélectionné*\n\n` +
          `${type === "all" ? "💯 Tout envoyer" : "50% du solde"}\n` +
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
  })

  // Manual amount selection action
  bot.action("manual_amount", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    const label = data.amountType === "native" ? data.selectedChain.toUpperCase() : "Euros"
    
    const { Markup } = await import("telegraf")
    const cancelKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback("❌ Annuler", "cancel")]
    ])
    
    ctx.editMessageText(
      `⌨️ *Saisie du montant*\n\n` +
        `Combien souhaites-tu envoyer (${label}) ?`,
      { parse_mode: "Markdown", ...cancelKeyboard }
    )
    sessions.setState(chatId, "ENTER_AMOUNT")
  })

  // Fee selection
  bot.action(/^fee_(.+)$/, async (ctx) => {
    const feeLevel = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    const actualFeeLevel = feeLevel === "auto" ? "slow" : feeLevel
    sessions.setData(chatId, { ...data, feeLevel: actualFeeLevel })

    const text = await formatTxDetails(data, actualFeeLevel)

    sessions.setState(chatId, "CONFIRM_SEND")
    ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...confirmationKeyboard(),
    })
  })

  // Confirm send
  bot.action("confirm_send", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    const tokenSymbol = data.selectedToken
    let pendingTxId

    try {
      pendingTxId = await storage.addPendingTransaction(chatId, {
        walletId: data.selectedWalletId,
        toAddress: data.toAddress,
        amount: data.amount,
        chain: data.selectedChain,
        token: tokenSymbol,
      })

      await ctx.editMessageText(`${EMOJIS.loading} *Transaction en cours...*`, { parse_mode: "Markdown" })

      const result = await walletService.sendTransaction(
        chatId,
        data.selectedWalletId,
        data.toAddress,
        data.amount,
        data.feeLevel,
        tokenSymbol
      )

      await storage.completePendingTransaction(chatId, pendingTxId, result.hash)

      auditLogger.log(AUDIT_ACTIONS.SEND_TX, chatId, {
        chain: data.selectedChain,
        token: tokenSymbol,
        amount: data.amount,
        toAddress: data.toAddress,
        txHash: result.hash,
      })

      // Use chain from session to determine explorer URL
      let hashUrl
      const chain = data.selectedChain
      if (chain === "eth" || chain === "arb" || chain === "op" || chain === "base" || chain === "matic") {
        const explorers = {
          eth: "etherscan.io",
          arb: "arbiscan.io",
          op: "optimism.io",
          base: "basescan.org",
          matic: "polygonscan.com",
        }
        hashUrl = `https://${explorers[chain] || "etherscan.io"}/tx/${result.hash}`
      } else if (chain === "sol") {
        hashUrl = `https://solscan.io/tx/${result.hash}`
      } else if (chain === "ltc") {
        hashUrl = `https://mempool.space/litecoin/tx/${result.hash}`
      } else if (chain === "bch") {
        hashUrl = `https://blockchain.com/bch/tx/${result.hash}`
      } else {
        hashUrl = `https://blockchain.com/btc/tx/${result.hash}`
      }

      const symbol = result.symbol || data.selectedChain.toUpperCase()
      await ctx.editMessageText(
        `${EMOJIS.success} *Bravo ! Transaction envoyée*\n\n` +
        `💰 Montant: ${data.amount} ${symbol}\n` +
        `🔗 [Voir sur l'explorateur](${hashUrl})`,
        { parse_mode: "Markdown", disable_web_page_preview: true, ...mainMenuKeyboard() }
      )

      sessions.clearData(chatId)
      sessions.setState(chatId, "IDLE")
    } catch (error) {
      if (pendingTxId) {
        await storage.removePendingTransaction(chatId, pendingTxId)
      }
      await handleSendError(ctx, error, mainMenuKeyboard)
    }
  })
}
