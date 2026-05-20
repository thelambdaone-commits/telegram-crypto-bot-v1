import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolymarketCredentialsText,
  buildWalletKeysText,
  sendPolymarketCredentialsFile,
  sendWalletKeysFile,
} from '../src/bot/handlers/wallet/key-file.js';

test('buildWalletKeysText formats wallet secrets without metadata', () => {
  const text = buildWalletKeysText({
    chain: ' eth ',
    address: ' 0xabc ',
    privateKey: ' 0xprivate ',
    mnemonic: ' seed words ',
  });

  assert.equal(
    text,
    'CHAIN=ETH\nADDRESS=0xabc\nPRIVATE_KEY=0xprivate\nSEED=seed words\n'
  );
});

test('sendWalletKeysFile uses incrementing filenames from storage', async () => {
  const filenames = [];
  const options = [];
  const ctx = {
    chat: { id: 42 },
    replyWithDocument: async (document, extra) => {
      filenames.push(document.filename);
      options.push(extra);
    },
  };
  const storage = {
    counter: 0,
    async getNextKeysFilename(_chatId, scope = 'default') {
      assert.equal(scope, 'default');
      this.counter += 1;
      return this.counter === 1 ? 'keys.txt' : `keys${this.counter}.txt`;
    },
  };
  const wallet = { chain: 'sol', address: 'addr', privateKey: 'priv' };

  await sendWalletKeysFile(ctx, wallet, storage);
  await sendWalletKeysFile(ctx, wallet, storage);
  await sendWalletKeysFile(ctx, wallet, storage);

  assert.deepEqual(filenames, ['keys.txt', 'keys2.txt', 'keys3.txt']);
  assert.deepEqual(options, [
    { protect_content: true },
    { protect_content: true },
    { protect_content: true },
  ]);
});

test('sendWalletKeysFile supports scoped filenames', async () => {
  const filenames = [];
  const scopes = [];
  const options = [];
  const ctx = {
    chat: { id: 42 },
    replyWithDocument: async (document, extra) => {
      filenames.push(document.filename);
      options.push(extra);
    },
  };
  const storage = {
    counters: {},
    async getNextKeysFilename(_chatId, scope = 'default') {
      scopes.push(scope);
      this.counters[scope] = (this.counters[scope] || 0) + 1;
      const index = this.counters[scope];
      const baseName = scope === 'default' ? 'keys' : `keys-${scope}`;
      return index === 1 ? `${baseName}.txt` : `${baseName}${index}.txt`;
    },
  };
  const wallet = { chain: 'eth', address: 'addr', privateKey: 'priv' };

  await sendWalletKeysFile(ctx, wallet, storage, { scope: 'polymarket' });
  await sendWalletKeysFile(ctx, wallet, storage, { scope: 'polymarket' });
  await sendWalletKeysFile(ctx, wallet, storage, { scope: 'jitosol' });

  assert.deepEqual(scopes, ['polymarket', 'polymarket', 'jitosol']);
  assert.deepEqual(filenames, ['keys-polymarket.txt', 'keys-polymarket2.txt', 'keys-jitosol.txt']);
  assert.deepEqual(options, [
    { protect_content: true },
    { protect_content: true },
    { protect_content: true },
  ]);
});

test('buildPolymarketCredentialsText formats only CLOB credentials', () => {
  const text = buildPolymarketCredentialsText({
    apiKey: ' key ',
    apiSecret: ' secret ',
    apiPassphrase: ' passphrase ',
    privateKey: 'must-not-leak-here',
  });

  assert.equal(
    text,
    'POLYMARKET_API_KEY=key\n' +
      'POLYMARKET_API_SECRET=secret\n' +
      'POLYMARKET_API_PASSPHRASE=passphrase\n'
  );
});

test('sendPolymarketCredentialsFile uses scoped credentials filenames', async () => {
  const filenames = [];
  const options = [];
  const ctx = {
    chat: { id: 42 },
    replyWithDocument: async (document, extra) => {
      filenames.push(document.filename);
      options.push(extra);
    },
  };
  const storage = {
    counter: 0,
    async getNextKeysFilename(_chatId, scope, prefix) {
      assert.equal(scope, 'polymarket');
      assert.equal(prefix, 'credentials');
      this.counter += 1;
      return this.counter === 1
        ? 'credentials-polymarket.txt'
        : `credentials-polymarket${this.counter}.txt`;
    },
  };
  const credentials = { apiKey: 'key', apiSecret: 'secret', apiPassphrase: 'pass' };

  await sendPolymarketCredentialsFile(ctx, credentials, storage);
  await sendPolymarketCredentialsFile(ctx, credentials, storage);

  assert.deepEqual(filenames, ['credentials-polymarket.txt', 'credentials-polymarket2.txt']);
  assert.deepEqual(options, [{ protect_content: true }, { protect_content: true }]);
});
