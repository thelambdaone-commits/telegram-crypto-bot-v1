import { deriveClobApiCredentials, getOrBuildClobClient, removeClobClient } from '../../../clob/client.js';
import { getPositions, getOrders, getCollateralBalanceAllowance } from '../../../clob/markets.js';
import { getUserActivity, getUserClosedPositions, getUserPositions } from '../../../clob/data-api.js';
import { exportPolymarketCredentialsToPolyfillEnv } from '../../../clob/polyfill-env.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, safeEditMessage } from '../../utils.js';
import { polymarketTexts, confirmTexts } from './texts.js';
import {
  polymarketMenuKeyboard,
  confirmDisconnectKeyboard,
  polymarketWalletSelectKeyboard,
  polymarketHistoryKeyboard,
} from './keyboards.js';

const HISTORY_PAGE_SIZE = 10;
const HISTORY_FETCH_LIMIT = 500;

function escapeMarkdown(text) {
  return String(text || '').replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function formatCollateralBalance(rawBalance) {
  if (rawBalance === null || rawBalance === undefined || rawBalance === '') return null;
  const value = String(rawBalance);

  if (value.includes('.')) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)} USDC` : null;
  }

  try {
    const raw = BigInt(value);
    const whole = raw / 1_000_000n;
    const fraction = raw % 1_000_000n;
    const decimal = `${whole}.${fraction.toString().padStart(6, '0')}`;
    return `${Number(decimal).toFixed(2)} USDC`;
  } catch {
    return null;
  }
}

function formatNativeWalletBalance(balance, chain) {
  const amount = Number(balance?.balance);
  if (!Number.isFinite(amount)) return null;
  return `${amount.toFixed(amount < 0.01 && amount > 0 ? 6 : 4)} ${chain.toUpperCase()}`;
}

function formatTokenAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (value === 0) return '0';
  if (value < 0.000001) return '<0.000001';
  if (value < 1) return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function formatWalletAssets(nativeBalance, tokens, chain) {
  const assets = [];
  const native = formatNativeWalletBalance(nativeBalance, chain);
  if (native) assets.push(native);

  for (const token of tokens || []) {
    const amount = formatTokenAmount(token.amount);
    if (amount) assets.push(`${amount} ${token.symbol}`);
  }

  if (assets.length === 0) return null;
  const visibleAssets = assets.slice(0, 4);
  const suffix = assets.length > visibleAssets.length ? `, +${assets.length - visibleAssets.length}` : '';
  return `${visibleAssets.join(', ')}${suffix}`;
}

function getPositionTitle(position) {
  return escapeMarkdown(
    position.title ||
    position.market ||
    position.question ||
    position.outcome ||
    position.asset ||
    position.conditionId ||
    position.asset_id ||
    'Position Polymarket'
  );
}

function getTradeKey(trade) {
  return [
    trade.conditionId || trade.condition_id || trade.market || trade.asset_id || trade.id || 'market',
    trade.outcome || trade.asset || trade.sideToken || 'outcome',
    trade.sourceAddress || trade.userAddress || trade.walletLabel || 'wallet',
  ].join('|');
}

function getTradeTimestamp(trade) {
  if (trade.timestamp) return Number(trade.timestamp);
  if (trade.match_time) return new Date(trade.match_time).getTime() / 1000;
  if (trade.last_update) return new Date(trade.last_update).getTime() / 1000;
  return 0;
}

export function calculateRealizedPnl(trades) {
  const lotsByKey = new Map();
  let realizedPnl = 0;
  let realizedTradeCount = 0;
  let unmatchedSellCount = 0;

  const sortedTrades = [...(trades || [])].sort((a, b) => getTradeTimestamp(a) - getTradeTimestamp(b));

  for (const trade of sortedTrades) {
    const side = String(trade.side || '').toUpperCase();
    const size = Math.abs(firstNumber(trade, ['size', 'amount', 'quantity']) || 0);
    const price = firstNumber(trade, ['price', 'avgPrice', 'averagePrice']);
    if (!side || size <= 0 || price === null) continue;

    const key = getTradeKey(trade);
    const lots = lotsByKey.get(key) || [];

    if (side === 'BUY') {
      lots.push({ size, price });
      lotsByKey.set(key, lots);
      continue;
    }

    if (side !== 'SELL') continue;

    let remaining = size;
    let matchedCost = 0;
    let matchedSize = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.size);
      matchedCost += matched * lot.price;
      matchedSize += matched;
      lot.size -= matched;
      remaining -= matched;

      if (lot.size <= 1e-9) lots.shift();
    }

    if (matchedSize > 0) {
      realizedPnl += matchedSize * price - matchedCost;
      realizedTradeCount += 1;
    }

    if (remaining > 1e-9) {
      unmatchedSellCount += 1;
    }

    lotsByKey.set(key, lots);
  }

  return {
    realizedPnl,
    realizedTradeCount,
    unmatchedSellCount,
  };
}

export function calculatePortfolioPnl(positions) {
  const items = [];

  for (const position of positions || []) {
    const size = Math.abs(firstNumber(position, ['size', 'balance', 'quantity', 'amount']) || 0);
    if (size <= 0) continue;

    const currentValue =
      firstNumber(position, ['currentValue', 'current_value', 'value', 'marketValue', 'market_value']) ??
      size * (firstNumber(position, ['price', 'currentPrice', 'current_price', 'markPrice', 'mark_price']) || 0);

    const costBasis =
      firstNumber(position, ['costBasis', 'cost_basis', 'initialValue', 'initial_value', 'totalCost', 'total_cost']) ??
      size * (firstNumber(position, ['avgPrice', 'avg_price', 'averagePrice', 'average_price', 'entryPrice', 'entry_price']) || 0);

    const explicitPnl = firstNumber(position, ['cashPnl', 'cash_pnl', 'pnl', 'unrealizedPnl', 'unrealized_pnl']);
    const pnl = explicitPnl ?? currentValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : null;

    items.push({
      title: getPositionTitle(position),
      size,
      currentValue,
      costBasis,
      pnl,
      pnlPercent,
    });
  }

  const currentValue = items.reduce((sum, item) => sum + item.currentValue, 0);
  const costBasis = items.reduce((sum, item) => sum + item.costBasis, 0);
  const unrealizedPnl = items.reduce((sum, item) => sum + item.pnl, 0);

  items.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  return {
    positionCount: items.length,
    currentValue,
    costBasis,
    unrealizedPnl,
    pnlPercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : null,
    realizedPnl: 0,
    realizedTradeCount: 0,
    unmatchedSellCount: 0,
    items,
  };
}

export function calculateOfficialPortfolioPnl(openPositions = [], closedPositions = []) {
  const openItems = [];

  for (const position of openPositions) {
    const size = Math.abs(firstNumber(position, ['size', 'balance', 'quantity', 'amount']) || 0);
    const currentValue = firstNumber(position, ['currentValue', 'current_value', 'value', 'marketValue', 'market_value']) || 0;
    const costBasis = firstNumber(position, ['initialValue', 'initial_value', 'costBasis', 'cost_basis', 'totalBought']) || 0;
    const cashPnl = firstNumber(position, ['cashPnl', 'cash_pnl', 'pnl', 'unrealizedPnl', 'unrealized_pnl']) || 0;
    const realizedPnl = firstNumber(position, ['realizedPnl', 'realized_pnl']) || 0;
    const percentPnl = firstNumber(position, ['percentPnl', 'percent_pnl']);

    openItems.push({
      title: getPositionTitle(position),
      size,
      currentValue,
      costBasis,
      pnl: cashPnl,
      realizedPnl,
      pnlPercent: percentPnl,
    });
  }

  const closedItems = [];
  for (const position of closedPositions) {
    const realizedPnl = firstNumber(position, ['realizedPnl', 'realized_pnl', 'totalPnl', 'total_pnl']) || 0;
    closedItems.push({
      title: getPositionTitle(position),
      realizedPnl,
    });
  }

  openItems.sort((a, b) => Math.abs((b.pnl || 0) + (b.realizedPnl || 0)) - Math.abs((a.pnl || 0) + (a.realizedPnl || 0)));

  const currentValue = openItems.reduce((sum, item) => sum + item.currentValue, 0);
  const costBasis = openItems.reduce((sum, item) => sum + item.costBasis, 0);
  const unrealizedPnl = openItems.reduce((sum, item) => sum + item.pnl, 0);
  const openRealizedPnl = openItems.reduce((sum, item) => sum + item.realizedPnl, 0);
  const closedRealizedPnl = closedItems.reduce((sum, item) => sum + item.realizedPnl, 0);
  const realizedPnl = openRealizedPnl + closedRealizedPnl;

  return {
    positionCount: openItems.length,
    closedPositionCount: closedItems.length,
    currentValue,
    costBasis,
    unrealizedPnl,
    realizedPnl,
    realizedTradeCount: closedItems.length,
    unmatchedSellCount: 0,
    pnlPercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : null,
    items: openItems,
    source: 'polymarket-data-api',
  };
}

async function initClient(chatId, storage) {
  try {
    const { client, creds } = await getOrBuildClobClient(chatId, storage);
    if (!client || !creds?.privateKey) {
      return { error: 'wallet' };
    }
    return { client, address: creds.address, connected: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function generatePolymarketWalletSession(chatId, storage, walletService, sessions) {
  const wallet = await walletService.createWallet(chatId, 'eth', 'Polymarket Wallet');
  const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

  if (!fullWallet || fullWallet.isCorrupted) {
    throw new Error('Impossible de générer ou relire le wallet Polymarket');
  }

  sessions.setData(chatId, {
    createNewWallet: true,
    walletId: fullWallet.id,
    privateKey: fullWallet.privateKey,
    address: fullWallet.address,
    chain: fullWallet.chain,
    label: fullWallet.label,
  });

  return fullWallet;
}

async function autoConnectPolymarket(ctx, storage, sessions, wallet, generated) {
  const chatId = ctx.chat.id;

  try {
    const apiCreds = await deriveClobApiCredentials(wallet.privateKey);
    await storage.addPolymarketCredentials(
      chatId,
      wallet.privateKey,
      wallet.address,
      apiCreds.apiKey,
      apiCreds.apiSecret,
      apiCreds.apiPassphrase,
      Date.now().toString(),
      {
        walletId: wallet.id,
        walletLabel: wallet.label,
        chain: wallet.chain,
      }
    );
    removeClobClient(chatId);

    sessions.clearState(chatId);

    const walletType = generated
      ? `nouveau wallet généré: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})`
      : `wallet choisi: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})`;

    return {
      connected: true,
      text:
        polymarketTexts.connectSuccess(wallet.address) +
        `\n\n🔑 *Wallet:* ${walletType}\n🔐 Credentials CLOB générés automatiquement.`,
    };
  } catch (err) {
    sessions.setState(chatId, 'AWAITING_POLY_API_KEY');
    sessions.setData(chatId, {
      createNewWallet: generated,
      walletId: wallet.id,
      privateKey: wallet.privateKey,
      address: wallet.address,
      chain: wallet.chain,
      label: wallet.label,
    });

    return {
      connected: false,
      text:
        '🔗 *Connexion Polymarket*\n\n' +
        `${generated ? 'Nouveau wallet Ethereum généré automatiquement' : 'Wallet Polymarket choisi'}.\n\n` +
        `Wallet: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})\n` +
        `Adresse: \`${wallet.address}\`\n\n` +
        `La génération automatique CLOB a échoué: ${escapeMarkdown(err.message)}\n\n` +
        'Fallback manuel: entre votre *API Key* Polymarket:',
    };
  }
}

