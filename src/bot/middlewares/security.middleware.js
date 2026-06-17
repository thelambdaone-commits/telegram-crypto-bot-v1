import { RateLimiter } from '../../shared/security/rate-limit.js';
import { config } from '../../core/config.js';
import { isAdmin } from './auth.middleware.js';
import { isValidAddress } from '../../shared/validation.js';
import { logger } from '../../shared/logger.js';

// Different rate limiters for different action types
const limiters = {
  global: new RateLimiter(config.rateLimit || 30, 60000),
  // Anti-burst: catches rapid-fire floods that stay under the per-minute cap
  // (e.g. 10 messages in 2s). In-memory only — not persisted.
  burst: new RateLimiter(10, 10000),
  sensitive: new RateLimiter(5, 60000), // 5 per minute for sensitive actions
  transaction: new RateLimiter(3, 60000), // 3 transactions per minute
};

// Distinct vault keys per limiter. Persisting only the limiters whose
// blacklist is meaningful across restarts; `burst` is transient (in-memory).
// Previously every limiter shared one key, so sensitive/transaction clobbered
// the global blacklist on save.
const VAULT_KEYS = {
  global: '_rateLimiter',
  sensitive: '_rateLimiter_sensitive',
  transaction: '_rateLimiter_transaction',
};

export function initRateLimiters(vault) {
  for (const [name, limiter] of Object.entries(limiters)) {
    const vaultKey = VAULT_KEYS[name];
    if (!vaultKey) continue; // burst stays in-memory
    limiter.vault = vault;
    limiter.vaultKey = vaultKey;
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
    '🚧 <b>Circuit breaker activé</b>\n\n' +
    `Limite journalière ${check.chain.toUpperCase()}: <b>${check.limit} ${symbol}</b>\n` +
    `Volume actuel: <b>${check.current.toFixed(6)} ${symbol}</b>\n` +
    `Tentative: <b>${(check.next - check.current).toFixed(6)} ${symbol}</b>\n\n` +
    'Réessaie demain ou contacte un administrateur.'
  );
}

// Tracks the last time we told a given chatId it was rate-limited, so a flood
// doesn't make the bot reply to every single blocked update (self-amplification).
const lastRateLimitNotice = new Map();
const RATE_LIMIT_NOTICE_COOLDOWN_MS = 30_000;

function shouldNotify(chatId, now = Date.now()) {
  const last = lastRateLimitNotice.get(chatId);
  if (last != null && now - last < RATE_LIMIT_NOTICE_COOLDOWN_MS) return false;
  lastRateLimitNotice.set(chatId, now);
  return true;
}

/**
 * Notify all configured admins once when a user is auto-blacklisted by the
 * rate limiter. Fires only on the `blacklist_auto` transition (subsequent
 * blocked updates report `blacklist`), so one flooder = one alert.
 */
function notifyAdminsAutoBlacklist(ctx, chatId) {
  logger.warn('User auto-blacklisted (flood detected)', { chatId });
  const text =
    '🚨 <b>Auto-blacklist</b>\n\n' +
    `Utilisateur <code>${chatId}</code> bloqué automatiquement (flood détecté).\n` +
    'Débanne-le via le panel /admin si nécessaire.';
  for (const adminId of config.adminChatId) {
    ctx.telegram?.sendMessage(adminId, text, { parse_mode: 'HTML' }).catch(() => {});
  }
}

/**
 * Security middleware for global rate limiting.
 *
 * When blocked we drop the update silently and notify the user at most once
 * per cooldown window. Replying to every blocked update under a flood would
 * burn Telegram API quota and amplify the attack.
 *
 * The per-minute `global` limiter is checked first so its counter keeps
 * accumulating (and can auto-blacklist + alert) even when the short-window
 * `burst` guard is dropping the rapid-fire messages.
 */
export function globalRateLimit(ctx, next) {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  // Admin bypass
  if (isAdmin(ctx)) return next();

  const check = limiters.global.isAllowed(chatId);

  if (!check.allowed) {
    // First crossing into auto-blacklist: alert admins, then silent drop.
    if (check.reason === 'blacklist_auto') {
      notifyAdminsAutoBlacklist(ctx, chatId);
      return;
    }
    // Already-blacklisted users get no reply at all — silent drop.
    if (check.reason === 'blacklist') {
      return;
    }
    if (shouldNotify(chatId)) {
      ctx.reply('Trop de requêtes. Réessayez dans quelques instants.').catch(() => {});
    }
    return;
  }

  // Short-window anti-burst guard. In-memory; sustained abuse still escalates
  // via the global limiter above.
  const burst = limiters.burst.isAllowed(chatId);
  if (!burst.allowed) {
    if (shouldNotify(chatId)) {
      ctx.reply('Trop de messages trop vite. Ralentis un instant.').catch(() => {});
    }
    return;
  }

  return next();
}

/**
 * Drop oversized text messages early (anti-flood / broken-input guard).
 *
 * No legitimate input to this bot approaches `config.maxMessageLength`
 * (longest is a 24-word seed, ~200 chars). Oversized messages are the
 * "1000 random chars" flood pattern, so we swallow them silently — replying
 * would amplify the flood. Admins bypass. Logged for monitoring.
 */
export function messageLengthGuard(ctx, next) {
  const text = ctx.message?.text;
  if (typeof text !== 'string') return next();

  if (isAdmin(ctx)) return next();

  if (text.length > config.maxMessageLength) {
    logger.warn('Oversized message dropped', {
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      length: text.length,
      limit: config.maxMessageLength,
    });
    return;
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
    burst: limiters.burst.getStats(),
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
  limiters.burst.cleanup();
  limiters.sensitive.cleanup();
  limiters.transaction.cleanup();

  // Drop stale rate-limit-notice timestamps so the map can't grow unbounded.
  const now = Date.now();
  for (const [chatId, ts] of lastRateLimitNotice) {
    if (now - ts >= RATE_LIMIT_NOTICE_COOLDOWN_MS) lastRateLimitNotice.delete(chatId);
  }
}
