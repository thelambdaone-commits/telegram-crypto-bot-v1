/**
 * Telegram Utility Functions
 */
import { logger } from '../logger.js';

/**
 * Escapes characters for MarkdownV2 or legacy Markdown
 * @param {string|number} value
 * @returns {string}
 */
export function escapeMarkdown(value) {
  return String(value ?? '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Escapes HTML entities for Telegram HTML parse_mode
 * Handles & < > " '
 * @param {string|number} value
 * @returns {string}
 */
export function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes characters for Markdown code blocks
 * @param {string|number} value
 * @returns {string}
 */
export function escapeMarkdownCode(value) {
  return String(value ?? '').replace(/[`\\]/g, '\\$&');
}

/**
 * Safely answer callback query - ignores timeout errors
 */
export async function safeAnswerCbQuery(ctx, text) {
  try {
    await ctx.answerCbQuery(text);
  } catch (e) {
    // Ignore "query is too old" errors - they're harmless
    if (!e.message?.includes('query is too old')) {
      // Use console for now, will be replaced by logger in Phase 4
      logger.warn('Error answering callback query', { error: e.message });
    }
  }
}

/**
 * Safely edit message - ignores "message not modified" errors
 */
export async function safeEditMessage(ctx, text, options = {}) {
  try {
    return await ctx.editMessageText(text, options);
  } catch (e) {
    // Ignore "message is not modified" errors - they're harmless
    if (!e.message?.includes('message is not modified')) {
      throw e;
    }
  }
}

/**
 * Send a temporary loading message
 */
export async function sendLoadingMessage(ctx, text = '⌛ Chargement...') {
  try {
    return await ctx.reply(text);
  } catch (e) {
    logger.warn('Error sending loading message', { error: e.message });
    return null;
  }
}

/**
 * Safely delete a loading message
 */
export async function deleteLoadingMessage(ctx, message) {
  if (!message) return;
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
  } catch (e) {
    // Ignore deletion errors (message already deleted, etc)
  }
}
