/**
 * TonChain — offline tests (no network): single-seed derivation determinism,
 * address format, key import, validation, fee shape. Network methods
 * (getBalance/sendTransaction/history) require a live RPC and are not covered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bip39 from 'bip39';
import { TonChain } from '../src/providers/ton.js';

const ton = new TonChain('https://toncenter.com/api/v2/jsonRPC', '');
const SEED = 'test test test test test test test test test test test junk';

test('importFromSeed derives a deterministic UQ address from a BIP39 seed', async () => {
  const a = await ton.importFromSeed(SEED);
  const b = await ton.importFromSeed(SEED);
  assert.equal(a.address, b.address, 'derivation must be deterministic');
  assert.match(a.address, /^[EU]Q[A-Za-z0-9_-]{46}$/, 'friendly TON address');
  assert.equal(a.mnemonic, SEED);
  assert.match(a.privateKey, /^[0-9a-f]{64}$/, 'stored key is the 32-byte ed25519 seed (hex)');
  assert.ok(ton.validateAddress(a.address));
});

test('importFromSeed rejects an invalid mnemonic', async () => {
  await assert.rejects(() => ton.importFromSeed('not a real seed phrase'), /Invalid seed/i);
});

test('createWallet yields a fresh, valid, self-consistent wallet', async () => {
  const w = await ton.createWallet();
  assert.ok(bip39.validateMnemonic(w.mnemonic), 'createWallet emits a valid BIP39 mnemonic');
  assert.ok(ton.validateAddress(w.address));
  // Re-deriving from the emitted mnemonic must reproduce the same address.
  const again = await ton.importFromSeed(w.mnemonic);
  assert.equal(again.address, w.address);
});

test('importFromKey accepts the stored hex seed and round-trips to the same address', async () => {
  const seeded = await ton.importFromSeed(SEED);
  const imported = await ton.importFromKey(seeded.privateKey);
  assert.equal(imported.address, seeded.address);
  assert.equal(imported.privateKey, seeded.privateKey);
});

test('importFromKey accepts a TON 24-word mnemonic', async () => {
  const words = Array(24).fill('abandon'); // 24 tokens → TON mnemonic path
  const res = await ton.importFromKey(words.join(' '));
  assert.ok(ton.validateAddress(res.address));
  assert.match(res.privateKey, /^[0-9a-f]{64}$/);
});

test('importFromKey rejects junk', async () => {
  await assert.rejects(() => ton.importFromKey('xyz'), /invalide/i);
});

test('validateAddress accepts UQ/EQ and rejects garbage', () => {
  assert.ok(ton.validateAddress('UQBouzAvVDVggDLOpH4GpFEyijOZnWmW5P5GDdmscYgau6zi'));
  assert.equal(ton.validateAddress('not_an_address'), false);
  assert.equal(ton.validateAddress(''), false);
  assert.equal(ton.validateAddress(null), false);
});

test('validateAddress rejects testnet-encoded addresses (mainnet bot)', async () => {
  const { address } = await ton.importFromSeed(SEED);
  const { Address } = await import('@ton/core');
  const testnet = Address.parse(address).toString({ bounceable: false, testOnly: true });
  assert.notEqual(testnet, address, 'testnet encoding should differ');
  assert.equal(ton.validateAddress(testnet), false, 'testnet address must be rejected');
  assert.ok(ton.validateAddress(address), 'mainnet still accepted');
});

test('sendTransaction guards amount/address before any network call, and small amounts do not throw', async () => {
  const t = new TonChain('https://example/api', '');
  const { privateKey, address } = await t.importFromSeed(SEED);

  // Stub the client so no real RPC is hit; track whether the network was touched.
  let broadcast = null;
  let seqnoCalls = 0;
  t.client = {
    open: () => ({ getSeqno: async () => { seqnoCalls += 1; return 0; } }),
    sendFile: async (boc) => { broadcast = boc; },
  };

  // Pre-flight guards must reject BEFORE touching the client.
  await assert.rejects(() => t.sendTransaction(privateKey, 'not_an_address', 1), /invalide/i);
  await assert.rejects(() => t.sendTransaction(privateKey, address, 0), /Montant/i);
  await assert.rejects(() => t.sendTransaction(privateKey, address, -5), /Montant/i);
  assert.equal(seqnoCalls, 0, 'no network call on a validation failure');

  // Tiny amount (1e-7) would be scientific-notation → toNano rejects without the
  // toFixed(9) guard. Must succeed and broadcast.
  const res = await t.sendTransaction(privateKey, address, 0.0000001);
  assert.equal(res.status, 'success');
  assert.equal(res.symbol, 'TON');
  assert.match(res.hash, /^[0-9a-f]+$/);
  assert.ok(broadcast, 'a BOC was broadcast');
  assert.equal(seqnoCalls, 1);
});

test('TonCenter throttle: keyless serialized (1100ms ≈0.9 RPS), keyed faster (120ms ≈8 RPS)', () => {
  assert.equal(new TonChain('https://x', '')._minGapMs, 1100, 'keyless under the 1 RPS limit');
  assert.equal(new TonChain('https://x', 'KEY')._minGapMs, 120, 'keyed under the 10 RPS free limit');
});

test('_retry retries a 429 then succeeds; does not retry a permanent error', async () => {
  const t = new TonChain('https://x', '');
  let calls = 0;
  const out = await t._retry(async () => {
    if (++calls < 2) throw Object.assign(new Error('429'), { response: { status: 429 } });
    return 'ok';
  }, 4, 1);
  assert.equal(out, 'ok');
  assert.equal(calls, 2);

  let bad = 0;
  await assert.rejects(() => t._retry(async () => { bad += 1; throw new Error('bad address'); }, 4, 1), /bad address/);
  assert.equal(bad, 1, 'permanent error is not retried');
});

test('_schedule preserves order and returns each result', async () => {
  const t = new TonChain('https://x', 'KEY');
  t._minGapMs = 0; // speed up the test
  const order = [];
  const out = await Promise.all([1, 2, 3].map((n) => t._schedule(async () => { order.push(n); return n; })));
  assert.deepEqual(out, [1, 2, 3]);
  assert.deepEqual(order, [1, 2, 3]);
});

test('estimateFees returns slow/average/fast with an estimatedFee buffer', async () => {
  const f = await ton.estimateFees();
  for (const level of ['slow', 'average', 'fast']) {
    assert.ok(f[level], `missing ${level}`);
    assert.ok(Number.parseFloat(f[level].estimatedFee) > 0, `${level}.estimatedFee must be > 0`);
  }
});
