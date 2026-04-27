import { RateLimiter } from "../../shared/security/rate-limit.js"
import { config } from "../../core/config.js"

// Different rate limiters for different action types
const limiters = {
  global: new RateLimiter(config.rateLimit || 30, 60000),
  sensitive: new RateLimiter(5, 60000), // 5 per minute for sensitive actions
  transaction: new RateLimiter(3, 60000), // 3 transactions per minute
}

/**
 * Security middleware for global rate limiting
 */
export function globalRateLimit(ctx, next) {
  const chatId = ctx.chat?.id
  if (!chatId) return next()

  // Admin bypass
  if (config.adminChatId.includes(chatId)) return next()

  const check = limiters.global.isAllowed(chatId)

  if (!check.allowed) {
    if (check.reason === "blacklist" || check.reason === "blacklist_auto") {
      return ctx.reply("Acces bloque. Contactez l'administrateur.")
    }
    return ctx.reply("Trop de requetes. Reessayez dans quelques instants.")
  }

  return next()
}

/**
 * Rate limit for sensitive actions (viewing keys, etc.)
 */
export function sensitiveRateLimit(ctx, next) {
  const chatId = ctx.chat?.id
  if (!chatId) return next()

  // Admin bypass
  if (config.adminChatId.includes(chatId)) return next()

  const check = limiters.sensitive.isAllowed(chatId)

  if (!check.allowed) {
    ctx.answerCbQuery("Action sensible limitee. Attendez un moment.")
    return
  }

  return next()
}

/**
 * Rate limit for transactions
 */
export function transactionRateLimit(ctx, next) {
  const chatId = ctx.chat?.id
  if (!chatId) return next()

  const check = limiters.transaction.isAllowed(chatId)

  if (!check.allowed) {
    ctx.reply("Limite de transactions atteinte. Attendez une minute.")
    return
  }

  return next()
}

/**
 * Input sanitization - removes potential harmful characters
 */
export function sanitizeInput(input) {
  if (typeof input !== "string") return input
  return input.replace(/[<>]/g, "").trim()
}

/**
 * Validate wallet address format
 */
export function isValidAddressFormat(address) {
  if (!address || typeof address !== "string") return false
  if (address.length < 26 || address.length > 130) return false
  return /^[a-zA-Z0-9]+$/.test(address)
}

/**
 * Get global rate limiter stats
 */
export function getRateLimitStats() {
  return {
    global: limiters.global.getStats(),
    sensitive: limiters.sensitive.getStats(),
    transaction: limiters.transaction.getStats(),
  }
}

/**
 * Add to blacklist
 */
export function blacklistUser(chatId) {
  limiters.global.addToBlacklist(chatId)
}

/**
 * Remove from blacklist
 */
export function unblacklistUser(chatId) {
  limiters.global.removeFromBlacklist(chatId)
}

/**
 * Cleanup all limiters
 */
export function cleanupLimiters() {
  limiters.global.cleanup()
  limiters.sensitive.cleanup()
  limiters.transaction.cleanup()
}
