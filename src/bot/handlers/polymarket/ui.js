import { getUserActivity } from '../../../clob/data-api.js';
import { getCollateralBalanceAllowance } from '../../../clob/markets.js';
import { getOrBuildClobClient } from '../../../clob/client.js';
import {
  calculateOfficialPortfolioPnl,
  calculatePolymarketTradeVolume,
  filterPolymarketTradesByTheme,
  getPolymarketTradeThemes,
  POLYMARKET_TRADE_THEMES,
} from '../../../modules/polymarket/analytics.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { polymarketTexts } from './texts.js';
import {
  polymarketHistoryKeyboard,
  polymarketMenuKeyboard,
  polymarketThemeSelectKeyboard,
  polymarketThemeTradesKeyboard,
} from './keyboards.js';
import { formatCollateralBalance, formatWalletAssets } from './formatters.js';
import { initClient } from './validation.js';
import { loadPolymarketOfficialPnl } from './positions.js';
import {
  deleteLoadingMessage,
  safeEditMessage,
  sendLoadingMessage,
} from '../../../shared/utils/telegram.js';

const HISTORY_PAGE_SIZE = 10;
const HISTORY_FETCH_LIMIT = 500;

export async function loadPolymarketHistory(
  chatId,
  storage,
  limit = HISTORY_FETCH_LIMIT,
  activityLoader = getUserActivity
) {
  const activeCredentials =
    typeof storage.getPolymarketCredentials === 'function'
      ? await storage.getPolymarketCredentials(chatId)
      : null;

  if (!activeCredentials?.address) {
    return { trades: [], errors: [], hasWallets: false, wallet: null };
  }

  const trades = [];
  const errors = [];
  try {
    const { userAddress, activity } = await activityLoader(activeCredentials.address, {
      limit,
      type: 'TRADE',
    });
    for (const item of activity) {
      trades.push({
        ...item,
        sourceAddress: activeCredentials.address,
        userAddress,
        walletLabel: activeCredentials.walletLabel || 'Wallet Polymarket',
        active: true,
      });
    }
  } catch (error) {
    errors.push(
      `${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}: ${error.message}`
    );
  }

  trades.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

  return {
    trades,
    errors,
    hasWallets: true,
    wallet: {
      label: activeCredentials.walletLabel || 'Wallet Polymarket',
      address: activeCredentials.address,
    },
  };
}

export async function loadPolymarketHistoryPnlSummary(chatId, storage, trades) {
  const officialPnl = await loadPolymarketOfficialPnl(chatId, storage);
  if (!officialPnl.hasWallets) return null;

  if (
    officialPnl.openPositions.length === 0 &&
    officialPnl.closedPositions.length === 0 &&
    officialPnl.errors.length > 0
  ) {
    return null;
  }

  const summary = calculateOfficialPortfolioPnl(
    officialPnl.openPositions,
    officialPnl.closedPositions
  );
  return {
    totalVolume: calculatePolymarketTradeVolume(trades),
    positionCount: summary.positionCount,
    closedPositionCount: summary.closedPositionCount,
    realizedPnl: summary.realizedPnl,
    totalPnl: summary.unrealizedPnl + summary.realizedPnl,
  };
}

export async function loadPolymarketMenuBalances(chatId, storage, walletService, creds) {
  if (!creds) return null;

  const balances = {
    polymarket: null,
    wallet: null,
  };

  try {
    await getOrBuildClobClient(chatId, storage);
    const balanceAllowance = await getCollateralBalanceAllowance(chatId);
    balances.polymarket = formatCollateralBalance(balanceAllowance?.balance);
  } catch {
    balances.polymarket = 'indisponible';
  }

  try {
    const chain = creds.chain || 'eth';
    const [walletBalance, tokens] = await Promise.all([
      creds.walletId
        ? walletService.getBalance(chatId, creds.walletId)
        : walletService.getPublicAddressBalance(chain, creds.address),
      walletService.getPublicAddressTokens(chain, creds.address).catch(() => []),
    ]);
    balances.wallet = formatWalletAssets(walletBalance, tokens, chain);
  } catch {
    balances.wallet = 'indisponible';
  }

  return balances;
}

