import { Markup } from 'telegraf';

const pendingPrompts = new Map();

const DEFAULT_TIMEOUT = 60000;
const PROMPT_STATE_PREFIX = 'PROMPT_';
const DEFAULT_SESSION_KEY = 'INPUT';

let sessionsRef = null;

export function registerTextHandlers(bot, sessions) {
  sessionsRef = sessions;

  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const state = sessions.getState(chatId);
    if (!state || !state.startsWith(PROMPT_STATE_PREFIX)) return next();

    const prompt = pendingPrompts.get(chatId);
    if (!prompt) {
      sessions.clearState(chatId);
      return next();
    }

    const input = ctx.message.text.trim();

    if (input.toLowerCase() === '/cancel') {
      clearTimeout(prompt.timeoutId);
      pendingPrompts.delete(chatId);
      sessions.clearState(chatId);
      await ctx.reply('✅ Annule.').catch(() => {});
      return;
    }

    const validator = prompt.validator;
    const validationResult = validator ? validator(input) : true;

    if (typeof validationResult === 'string') {
      await ctx.reply(`${validationResult} Essaie encore.`).catch(() => {});
      return;
    }

    if (validationResult === false) {
      await ctx.reply('Entree invalide. Essaie encore.').catch(() => {});
      return;
    }

    clearTimeout(prompt.timeoutId);
    pendingPrompts.delete(chatId);
    sessions.clearState(chatId);

    prompt.resolve(input);
  });

  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const prompt = pendingPrompts.get(chatId);
    if (prompt) {
      clearTimeout(prompt.timeoutId);
      pendingPrompts.delete(chatId);
      sessions.clearState(chatId);
      prompt.resolve(null);
    }

    await ctx.reply('✅ Annule.').catch(() => {});
  });
}

export function getPromptPendingCount() {
  return pendingPrompts.size;
}

export async function inputPrompt(ctx, options) {
  const {
    message,
    validator = null,
    retryMessage = null,
    timeout = DEFAULT_TIMEOUT,
    sessionKey = DEFAULT_SESSION_KEY,
  } = options;

  const chatId = ctx.chat?.id;
  if (!chatId) return null;

  // Cancel any existing prompt for this user
  const existing = pendingPrompts.get(chatId);
  if (existing) {
    clearTimeout(existing.timeoutId);
    pendingPrompts.delete(chatId);
    sessionsRef.clearState(chatId);
    existing.resolve(null);
  }

  let resolvePrompt;
  const promise = new Promise((resolve) => {
    resolvePrompt = resolve;
  });

  const timeoutId = setTimeout(() => {
    pendingPrompts.delete(chatId);
    sessionsRef.clearState(chatId);
    resolvePrompt(null);
  }, timeout);

  sessionsRef.setState(chatId, `${PROMPT_STATE_PREFIX}${sessionKey}`);

  pendingPrompts.set(chatId, {
    resolve: resolvePrompt,
    timeoutId,
    validator,
    retryMessage,
  });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Annuler', 'cancel')],
  ]);

  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
  }

  return promise;
}
