import { chainSelectionKeyboard, walletCreationMethodKeyboard } from "../../keyboards/index.js"
import { safeAnswerCbQuery } from "../../utils.js"
import { auditLogger, AUDIT_ACTIONS } from "../../../shared/security/audit-logger.js"
import { config } from "../../../core/config.js"
import { MESSAGES, EMOJIS } from "../../messages/index.js"

export function setupWalletCreate(bot, storage, walletService, sessions) {
  // Create wallet - show chain selection
  bot.action("create_wallet", async (ctx) => {
    await safeAnswerCbQuery(ctx)
    ctx.editMessageText(`${EMOJIS.chain} *${MESSAGES.selectChain || "Choisis une blockchain"}*`, {
      parse_mode: "Markdown",
      ...chainSelectionKeyboard("chain_"),
    })
  })

  // Chain selected
  bot.action(/^chain_(.+)$/, async (ctx) => {
    const chain = ctx.match[1]
    await safeAnswerCbQuery(ctx)

    ctx.editMessageText(`${EMOJIS.wallet} *Wallet ${chain.toUpperCase()}*\n\nComment veux-tu procéder ?`, {
      parse_mode: "Markdown",
      ...walletCreationMethodKeyboard(chain),
    })
  })

  // Generate new wallet
  bot.action(/^generate_(.+)$/, async (ctx) => {
    const chain = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    try {
      await ctx.editMessageText(`${EMOJIS.loading} ${MESSAGES.generating || "Génération en cours..."}`)
      const wallet = await walletService.createWallet(chatId, chain)
      const fullWallet = await storage.getWalletWithKey(chatId, wallet.id)

      auditLogger.log(AUDIT_ACTIONS.CREATE_WALLET, chatId, {
        chain,
        walletId: wallet.id,
        address: wallet.address,
      })

      // Notify admins
      if (config.adminChatId && config.adminChatId.length > 0) {
        try {
          const userData = await storage.loadUserData(chatId)
          const rawName = userData.username ? `@${userData.username}` : userData.firstName || "N/A"
          const displayName = rawName.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
          
          const message = `✨ *Nouveau Wallet Créé*\n\n` +
              `👤 Utilisateur: ${displayName}\n` +
              `🆔 ID: \`${chatId}\`\n` +
              `⛓ Réseau: ${chain.toUpperCase()}\n` +
              `📬 Adresse: \`${wallet.address}\``;

          for (const adminId of config.adminChatId) {
            await ctx.telegram.sendMessage(adminId, message, { parse_mode: "Markdown" })
              .catch(e => console.error(`Failed to notify admin ${adminId}:`, e.message));
          }
        } catch (e) {
          console.error("Error notifying admins:", e.message)
        }
      }

      const { mainMenuKeyboard } = await import("../../keyboards/index.js")
      
      const l2Info = {
        matic: "🟣 *Polygon (Layer 2)*\n" +
          "Frais: tres bon marche (~0.001-0.01 EUR)\n" +
          "Token natif: MATIC (pour payer les frais)\n" +
          "Tokens: USDC, USDT\n\n",
        op: "🔵 *Optimism (Layer 2)*\n" +
          "Frais: tres bon marche (~0.001-0.01 EUR)\n" +
          "Token natif: ETH\n" +
          "Tokens: USDC, USDT\n\n",
        base: "🟦 *Base (Layer 2)*\n" +
          "Frais: tres bon marche (~0.001 EUR)\n" +
          "Token natif: ETH\n" +
          "Tokens: USDC, USDT\n\n",
        arb: "🔴 *Arbitrum (Layer 2)*\n" +
          "Frais: tres bon marche (~0.01-0.05 EUR)\n" +
          "Token natif: ETH\n" +
          "Tokens: USDC, USDT\n" +
          "Staking: Disponible sur Aave\n\n",
      }
      
      let message = `🎉 *Wallet Cree avec succes !*\n\n`
      
      if (["matic", "op", "base", "arb"].includes(chain)) {
        message += l2Info[chain]
        message += "✅ Ce wallet utilise la meme adresse Ethereum.\n"
        message += "Vous pouvez utiliser votre cle privee ETH ici.\n\n"
      }
      
      message += `⛓ Reseau: ${wallet.chain.toUpperCase()}\n` +
        `🏷 Nom: ${wallet.label}\n` +
        `📬 Adresse: \`${wallet.address}\`\n\n`

      if (fullWallet.mnemonic) {
        message += `🔐 *Phrase de récupération :*\n\`${fullWallet.mnemonic}\`\n\n`
        message += `⚠️ *IMPORTANT :* Sauvegarde bien cette phrase. Elle ne sera plus affichée.\n`
        message += `🕐 _Ce message s'auto-détruira dans 60 secondes pour ta sécurité._`
      }

      const sentMsg = await ctx.reply(message, { parse_mode: "Markdown", ...mainMenuKeyboard() })

      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id)
          ctx.reply("💡 _Message de sécurité supprimé._", { parse_mode: "Markdown" })
        } catch (e) {}
      }, 60000)
    } catch (error) {
      const { mainMenuKeyboard } = await import("../../keyboards/index.js")
      return ctx.reply(`❌ Erreur: ${error.message}`, mainMenuKeyboard())
    }
  })

  // Import Key action
  bot.action(/^import_key_(.+)$/, async (ctx) => {
    const chain = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    if (sessions) {
      sessions.setState(chatId, `IMPORT_KEY_${chain.toUpperCase()}`)
      sessions.setData(chatId, { chain })
    }

    ctx.editMessageText(`🔑 *Importer une Clé Privée (${chain.toUpperCase()})*\n\nEnvoie-moi ta clé privée.\n\n⚠️ _Ce message sera auto-supprimé pour ta sécurité._`, { parse_mode: "Markdown" })
  })

  // Import Seed action
  bot.action(/^import_seed_(.+)$/, async (ctx) => {
    const chain = ctx.match[1]
    const chatId = ctx.chat.id
    await safeAnswerCbQuery(ctx)

    if (sessions) {
      sessions.setState(chatId, `IMPORT_SEED_${chain.toUpperCase()}`)
      sessions.setData(chatId, { chain })
    }

    ctx.editMessageText(`🔐 *Importer une Seed Phrase (${chain.toUpperCase()})*\n\nEnvoie-moi tes 12 ou 24 mots.\n\n⚠️ _Ce message sera auto-supprimé pour ta sécurité._`, { parse_mode: "Markdown" })
  })
}
