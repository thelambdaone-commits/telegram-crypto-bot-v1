import { RateLimiter } from '../../shared/security/rate-limit.js';
import { config } from '../../core/config.js';
import { isAdmin } from './auth.middleware.js';
import { isValidAddress } from '../../shared/validation.js';
import { logger } from '../../shared/logger.js';

// Different rate limiters for different action types
const limiters = {
  global: new RateLimiter(config.rateLimit || 30, 60000),
  sensitive: new RateLimiter(5, 60000), // 5 per minute for sensitive actions
  transaction: new RateLimiter(3, 60000), // 3 transactions per minute
};

export function initRateLimiters(vault) {
  for (const limiter of Object.values(limiters)) {
    limiter.vault = vault;
    limiter.vaultKey = '_rateLimiter';
    limiter._loadFromVault();
  }
}

export const DAILY_VOLUME_LIMITS = {
  sol: Number(process.env.DAILY_LIMIT_SOL || '10'),
  eth: Number(process.env.DAILY_LIMIT_ETH || '0.5'),
  usd: Number(process.env.DAILY_LIMIT_USD || '10000'),
};

export async function dailyVolumeCheck(storage, chatId, amount, chain) {
  const normalizedChain = String(chain || '').toLowerCase();
  const limit = DAILY_VOLUME_LIMITS[normalizedChain] || DAILY_VOLUME_LIMITS.usd;
  const check = await storage.checkDailyVolume(chatId, normalizedChain, Number(amount || 0), limit);

  if (!check.allowed) {
    logger.warn('Daily volume circuit breaker triggered', {
      chatId,
      chain: normalizedChain,
      amount,
      current: check.current,
      limit: check.limit,
    });
  }

  return check;
}

export async function recordDailyVolume(storage, chatId, amount, chain) {
  return storage.recordDailyVolume(chatId, String(chain || '').toLowerCase(), Number(amount || 0));
}

export function formatDailyLimitMessage(check, symbol) {
  return (
    '🚧 *Circuit breaker activé*\n\n' +
    `Limite journalière ${check.chain.toUpperCase()}: *${check.limit} ${symbol}*\n` +
    `Volume actuel: *${check.current.toFixed(6)} ${symbol}*\n` +
    `Tentative: *${(check.next - check.current).toFixed(6)} ${symbol}*\n\n` +
    'Réessaie demain ou contacte un administrateur.'
  );
}

/**
 * Security middleware for global rate limiting
 */
export function globalRateLimit(ctx, next) {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  // Admin bypass
  if (isAdmin(ctx)) return next();

  const check = limiters.global.isAllowed(chatId);

  if (!check.allowed) {
    if (check.reason === 'blacklist' || check.reason === 'blacklist_auto') {
      return ctx.reply("Acces bloque. Contactez l'administrateur.");
    }
    return ctx.reply('Trop de requetes. Reessayez dans quelques instants.');
  }

  return next();
}

/**
 * Rate limit for sensitive actions (viewing keys, etc.)
 */
export function sensitiveRateLimit(ctx, next) {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  // Admin bypass
  if (isAdmin(ctx)) return next();

  const check = limiters.sensitive.isAllowed(chatId);

  if (!check.allowed) {
    ctx.answerCbQuery('Action sensible limitee. Attendez un moment.');
    return;
  }

  return next();
}

/**
 * Rate limit for transactions
 */
export function transactionRateLimit(ctx, next) {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  // Admin bypass
  if (isAdmin(ctx)) return next();

  const check = limiters.transaction.isAllowed(chatId);

  if (!check.allowed) {
    ctx.reply('Limite de transactions atteinte. Attendez une minute.');
    return;
  }

  return next();
}

/**
 * Input sanitization - removes Telegram MarkdownV2 special characters
 * Telegram MarkdownV2 special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
    .trim();
}

/**
 * Validate wallet address format
 */
export function isValidAddressFormat(address) {
  return isValidAddress(address);
}

/**
 * Get global rate limiter stats
 */
export function getRateLimitStats() {
  return {
    global: limiters.global.getStats(),
    sensitive: limiters.sensitive.getStats(),
    transaction: limiters.transaction.getStats(),
  };
}

/**
 * Add to blacklist
 */
export function blacklistUser(chatId) {
  limiters.global.addToBlacklist(chatId);
}

/**
 * Remove from blacklist
 */
export function unblacklistUser(chatId) {
  limiters.global.removeFromBlacklist(chatId);
}

/**
 * Cleanup all limiters
 */
export function cleanupLimiters() {
  limiters.global.cleanup();
  limiters.sensitive.cleanup();
  limiters.transaction.cleanup();
}
