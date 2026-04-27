import { mainMenuKeyboard, walletListKeyboard, walletActionsKeyboard, corruptedWalletKeyboard } from "../../keyboards/index.js"
import { auditLogger, AUDIT_ACTIONS } from "../../../shared/security/audit-logger.js"
import { safeAnswerCbQuery } from "../../utils.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"
import { isAdmin } from "../../middlewares/auth.middleware.js"

export function setupKeysHandlers(bot, storage, walletService) {
  // View keys menu
  bot.action("view_keys", async (ctx) => {
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const wallets = await storage.getWallets(chatId)

    if (wallets.length === 0) {
      return ctx.editMessageText(`*${MESSAGES.noWallets}*`, {
        parse_mode: "Markdown",
        ...mainMenuKeyboard(),
      })
    }

    ctx.editMessageText(`${EMOJIS.lock} *Sauvegarder tes clés*\n\nSélectionne un wallet pour voir ses informations secrètes.\n\n⚠️ _Ne partage jamais ces clés avec personne._`, {
      parse_mode: "Markdown",
      ...walletListKeyboard(wallets, "keys_"),
    })
  })

  // Select wallet for keys
  bot.action(/^keys_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const wallets = await storage.getWallets(chatId)
    const wallet = wallets.find((w) => w.id === walletId)

    if (!wallet) {
      return ctx.editMessageText("😕 Wallet non trouvé", mainMenuKeyboard())
    }

    ctx.editMessageText(`📑 *${wallet.label}*\n\nAdresse :\n\`${wallet.address}\`\n\nQue souhaites-tu afficher ?`, {
      parse_mode: "Markdown",
      ...walletActionsKeyboard(walletId),
    })
  })

  // Copy address action
  bot.action(/^copy_addr_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx, "✅ Adresse copiée !")

    const wallets = await storage.getWallets(chatId)
    const wallet = wallets.find((w) => w.id === walletId)

    if (wallet) {
      ctx.reply(`\`${wallet.address}\`\n\n_Appuie sur l'adresse pour la copier si besoin._`, { parse_mode: "Markdown" })
    }
  })

  // View seed phrase
  bot.action(/^view_seed_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const isAuthorizedGroup = (ctx.chat.type === "group" || ctx.chat.type === "supergroup") && isAdmin(ctx.chat.id);
    if (ctx.chat.type !== "private" && !isAuthorizedGroup) {
      return ctx.reply("❌ Cette action n'est disponible qu'en message privé ou canal admin autorisé.")
    }

    try {
      const wallet = await storage.getWalletWithKey(chatId, walletId)

      if (!wallet) {
        return ctx.editMessageText("😕 Wallet non trouvé", mainMenuKeyboard())
      }

      if (wallet.isCorrupted) {
        return ctx.editMessageText(
          "⚠️ *Wallet corrompu*\n\nLa clé de chiffrement a changé. Les données ne peuvent plus être récupérées.\n\n_Supprime ce wallet et recrées-en un._",
          { parse_mode: "Markdown", ...corruptedWalletKeyboard(walletId) }
        )
      }

      if (!wallet.mnemonic) {
        return ctx.editMessageText("ℹ️ Pas de seed phrase pour ce wallet (importé via clé privée).", {
          parse_mode: "Markdown",
          ...mainMenuKeyboard(),
        })
      }

      auditLogger.log(AUDIT_ACTIONS.VIEW_SEED, chatId, { walletId, chain: wallet.chain })

      const message =
        `🔐 *Phrase de Récupération*\n\n` +
        `\`${wallet.mnemonic}\`\n\n` +
        `⚠️ *IMPORTANT :* Garde cette phrase secrète ! Elle donne accès à tes fonds.\n\n` +
        `🕐 Ce message sera supprimé dans 30 secondes.`

      const sentMsg = await ctx.reply(message, { parse_mode: "Markdown", ...mainMenuKeyboard() })

      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id)
        } catch (e) {}
      }, 30000)
    } catch (error) {
      return ctx.reply(`❌ Erreur : ${error.message}`, mainMenuKeyboard())
    }
  })

  // View private key
  bot.action(/^view_privkey_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    const isAuthorizedGroup = (ctx.chat.type === "group" || ctx.chat.type === "supergroup") && isAdmin(ctx.chat.id);
    if (ctx.chat.type !== "private" && !isAuthorizedGroup) {
      return ctx.reply("❌ Cette action n'est disponible qu'en message privé ou canal admin autorisé.")
    }

    try {
      const wallet = await storage.getWalletWithKey(chatId, walletId)

      if (!wallet) {
        return ctx.editMessageText("😕 Wallet non trouvé", mainMenuKeyboard())
      }

      if (wallet.isCorrupted) {
        return ctx.editMessageText(
          "⚠️ *Wallet corrompu*\n\nLa clé de chiffrement a changé. Les données ne peuvent plus être récupérées.\n\n_Supprime ce wallet et recrées-en un._",
          { parse_mode: "Markdown", ...corruptedWalletKeyboard(walletId) }
        )
      }

      auditLogger.log(AUDIT_ACTIONS.VIEW_PRIVKEY, chatId, { walletId, chain: wallet.chain })

      const message =
        `🔑 *Clé Privée*\n\n` +
        `\`${wallet.privateKey}\`\n\n` +
        `⚠️ *ATTENTION :* Cette clé donne un accès TOTAL à tes fonds ! Ne la partage jamais.\n\n` +
        `🕐 Ce message sera supprimé dans 30 secondes.`

      const sentMsg = await ctx.reply(message, { parse_mode: "Markdown", ...mainMenuKeyboard() })

      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id)
        } catch (e) {}
      }, 30000)
    } catch (error) {
      return ctx.reply(`❌ Erreur : ${error.message}`, mainMenuKeyboard())
    }
  })

  // View wallet transaction history
  bot.action(/^wallet_history_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    try {
      const wallets = await storage.getWallets(chatId)
      const wallet = wallets.find((w) => w.id === walletId)

      if (!wallet) {
        return ctx.editMessageText("😕 Wallet non trouvé", mainMenuKeyboard())
      }

      // Show loading message
      await ctx.editMessageText(`📜 *Chargement de l'historique...*\n\n⏳ Récupération des transactions pour ${wallet.label}...`, {
        parse_mode: "Markdown"
      })

      const txHistory = await walletService.getTransactionHistory(wallet.chain, wallet.address, 10)

      if (!txHistory || txHistory.length === 0) {
        return ctx.editMessageText(
          `📜 *Historique de ${wallet.label}*\n\n` +
          `Aucune transaction trouvée pour ce wallet.`,
          { 
            parse_mode: "Markdown",
            ...walletActionsKeyboard(walletId)
          }
        )
      }

      const chainEmoji = { eth: "🔷", btc: "🟠", sol: "🟣" }[wallet.chain] || "💎"
      const chainSymbol = wallet.chain.toUpperCase()
      
      let text = `${chainEmoji} *Historique — ${wallet.label}*\n`
      text += `\`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}\`\n\n`

      for (const tx of txHistory) {
        // Direction emoji and label
        const directionEmoji = tx.type === "in" ? "⬇️" : tx.type === "out" ? "⬆️" : "🔄"
        const directionLabel = tx.type === "in" ? "Entrant" : tx.type === "out" ? "Sortant" : "TX"
        
        // Format amount
        const amountDisplay = tx.amount && tx.amount !== "—" && tx.amount !== "0" 
          ? `${tx.amount} ${chainSymbol}` 
          : ""
        
        // Format date
        const date = new Date(tx.timestamp)
        const dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
        const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        
        // Short hash
        const shortHash = `${tx.hash.slice(0, 6)}...${tx.hash.slice(-4)}`
        
        // One line per info - clean format
        text += `${directionEmoji} *${directionLabel}* · ${amountDisplay}\n`
        text += `🕑 ${dateStr} ${timeStr}\n`
        text += `🔗 \`${shortHash}\`\n\n`
      }

      text += `_${txHistory.length} transaction(s)_`

      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...walletActionsKeyboard(walletId)
      })
    } catch (error) {
      console.error("Error fetching tx history:", error)
      return ctx.editMessageText(
        `❌ *Erreur*\n\nImpossible de récupérer l'historique : ${error.message}`,
        { 
          parse_mode: "Markdown",
          ...walletActionsKeyboard(walletId)
        }
      )
    }
  })
}
