import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DepositMonitor } from '../src/core/monitor.js';

test('DepositMonitor initializes user balances with bounded concurrency', async () => {
  let active = 0;
  let maxActive = 0;

  const storage = {
    getAllUsers: async () => [
      { chatId: 1 },
      { chatId: 2 },
      { chatId: 3 },
      { chatId: 4 },
      { chatId: 5 },
    ],
  };
  const walletService = {
    getAllBalances: async (chatId) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;

      return [
        {
          id: `wallet-${chatId}`,
          balance: String(chatId),
        },
      ];
    },
  };

  const monitor = new DepositMonitor(
    storage,
    walletService,
    { telegram: {} },
    {
      concurrency: 2,
      userDelayMs: 0,
    }
  );

  await monitor.initialize();

  assert.equal(maxActive, 2);
  assert.deepEqual(monitor.lastBalances.get(3), { 'wallet-3': 3 });
  assert.equal(monitor.lastBalances.size, 5);
});

test('DepositMonitor notifies admins when a wallet balance increases', async () => {
  const sentMessages = [];
  const storage = {
    getAllUsers: async () => [{ chatId: 123 }],
    loadUserData: async () => ({
      username: 'alice',
      firstName: 'Alice',
    }),
  };
  const walletService = {
    getAllBalances: async () => [
      {
        id: 'wallet-1',
        label: 'Main BTC',
        chain: 'btc',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        balance: '1.5',
      },
    ],
  };
  const bot = {
    telegram: {
      sendMessage: async (chatId, message, options) => {
        sentMessages.push({ chatId, message, options });
      },
    },
  };

  const monitor = new DepositMonitor(storage, walletService, bot, {
    concurrency: 1,
    userDelayMs: 0,
  });
  monitor.lastBalances.set(123, { 'wallet-1': 1 });

  await monitor.checkDeposits();

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].message, /Montant: 0\.50000000 BTC/);
  assert.match(sentMessages[0].message, /Nouveau solde: 1\.5 BTC/);
  assert.deepEqual(monitor.lastBalances.get(123), { 'wallet-1': 1.5 });
});

test('DepositMonitor keeps processing users when one balance lookup fails', async () => {
  const storage = {
    getAllUsers: async () => [{ chatId: 1 }, { chatId: 2 }],
  };
  const walletService = {
    getAllBalances: async (chatId) => {
      if (chatId === 1) throw new Error('RPC down');
      return [{ id: 'wallet-2', balance: '2' }];
    },
  };

  const monitor = new DepositMonitor(
    storage,
    walletService,
    { telegram: {} },
    {
      concurrency: 2,
      userDelayMs: 0,
    }
  );

  await monitor.initialize();

  assert.equal(monitor.lastBalances.has(1), false);
  assert.deepEqual(monitor.lastBalances.get(2), { 'wallet-2': 2 });
});
