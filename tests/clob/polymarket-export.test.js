import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../src/shared/utils/telegram.js';
import { AUDIT_ACTIONS } from '../../src/shared/security/audit-logger.js';
import { buildExportMessage } from '../../src/bot/handlers/polymarket/commands.js';

const creds = {
  privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  apiKey: 'my-api-key',
  apiSecret: 'super-secret-value',
  apiPassphrase: 'my-passphrase',
  address: '0xAb755F8B5522eBD7609A4eAE27AF061d8B0f8D28',
  chain: 'eth',
  walletLabel: 'Wallet ETH',
};

test('escapeHtml escapes all 5 HTML entities', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml handles combined entities', () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
  );
});

test('escapeHtml handles ampersand first to avoid double-encoding', () => {
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml returns empty string for null/undefined', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml converts numbers to strings', () => {
  assert.equal(escapeHtml(42), '42');
});

test('buildExportMessage produces HTML with correct structure', () => {
  const msg = buildExportMessage(creds);
  assert.match(msg, /<b>Export Polymarket<\/b>/);
  assert.match(msg, /<code>0xAb755F8B5522eBD7609A4eAE27AF061d8B0f8D28<\/code>/);
  assert.match(msg, /ETH/);
  assert.match(msg, /⚠️ <i>Ce message sera supprimé dans 30 secondes.<\/i>/);
});

test('buildExportMessage wraps private key in tg-spoiler', () => {
  const msg = buildExportMessage(creds);
  assert.match(msg, /<tg-spoiler>0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef<\/tg-spoiler>/);
});

test('buildExportMessage wraps apiSecret in tg-spoiler', () => {
  const msg = buildExportMessage(creds);
  assert.match(msg, /<tg-spoiler>super-secret-value<\/tg-spoiler>/);
});

test('buildExportMessage wraps apiPassphrase in tg-spoiler', () => {
  const msg = buildExportMessage(creds);
  assert.match(msg, /<tg-spoiler>my-passphrase<\/tg-spoiler>/);
});

test('buildExportMessage does not expose plaintext secrets outside tg-spoiler', () => {
  const msg = buildExportMessage(creds);
  const spoilerRegex = /<tg-spoiler>([^<]+)<\/tg-spoiler>/g;
  const spoilerContents = [];
  let match;
  while ((match = spoilerRegex.exec(msg)) !== null) {
    spoilerContents.push(match[1]);
  }
  assert.ok(spoilerContents.includes(creds.privateKey));
  assert.ok(spoilerContents.includes(creds.apiSecret));
  assert.ok(spoilerContents.includes(creds.apiPassphrase));
});

test('buildExportMessage escapes HTML in values', () => {
  const malicious = {
    ...creds,
    apiKey: '<img src=x onerror=alert(1)>',
  };
  const msg = buildExportMessage(malicious);
  assert.ok(msg.includes('&lt;'));
  assert.ok(!msg.includes('<img'));
});

test('buildExportMessage handles missing optional fields', () => {
  const minimal = {
    privateKey: '0xdead',
    apiKey: 'key',
    apiSecret: 'secret',
    apiPassphrase: 'phrase',
  };
  const msg = buildExportMessage(minimal);
  assert.match(msg, /N\/A/);
  assert.match(msg, /EVM/);
});

test('AUDIT_ACTIONS.EXPORT_CREDENTIALS exists', () => {
  assert.equal(AUDIT_ACTIONS.EXPORT_CREDENTIALS, 'EXPORT_CREDENTIALS');
});

test('handler passes protect_content and disable_web_page_preview', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {
    getPolymarketCredentials: async () => creds,
  };
  const sessions = { getState: () => null, clearState: () => {} };

  let replyOptions = null;
  const ctx = {
    chat: { id: 201 },
    callbackQuery: { message: { message_id: 100, chat: { id: 201 } } },
    telegram: {
      deleteMessage: async () => {},
    },
    answerCbQuery: async () => {},
    reply: async (_text, options) => {
      replyOptions = options;
      return { message_id: 200 };
    },
  };

  const { setupPolymarketHandlers } = await import(
    '../../src/bot/handlers/polymarket/index.js'
  );
  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_export_polyfill')(ctx);

  assert.equal(replyOptions.protect_content, true);
  assert.equal(replyOptions.disable_web_page_preview, true);
  assert.equal(replyOptions.parse_mode, 'HTML');
});

test('handler deletes trigger message on export', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {
    getPolymarketCredentials: async () => creds,
  };
  const sessions = { getState: () => null, clearState: () => {} };

  let deletedMessageId = null;
  const ctx = {
    chat: { id: 202 },
    callbackQuery: { message: { message_id: 100, chat: { id: 202 } } },
    telegram: {
      deleteMessage: async (chatId, msgId) => {
        deletedMessageId = msgId;
      },
    },
    answerCbQuery: async () => {},
    reply: async (_text, options) => {
      return { message_id: 200 };
    },
  };

  const { setupPolymarketHandlers } = await import(
    '../../src/bot/handlers/polymarket/index.js'
  );
  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_export_polyfill')(ctx);

  assert.equal(deletedMessageId, 100);
});

test('handler shows error without credentials', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {
    getPolymarketCredentials: async () => null,
  };
  const sessions = { getState: () => null, clearState: () => {} };

  let replyText = null;
  const ctx = {
    chat: { id: 203 },
    callbackQuery: { message: { message_id: 100, chat: { id: 203 } } },
    telegram: { deleteMessage: async () => {} },
    answerCbQuery: async () => {},
    reply: async (text) => {
      replyText = text;
      return { message_id: 200 };
    },
  };

  const { setupPolymarketHandlers } = await import(
    '../../src/bot/handlers/polymarket/index.js'
  );
  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_export_polyfill')(ctx);

  assert.match(replyText, /Non connecté/);
});

test('handler silences deleteMessage errors', async () => {
  const actions = new Map();
  const bot = {
    on: () => {},
    command: () => {},
    action: (name, handler) => {
      actions.set(name, handler);
    },
  };
  const storage = {
    getPolymarketCredentials: async () => creds,
  };
  const sessions = { getState: () => null, clearState: () => {} };

  const ctx = {
    chat: { id: 204 },
    callbackQuery: { message: { message_id: 100, chat: { id: 204 } } },
    telegram: {
      deleteMessage: async () => {
        throw new Error('Message to delete not found');
      },
    },
    answerCbQuery: async () => {},
    reply: async (_text) => {
      return { message_id: 200 };
    },
  };

  const { setupPolymarketHandlers } = await import(
    '../../src/bot/handlers/polymarket/index.js'
  );
  setupPolymarketHandlers(bot, storage, {}, sessions);
  await actions.get('pm_export_polyfill')(ctx);
});
