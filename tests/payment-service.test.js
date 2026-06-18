/**
 * PaymentService (Phase 1) — create + watch invoices. Storage, walletService and
 * bot are in-memory mocks; no network, no funds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { INVOICE_STATES } from '../src/modules/payments/invoice.service.js';

function harness({ balance = 0, wallets } = {}) {
  const store = new Map(); // chatId -> invoices[]
  const notes = [];
  let bal = balance;
  const storage = {
    getWallets: async () => wallets ?? [{ id: 'eth-1', chain: 'eth', address: '0xMerchant', isCorrupted: false }],
    getInvoices: async (id) => store.get(id) || [],
    addInvoice: async (id, inv) => { store.set(id, [...(store.get(id) || []), inv]); return inv.id; },
    updateInvoice: async (id, inv) => {
      const l = store.get(id) || []; const i = l.findIndex((x) => x.id === inv.id);
      if (i === -1) return false; l[i] = inv; store.set(id, l); return true;
    },
    getAllUsers: async () => [...store.keys()].map((chatId) => ({ chatId })),
  };
  const walletService = { getBalance: async () => ({ balance: String(bal) }) };
  const bot = { telegram: { sendMessage: async (id, text) => notes.push({ id, text }) } };
  const svc = new PaymentService(storage, walletService, bot);
  return { svc, store, notes, setBalance: (v) => { bal = v; } };
}

test('createInvoice attaches the merchant address + baseline and persists', async () => {
  const { svc, store } = harness({ balance: 5 }); // merchant already holds 5 ETH
  const inv = await svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 0.1 });
  assert.equal(inv.address, '0xMerchant');
  assert.equal(inv.walletId, 'eth-1');
  assert.equal(inv.baseline, 5);
  assert.equal(inv.status, INVOICE_STATES.NEW);
  assert.equal((store.get(1) || []).length, 1);
});

test('createInvoice rejects when the merchant has no wallet on that chain', async () => {
  const { svc } = harness({ wallets: [] });
  await assert.rejects(() => svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 1 }), /Aucun wallet/);
});

test('createInvoice rejects a second open invoice on the same chain/asset', async () => {
  const { svc } = harness({ balance: 0 });
  await svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 1 });
  await assert.rejects(() => svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 2 }), /déjà ouverte/);
});

test('checkInvoice settles on a balance delta ≥ amount and notifies the merchant', async () => {
  const h = harness({ balance: 5 });
  const inv = await h.svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 0.1 });
  // not paid yet
  let cur = await h.svc.checkInvoice(inv);
  assert.equal(cur.status, INVOICE_STATES.NEW);
  assert.equal(h.notes.length, 0);
  // customer pays 0.1 → balance 5 → 5.1
  h.setBalance(5.1);
  cur = await h.svc.checkInvoice(cur);
  assert.equal(cur.status, INVOICE_STATES.SETTLED);
  assert.equal(cur.receivedCrypto, 0.1 + 5 - 5); // ~0.1 within fp
  assert.equal(h.notes.length, 1);
  assert.match(h.notes[0].text, /Paiement reçu/);
});

test('checkInvoice marks underpayment as processing (no false settle)', async () => {
  const h = harness({ balance: 0 });
  const inv = await h.svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 1 });
  h.setBalance(0.4);
  const cur = await h.svc.checkInvoice(inv);
  assert.equal(cur.status, INVOICE_STATES.PROCESSING);
  assert.ok(Math.abs(cur.receivedCrypto - 0.4) < 1e-9);
  assert.equal(h.notes.length, 0);
});

test('pollOnce checks every merchant open invoice', async () => {
  const h = harness({ balance: 0 });
  await h.svc.createInvoice(7, 'eth', 'ETH', { amountCrypto: 1 });
  h.setBalance(1);
  await h.svc.pollOnce();
  const inv = (h.store.get(7) || [])[0];
  assert.equal(inv.status, INVOICE_STATES.SETTLED);
});
