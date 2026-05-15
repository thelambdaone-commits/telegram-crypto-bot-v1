import { Markup } from 'telegraf';

const pages = new Map();

export function createPaginator(bot, options = {}) {
  const {
    prefix = 'page',
    pageSize = 5,
    prevLabel = '⬅️ Prev',
    nextLabel = 'Next ➡️',
    closeLabel = '❌ Fermer',
  } = options;

  const PREV_REGEX = new RegExp(`^pg:prev:${prefix}:(\\d+)$`);
  const NEXT_REGEX = new RegExp(`^pg:next:${prefix}:(\\d+)$`);
  const CLOSE_REGEX = /^pg:close:(\d+)$/;

  bot.action(PREV_REGEX, async (ctx) => {
    const msgId = Number(ctx.match[1]);
    const key = `${ctx.chat.id}:${msgId}`;
    const record = pages.get(key);
    if (!record) {
      await ctx.answerCbQuery('Page expiree.').catch(() => {});
      return;
    }
    if (record.page > 0) {
      record.page--;
      await renderPage(ctx, key, record);
    } else {
      await ctx.answerCbQuery().catch(() => {});
    }
  });

  bot.action(NEXT_REGEX, async (ctx) => {
    const msgId = Number(ctx.match[1]);
    const key = `${ctx.chat.id}:${msgId}`;
    const record = pages.get(key);
    if (!record) {
      await ctx.answerCbQuery('Page expiree.').catch(() => {});
      return;
    }
    const totalPages = Math.ceil(record.items.length / record.pageSize);
    if (record.page < totalPages - 1) {
      record.page++;
      await renderPage(ctx, key, record);
    } else {
      await ctx.answerCbQuery().catch(() => {});
    }
  });

  bot.action(CLOSE_REGEX, async (ctx) => {
    const msgId = Number(ctx.match[1]);
    const key = `${ctx.chat.id}:${msgId}`;
    pages.delete(key);
    try {
      await ctx.deleteMessage();
    } catch {
      await ctx.editMessageText('❌ Ferme.').catch(() => {});
    }
  });

  async function renderPage(ctx, key, record) {
    const { items, page, pageSize, renderItem, header, emptyMessage } = record;
    const totalPages = Math.ceil(items.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    let text = header ? `${header}\n\n` : '';

    if (pageItems.length === 0) {
      text += emptyMessage || 'Aucun element.';
    } else {
      text += pageItems.map((item, i) => renderItem(item, start + i)).join('\n');
    }

    if (items.length > pageSize) {
      text += `\n\nPage ${page + 1}/${totalPages}`;
    }

    const buttons = [];
    const navRow = [];
    if (page > 0) {
      navRow.push(Markup.button.callback(prevLabel, `pg:prev:${prefix}:${key.split(':')[1]}`));
    }
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback(nextLabel, `pg:next:${prefix}:${key.split(':')[1]}`));
    }
    if (navRow.length > 0) buttons.push(navRow);
    buttons.push([Markup.button.callback(closeLabel, `pg:close:${key.split(':')[1]}`)]);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    } catch {
      // Message may have been deleted or modified
      pages.delete(key);
    }
  }

  async function send(ctx, opts) {
    const {
      items,
      renderItem,
      header = '',
      emptyMessage = 'Aucun element.',
      page = 0,
    } = opts;

    const chatId = ctx.chat.id;
    const msg = ctx.callbackQuery?.message;

    let text = header ? `${header}\n\n` : '';

    if (items.length === 0) {
      text += emptyMessage;
      if (msg) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown' }).catch(() => {});
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => {});
      }
      return;
    }

    const totalPages = Math.ceil(items.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    text += pageItems.map((item, i) => renderItem(item, start + i)).join('\n');
    text += `\n\nPage ${page + 1}/${totalPages}`;

    const buttons = [];
    const navRow = [];
    if (page > 0) {
      navRow.push(Markup.button.callback(prevLabel, 'pg:prev:PLACEHOLDER'));
    }
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback(nextLabel, 'pg:next:PLACEHOLDER'));
    }
    if (navRow.length > 0) buttons.push(navRow);
    buttons.push([Markup.button.callback(closeLabel, 'pg:close:PLACEHOLDER')]);

    let messageId;
    if (msg) {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
      messageId = msg.message_id;
    } else {
      const sent = await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
      messageId = sent.message_id;
    }

    const key = `${chatId}:${messageId}`;

    // Fix placeholders with actual messageId
    const finalButtons = [];
    if (page > 0) {
      finalButtons.push([Markup.button.callback(prevLabel, `pg:prev:${prefix}:${messageId}`)]);
    }
    if (page < totalPages - 1) {
      if (finalButtons.length === 0) finalButtons.push([]);
      finalButtons[finalButtons.length - 1].push(
        Markup.button.callback(nextLabel, `pg:next:${prefix}:${messageId}`)
      );
    }
    if (finalButtons.length === 0 || finalButtons[finalButtons.length - 1].length > 0) {
      finalButtons.push([Markup.button.callback(closeLabel, `pg:close:${messageId}`)]);
    } else {
      finalButtons[finalButtons.length - 1].push(
        Markup.button.callback(closeLabel, `pg:close:${messageId}`)
      );
    }

    try {
      if (msg) {
        await ctx.editMessageReplyMarkup({ inline_keyboard: finalButtons });
      } else {
        await ctx.telegram.editMessageReplyMarkup(
          chatId,
          messageId,
          null,
          { inline_keyboard: finalButtons }
        );
      }
    } catch {
      // Best-effort
    }

    pages.set(key, {
      items,
      page,
      pageSize,
      renderItem,
      header,
      emptyMessage,
      prefix,
    });
  }

  function destroy() {
    pages.clear();
  }

  return { send, destroy };
}
