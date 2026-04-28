import { config } from '../../core/config.js';

/**
 * Authentication middleware - Checks if command is from admin group
 */
export function isAdmin(chatId) {
  // Check if command is coming from the admin group
  return config.adminChatId.includes(chatId);
}

/**
 * Middleware to require admin access
 * Use: bot.action("admin_action", requireAdmin, async (ctx) => { ... })
 */
export function requireAdmin(ctx, next) {
  const chatId = ctx.chat?.id;

  if (!isAdmin(chatId)) {
    ctx.answerCbQuery('Acces refuse - Admin uniquement');
    return;
  }

  return next();
}

/**
 * Middleware to require private chat
 */
export function requirePrivate(ctx, next) {
  const chatId = ctx.chat?.id;
  const isAuthorizedGroup = (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') && isAdmin(chatId);

  if (ctx.chat?.type !== 'private' && !isAuthorizedGroup) {
    ctx.reply('Cette action n\'est disponible qu\'en message prive ou dans le canal admin autorise.');
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
