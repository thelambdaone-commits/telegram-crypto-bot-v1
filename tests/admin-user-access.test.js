import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupAdminSecrets } from '../src/bot/handlers/admin/secrets.js';

test('admin secret text handler lets normal user menu text continue', async () => {
  let textHandler = null;
  const bot = {
    action: () => {},
    on: (event, handler) => {
      if (event === 'text') textHandler = handler;
    },
  };
  const storage = {
    secrets: {
      list: () => [],
    },
  };
  const sessions = {
    getState: () => null,
  };

  setupAdminSecrets(bot, storage, sessions);

  let nextCalled = false;
  let replyCalled = false;
  const userMenuCommands = [
    '💰 Mes Wallets',
    '💵 Soldes',
    '🆕 Nouveau Wallet',
    '📊 Cours EUR',
    '📡 Envoyer',
    '🔎 Analyser',
    '🔐 Mes Clés',
    '🆘 Help',
    "➕ Plus d'actions",
    '❌ Fermer',
  ];

  for (const text of userMenuCommands) {
    nextCalled = false;
    replyCalled = false;
    const ctx = {
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789, username: 'regular_user' },
      message: { text },
      reply: async () => {
        replyCalled = true;
      },
    };

    await textHandler(ctx, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, `${text} should continue to user handlers`);
    assert.equal(replyCalled, false, `${text} should not receive admin-only reply`);
  }
});
