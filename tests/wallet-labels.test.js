import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalletService } from '../src/modules/wallet/wallet.service.js';

test('imported wallet labels use the next available chain number', async () => {
  const service = Object.create(WalletService.prototype);
  service.storage = {
    getWallets: async () => [
      { chain: 'eth', label: 'Wallet ETH 1' },
      { chain: 'eth', label: 'Wallet ETH 2' },
      { chain: 'sol', label: 'Wallet SOL 1' },
    ],
  };

  assert.equal(await service.getNextWalletLabel(123, 'eth'), 'Wallet ETH 3');
  assert.equal(await service.getNextWalletLabel(123, 'sol'), 'Wallet SOL 2');
});

test('legacy unnumbered imported wallet label counts as number 1', async () => {
  const service = Object.create(WalletService.prototype);
  service.storage = {
    getWallets: async () => [
      { chain: 'eth', label: 'Wallet ETH' },
    ],
  };

  assert.equal(await service.getNextWalletLabel(123, 'eth'), 'Wallet ETH 2');
});
