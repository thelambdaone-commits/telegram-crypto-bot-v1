import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { buildClobClient, removeClobClient } from '../../src/clob/client.js';
import {
  getMarket,
  getMarkets,
  getMyTrades,
  getOrderBook,
  getOrders,
  getPositions,
} from '../../src/clob/markets.js';

const chatId = 123;

function setupMockClient(overrides = {}) {
  const wallet = ethers.Wallet.createRandom();
  const client = buildClobClient(chatId, wallet.privateKey, {
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    apiPassphrase: 'api-passphrase',
  });

  Object.assign(client, overrides);
  return client;
}

describe('Markets API', () => {
  beforeEach(() => {
    removeClobClient(chatId);
  });

  test('getMarkets throws without client', async () => {
    await assert.rejects(
      () => getMarkets(chatId),
      /Client non initialise/
    );
  });

  test('getMarkets returns data', async () => {
    const mockMarkets = [{ conditionId: 'cond1', question: 'Test?' }];
    setupMockClient({
      getMarkets: async (filter) => {
        assert.equal(filter, 'open');
        return mockMarkets;
      },
    });

    const result = await getMarkets(chatId, 'open');
    assert.deepEqual(result, mockMarkets);
  });

  test('getMarket returns null on error', async () => {
    setupMockClient({
      getMarket: async () => {
        throw new Error('API error');
      },
    });

    assert.equal(await getMarket(chatId, 'cond1'), null);
  });

  test('getOrderBook returns null on error', async () => {
    setupMockClient({
      getOrderBook: async () => {
        throw new Error('API error');
      },
    });

    assert.equal(await getOrderBook(chatId, 'cond1'), null);
  });

  test('getPositions returns empty on error', async () => {
    setupMockClient({
      getPositions: async () => {
        throw new Error('API error');
      },
    });

    assert.deepEqual(await getPositions(chatId), []);
  });

  test('getOrders returns empty on error', async () => {
    setupMockClient({
      getOpenOrders: async () => {
        throw new Error('API error');
      },
    });

    assert.deepEqual(await getOrders(chatId), []);
  });

  test('getOrders uses CLOB getOpenOrders', async () => {
    const mockOrders = [{ id: 'order1', market: 'market1' }];
    setupMockClient({
      getOpenOrders: async () => mockOrders,
    });

    assert.deepEqual(await getOrders(chatId), mockOrders);
  });

  test('getMyTrades uses CLOB getTrades for history', async () => {
    const mockTrades = [{ id: 'trade1', market: 'market1', size: '1' }];
    setupMockClient({
      getTradesPaginated: async (params) => {
        assert.deepEqual(params, { maker_address: '0xabc' });
        return { trades: mockTrades };
      },
    });

    assert.deepEqual(await getMyTrades(chatId, '0xabc'), mockTrades);
  });

  test('getMyTrades throws CLOB errors instead of hiding them', async () => {
    setupMockClient({
      getTradesPaginated: async () => {
        throw new Error('auth failed');
      },
    });

    await assert.rejects(
      () => getMyTrades(chatId, '0xabc'),
      /Historique inaccessible: auth failed/
    );
  });

  test('getPositions returns data', async () => {
    const mockPositions = [{ conditionId: 'cond1', size: 100 }];
    setupMockClient({
      getPositions: async () => mockPositions,
    });

    assert.deepEqual(await getPositions(chatId), mockPositions);
  });
});
