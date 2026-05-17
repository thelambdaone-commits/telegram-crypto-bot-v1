import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('auth.middleware', () => {
  let originalAdminChatId;
  let originalAdminUserId;

  function setupTestConfig(adminChatIds, adminUserIds) {
    return {
      adminChatId: adminChatIds || [],
      adminUserId: adminUserIds || [],
    };
  }

  test('isAdmin returns true for admin chat ID', async () => {
    const { isAdmin } = await import('../src/bot/middlewares/auth.middleware.js');
    const config = setupTestConfig([12345], []);
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [12345];
    modConfig.adminUserId = [];

    assert.equal(isAdmin(12345), true);
    assert.equal(isAdmin(99999), false);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('isAdmin returns true for admin user ID', async () => {
    const { isAdmin } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [];
    modConfig.adminUserId = [67890];

    assert.equal(isAdmin(67890), true);
    assert.equal(isAdmin(11111), false);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('isAdmin works with context object', async () => {
    const { isAdmin } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [12345];
    modConfig.adminUserId = [];

    const ctxChat = { chat: { id: 12345 }, from: { id: 99999 } };
    const ctxUser = { chat: { id: 99999 }, from: { id: 67890 } };
    const ctxNone = { chat: { id: 99999 }, from: { id: 88888 } };

    assert.equal(isAdmin(ctxChat), true);
    assert.equal(isAdmin(ctxUser), false);
    assert.equal(isAdmin(ctxNone), false);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('adminGuard returns false for non-admin', async () => {
    const { adminGuard } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [];
    modConfig.adminUserId = [];

    let replied = false;
    const ctx = {
      chat: { id: 99999 },
      from: { id: 88888 },
      reply: async () => { replied = true; },
      answerCbQuery: async () => {},
    };

    const result = adminGuard(ctx);
    assert.equal(result, false);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('adminGuard returns true for admin', async () => {
    const { adminGuard } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [12345];
    modConfig.adminUserId = [];

    const ctx = {
      chat: { id: 12345 },
      from: { id: 12345 },
    };

    const result = adminGuard(ctx);
    assert.equal(result, true);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('requireAdmin calls next for admin', async () => {
    const { requireAdmin } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [12345];
    modConfig.adminUserId = [];

    let nextCalled = false;
    const ctx = {
      chat: { id: 12345 },
      from: { id: 12345 },
      answerCbQuery: async () => {},
    };

    await requireAdmin(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('requireAdmin blocks non-admin', async () => {
    const { requireAdmin } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [];
    modConfig.adminUserId = [];

    let nextCalled = false;
    let cbAnswerCalled = false;
    const ctx = {
      chat: { id: 99999 },
      from: { id: 88888 },
      answerCbQuery: async () => { cbAnswerCalled = true; },
    };

    await requireAdmin(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(cbAnswerCalled, true);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('requirePrivate passes for private chat', async () => {
    const { requirePrivate } = await import('../src/bot/middlewares/auth.middleware.js');
    let nextCalled = false;
    const ctx = {
      chat: { id: 12345, type: 'private' },
      reply: async () => {},
    };

    await requirePrivate(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('requirePrivate blocks group chat for non-admin', async () => {
    const { requirePrivate } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    const origUserId = modConfig.adminUserId;
    modConfig.adminChatId = [];
    modConfig.adminUserId = [];

    let nextCalled = false;
    let replied = false;
    const ctx = {
      chat: { id: 99999, type: 'supergroup' },
      from: { id: 88888 },
      reply: async () => { replied = true; },
    };

    await requirePrivate(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(replied, true);

    modConfig.adminChatId = origChatId;
    modConfig.adminUserId = origUserId;
  });

  test('getAdminChatId returns configured IDs', async () => {
    const { getAdminChatId } = await import('../src/bot/middlewares/auth.middleware.js');
    const { config: modConfig } = await import('../src/core/config.js');
    const origChatId = modConfig.adminChatId;
    modConfig.adminChatId = [111, 222];

    const result = getAdminChatId();
    assert.deepEqual(result, [111, 222]);

    modConfig.adminChatId = origChatId;
  });
});
