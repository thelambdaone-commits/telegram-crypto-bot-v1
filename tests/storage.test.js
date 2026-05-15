import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StorageService } from '../src/core/storage.js';

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

  await storage._acquireLock(456);
  storage._releaseLock(456);
  storage._releaseLock(456);

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