export async function handlePnlCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await sendLoadingMessage(ctx, '💰 Calcul du PnL Polymarket...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await deleteLoadingMessage(ctx, loading);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await deleteLoadingMessage(ctx, loading);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const officialPnl = await loadPolymarketOfficialPnl(chatId, storage);
    if (!officialPnl.hasWallets) {
      await deleteLoadingMessage(ctx, loading);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (
      officialPnl.openPositions.length === 0 &&
      officialPnl.closedPositions.length === 0 &&
      officialPnl.errors.length > 0
    ) {
      throw new Error(officialPnl.errors.join('\n'));
    }

    const summary = calculateOfficialPortfolioPnl(
      officialPnl.openPositions,
      officialPnl.closedPositions
    );
    await deleteLoadingMessage(ctx, loading);

    await ctx.reply(polymarketTexts.pnl(summary), {
      parse_mode: 'Markdown',
      ...polymarketMenuKeyboard(true),
    });
  } catch (err) {
    await deleteLoadingMessage(ctx, loading);
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

export async function handleHistoryCommand(ctx, storage, page = 0, edit = false) {
  const chatId = ctx.chat.id;
  const loading = edit ? null : await sendLoadingMessage(ctx, "📜 Chargement de l'historique...");

  try {
    const { trades, errors, hasWallets, wallet } = await loadPolymarketHistory(chatId, storage);

    if (!hasWallets) {
      await deleteLoadingMessage(ctx, loading);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (trades.length === 0 && errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    await deleteLoadingMessage(ctx, loading);

    const totalPages = Math.max(1, Math.ceil(trades.length / HISTORY_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const options = {
      parse_mode: 'Markdown',
      ...polymarketHistoryKeyboard(safePage, totalPages),
    };
    const summary = await loadPolymarketHistoryPnlSummary(chatId, storage, trades);
    const text = polymarketTexts.history(trades, safePage, HISTORY_PAGE_SIZE, wallet, summary);

    if (edit) {
      await safeEditMessage(ctx, text, options);
      return;
    }

    await ctx.reply(text, options);
  } catch (err) {
    await deleteLoadingMessage(ctx, loading);
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

export async function handleThemeSelectCommand(ctx) {
  await safeEditMessage(ctx, polymarketTexts.themeSelect(), {
    parse_mode: 'Markdown',
    ...polymarketThemeSelectKeyboard(getPolymarketTradeThemes()),
  });
}

export async function handleThemeTradesCommand(ctx, storage, themeId, page = 0, edit = false) {
  const theme = POLYMARKET_TRADE_THEMES.find((item) => item.id === themeId);
  if (!theme) {
    return safeEditMessage(ctx, polymarketTexts.error('Thème inconnu.'), {
      parse_mode: 'Markdown',
      ...polymarketThemeSelectKeyboard(getPolymarketTradeThemes()),
    });
  }

  const chatId = ctx.chat.id;
  const loading = edit
    ? null
    : await sendLoadingMessage(ctx, '📊 Chargement des trades par thème...');

  try {
    const { trades, errors, hasWallets, wallet } = await loadPolymarketHistory(chatId, storage);

    if (!hasWallets) {
      await deleteLoadingMessage(ctx, loading);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (trades.length === 0 && errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    await deleteLoadingMessage(ctx, loading);

    const themedTrades = filterPolymarketTradesByTheme(trades, themeId);
    const totalPages = Math.max(1, Math.ceil(themedTrades.length / HISTORY_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const options = {
      parse_mode: 'Markdown',
      ...polymarketThemeTradesKeyboard(themeId, safePage, totalPages),
    };
    const text = polymarketTexts.themeTrades(
      theme,
      themedTrades,
      safePage,
      HISTORY_PAGE_SIZE,
      wallet
    );

    if (edit) {
      await safeEditMessage(ctx, text, options);
      return;
    }

    await ctx.reply(text, options);
  } catch (err) {
    await deleteLoadingMessage(ctx, loading);
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}
