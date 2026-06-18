/**
 * Payment gateway Phase 0 — invoice state machine, rate-lock, and ledger.
 * Pure domain, no network/funds. Price source + clock are injected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVOICE_STATES,
  canTransition,
  createInvoice,
  applyPayment,
  isExpired,
  expireIfDue,
} from '../src/modules/payments/invoice.service.js';
import { settlementEntries, balance, isBalanced } from '../src/modules/payments/ledger.js';

const T0 = 1_000_000_000_000;
const deps = (now = T0) => ({ now: () => now, priceFn: async () => ({ btc: 50000, eth: 2000, usdt: 0.9 }) });

test('createInvoice locks the EUR rate and derives the crypto amount', async () => {
  const inv = await createInvoice(
    { merchantId: 'm1', chain: 'btc', symbol: 'BTC', amountFiat: 100, expirySec: 900 },
    deps()
  );
  assert.equal(inv.status, INVOICE_STATES.NEW);
  assert.equal(inv.lockedRate, 50000);
  assert.equal(inv.amountCrypto, 100 / 50000); // 0.002 BTC
  assert.equal(inv.expiresAt, T0 + 900 * 1000);
  assert.match(inv.id, /^inv-/);
});

test('createInvoice accepts a crypto-denominated amount (no rate lookup)', async () => {
  const inv = await createInvoice({ merchantId: 'm1', chain: 'eth', symbol: 'ETH', amountCrypto: 1.5 }, deps());
  assert.equal(inv.amountCrypto, 1.5);
  assert.equal(inv.lockedRate, null);
});

test('createInvoice validates inputs', async () => {
  await assert.rejects(() => createInvoice({ chain: 'btc', symbol: 'BTC', amountFiat: 10 }, deps()), /merchantId/);
  await assert.rejects(() => createInvoice({ merchantId: 'm', symbol: 'BTC', amountFiat: 10 }, deps()), /chain et symbol/);
  await assert.rejects(() => createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC' }, deps()), /amountFiat ou amountCrypto/);
  await assert.rejects(() => createInvoice({ merchantId: 'm', chain: 'x', symbol: 'NOPE', amountFiat: 10 }, deps()), /Pas de prix/);
});

test('state machine guards transitions', () => {
  assert.ok(canTransition('new', 'processing'));
  assert.ok(canTransition('new', 'settled'));
  assert.ok(canTransition('processing', 'settled'));
  assert.ok(canTransition('settled', 'complete'));
  assert.ok(!canTransition('settled', 'new'));
  assert.ok(!canTransition('expired', 'settled'));
  assert.ok(!canTransition('complete', 'processing'));
});

test('applyPayment: underpaid stays processing', async () => {
  const inv = await createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC', amountCrypto: 1 }, deps());
  const out = applyPayment(inv, 0.5, { confirmed: true, now: T0 });
  assert.equal(out.status, INVOICE_STATES.PROCESSING);
  assert.equal(out.receivedCrypto, 0.5);
});

test('applyPayment: exact unconfirmed → processing, confirmed → settled', async () => {
  const inv = await createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC', amountCrypto: 1 }, deps());
  const seen = applyPayment(inv, 1, { confirmed: false, now: T0 });
  assert.equal(seen.status, INVOICE_STATES.PROCESSING);
  const done = applyPayment(seen, 1, { confirmed: true, now: T0 });
  assert.equal(done.status, INVOICE_STATES.SETTLED);
  assert.equal(done.paidAt, T0);
  assert.equal(done.overpaid, false);
});

test('applyPayment: within 1% tolerance counts as paid; overpayment flags', async () => {
  const inv = await createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC', amountCrypto: 1 }, deps());
  assert.equal(applyPayment(inv, 0.995, { confirmed: true, now: T0 }).status, INVOICE_STATES.SETTLED);
  const over = applyPayment(inv, 1.2, { confirmed: true, now: T0 });
  assert.equal(over.status, INVOICE_STATES.SETTLED);
  assert.equal(over.overpaid, true);
});

test('expiry: no payment past the window → expired; full payment still settles', async () => {
  const inv = await createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC', amountCrypto: 1, expirySec: 60 }, deps());
  const after = T0 + 61 * 1000;
  assert.ok(isExpired(inv, after));
  assert.equal(applyPayment(inv, 0, { now: after }).status, INVOICE_STATES.EXPIRED);
  assert.equal(applyPayment(inv, 1, { confirmed: true, now: after }).status, INVOICE_STATES.SETTLED);
  // sweep helper
  assert.equal(expireIfDue(inv, after).status, INVOICE_STATES.EXPIRED);
  assert.equal(expireIfDue(inv, T0).status, INVOICE_STATES.NEW);
});

test('terminal states are immutable', async () => {
  const inv = await createInvoice({ merchantId: 'm', chain: 'btc', symbol: 'BTC', amountCrypto: 1 }, deps());
  const settled = applyPayment(inv, 1, { confirmed: true, now: T0 });
  const again = applyPayment(settled, 2, { confirmed: true, now: T0 });
  assert.equal(again.status, INVOICE_STATES.SETTLED); // unchanged
});

test('ledger: a settled invoice produces balanced double-entry + a merchant balance', async () => {
  const inv = await createInvoice({ merchantId: 'm1', chain: 'btc', symbol: 'BTC', amountCrypto: 0.5 }, deps());
  const settled = applyPayment(inv, 0.5, { confirmed: true, now: T0 });
  const entries = settlementEntries(settled);
  assert.equal(entries.length, 2);
  assert.ok(isBalanced(entries), 'debits must equal credits');
  assert.equal(balance(entries, 'm1', 'BTC'), 0.5);
});
