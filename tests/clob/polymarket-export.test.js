import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../src/shared/utils/telegram.js';
import { polymarketMenuKeyboard } from '../../src/bot/handlers/polymarket/keyboards.js';

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

test('connected Polymarket menu does not expose credentials action', () => {
  const keyboard = polymarketMenuKeyboard(true).reply_markup.inline_keyboard;
  const callbacks = keyboard.flat().map((button) => button.callback_data);

  assert.equal(callbacks.includes('pm_show_credentials'), false);
});

test('/polyexport command is not registered', async () => {
  const commands = new Map();
  const bot = {
    on: () => {},
    action: () => {},
    command: (name, handler) => {
      commands.set(name, handler);
    },
  };
  const storage = {};
  const sessions = { getState: () => null, clearState: () => {} };

  const { setupPolymarketHandlers } = await import(
    '../../src/bot/handlers/polymarket/index.js'
  );
  setupPolymarketHandlers(bot, storage, {}, sessions);

  assert.equal(commands.has('polyexport'), false);
});
