import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StorageService } from '../src/core/storage.js';

async function makeStorage() {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-crypto-bot-storage-'));
  const masterKey = crypto.randomBytes(32).toString('hex');
  return { dataPath, masterKey };
}

test('StorageService serializes concurrent writes for the same chat', async () => {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-crypto-bot-storage-'));
  const storage = new StorageService(dataPath, crypto.randomBytes(32).toString('hex'));
  await storage.init();

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      storage.addPendingTransaction(123, {
        walletId: 'wallet-1',
        toAddress: `address-${index}`,
        amount: index + 1,
        chain: 'sol',
      })
    )
  );

  const userData = await storage.loadUserData(123);
  assert.equal(userData.pendingTransactions.length, 20);
  assert.deepEqual(
    userData.pendingTransactions.map((tx) => tx.toAddress).sort(),
    Array.from({ length: 20 }, (_, index) => `address-${index}`).sort()
  );

  await fs.rm(dataPath, { recursive: true, force: true });
});

test('StorageService lock release is idempotent', async () => {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-crypto-bot-storage-'));
  const storage = new StorageService(dataPath, crypto.randomBytes(32).toString('hex'));
  await storage.init();

  const release = await storage._acquireLock(456);
  release();
  release();

  await storage.addPendingTransaction(456, {
    walletId: 'wallet-1',
    toAddress: 'address-1',
    amount: 1,
    chain: 'btc',
  });

  const userData = await storage.loadUserData(456);
  assert.equal(userData.pendingTransactions.length, 1);

  await fs.rm(dataPath, { recursive: true, force: true });
});

test('StorageService getWalletWithKey round-trip', async () => {
  const { dataPath, masterKey } = await makeStorage();
  const storage = new StorageService(dataPath, masterKey);
  await storage.init();

  await storage.addWallet(123, {
    privateKey: '0xabc123',
    mnemonic: 'word1 word2 word3',
    chain: 'eth',
    address: '0xdeadbeef',
  });

  const wallets = await storage.getWallets(123);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].address, '0xdeadbeef');
  assert.equal(wallets[0].privateKey, undefined);

  const walletWithKey = await storage.getWalletWithKey(123, wallets[0].id);
  assert.equal(walletWithKey.privateKey, '0xabc123');
  assert.equal(walletWithKey.mnemonic, 'word1 word2 word3');
  assert.equal(walletWithKey.isCorrupted, false);

  await fs.rm(dataPath, { recursive: true, force: true });
});

test('StorageService hasPendingTransaction is read-only (no write)', async () => {
  const { dataPath, masterKey } = await makeStorage();
  const storage = new StorageService(dataPath, masterKey);
  await storage.init();

  await storage.addPendingTransaction(123, {
    walletId: 'wallet-1',
    toAddress: 'addr-1',
    amount: 1,
    chain: 'sol',
  });

  const has = await storage.hasPendingTransaction(123, 'wallet-1', 'addr-1', 1);
  assert.equal(has, true);

  const hasOther = await storage.hasPendingTransaction(123, 'wallet-1', 'addr-2', 1);
  assert.equal(hasOther, false);

  await fs.rm(dataPath, { recursive: true, force: true });
});

test('StorageService runMaintenance cleans expired transactions', async () => {
  const { dataPath, masterKey } = await makeStorage();
  const storage = new StorageService(dataPath, masterKey);
  await storage.init();

  await storage.addPendingTransaction(123, {
    walletId: 'wallet-1',
    toAddress: 'addr-1',
    amount: 1,
    chain: 'sol',
  });

  const dataBefore = await storage.loadUserData(123);
  assert.equal(dataBefore.pendingTransactions.length, 1);

  dataBefore.pendingTransactions[0].expiresAt = new Date(0).toISOString();
  await storage.saveUserData(123, dataBefore);

  await storage.runMaintenance();

  const dataAfter = await storage.loadUserData(123);
  assert.equal(dataAfter.pendingTransactions.length, 0);

  await fs.rm(dataPath, { recursive: true, force: true });
});

test('StorageService stop clears maintenance interval', async () => {
  const { dataPath, masterKey } = await makeStorage();
  const storage = new StorageService(dataPath, masterKey);
  await storage.init();

  assert.ok(storage._maintenanceInterval !== null);
  await storage.stop();
  assert.equal(storage._maintenanceInterval, null);

  await fs.rm(dataPath, { recursive: true, force: true });
});
