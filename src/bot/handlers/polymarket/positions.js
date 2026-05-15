import { getPositions, getOrders } from '../../../clob/markets.js';
import { getUserClosedPositions, getUserPositions } from '../../../clob/data-api.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { polymarketTexts } from './texts.js';
import { initClient } from './validation.js';
import { deleteLoadingMessage, sendLoadingMessage } from '../../../shared/utils/telegram.js';

export async function loadPolymarketOfficialPnl(chatId, storage) {
  const activeCredentials =
    typeof storage.getPolymarketCredentials === 'function'
      ? await storage.getPolymarketCredentials(chatId)
      : null;

  if (!activeCredentials?.address) {
    return { openPositions: [], closedPositions: [], errors: [], hasWallets: false };
  }

  const openPositions = [];
  const closedPositions = [];
  const errors = [];

  try {
    const [{ positions }, closedResult] = await Promise.all([
      getUserPositions(activeCredentials.address, { limit: 500, sizeThreshold: 0 }),
      getUserClosedPositions(activeCredentials.address, { limit: 50, maxPages: 20 }),
    ]);

    for (const position of positions) {
      openPositions.push({
        ...position,
        sourceAddress: activeCredentials.address,
        walletLabel: activeCredentials.walletLabel || 'Wallet Polymarket',
        active: true,
      });
    }

    for (const position of closedResult.positions) {
      closedPositions.push({
        ...position,
        sourceAddress: activeCredentials.address,
        walletLabel: activeCredentials.walletLabel || 'Wallet Polymarket',
        active: true,
      });
    }
  } catch (error) {
    errors.push(
      `${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}: ${error.message}`
    );
  }

  return { openPositions, closedPositions, errors, hasWallets: true };
}

export async function handlePositionsCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await sendLoadingMessage(ctx, '📊 Chargement des positions...');

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

    const positions = await getPositions(chatId);
    await deleteLoadingMessage(ctx, loading);

    await ctx.reply(polymarketTexts.positions(positions), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    await deleteLoadingMessage(ctx, loading);
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

export async function handleOrdersCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await sendLoadingMessage(ctx, '📋 Chargement des ordres...');

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

    const orders = await getOrders(chatId);
    await deleteLoadingMessage(ctx, loading);

    await ctx.reply(polymarketTexts.orders(orders), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    await deleteLoadingMessage(ctx, loading);
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}
