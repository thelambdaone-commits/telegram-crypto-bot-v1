import { Markup } from "telegraf"
import { mainMenuKeyboard, mainReplyKeyboard } from "../../keyboards/index.js"
import { auditLogger, AUDIT_ACTIONS } from "../../../shared/security/audit-logger.js"
import { config } from "../../../core/config.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"

/**
 * Notify admin group about new user
 */
async function notifyAdminNewUser(ctx, chatId, userName, username) {
  if (!config.adminChatId || config.adminChatId.length === 0) return

  try {
    const escapeMd = (str) => str ? str.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1') : str
    const safeUserName = escapeMd(userName)
    const safeUsername = username ? escapeMd(username) : null
    const contactUrl = `tg://user?id=${chatId}`
    
    const message = `✨ *Nouvel utilisateur*\n\n` +
      `👤 Nom: ${safeUserName}\n` +
      `🔹 Username: ${safeUsername ? `@${safeUsername}` : "N/A"}\n` +
      `🆔 ID: \`${chatId}\``

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url("💬 Contacter", contactUrl)],
      [Markup.button.callback("👤 Voir Profil", `admin_view_user_quick_${chatId}`)],
    ])

    for (const adminId of config.adminChatId) {
      await ctx.telegram.sendMessage(adminId, message, {
        parse_mode: "Markdown",
        ...keyboard,
      }).catch(e => console.error(`Failed to notify admin ${adminId}:`, e.message))
    }
  } catch (error) {
    console.error("Erreur notification admin:", error.message)
  }
}

/**
 * Setup start handler - Auto-generates 3 wallets for new users
 */
export function setupStartHandler(bot, storage, walletService) {
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id
    const userName = ctx.from.first_name || "ami"
    const username = ctx.from.username || null

    try {
      // Update user profile info
      await storage.updateUserProfile(chatId, userName, username)

    // Check if user already has wallets
    const existingWallets = await storage.getWallets(chatId)

    if (existingWallets.length === 0) {
      // Log new user
      auditLogger.log(AUDIT_ACTIONS.USER_START, chatId, { isNewUser: true, username })

      // Notify admin group
      await notifyAdminNewUser(ctx, chatId, userName, username)

      // New user - auto-generate 3 wallets
      await ctx.reply(`👋 Bienvenue ${userName} !\nTrop content de te voir ici. Je prépare tes 3 wallets sécurisés (ETH, BTC, SOL)...`)

      try {
        const chains = ["eth", "btc", "sol"]
        const createdWallets = []

        for (const chain of chains) {
          const wallet = await walletService.createWallet(chatId, chain)
          const fullWallet = await storage.getWalletWithKey(chatId, wallet.id)
          createdWallets.push(fullWallet)

          // Log wallet creation
          auditLogger.log(AUDIT_ACTIONS.CREATE_WALLET, chatId, {
            chain,
            walletId: wallet.id,
            address: wallet.address,
          })
        }

        // Build message with all seed phrases
        let message = `🎉 *Tes 3 wallets sont prêts \\!*\n\n`

        for (const wallet of createdWallets) {
          const chainName = { eth: "Ethereum", btc: "Bitcoin", sol: "Solana" }[wallet.chain]
          const escapedMnemonic = wallet.mnemonic
            ? wallet.mnemonic.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&")
            : null

          message += `*${chainName}*\n`
          message += `📬 Adresse: \`${wallet.address}\`\n`
          if (escapedMnemonic) {
            message += `🔐 Seed: \`${escapedMnemonic}\`\n`
          }
          message += `\n`
        }

        message += `⚠️ *IMPORTANT :* Sauvegarde bien ces phrases de récupération\\. Elles ne seront plus affichées\\.\n\n`
        message += `🕐 _Ce message sera supprimé dans 60 secondes pour ta sécurité\\._`

        const sentMsg = await ctx.reply(message, {
          parse_mode: "MarkdownV2",
          ...mainReplyKeyboard(),
        })

        // Auto-delete after 60s
        setTimeout(async () => {
          try {
            await ctx.telegram.deleteMessage(chatId, sentMsg.message_id)
            ctx.reply("💡 _Message de sécurité supprimé._", { parse_mode: "Markdown" })
          } catch (e) {}
        }, 60000)
      } catch (error) {
        console.error("Erreur creation wallets:", error.message)
        return ctx.reply(`❌ Erreur lors de la création des wallets: ${error.message}`, mainMenuKeyboard())
      }
    } else {
      // Existing user
      auditLogger.log(AUDIT_ACTIONS.USER_START, chatId, { isNewUser: false })
      await ctx.reply(`👋 Content de te revoir, ${userName} !\n\nQue souhaites-tu faire aujourd'hui ?`, {
        parse_mode: "Markdown",
        ...mainReplyKeyboard()
      })
    }
    } catch (error) {
      // Handle "bot was blocked by user" error gracefully
      if (error.message?.includes('blocked by the user') || error.response?.error_code === 403) {
        console.warn(`[START] User ${chatId} (${username || userName}) has blocked the bot - skipping`)
        return
      }
      // Re-throw other errors
      console.error(`[START] Error for user ${chatId}:`, error.message)
      throw error
    }
  })
}
