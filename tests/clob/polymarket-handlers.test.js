import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOfficialPortfolioPnl,
  calculatePortfolioPnl,
  calculateRealizedPnl,
  formatCollateralBalance,
  loadPolymarketHistory,
  setupPolymarketHandlers,
} from '../../src/bot/handlers/polymarket/index.js';

test('Polymarket callback middleware lets menu actions run', async () => {
  let callbackMiddleware;
  const actions = new Map();
  const bot = {
    on: (eventName, handler) => {
      if (eventName === 'callback_query') callbackMiddleware = handler;
    },
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {
    getPolymarketCredentials: async () => null,
    getWallets: async () => [],
  };
  const sessions = {
    setState: () => {},
    setData: () => {},
    getState: () => null,
    clearState: () => {},
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);

  let nextCalled = false;
  const ctx = { callbackQuery: { data: 'pm_menu_refresh' } };

  await callbackMiddleware(ctx, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(typeof actions.get('pm_menu_refresh'), 'function');
});

test('new Polymarket wallet is generated and stored in session on click', async () => {
  let callbackMiddleware;
  let sessionState = null;
  let sessionData = null;
  const wallet = {
    id: 'eth-123',
    chain: 'eth',
    label: 'Polymarket Wallet',
    address: '0x0000000000000000000000000000000000000001',
    privateKey: 'not-a-private-key',
    isCorrupted: false,
  };
  const bot = {
    on: (eventName, handler) => {
      if (eventName === 'callback_query') callbackMiddleware = handler;
    },
    command: () => {},
    action: () => {},
  };
  const storage = {
    getWalletWithKey: async (_chatId, walletId) => {
      assert.equal(walletId, wallet.id);
      return wallet;
    },
  };
  const walletService = {
    createWallet: async (chatId, chain, label) => {
      assert.equal(chatId, 42);
      assert.equal(chain, 'eth');
      assert.equal(label, 'Polymarket Wallet');
      return { id: wallet.id };
    },
  };
  const sessions = {
    setState: (_chatId, state) => {
      sessionState = state;
    },
    setData: (_chatId, data) => {
      sessionData = data;
    },
    clearState: () => {},
  };
  const ctx = {
    chat: { id: 42 },
    callbackQuery: { data: 'pm_new_wallet' },
    answerCbQuery: async () => {},
    editMessageText: async () => {},
  };

  setupPolymarketHandlers(bot, storage, walletService, sessions);
  await callbackMiddleware(ctx, async () => {});

  assert.equal(sessionState, 'AWAITING_POLY_API_KEY');
  assert.deepEqual(sessionData, {
    createNewWallet: true,
    walletId: wallet.id,
    privateKey: wallet.privateKey,
    address: wallet.address,
    chain: wallet.chain,
    label: wallet.label,
  });
});

test('disconnect button falls back to reply when message edit fails', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {};
  const sessions = {
    getState: () => null,
    clearState: () => {},
  };
  let replied = false;
  const ctx = {
    chat: { id: 42 },
    callbackQuery: { data: 'pm_disconnect' },
    answerCbQuery: async () => {},
    editMessageText: async () => {
      throw new Error('message cannot be edited');
    },
    reply: async (text, options) => {
      replied = true;
      assert.match(text, /Confirmation/);
      assert.ok(options.reply_markup);
    },
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_disconnect')(ctx);

  assert.equal(replied, true);
});

test('confirm disconnect removes credentials and edits message', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  let deletedChatId = null;
  const storage = {
    deletePolymarketCredentials: async (chatId) => {
      deletedChatId = chatId;
    },
  };
  const sessions = {
    getState: () => null,
    clearState: () => {},
  };
  let edited = false;
  const ctx = {
    chat: { id: 42 },
    callbackQuery: { data: 'pm_confirm_disconnect' },
    answerCbQuery: async () => {},
    editMessageText: async (text, options) => {
      edited = true;
      assert.match(text, /Déconnexion Polymarket/);
      assert.ok(options.reply_markup);
    },
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_confirm_disconnect')(ctx);

  assert.equal(deletedChatId, 42);
  assert.equal(edited, true);
});

test('connected Polymarket menu includes polyfill-rs export button', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {};
  const sessions = {
    getState: () => null,
    clearState: () => {},
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);

  assert.equal(typeof actions.get('pm_export_polyfill'), 'function');
});

test('connected Polymarket menu includes portfolio PnL button', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {};
  const sessions = {
    getState: () => null,
    clearState: () => {},
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);

  assert.equal(typeof actions.get('pm_menu_pnl'), 'function');
});

