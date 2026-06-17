/**
 * Anti-bot gate: a new user must solve the math captcha before any wallet is
 * provisioned. Verifies the security invariant — no createInitialWallets() call
 * until a correct captcha answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupStartHandler } from '../src/bot/handlers/start/index.js';

function harness({ wallets = [] } = {}) {
  let startHandler;
  let captchaHandler;
  const bot = {
    start: (fn) => {
      startHandler = fn;
    },
    action: (pat, fn) => {
      if (String(pat).includes('captcha')) captchaHandler = fn;
    },
    command: () => {},
    hears: () => {},
    on: () => {},
    use: () => {},
  };
  const stateMap = new Map();
  const dataMap = new Map();
  const sessions = {
    getState: (id) => stateMap.get(id),
    setState: (id, s) => stateMap.set(id, s),
    clearState: (id) => stateMap.delete(id),
    getData: (id) => dataMap.get(id),
    setData: (id, d) => dataMap.set(id, d),
  };
  const calls = { createWallets: 0 };
  const storage = { updateUserProfile: async () => {}, getWallets: async () => wallets };
  const walletService = {
    createInitialWallets: async () => {
      calls.createWallets += 1;
      // Throw a sentinel so the heavy reveal/file path doesn't run in the test;
      // provisionNewUser swallows it. The call itself proves the gate opened.
      throw new Error('stop-after-spy');
    },
  };
  setupStartHandler(bot, storage, walletService, sessions);
  return { startHandler, captchaHandler, sessions, stateMap, dataMap, calls };
}

function makeCtx(chatId = 555001) {
  const replies = [];
  return {
    chat: { id: chatId },
    from: { id: chatId, first_name: 'Bot', username: null },
    reply: async (text, extra) => {
      replies.push({ text, extra });
      return { message_id: 1 };
    },
    replyWithVideo: async () => ({ video: { file_id: 'x' } }),
    editMessageText: async () => {},
    answerCbQuery: async () => {},
    telegram: { sendMessage: async () => {}, deleteMessage: async () => {} },
    replies,
  };
}

test('new user /start shows a captcha and does NOT create wallets yet', async () => {
  const h = harness({ wallets: [] });
  const ctx = makeCtx();
  await h.startHandler(ctx);

  assert.equal(h.calls.createWallets, 0, 'no wallet provisioning before captcha');
  assert.equal(h.stateMap.get(ctx.chat.id), 'CAPTCHA');
  assert.match(ctx.replies[0].text, /anti-robot|\d \+ \d/);
  assert.ok(typeof h.dataMap.get(ctx.chat.id).captchaAnswer === 'number');
});

test('wrong captcha answer never provisions wallets', async () => {
  const h = harness({ wallets: [] });
  const ctx = makeCtx();
  await h.startHandler(ctx);
  const answer = h.dataMap.get(ctx.chat.id).captchaAnswer;

  ctx.match = [`captcha_${answer + 1}`, String(answer + 1)];
  await h.captchaHandler(ctx);

  assert.equal(h.calls.createWallets, 0, 'wrong answer must not provision');
  assert.equal(h.stateMap.get(ctx.chat.id), 'CAPTCHA', 'still gated');
});

test('correct captcha answer opens the gate (provisioning runs)', async () => {
  const h = harness({ wallets: [] });
  const ctx = makeCtx();
  await h.startHandler(ctx);
  const answer = h.dataMap.get(ctx.chat.id).captchaAnswer;

  ctx.match = [`captcha_${answer}`, String(answer)];
  await h.captchaHandler(ctx);

  assert.equal(h.calls.createWallets, 1, 'correct answer provisions exactly once');
  assert.equal(h.stateMap.get(ctx.chat.id), undefined, 'captcha state cleared');
});
