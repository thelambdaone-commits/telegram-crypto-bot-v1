import { Telegraf } from "telegraf"
import { config } from "./core/config.js"
import { setupHandlers } from "./bot/handlers/index.js"
import { StorageService } from "./core/storage.js"
import { logger } from "./shared/logger.js"

const bot = new Telegraf(config.botToken)
const storage = new StorageService(config.dataPath, config.masterKey)

// Initialize
await storage.init()
logger.info("Bot starting", { adminId: config.adminChatId })

// Setup handlers
await setupHandlers(bot, storage)

// Error handling
bot.catch((err, ctx) => {
  logger.logError(err, {
    updateType: ctx.updateType,
    chatId: ctx.chat?.id,
    username: ctx.from?.username,
  })
  ctx.reply("Une erreur est survenue. Reessayez.").catch(() => {})
})

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info("Bot shutting down (SIGINT)")
  bot.stop("SIGINT")
})
process.once("SIGTERM", () => {
  logger.info("Bot shutting down (SIGTERM)")
  bot.stop("SIGTERM")
})

// Start
bot.launch()
logger.info("Bot started successfully", { adminsCount: config.adminChatId.length })
console.log("Bot Telegram Crypto Wallet demarre")
console.log(`Admin ID: ${config.adminChatId.length > 0 ? `${config.adminChatId.length} configuré(s)` : "Non configure"}`)