test('connect screen shows the active Polymarket wallet', async () => {
  const commands = new Map();
  const bot = {
    on: () => {},
    command: (name, handler) => {
      commands.set(name, handler);
    },
    action: () => {},
  };
  const wallet = {
    id: 'eth-123',
    chain: 'eth',
    label: 'Wallet ETH',
    address: '0xAb755F8B5522eBD7609A4eAE27AF061d8B0f8D28',
  };
  const storage = {
    getWallets: async () => [wallet],
    getPolymarketCredentials: async () => ({
      walletId: wallet.id,
      walletLabel: wallet.label,
      chain: wallet.chain,
      address: wallet.address,
    }),
  };
  const sessions = {
    setState: () => {},
    getState: () => null,
    clearState: () => {},
  };
  let replyText = '';
  let replyMarkup;
  const ctx = {
    chat: { id: 42 },
    reply: async (text, options) => {
      replyText = text;
      replyMarkup = options.reply_markup;
    },
  };

  setupPolymarketHandlers(bot, storage, {}, sessions);
  await commands.get('polyconnect')(ctx);

  assert.match(replyText, /Wallet Polymarket actif/);
  assert.match(replyText, /Wallet ETH/);
  assert.match(JSON.stringify(replyMarkup), /⭐ Wallet ETH/);
});

test('Polymarket history requires only the active wallet credentials', async () => {
  const storage = {
    getPolymarketCredentials: async () => ({
      address: '0x0000000000000000000000000000000000000001',
      walletLabel: 'Active Wallet',
    }),
    getPolymarketCredentialsList: async () => {
      throw new Error('history should not read every saved wallet');
    },
  };

  const history = await loadPolymarketHistory(42, storage, 1, async (address, options) => {
    assert.equal(address, '0x0000000000000000000000000000000000000001');
    assert.deepEqual(options, { limit: 1, type: 'TRADE' });
    return {
      userAddress: address,
      activity: [{ id: 'trade-1', timestamp: 1 }],
    };
  });

  assert.equal(history.hasWallets, true);
  assert.equal(history.trades.length, 1);
  assert.deepEqual(history.wallet, {
    label: 'Active Wallet',
    address: '0x0000000000000000000000000000000000000001',
  });
});

test('calculatePortfolioPnl summarizes open position PnL', () => {
  const summary = calculatePortfolioPnl([
    {
      title: 'Market A',
      size: '10',
      price: '0.70',
      avgPrice: '0.40',
    },
    {
      title: 'Market B',
      size: '5',
      currentValue: '2',
      costBasis: '3',
    },
  ]);

  assert.equal(summary.positionCount, 2);
  assert.equal(summary.currentValue, 9);
  assert.equal(summary.costBasis, 7);
  assert.equal(summary.unrealizedPnl, 2);
  assert.equal(Number(summary.pnlPercent.toFixed(2)), 28.57);
});

test('formatCollateralBalance formats raw USDC units', () => {
  assert.equal(formatCollateralBalance('12345678'), '12.35 USDC');
  assert.equal(formatCollateralBalance('12.345'), '12.35 USDC');
});

test('calculateRealizedPnl matches sells against previous buys', () => {
  const summary = calculateRealizedPnl([
    {
      market: 'BTC 5m',
      outcome: 'Down',
      sourceAddress: '0xabc',
      side: 'BUY',
      size: '10',
      price: '0.20',
      timestamp: 1,
    },
    {
      market: 'BTC 5m',
      outcome: 'Down',
      sourceAddress: '0xabc',
      side: 'SELL',
      size: '4',
      price: '0.45',
      timestamp: 2,
    },
  ]);

  assert.equal(Number(summary.realizedPnl.toFixed(2)), 1);
  assert.equal(summary.realizedTradeCount, 1);
  assert.equal(summary.unmatchedSellCount, 0);
});

test('calculateOfficialPortfolioPnl uses Polymarket position PnL fields', () => {
  const summary = calculateOfficialPortfolioPnl(
    [
      {
        title: 'Open market',
        size: 10,
        initialValue: 4,
        currentValue: 7,
        cashPnl: 3,
        realizedPnl: 1,
      },
    ],
    [
      {
        title: 'Closed market',
        realizedPnl: 5,
      },
    ]
  );

  assert.equal(summary.positionCount, 1);
  assert.equal(summary.closedPositionCount, 1);
  assert.equal(summary.currentValue, 7);
  assert.equal(summary.costBasis, 4);
  assert.equal(summary.unrealizedPnl, 3);
  assert.equal(summary.realizedPnl, 6);
});
