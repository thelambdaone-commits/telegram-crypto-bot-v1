/**
 * PaymentService (Phase 1) — create + watch invoices. Storage, walletService and
 * bot are in-memory mocks; no network, no funds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { INVOICE_STATES } from '../src/modules/payments/invoice.service.js';

function harness({ balance = 0, wallets, lnConfigured = false, sweep, nodeBalanceSat = 0, sendFails = false } = {}) {
  const store = new Map(); // chatId -> invoices[]
  const lnBalances = new Map();
  const payouts = [];
  const notes = [];
  let bal = balance;
  let settings = {};
  const ln = { paid: false, receivedSat: 0 };
  const storage = {
    getWallets: async () => wallets ?? [{ id: 'eth-1', chain: 'eth', address: '0xMerchant', isCorrupted: false }],
    getInvoices: async (id) => store.get(id) || [],
    addInvoice: async (id, inv) => { store.set(id, [...(store.get(id) || []), inv]); return inv.id; },
    addInvoiceExclusive: async (id, inv, { chain, symbol, openStatuses }) => {
      const list = store.get(id) || [];
      if (list.some((i) => i.chain === chain && i.symbol === symbol && openStatuses.includes(i.status))) return false;
      store.set(id, [...list, inv]); return true;
    },
    updateInvoice: async (id, inv) => {
      const l = store.get(id) || []; const i = l.findIndex((x) => x.id === inv.id);
      if (i === -1) return false; l[i] = inv; store.set(id, l); return true;
    },
    getAllUsers: async () => [...store.keys()].map((chatId) => ({ chatId })),
    creditLnBalance: async (id, sat) => { const v = (lnBalances.get(id) || 0) + Math.round(sat); lnBalances.set(id, v); return v; },
    getLnBalance: async (id) => lnBalances.get(id) || 0,
    addPayout: async (p) => { payouts.push(p); return p.id; },
    getPayouts: async () => payouts,
    updatePayout: async (p) => { const i = payouts.findIndex((x) => x.id === p.id); if (i === -1) return false; payouts[i] = p; return true; },
    updateSettings: async (_id, s) => { settings = { ...settings, ...s }; },
    loadUserData: async () => ({ settings }),
  };
  let balanceThrows = false;
  const walletService = { getBalance: async () => { if (balanceThrows) throw new Error('RPC down'); return { balance: String(bal) }; } };
  const bot = { telegram: { sendMessage: async (id, text) => notes.push({ id, text }) } };
  const lightning = {
    isConfigured: () => lnConfigured,
    createInvoice: async ({ amountSat, externalId }) => ({ bolt11: `lnbc${amountSat}`, paymentHash: `ph-${externalId}`, amountSat }),
    lookupIncoming: async () => (ln.paid ? { isPaid: true, receivedSat: ln.receivedSat } : { isPaid: false, receivedSat: 0 }),
    getBalance: async () => ({ balanceSat: nodeBalanceSat, feeCreditSat: 0 }),
    sendToAddress: async ({ amountSat }) => { if (sendFails) throw new Error('node offline'); return { txid: `tx-${amountSat}` }; },
  };
  const svc = new PaymentService(storage, walletService, bot, { lightning, sweep, adminId: 999 });
  return { svc, store, notes, ln, lnBalances, payouts, setBalance: (v) => { bal = v; }, setThrow: (v) => { balanceThrows = v; } };
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

test('invoicing supports tokens (USDT) — native vs token resolved via _tokenSymbol', async () => {
  const h = harness({ balance: 0 });
  assert.equal(h.svc._tokenSymbol('eth', 'ETH'), null); // native → no token symbol
  assert.equal(h.svc._tokenSymbol('eth', 'USDT'), 'USDT'); // token → its symbol
  const inv = await h.svc.createInvoice(1, 'eth', 'USDT', { amountCrypto: 10 });
  assert.equal(inv.symbol, 'USDT');
  assert.equal(inv.chain, 'eth');
  assert.equal(inv.address, '0xMerchant'); // received at the same wallet address
});

test('createLightningInvoice requires the LN backend to be configured', async () => {
  const off = harness({ lnConfigured: false });
  await assert.rejects(() => off.svc.createLightningInvoice(1, { amountCrypto: 0.001 }), /non configuré/i);
  assert.equal(off.svc.lightningEnabled(), false);
});

test('createLightningInvoice mints a BOLT11 (sats) and stores the payment hash', async () => {
  const h = harness({ lnConfigured: true });
  const inv = await h.svc.createLightningInvoice(1, { amountCrypto: 0.0005 }); // 50_000 sats
  assert.equal(inv.chain, 'lightning');
  assert.equal(inv.amountSat, 50000);
  assert.equal(inv.bolt11, 'lnbc50000');
  assert.equal(inv.address, 'lnbc50000');
  assert.match(inv.paymentHash, /^ph-inv-/);
});

test('lightning invoice settles instantly when the node reports it paid', async () => {
  const h = harness({ lnConfigured: true });
  const inv = await h.svc.createLightningInvoice(1, { amountCrypto: 0.0005 });
  let cur = await h.svc.checkInvoice(inv); // not paid yet
  assert.equal(cur.status, INVOICE_STATES.NEW);
  h.ln.paid = true; h.ln.receivedSat = 50000;
  cur = await h.svc.checkInvoice(cur);
  assert.equal(cur.status, INVOICE_STATES.SETTLED);
  assert.equal(h.notes.length, 1);
});

test('only one open Lightning invoice at a time', async () => {
  const h = harness({ lnConfigured: true });
  await h.svc.createLightningInvoice(1, { amountCrypto: 0.0005 });
  await assert.rejects(() => h.svc.createLightningInvoice(1, { amountCrypto: 0.001 }), /déjà ouverte/);
});

test('settling a Lightning invoice credits the merchant internal balance', async () => {
  const h = harness({ lnConfigured: true });
  const inv = await h.svc.createLightningInvoice(1, { amountCrypto: 0.0005 }); // 50_000 sats
  h.ln.paid = true; h.ln.receivedSat = 50000;
  await h.svc.checkInvoice(inv);
  assert.equal(await h.svc.storage.getLnBalance(1), 50000); // accounting credited
  assert.match(h.notes.at(-1).text, /Solde Lightning/);
});

const SWEEP = { address: 'bc1qcold', thresholdSat: 500_000, intervalMs: 1 };

test('sweep is a no-op below the threshold', async () => {
  const h = harness({ lnConfigured: true, sweep: SWEEP, nodeBalanceSat: 200_000 });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, false);
  assert.equal(r.reason, 'below-threshold');
  assert.equal(h.payouts.length, 0);
});

test('sweep moves node funds to the cold address above the threshold + records a payout', async () => {
  const h = harness({ lnConfigured: true, sweep: SWEEP, nodeBalanceSat: 750_000 });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, true);
  assert.equal(h.payouts.length, 1);
  assert.equal(h.payouts[0].status, 'withdrawn');
  assert.equal(h.payouts[0].amountSat, 750_000);
  assert.equal(h.payouts[0].txid, 'tx-750000');
  assert.match(h.notes.at(-1).text, /Trésorerie balayée/);
});

test('a failed payout is recorded as failed; funds stay in the node (no loss)', async () => {
  const h = harness({ lnConfigured: true, sweep: SWEEP, nodeBalanceSat: 750_000, sendFails: true });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, false);
  assert.equal(r.reason, 'payout-failed');
  assert.equal(h.payouts[0].status, 'failed'); // audit trail; retried next cycle from real balance
});

test('sweep stays disabled without a cold address AND no operator BTC wallet', async () => {
  const h = harness({ lnConfigured: true, sweep: { address: '', thresholdSat: 1, intervalMs: 1 }, nodeBalanceSat: 9_999_999, wallets: [{ id: 'eth-1', chain: 'eth', address: '0xMerchant', isCorrupted: false }] });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, false);
  assert.equal(r.reason, 'disabled');
});

test('sweep falls back to the operator own BTC wallet when no cold address is set', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: '', thresholdSat: 500_000, intervalMs: 1 },
    nodeBalanceSat: 750_000,
    wallets: [{ id: 'btc-1', chain: 'btc', address: 'bc1qmywallet', label: 'BTC Wallet 1', isCorrupted: false }],
  });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, true);
  assert.equal(h.payouts[0].address, 'bc1qmywallet'); // /gen btc address used automatically
  const st = await h.svc.treasuryStatus();
  assert.equal(st.address, 'bc1qmywallet'); // admin UI reflects the resolved destination
  assert.equal(st.addressLabel, 'BTC Wallet 1'); // …and names WHICH wallet it is
});

test('an explicit cold address wins over the operator BTC wallet', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: 'bc1qcold', thresholdSat: 500_000, intervalMs: 1 },
    nodeBalanceSat: 750_000,
    wallets: [{ id: 'btc-1', chain: 'btc', address: 'bc1qhot', isCorrupted: false }],
  });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, true);
  assert.equal(h.payouts[0].address, 'bc1qcold'); // cold storage preserved
});

test('sweep honors the admin-chosen BTC wallet over the first one', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: '', thresholdSat: 500_000, intervalMs: 1 },
    nodeBalanceSat: 750_000,
    wallets: [
      { id: 'btc-1', chain: 'btc', address: 'bc1qfirst', label: 'BTC Wallet 1', isCorrupted: false },
      { id: 'btc-2', chain: 'btc', address: 'bc1qsecond', label: 'BTC Wallet 2', isCorrupted: false },
    ],
  });
  await h.svc.setSweepWallet('btc-2'); // operator picks the 2nd wallet in /treasury
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, true);
  assert.equal(h.payouts[0].address, 'bc1qsecond');
  const st = await h.svc.treasuryStatus();
  assert.equal(st.addressLabel, 'BTC Wallet 2');
});

test('sweepDestination returns the resolved wallet + label (shown on LN invoices)', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: '', thresholdSat: 1, intervalMs: 1 },
    wallets: [
      { id: 'btc-1', chain: 'btc', address: 'bc1qfirst', label: 'BTC Wallet 1', isCorrupted: false },
      { id: 'btc-2', chain: 'btc', address: 'bc1qsecond', label: 'BTC Wallet 2', isCorrupted: false },
    ],
  });
  assert.deepEqual(await h.svc.sweepDestination(), { address: 'bc1qfirst', label: 'BTC Wallet 1' });
  await h.svc.setSweepWallet('btc-2');
  assert.deepEqual(await h.svc.sweepDestination(), { address: 'bc1qsecond', label: 'BTC Wallet 2' });
});

test('sweepDestination labels a forced cold address and is null without any wallet', async () => {
  const cold = harness({ lnConfigured: true, sweep: { address: 'bc1qcold', thresholdSat: 1, intervalMs: 1 }, wallets: [] });
  assert.deepEqual(await cold.svc.sweepDestination(), { address: 'bc1qcold', label: 'Adresse externe (cold)' });
  const none = harness({ lnConfigured: true, sweep: { address: '', thresholdSat: 1, intervalMs: 1 }, wallets: [] });
  assert.equal(await none.svc.sweepDestination(), null);
});

test('sweepWalletOptions flags the active wallet (first by default)', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: '', thresholdSat: 1, intervalMs: 1 },
    nodeBalanceSat: 1,
    wallets: [
      { id: 'btc-1', chain: 'btc', address: 'bc1qfirst', label: 'BTC Wallet 1', isCorrupted: false },
      { id: 'btc-2', chain: 'btc', address: 'bc1qsecond', label: 'BTC Wallet 2', isCorrupted: false },
    ],
  });
  let opts = await h.svc.sweepWalletOptions();
  assert.equal(opts.coldForced, false);
  assert.deepEqual(opts.wallets.map((w) => w.active), [true, false]); // first active by default
  await h.svc.setSweepWallet('btc-2');
  opts = await h.svc.sweepWalletOptions();
  assert.deepEqual(opts.wallets.map((w) => w.active), [false, true]);
});

test('setSweepWallet rejects an unknown wallet and refuses when a cold address is forced', async () => {
  const free = harness({ lnConfigured: true, sweep: { address: '', thresholdSat: 1, intervalMs: 1 }, wallets: [{ id: 'btc-1', chain: 'btc', address: 'bc1qfirst', isCorrupted: false }] });
  await assert.rejects(() => free.svc.setSweepWallet('btc-nope'), /introuvable/);
  const forced = harness({ lnConfigured: true, sweep: { address: 'bc1qcold', thresholdSat: 1, intervalMs: 1 }, wallets: [{ id: 'btc-1', chain: 'btc', address: 'bc1qfirst', isCorrupted: false }] });
  await assert.rejects(() => forced.svc.setSweepWallet('btc-1'), /forcée/);
  assert.equal((await forced.svc.sweepWalletOptions()).coldForced, true);
});

test('start() launches the auto-sweep timer even without a cold address (dynamic destination)', () => {
  const h = harness({ lnConfigured: true, sweep: { address: '', thresholdSat: 1, intervalMs: 1000 } });
  h.svc.start();
  assert.ok(h.svc.sweepTimer, 'sweep timer must run so the periodic sweep fires once a wallet is picked');
  h.svc.stop();
  assert.equal(h.svc.sweepTimer, null);
});

test('a corrupted BTC wallet is skipped by the sweep fallback', async () => {
  const h = harness({
    lnConfigured: true,
    sweep: { address: '', thresholdSat: 500_000, intervalMs: 1 },
    nodeBalanceSat: 750_000,
    wallets: [{ id: 'btc-1', chain: 'btc', address: 'bc1qbad', isCorrupted: true }],
  });
  const r = await h.svc.sweepLightningBalance();
  assert.equal(r.swept, false);
  assert.equal(r.reason, 'disabled');
});

test('a failed balance read never expires a possibly-paid invoice (RPC-flake safe)', async () => {
  const h = harness({ balance: 0 });
  const inv = await h.svc.createInvoice(1, 'eth', 'ETH', { amountCrypto: 1, expirySec: 1 });
  h.setThrow(true); // RPC dies right at expiry
  const out = await h.svc.checkInvoice(inv, inv.expiresAt + 1000);
  assert.equal(out.status, INVOICE_STATES.NEW); // NOT expired on a failed read — retried next cycle
});

test('overlapping polls do not double-credit (re-entrancy guard)', async () => {
  const h = harness({ lnConfigured: true });
  const inv = await h.svc.createLightningInvoice(3, { amountCrypto: 0.0005 }); // 50_000 sats
  void inv;
  h.ln.paid = true; h.ln.receivedSat = 50000;
  await Promise.all([h.svc.pollOnce(), h.svc.pollOnce()]); // concurrent
  assert.equal(await h.svc.storage.getLnBalance(3), 50000); // credited once, not 100_000
});

test('concurrent sweeps do not double-spend (re-entrancy guard)', async () => {
  const h = harness({ lnConfigured: true, sweep: SWEEP, nodeBalanceSat: 750_000 });
  const [a, b] = await Promise.all([h.svc.sweepLightningBalance(), h.svc.sweepLightningBalance()]);
  assert.equal([a, b].filter((r) => r.swept).length, 1); // exactly one swept
  assert.equal([a, b].filter((r) => r.reason === 'busy').length, 1);
  assert.equal(h.payouts.length, 1);
});

test('treasuryStatus exposes node balance + payouts without leaking internals', async () => {
  const h = harness({ lnConfigured: true, sweep: SWEEP, nodeBalanceSat: 123_456 });
  const st = await h.svc.treasuryStatus();
  assert.equal(st.enabled, true);
  assert.equal(st.balanceSat, 123_456);
  assert.equal(st.thresholdSat, 500_000);
  assert.equal(st.address, 'bc1qcold');
  assert.ok(Array.isArray(st.payouts));
  assert.deepEqual(await harness({ lnConfigured: false }).svc.treasuryStatus(), { enabled: false });
});

test('pollOnce checks every merchant open invoice', async () => {
  const h = harness({ balance: 0 });
  await h.svc.createInvoice(7, 'eth', 'ETH', { amountCrypto: 1 });
  h.setBalance(1);
  await h.svc.pollOnce();
  const inv = (h.store.get(7) || [])[0];
  assert.equal(inv.status, INVOICE_STATES.SETTLED);
});