async function switchStoredPolymarketCredentials(ctx, storage, wallet) {
  if (typeof storage.getPolymarketCredentialsList !== 'function') return null;

  const chatId = ctx.chat.id;
  const credentialsList = await storage.getPolymarketCredentialsList(chatId);
  const stored = credentialsList.find((creds) => creds.address?.toLowerCase() === wallet.address.toLowerCase());
  if (!stored) return null;

  await storage.setActivePolymarketCredentials(chatId, stored.id);
  removeClobClient(chatId);

  return {
    text:
      polymarketTexts.connectSuccess(wallet.address) +
      `\n\n🔑 *Wallet actif:* *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})\n` +
      '🔁 Session Polymarket existante réactivée.',
  };
}

async function loadPolymarketMenuBalances(chatId, storage, walletService, creds) {
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

async function handlePolyCommand(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const creds = await storage.getPolymarketCredentials(chatId);
  const credentialsList = typeof storage.getPolymarketCredentialsList === 'function'
    ? await storage.getPolymarketCredentialsList(chatId)
    : [];
  const connected = !!creds;
  const balances = connected ? await loadPolymarketMenuBalances(chatId, storage, walletService, creds) : null;

  const text = polymarketTexts.menu(connected, {
    active: creds ? { ...creds, walletLabel: escapeMarkdown(creds.walletLabel || 'Wallet Polymarket') } : null,
    savedCount: credentialsList.length,
    balances,
  });

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...polymarketMenuKeyboard(connected),
  });
}

