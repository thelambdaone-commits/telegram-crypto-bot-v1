import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { polymarketTexts } from './texts.js';
import { polymarketThemeSelectKeyboard } from './keyboards.js';
import { getPolymarketTradeThemes } from '../../../modules/polymarket/analytics.js';

import {
  handlePolyCommand,
  handleConnectStart,
  handleDisconnectCommand,
  handleConfirmDisconnect,
} from './commands.js';

import {
  handlePositionsCommand,
  handleOrdersCommand,
} from './positions.js';

import {
  handleApiKeyInput,
  handleApiSecretInput,
  handleApiPassphraseInput,
  handleWalletSelection,
} from './trading.js';

import {
  handlePnlCommand,
  handleHistoryCommand,
  handleThemeSelectCommand,
  handleThemeTradesCommand,
} from './ui.js';

export {
  calculateOfficialPortfolioPnl,
  calculatePortfolioPnl,
  calculatePolymarketTradeVolume,
  calculateRealizedPnl,
  filterPolymarketTradesByTheme,
  getPolymarketTradeThemes,
} from '../../../modules/polymarket/analytics.js';

export { formatCollateralBalance } from './formatters.js';
export { loadPolymarketHistory } from './ui.js';

export function setupPolymarketHandlers(bot, storage, walletService, sessions) {
  // Callback query handler for wallet selection (namespaced to pm_ actions)
  bot.action(/^pm_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleWalletSelection(ctx, storage, walletService, sessions);
  });

  bot.action('pm_new_wallet', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleWalletSelection(ctx, storage, walletService, sessions);
  });

  // Text input handler for polymarket flow
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const state = sessions.getState(chatId);
    const text = ctx.message?.text?.trim();
    if (!text) return next();

    if (state === 'AWAITING_POLY_API_KEY') {
      await handleApiKeyInput(ctx, storage, sessions);
      return;
    }

    if (state === 'AWAITING_POLY_SECRET') {
      await handleApiSecretInput(ctx, storage, sessions);
      return;
    }

    if (state === 'AWAITING_POLY_PASSPHRASE') {
      await handleApiPassphraseInput(ctx, storage, sessions);
      return;
    }

    if (state?.startsWith('AWAITING_POLY_')) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Opération annulée. Réessayez avec /polyconnect');
    }

    return next();
  });

  // Commands
  bot.command('poly', async (ctx) => {
    await handlePolyCommand(ctx, storage, walletService);
  });

  bot.command('polyconnect', async (ctx) => {
    await handleConnectStart(ctx, storage, walletService, sessions);
  });

  bot.command('polypos', async (ctx) => {
    await handlePositionsCommand(ctx, storage);
  });

  bot.command('polyorders', async (ctx) => {
    await handleOrdersCommand(ctx, storage);
  });

  bot.command('polypnl', async (ctx) => {
    await handlePnlCommand(ctx, storage);
  });

  bot.command('polyhistory', async (ctx) => {
    await handleHistoryCommand(ctx, storage);
  });

  bot.command('polythemes', async (ctx) => {
    await ctx.reply(polymarketTexts.themeSelect(), {
      parse_mode: 'Markdown',
      ...polymarketThemeSelectKeyboard(getPolymarketTradeThemes()),
    });
  });

  bot.command('polydisconnect', async (ctx) => {
    await handleDisconnectCommand(ctx);
  });

  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = sessions.getState(chatId);
    if (state?.startsWith('AWAITING_POLY_')) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Opération annulée.');
    }
  });

  // Callback actions
  bot.action('pm_menu_positions', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePositionsCommand(ctx, storage);
  });

  bot.action('pm_menu_orders', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleOrdersCommand(ctx, storage);
  });

  bot.action('pm_menu_pnl', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePnlCommand(ctx, storage);
  });

  bot.action('pm_menu_history', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleHistoryCommand(ctx, storage);
  });

  bot.action('pm_menu_themes', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleThemeSelectCommand(ctx);
  });

  bot.action(/^pm_theme_(.+)_page_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const themeId = ctx.match?.[1];
    const page = Number(ctx.match?.[2] || 0);
    await handleThemeTradesCommand(ctx, storage, themeId, page, true);
  });

  bot.action('pm_theme_current', async (ctx) => {
    await safeAnswerCbQuery(ctx);
  });

  bot.action(/^pm_history_page_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const page = Number(ctx.match?.[1] || 0);
    await handleHistoryCommand(ctx, storage, page, true);
  });

  bot.action('pm_history_current', async (ctx) => {
    await safeAnswerCbQuery(ctx);
  });

  bot.action('pm_menu_refresh', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePolyCommand(ctx, storage, walletService);
  });

  bot.action('pm_connect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleConnectStart(ctx, storage, walletService, sessions);
  });

  bot.action('pm_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleDisconnectCommand(ctx);
  });

  bot.action('pm_confirm_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleConfirmDisconnect(ctx, storage);
  });

  bot.action('pm_cancel_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePolyCommand(ctx, storage, walletService);
  });

  bot.action('pm_cancel', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    await handlePolyCommand(ctx, storage, walletService);
  });
}
