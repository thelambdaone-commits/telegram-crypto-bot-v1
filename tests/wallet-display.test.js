import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBalancesText } from '../src/bot/i18n/wallet-display.js';

test('buildBalancesText displays provider symbol instead of chain code', async () => {
  const storage = {
    getWallets: async () => [
      {
        id: 'base-1',
        chain: 'base',
        label: 'Base wallet',
        address: '0x0000000000000000000000000000000000000000',
      },
    ],
  };
  const walletService = {
    getBalance: async () => ({
      balance: '0',
      symbol: 'ETH',
    }),
  };

  const text = await buildBalancesText(walletService, storage, 123);

  assert.match(text, /Solde: 0 ETH/);
  assert.doesNotMatch(text, /Solde: 0 BASE/);
});
