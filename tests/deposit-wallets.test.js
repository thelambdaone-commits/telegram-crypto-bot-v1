/**
 * Receive flow — wallet eligibility/selection. When the user holds several
 * wallets able to receive on a chain (e.g. ETH Wallet 1 / 2), the deposit flow
 * must surface all of them so they can pick — not silently use the first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleDepositWallets } from '../src/bot/handlers/deposit/index.js';

const mkStorage = (wallets) => ({ getWallets: async () => wallets });

test('returns every non-corrupted wallet on the exact chain (so the UI can offer a choice)', async () => {
  const storage = mkStorage([
    { id: 'eth-1', chain: 'eth', address: '0xaaa', isCorrupted: false },
    { id: 'eth-2', chain: 'eth', address: '0xbbb', isCorrupted: false },
    { id: 'btc-1', chain: 'btc', address: 'bc1q', isCorrupted: false },
  ]);
  const list = await eligibleDepositWallets(storage, 1, 'eth');
  assert.deepEqual(
    list.map((w) => w.id),
    ['eth-1', 'eth-2']
  );
});

test('excludes corrupted wallets and wallets without an address', async () => {
  const storage = mkStorage([
    { id: 'eth-1', chain: 'eth', address: '0xaaa', isCorrupted: false },
    { id: 'eth-2', chain: 'eth', address: '0xbbb', isCorrupted: true },
    { id: 'eth-3', chain: 'eth', address: '', isCorrupted: false },
  ]);
  const list = await eligibleDepositWallets(storage, 1, 'eth');
  assert.deepEqual(
    list.map((w) => w.id),
    ['eth-1']
  );
});

test('falls back to any EVM wallet when none exists on the exact EVM chain', async () => {
  const storage = mkStorage([
    { id: 'eth-1', chain: 'eth', address: '0xaaa', isCorrupted: false },
    { id: 'op-1', chain: 'op', address: '0xccc', isCorrupted: false },
  ]);
  // No wallet created specifically on Base, but EVM addresses are interchangeable.
  const list = await eligibleDepositWallets(storage, 1, 'base');
  assert.deepEqual(
    list.map((w) => w.id),
    ['eth-1', 'op-1']
  );
});

test('no fallback for non-EVM chains — an empty list means "no wallet"', async () => {
  const storage = mkStorage([{ id: 'eth-1', chain: 'eth', address: '0xaaa', isCorrupted: false }]);
  const list = await eligibleDepositWallets(storage, 1, 'btc');
  assert.deepEqual(list, []);
});

test('a single wallet returns a one-element list (caller skips the picker)', async () => {
  const storage = mkStorage([{ id: 'sol-1', chain: 'sol', address: 'So1', isCorrupted: false }]);
  const list = await eligibleDepositWallets(storage, 1, 'sol');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'sol-1');
});