async function handleConnectStart(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;

  const wallets = await storage.getWallets(chatId);
  const ethWallets = wallets.filter((w) => ['eth', 'matic', 'pol'].includes(w.chain));
  const activeCredentials = typeof storage.getPolymarketCredentials === 'function'
    ? await storage.getPolymarketCredentials(chatId)
    : null;

  if (ethWallets.length === 0) {
    try {
      const wallet = await generatePolymarketWalletSession(chatId, storage, walletService, sessions);
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.reply(
        result.text,
        { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
      );
    } catch (err) {
      sessions.clearState(chatId);
      return ctx.reply(`❌ ${err.message}`);
    }
  }

  sessions.setState(chatId, 'AWAITING_POLY_WALLET_SELECT');
  const activeText = activeCredentials?.address
    ? '\n\nWallet Polymarket actif:\n' +
      `⭐ *${escapeMarkdown(activeCredentials.walletLabel || 'Wallet Polymarket')}* ` +
      `(${(activeCredentials.chain || 'EVM').toUpperCase()})\n` +
      `\`${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}\``
    : '\n\nAucun wallet Polymarket actif actuellement.';

  await ctx.reply(
    '🔗 *Connexion Polymarket*\n\n' +
    'Choisissez un wallet ETH/Polygon ou générez-en un nouveau:' +
    activeText,
    { parse_mode: 'Markdown', ...polymarketWalletSelectKeyboard(ethWallets, activeCredentials) }
  );
}

async function handleWalletSelection(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData === 'pm_new_wallet') {
    try {
      const wallet = await generatePolymarketWalletSession(chatId, storage, walletService, sessions);
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.editMessageText(
        result.text,
        { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
      );
    } catch (err) {
      sessions.clearState(chatId);
      return ctx.editMessageText(`❌ ${err.message}`);
    }
  }

  if (callbackData?.startsWith('pm_select_wallet_')) {
    const walletId = callbackData.replace('pm_select_wallet_', '');
    const fullWallet = await storage.getWalletWithKey(chatId, walletId);

    if (!fullWallet || fullWallet.isCorrupted) {
      return ctx.editMessageText('❌ Wallet invalide ou corrompu.');
    }

    const switched = await switchStoredPolymarketCredentials(ctx, storage, fullWallet);
    if (switched) {
      return ctx.editMessageText(switched.text, {
        parse_mode: 'Markdown',
        ...polymarketMenuKeyboard(true),
      });
    }

    const result = await autoConnectPolymarket(ctx, storage, sessions, fullWallet, false);

    return ctx.editMessageText(
      result.text,
      { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
    );
  }
}

async function handleApiKeyInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiKey: text });
  sessions.setState(chatId, 'AWAITING_POLY_SECRET');

  await ctx.reply(
    '📌 *Étape 2/3*\n\nEntrez votre *API Secret*:',
    { parse_mode: 'Markdown' }
  );
}

