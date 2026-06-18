/**
 * Static button-coverage test (no network).
 *
 * Guarantees "every button is wired": every callback_data emitted by a keyboard
 * has a matching bot.action handler, every reply-keyboard text has a bot.hears,
 * and every command in the public menu has a bot.command. Runs in `npm test`.
 *
 * Strategy: register all handlers against a recording mock `bot`, then call each
 * keyboard factory with representative args and cross-check the emitted callback
 * data against the collected handler patterns (string equality OR regex.test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setupStartHandler } from '../src/bot/handlers/start/index.js';
import { setupWalletHandlers } from '../src/bot/handlers/wallet/index.js';
import { setupKeysHandlers } from '../src/bot/handlers/keys/index.js';
import { setupDepositHandlers } from '../src/bot/handlers/deposit/index.js';
import { setupSendHandlers } from '../src/bot/handlers/send/index.js';
import { setupExchangeHandlers } from '../src/bot/handlers/exchange/index.js';
import { setupPaymentHandlers } from '../src/bot/handlers/payments/index.js';
import { setupAdminHandlers } from '../src/bot/handlers/admin/index.js';
import { setupCommands } from '../src/bot/handlers/commands/index.js';
import { setupBalanceHandlers } from '../src/bot/handlers/balance.handlers.js';
import { setupNavigationHandlers } from '../src/bot/handlers/nav.handlers.js';

import { BOT_COMMANDS } from '../src/bot/bot-commands.js';
import {
  mainReplyKeyboard,
  mainMenuKeyboard,
  cancelKeyboard,
  adminExtendedKeyboard,
  adminUserKeyboard,
  adminCancelKeyboard,
  walletListKeyboard,
  walletActionsKeyboard,
  deleteConfirmKeyboard,
  corruptedWalletKeyboard,
  walletCreationMethodKeyboard,
  chainSelectionKeyboard,
  feeSelectionKeyboard,
  confirmationKeyboard,
  tokenSelectionKeyboard,
  amountTypeKeyboard,
  quickAmountKeyboard,
  addressAnalyzedKeyboard,
} from '../src/bot/keyboards/index.js';

// ── Stubs ────────────────────────────────────────────────────────────────────

// A callable Proxy that returns itself for any access/call, and yields an empty
// iterator — so a setup fn that incidentally touches a dependency at register
// time can't throw. Handlers only USE deps inside their callbacks, not here.
function makeStub() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined; // never a thenable
      return makeStub();
    },
    apply() {
      return makeStub();
    },
  });
}

function makeBot() {
  const commands = [];
  const hears = [];
  const actions = [];
  const bot = {
    command: (name) => {
      (Array.isArray(name) ? name : [name]).forEach((n) => commands.push(n));
      return bot;
    },
    hears: (pat) => {
      hears.push(pat);
      return bot;
    },
    action: (pat) => {
      actions.push(pat);
      return bot;
    },
    on: () => bot,
    use: () => bot,
    catch: () => bot,
    start: () => {
      commands.push('start'); // Telegraf sugar for command('start')
      return bot;
    },
    help: () => bot,
    launch: () => bot,
    telegram: makeStub(),
  };
  return { bot, commands, hears, actions };
}

function registerAll() {
  const { bot, commands, hears, actions } = makeBot();
  const s = makeStub();
  setupStartHandler(bot, s, s, s);
  setupWalletHandlers(bot, s, s, s);
  setupKeysHandlers(bot, s, s);
  setupDepositHandlers(bot, s);
  setupSendHandlers(bot, s, s, s);
  setupExchangeHandlers(bot, s, s, s);
  setupPaymentHandlers(bot, s, s, s, s);
  setupAdminHandlers(bot, s, s, s);
  setupBalanceHandlers(bot, s, s);
  setupNavigationHandlers(bot, s, s, s);
  setupCommands(bot, s, s, s);
  return { commands, hears, actions };
}

// ── Matchers ───────────────────────────────────────────────────────────────

function actionHandles(data, actions) {
  return actions.some((p) =>
    typeof p === 'string' ? p === data : p instanceof RegExp ? p.test(data) : false
  );
}

function hearsHandles(text, hears) {
  const one = (p) =>
    typeof p === 'string' ? p === text : p instanceof RegExp ? p.test(text) : false;
  return hears.some((p) => (Array.isArray(p) ? p.some(one) : one(p)));
}

// ── Keyboard extraction ──────────────────────────────────────────────────────

function inlineData(markup) {
  const rows = markup?.reply_markup?.inline_keyboard || [];
  const out = [];
  for (const row of rows) {
    for (const btn of row) {
      if (btn && btn.callback_data != null) out.push(btn.callback_data);
    }
  }
  return out;
}

function replyTexts(markup) {
  const rows = markup?.reply_markup?.keyboard || [];
  const out = [];
  for (const row of rows) {
    for (const btn of row) out.push(typeof btn === 'string' ? btn : btn.text);
  }
  return out;
}

// Representative args so dynamic callbacks resolve to concrete data we can match
// against the regex handlers (e.g. walletActionsKeyboard('eth-1') → copy_addr_eth-1).
const WALLET = { chain: 'eth', id: 'eth-1', label: 'Test' };
const ADDR = '0x0000000000000000000000000000000000000000';

function allInlineKeyboards() {
  return [
    ['mainMenuKeyboard', mainMenuKeyboard()],
    ['cancelKeyboard', cancelKeyboard()],
    ['adminExtendedKeyboard', adminExtendedKeyboard()],
    ['adminUserKeyboard', adminUserKeyboard(123456)],
    ['adminCancelKeyboard', adminCancelKeyboard()],
    ['walletListKeyboard', walletListKeyboard([WALLET])],
    ['walletActionsKeyboard', walletActionsKeyboard(WALLET.id)],
    ['deleteConfirmKeyboard', deleteConfirmKeyboard(WALLET.id)],
    ['corruptedWalletKeyboard', corruptedWalletKeyboard(WALLET.id)],
    ['walletCreationMethodKeyboard', walletCreationMethodKeyboard('eth')],
    ['chainSelectionKeyboard', chainSelectionKeyboard()],
    ['feeSelectionKeyboard', feeSelectionKeyboard('slow')],
    ['confirmationKeyboard', confirmationKeyboard()],
    ['tokenSelectionKeyboard', tokenSelectionKeyboard('eth')],
    ['amountTypeKeyboard', amountTypeKeyboard()],
    ['quickAmountKeyboard', quickAmountKeyboard()],
    ['addressAnalyzedKeyboard', addressAnalyzedKeyboard('eth', ADDR)],
  ];
}

// Deposit keyboards are internal to handlers/deposit/index.js (not exported), so
// we sample their callback formats explicitly. Keep in sync with that file.
const DEPOSIT_SAMPLES = ['deposit', 'dep_a_USDT', 'dep_n_USDT_eth', 'dep_s_USDT_eth'];

// Commands registered at the composition root (handlers/index.js), not via a
// setupX function, so excluded from the command-coverage assertion.
const ROOT_COMMANDS = new Set(['id']);

// ── Tests ────────────────────────────────────────────────────────────────────

test('every inline keyboard button has a matching bot.action handler', () => {
  const { actions } = registerAll();
  const dead = [];

  for (const [name, markup] of allInlineKeyboards()) {
    for (const data of inlineData(markup)) {
      if (!actionHandles(data, actions)) dead.push(`${name} → "${data}"`);
    }
  }
  for (const data of DEPOSIT_SAMPLES) {
    if (!actionHandles(data, actions)) dead.push(`deposit → "${data}"`);
  }

  assert.deepEqual(dead, [], `Dead buttons (no bot.action handler):\n  ${dead.join('\n  ')}`);
});

test('every reply-keyboard button has a matching bot.hears handler', () => {
  const { hears } = registerAll();
  const orphanText = [];

  for (const text of replyTexts(mainReplyKeyboard())) {
    if (!hearsHandles(text, hears)) orphanText.push(text);
  }

  assert.deepEqual(orphanText, [], `Reply buttons with no bot.hears:\n  ${orphanText.join('\n  ')}`);
});

test('every public menu command has a registered bot.command handler', () => {
  const { commands } = registerAll();
  const registered = new Set(commands);
  const missing = BOT_COMMANDS.map((c) => c.command).filter(
    (name) => !registered.has(name) && !ROOT_COMMANDS.has(name)
  );

  assert.deepEqual(missing, [], `Menu commands with no bot.command:\n  ${missing.join('\n  ')}`);
});

test('soft: report bot.action handlers not referenced by any enumerated keyboard', () => {
  // Informational only — many handlers are reached via callbacks built inside
  // other handlers (send_from_*, qr_back_*, admin_secret_*, …) that this static
  // enumeration does not model, so this is logged, never asserted.
  const { actions } = registerAll();
  const emitted = new Set([...allInlineKeyboards().flatMap(([, m]) => inlineData(m)), ...DEPOSIT_SAMPLES]);

  const stringActions = actions.filter((p) => typeof p === 'string');
  const unreferenced = stringActions.filter((a) => !emitted.has(a));
  if (unreferenced.length) {
    // eslint-disable-next-line no-console
    console.log(`[button-coverage] ${unreferenced.length} string action(s) not in enumerated keyboards (informational): ${unreferenced.join(', ')}`);
  }
  assert.ok(true);
});
