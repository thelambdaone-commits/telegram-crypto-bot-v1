import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupPolymarketHandlers } from '../../src/bot/handlers/polymarket/index.js';

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
