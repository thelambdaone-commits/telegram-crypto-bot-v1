import { config } from '../../core/config.js';
import { logger } from '../../shared/logger.js';

/**
 * Authentication middleware - Checks if command is from an admin chat or user.
 */
export function isAdmin(ctxOrId) {
  if (typeof ctxOrId === 'object' && ctxOrId !== null) {
    const chatId = ctxOrId.chat?.id;
    const userId = ctxOrId.from?.id;
    return config.adminChatId.includes(chatId) || config.adminUserId.includes(userId);
  }

  return config.adminChatId.includes(ctxOrId) || config.adminUserId.includes(ctxOrId);
}

/**
 * Unified admin guard — replies and returns false if not authorized.
 * Works for both commands and callback queries.
 */
export function adminGuard(ctx) {
  if (isAdmin(ctx)) return true;

  logger.logWithContext('WARN', 'Admin access denied', {
    chatId: ctx.chat?.id,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    module: 'auth',
    action: 'adminGuard',
  });

  if (ctx.callbackQuery) {
    ctx.answerCbQuery('Acces refuse — Admin uniquement').catch(() => {});
  } else {
    ctx.reply('❌ Acces refuse — Admin uniquement.').catch(() => {});
  }

  return false;
}

/**
 * Middleware to require admin access
 * Use: bot.action("admin_action", requireAdmin, async (ctx) => { ... })
 */
export function requireAdmin(ctx, next) {
  if (!isAdmin(ctx)) {
    ctx.answerCbQuery('Acces refuse - Admin uniquement');
    return;
  }

  return next();
}

/**
 * Middleware to require private chat
 */
export function requirePrivate(ctx, next) {
  const isAuthorizedGroup =
    (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') && isAdmin(ctx);

  if (ctx.chat?.type !== 'private' && !isAuthorizedGroup) {
    ctx.reply("Cette action n'est disponible qu'en message prive ou dans le canal admin autorise.");
    return;
  }

  return next();
}

/**
 * Get admin chat ID
 */
export function getAdminChatId() {
  return config.adminChatId;
}
