import { setupSendActions } from "./actions.js"
import { setupSendTextInput } from "./text-input.js"
import { safeAnswerCbQuery } from "../../utils.js"
import { mainMenuKeyboard } from "../../keyboards/index.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"

/**
 * Setup all send-related handlers
 */
export function setupSendHandlers(bot, storage, walletService, sessions) {
  // Analyze address menu
  bot.action("analyze_address", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    sessions.setState(chatId, "ENTER_ADDRESS_ANALYZE")
    ctx.editMessageText(
      `🔍 *Analyse d'adresse*\n\n` + 
      `Envoie-moi une adresse publique (ETH, BTC, LTC, BCH, SOL, ARB, MATIC, OP, BASE) pour voir son solde et tous ses tokens.`,
      { parse_mode: "Markdown" }
    )
  })

  // Amount type selection (callback from ENTER_ADDRESS flow)
  bot.action(/^amount_type_(.+)$/, async (ctx) => {
    const type = ctx.match[1] // native or eur
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const data = sessions.getData(chatId)
    sessions.setData(chatId, { ...data, amountType: type })

    try {
      const balanceData = await walletService.getBalance(chatId, data.selectedWalletId)
      
      // Store current balance for quick calculations
      const balanceNum = Number.parseFloat(balanceData.balance)
      sessions.setData(chatId, { 
        ...sessions.getData(chatId), 
        currentBalance: balanceNum,
        currentBalanceLamports: balanceData.balanceLamports 
      })
      
      const label = type === "native" ? data.selectedChain.toUpperCase() : "Euros"
      const prompt = `💰 *Saisie du montant*\n\n` +
        `Ton solde : *${balanceData.balance} ${data.selectedChain.toUpperCase()}*\n\n` +
        `Entre le montant en *${label}* ou utilise les raccourcis :`

      const { quickAmountKeyboard } = await import("../../keyboards/index.js")
      ctx.editMessageText(prompt, { parse_mode: "Markdown", ...quickAmountKeyboard() })
      sessions.setState(chatId, "SELECT_QUICK_AMOUNT")
    } catch (error) {
      ctx.editMessageText(`❌ Erreur: ${error.message}`, mainMenuKeyboard())
    }
  })

  // Initialize sub-modules
  setupSendActions(bot, storage, walletService, sessions)
  setupSendTextInput(bot, storage, walletService, sessions)
}
