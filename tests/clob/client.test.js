import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  buildClobClient,
  getClobClient,
  getOrBuildClobClient,
  hasClobClient,
  removeClobClient,
} from '../../src/clob/client.js';

const chatId = 123;

function makeCreds() {
  const wallet = ethers.Wallet.createRandom();
  return {
    privateKey: wallet.privateKey,
    address: wallet.address,
    apiKey: 'api-key',
    apiSecret: 'api-secret',
    apiPassphrase: 'api-passphrase',
  };
}

describe('CLOB Client', () => {
  beforeEach(() => {
    removeClobClient(chatId);
  });

  test('buildClobClient creates and caches client', () => {
    const creds = makeCreds();
    const client = buildClobClient(chatId, creds.privateKey, creds);

    assert.equal(getClobClient(chatId), client);
    assert.equal(hasClobClient(chatId), true);
  });

  test('getClobClient returns null for unknown chat', () => {
    assert.equal(getClobClient(999), null);
  });

  test('removeClobClient deletes cached client', () => {
    const creds = makeCreds();
    buildClobClient(chatId, creds.privateKey, creds);
    removeClobClient(chatId);

    assert.equal(getClobClient(chatId), null);
    assert.equal(hasClobClient(chatId), false);
  });

  test('buildClobClient rejects invalid private key', () => {
    assert.throws(
      () => buildClobClient(chatId, 'not-a-key', { apiKey: 'key', apiSecret: 'secret', apiPassphrase: 'pass' }),
      /Private key Polymarket invalide/
    );
  });

  test('buildClobClient rejects incomplete API credentials', () => {
    const creds = makeCreds();

    assert.throws(
      () => buildClobClient(chatId, creds.privateKey, { apiKey: 'key' }),
      /Credentials API Polymarket incomplets/
    );
  });

  test('getOrBuildClobClient reads encrypted credentials from storage adapter', async () => {
    const creds = makeCreds();
    const storage = {
      getPolymarketCredentials: async (requestedChatId) => {
        assert.equal(requestedChatId, chatId);
        return creds;
      },
    };

    const result = await getOrBuildClobClient(chatId, storage);

    assert.equal(result.creds, creds);
    assert.equal(result.client, getClobClient(chatId));
  });

  test('getOrBuildClobClient returns null client without stored credentials', async () => {
    const storage = {
      getPolymarketCredentials: async () => null,
    };

    const result = await getOrBuildClobClient(chatId, storage);

    assert.deepEqual(result, { client: null, creds: null });
  });
});