async function handleApiSecretInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiSecret: text });
  sessions.setState(chatId, 'AWAITING_POLY_PASSPHRASE');

  await ctx.reply(
    '📌 *Étape 3/3*\n\nEntrez votre *API Passphrase*:',
    { parse_mode: 'Markdown' }
  );
}

async function handleApiPassphraseInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);

  const privateKey = data.privateKey;
  const address = data.address;
  const walletLabel = data.label;
  const walletChain = data.chain;
  if (!privateKey || !address) {
    sessions.clearState(chatId);
    return ctx.reply('❌ Wallet Polymarket manquant en session. Réessayez avec /polyconnect.');
  }

  await storage.addPolymarketCredentials(
    chatId,
    privateKey,
    address,
    data.apiKey,
    data.apiSecret,
    text,
    Date.now().toString(),
    {
      walletId: data.walletId,
      walletLabel: data.label,
      chain: data.chain,
    }
  );
  removeClobClient(chatId);

  sessions.clearState(chatId);

  const walletType = data.createNewWallet
    ? `nouveau wallet généré: *${escapeMarkdown(walletLabel)}* (${walletChain.toUpperCase()})`
    : `wallet choisi: *${escapeMarkdown(walletLabel)}* (${walletChain.toUpperCase()})`;

  await ctx.reply(
    polymarketTexts.connectSuccess(address || data.address) +
    `\n\n🔑 *Wallet:* ${walletType}`,
    { parse_mode: 'Markdown', ...polymarketMenuKeyboard(true) }
  );
}

