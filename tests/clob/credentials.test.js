import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';
import {
  decryptCredentials,
  encryptCredentials,
  extractAddress,
  formatPrivateKey,
  validatePrivateKey,
} from '../../src/clob/credentials.js';
import { StorageService } from '../../src/core/storage.js';
import { generateKey } from '../../src/shared/encryption.js';

describe('Credentials Utils', () => {
  test('formatPrivateKey adds 0x prefix', () => {
    assert.equal(formatPrivateKey('abc123'), '0xabc123');
  });

  test('formatPrivateKey keeps 0x prefix', () => {
    assert.equal(formatPrivateKey('0xabc123'), '0xabc123');
  });

  test('formatPrivateKey returns null for null input', () => {
    assert.equal(formatPrivateKey(null), null);
  });

  test('validatePrivateKey accepts EVM keys for Ethereum and Polygon wallets', () => {
    const wallet = ethers.Wallet.createRandom();

    assert.equal(validatePrivateKey(wallet.privateKey), true);
    assert.equal(validatePrivateKey(wallet.privateKey.replace('0x', '')), true);
  });

  test('validatePrivateKey rejects invalid keys', () => {
    assert.equal(validatePrivateKey('abc'), false);
    assert.equal(validatePrivateKey(null), false);
    assert.equal(validatePrivateKey('z'.repeat(64)), false);
  });

  test('extractAddress returns the wallet address', () => {
    const wallet = ethers.Wallet.createRandom();

    assert.equal(extractAddress(wallet.privateKey), wallet.address);
  });

  test('encryptCredentials and decryptCredentials round-trip with masterKey', () => {
    const creds = { apiKey: 'key123', apiSecret: 'secret456', apiPassphrase: 'pass789' };
    const masterKey = generateKey();
    const encrypted = encryptCredentials(creds, masterKey);

    assert.notEqual(encrypted.apiKey, creds.apiKey);
    assert.notEqual(encrypted.apiSecret, creds.apiSecret);
    assert.notEqual(encrypted.apiPassphrase, creds.apiPassphrase);
    assert.deepEqual(decryptCredentials(encrypted, masterKey), creds);
  });

  test('decryptCredentials returns null with the wrong masterKey', () => {
    const creds = { apiKey: 'key123', apiSecret: 'secret456', apiPassphrase: 'pass789' };
    const encrypted = encryptCredentials(creds, generateKey());

    assert.equal(decryptCredentials(encrypted, generateKey()), null);
  });
});

describe('Polymarket credentials storage', () => {
  test('stores and decrypts Polymarket credentials with masterKey', async () => {
    const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-credentials-'));
    const masterKey = generateKey();
    const storage = new StorageService(dataPath, masterKey);
    const wallet = ethers.Wallet.createRandom();
    const chatId = 12345;

    await storage.init();
    await storage.addPolymarketCredentials(
      chatId,
      wallet.privateKey,
      wallet.address,
      'api-key',
      'api-secret',
      'api-passphrase',
      'signature-ts'
    );

    const stored = await storage.getPolymarketCredentials(chatId);

    assert.equal(stored.privateKey, wallet.privateKey);
    assert.equal(stored.address, wallet.address);
    assert.equal(stored.apiKey, 'api-key');
    assert.equal(stored.apiSecret, 'api-secret');
    assert.equal(stored.apiPassphrase, 'api-passphrase');
    assert.equal(stored.signatureTimestamp, 'signature-ts');
  });

  test('keeps multiple Polymarket credentials and switches active wallet', async () => {
    const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-credentials-'));
    const masterKey = generateKey();
    const storage = new StorageService(dataPath, masterKey);
    const firstWallet = ethers.Wallet.createRandom();
    const secondWallet = ethers.Wallet.createRandom();
    const chatId = 67890;

    await storage.init();
    await storage.addPolymarketCredentials(
      chatId,
      firstWallet.privateKey,
      firstWallet.address,
      'api-key-1',
      'api-secret-1',
      'api-passphrase-1',
      'signature-ts-1',
      { walletId: 'eth-1', walletLabel: 'Wallet ETH 1', chain: 'eth' }
    );
    await storage.addPolymarketCredentials(
      chatId,
      secondWallet.privateKey,
      secondWallet.address,
      'api-key-2',
      'api-secret-2',
      'api-passphrase-2',
      'signature-ts-2',
      { walletId: 'eth-2', walletLabel: 'Wallet ETH 2', chain: 'eth' }
    );

    const list = await storage.getPolymarketCredentialsList(chatId);
    const active = await storage.getPolymarketCredentials(chatId);

    assert.equal(list.length, 2);
    assert.equal(active.address, secondWallet.address);
    assert.equal(active.apiKey, 'api-key-2');

    await storage.setActivePolymarketCredentials(chatId, list[0].id);
    const switched = await storage.getPolymarketCredentials(chatId);

    assert.equal(switched.address, firstWallet.address);
    assert.equal(switched.apiKey, 'api-key-1');

    await storage.deletePolymarketCredentials(chatId);
    assert.equal(await storage.getPolymarketCredentials(chatId), null);
    assert.equal((await storage.getPolymarketCredentialsList(chatId)).length, 2);
  });
});
