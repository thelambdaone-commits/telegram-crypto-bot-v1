import crypto from 'node:crypto';
import { Markup } from 'telegraf';

const pending = new Map();

const CONFIRM_PREFIX = 'cf:';
const CANCEL_PREFIX = 'cfc:';
const DEFAULT_TIMEOUT = 30000;

export function registerConfirmActions(bot) {
  bot.action(new RegExp(`^${CONFIRM_PREFIX}(\\w+)$`), async (ctx) => {
    const id = ctx.match[1];
    const record = pending.get(id);
    if (!record) {
      await ctx.answerCbQuery('Action expiree.').catch(() => {});
      return;
    }
    clearTimeout(record.timeoutId);
    pending.delete(id);
    await record.onConfirm(ctx);
  });

  bot.action(new RegExp(`^${CANCEL_PREFIX}(\\w+)$`), async (ctx) => {
    const id = ctx.match[1];
    const record = pending.get(id);
    if (!record) {
      await ctx.answerCbQuery('Action expiree.').catch(() => {});
      return;
    }
    clearTimeout(record.timeoutId);
    pending.delete(id);
    if (record.onCancel) {
      await record.onCancel(ctx);
    }
  });
}

export function getConfirmPendingCount() {
  return pending.size;
}

export async function confirmFlow(ctx, options) {
  const {
    message,
    confirmLabel = '✅ Confirmer',
    cancelLabel = '❌ Annuler',
    onConfirm,
    onCancel,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const id = crypto.randomUUID().slice(0, 8);

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(confirmLabel, `${CONFIRM_PREFIX}${id}`),
      Markup.button.callback(cancelLabel, `${CANCEL_PREFIX}${id}`),
    ],
  ]);

  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
  }

  const record = {
    onConfirm,
    onCancel,
    timeoutId: null,
    chatId: ctx.chat?.id,
    createdAt: Date.now(),
  };

  record.timeoutId = setTimeout(async () => {
    pending.delete(id);
    try {
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText('⏱️ Action annulee (delai depasse).');
      }
    } catch {
      /* message may already be gone */
    }
  }, timeout);
  record.timeoutId.unref();

  pending.set(id, record);
}