async function handlePositionsCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('📊 Chargement des positions...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const positions = await getPositions(chatId);
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.positions(positions), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleOrdersCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('📋 Chargement des ordres...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const orders = await getOrders(chatId);
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.orders(orders), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

export async function loadPolymarketHistory(chatId, storage, limit = HISTORY_FETCH_LIMIT, activityLoader = getUserActivity) {
  const activeCredentials = typeof storage.getPolymarketCredentials === 'function'
    ? await storage.getPolymarketCredentials(chatId)
    : null;

  if (!activeCredentials?.address) {
    return { trades: [], errors: [], hasWallets: false, wallet: null };
  }

  const trades = [];
  const errors = [];
  try {
    const { userAddress, activity } = await activityLoader(activeCredentials.address, { limit, type: 'TRADE' });
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
    errors.push(`${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}: ${error.message}`);
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

async function loadPolymarketOfficialPnl(chatId, storage) {
  const activeCredentials = typeof storage.getPolymarketCredentials === 'function'
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
    errors.push(`${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}: ${error.message}`);
  }

  return { openPositions, closedPositions, errors, hasWallets: true };
}

async function handlePnlCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('💰 Calcul du PnL Polymarket...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const officialPnl = await loadPolymarketOfficialPnl(chatId, storage);
    if (!officialPnl.hasWallets) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (
      officialPnl.openPositions.length === 0 &&
      officialPnl.closedPositions.length === 0 &&
      officialPnl.errors.length > 0
    ) {
      throw new Error(officialPnl.errors.join('\n'));
    }

    const summary = calculateOfficialPortfolioPnl(officialPnl.openPositions, officialPnl.closedPositions);
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.pnl(summary), {
      parse_mode: 'Markdown',
      ...polymarketMenuKeyboard(true),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleHistoryCommand(ctx, storage, page = 0, edit = false) {
  const chatId = ctx.chat.id;
  const loading = edit ? null : await ctx.reply('📜 Chargement de l\'historique...');

  try {
    const { trades, errors, hasWallets, wallet } = await loadPolymarketHistory(chatId, storage);

    if (!hasWallets) {
      if (loading) await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (trades.length === 0 && errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    if (loading) await ctx.telegram.deleteMessage(chatId, loading.message_id);

    const totalPages = Math.max(1, Math.ceil(trades.length / HISTORY_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const options = {
      parse_mode: 'Markdown',
      ...polymarketHistoryKeyboard(safePage, totalPages),
    };
    const text = polymarketTexts.history(trades, safePage, HISTORY_PAGE_SIZE, wallet);

    if (edit) {
      await safeEditMessage(ctx, text, options);
      return;
    }

    await ctx.reply(text, options);
  } catch (err) {
    try {
      if (loading) await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleExportPolyfillCommand(ctx, storage) {
  const chatId = ctx.chat.id;

  try {
    const creds = await storage.getPolymarketCredentials(chatId);
    if (!creds) {
      return ctx.reply(polymarketTexts.noCredentials(), {
        parse_mode: 'Markdown',
        ...polymarketMenuKeyboard(false),
      });
    }

    const result = await exportPolymarketCredentialsToPolyfillEnv(creds);
    const address = creds.address
      ? `\nWallet: \`${creds.address.slice(0, 8)}...${creds.address.slice(-6)}\``
      : '';

    return ctx.reply(
      '✅ *Session exportée vers polyfill-rs*\n\n' +
      `Fichier mis à jour: \`${escapeMarkdown(result.envPath)}\`\n` +
      `Variables écrites: *${result.keys.length}*${address}`,
      { parse_mode: 'Markdown', ...polymarketMenuKeyboard(true) }
    );
  } catch (err) {
    return ctx.reply(polymarketTexts.error(escapeMarkdown(err.message)), {
      parse_mode: 'Markdown',
      ...polymarketMenuKeyboard(true),
    });
  }
}

async function handleDisconnectCommand(ctx) {
  const options = {
    parse_mode: 'Markdown',
    ...confirmDisconnectKeyboard(),
  };

  try {
    await ctx.editMessageText(confirmTexts.disconnect(), options);
  } catch {
    await ctx.reply(confirmTexts.disconnect(), options);
  }
}

async function handleConfirmDisconnect(ctx, storage) {
  const chatId = ctx.chat.id;

  try {
    await storage.deletePolymarketCredentials(chatId);
    removeClobClient(chatId);

    await safeEditMessage(ctx, polymarketTexts.disconnectSuccess(), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await safeEditMessage(ctx, polymarketTexts.error(err.message), {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    } catch {
      await ctx.reply(polymarketTexts.error(err.message), {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      }).catch(() => {});
    }
  }
}

export function setupPolymarketHandlers(bot, storage, walletService, sessions) {
  // Callback query handler for wallet selection
  bot.on('callback_query', async (ctx, next) => {
    const callbackData = ctx.callbackQuery?.data;

    if (callbackData?.startsWith('pm_select_wallet_') || callbackData === 'pm_new_wallet') {
      await safeAnswerCbQuery(ctx);
      await handleWalletSelection(ctx, storage, walletService, sessions);
      return;
    }

    return next();
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

  bot.command('polyexport', async (ctx) => {
    await handleExportPolyfillCommand(ctx, storage);
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

  bot.action('pm_export_polyfill', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleExportPolyfillCommand(ctx, storage);
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
