import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSendAmount,
  setupWalletCommands,
} from '../src/bot/handlers/commands/wallet.commands.js';

// ─────────────────────────────────────────────────────────────────────────────
// computeSendAmount — pure resolution of the /send amount argument
// ─────────────────────────────────────────────────────────────────────────────

test('montant natif simple', () => {
  assert.deepEqual(computeSendAmount('0.1', { network: 'eth', balance: 1 }), {
    amount: 0.1,
    amountType: 'native',
    isMaxSend: false,
  });
});

test('virgule décimale acceptée', () => {
  assert.equal(computeSendAmount('0,25', { network: 'eth', balance: 1 }).amount, 0.25);
});

test('montant en euros → converti via priceEUR', () => {
  const r = computeSendAmount('25€', { network: 'eth', balance: 10, priceEUR: 2500 });
  assert.equal(r.amountType, 'eur');
  assert.ok(Math.abs(r.amount - 0.01) < 1e-9);
});

test('euros avec suffixe texte (eur/euros) accepté', () => {
  assert.equal(computeSendAmount('25 eur', { network: 'eth', balance: 10, priceEUR: 2500 }).amountType, 'eur');
  assert.equal(computeSendAmount('25 euros', { network: 'eth', balance: 10, priceEUR: 2500 }).amountType, 'eur');
});

test('euros sans prix disponible → no_price', () => {
  assert.deepEqual(computeSendAmount('25€', { network: 'eth', balance: 1, priceEUR: null }), {
    error: 'no_price',
  });
});

test('euros invalide (≤ 0) → invalid_eur', () => {
  assert.equal(computeSendAmount('0€', { network: 'eth', balance: 1, priceEUR: 2500 }).error, 'invalid_eur');
});

test('max SOL → sweep exact, isMaxSend=true', () => {
  const r = computeSendAmount('max', { network: 'sol', balance: 2, balanceLamports: '2000000000' });
  assert.equal(r.isMaxSend, true);
  assert.equal(r.amountType, 'native');
  assert.ok(Math.abs(r.amount - 1.999995) < 1e-9); // 2e9 − 5000 lamports
});

test('max EVM → balance − frais réservés, isMaxSend=false', () => {
  const r = computeSendAmount('MAX', { network: 'eth', balance: 1, estimatedFee: '0.001' });
  assert.equal(r.isMaxSend, false);
  assert.ok(Math.abs(r.amount - 0.999) < 1e-9);
});

test('max sans solde pour couvrir les frais → insufficient_fee', () => {
  assert.deepEqual(
    computeSendAmount('max', { network: 'eth', balance: 0.0005, estimatedFee: '0.001' }),
    { error: 'insufficient_fee' }
  );
});

test('montant non numérique / négatif → invalid_amount', () => {
  assert.equal(computeSendAmount('abc', { network: 'eth', balance: 1 }).error, 'invalid_amount');
  assert.equal(computeSendAmount('-1', { network: 'eth', balance: 1 }).error, 'invalid_amount');
  assert.equal(computeSendAmount('0', { network: 'eth', balance: 1 }).error, 'invalid_amount');
});

// ─────────────────────────────────────────────────────────────────────────────
// /validate command
// ─────────────────────────────────────────────────────────────────────────────

function captureCommands(walletService) {
  const cmds = {};
  const bot = {
    command: (name, handler) => {
      (Array.isArray(name) ? name : [name]).forEach((n) => (cmds[n] = handler));
      return bot;
    },
    action: () => bot,
    hears: () => bot,
    on: () => bot,
    use: () => bot,
    start: () => bot,
  };
  setupWalletCommands(bot, {}, walletService, {});
  return cmds;
}

function makeCtx(text) {
  const replies = [];
  const ctx = {
    chat: { id: 1 },
    message: { text },
    reply: (t) => {
      replies.push(t);
      return Promise.resolve();
    },
  };
  return { ctx, replies };
}

test('/validate: adresse valide → ✅', async () => {
  const cmds = captureCommands({ validateAddress: () => true });
  const { ctx, replies } = makeCtx('/validate eth 0x1234567890abcdef');
  await cmds.validate(ctx);
  assert.match(replies[0], /valide/i);
  assert.doesNotMatch(replies[0], /invalide/i);
});

test('/validate: adresse invalide → ❌', async () => {
  const cmds = captureCommands({ validateAddress: () => false });
  const { ctx, replies } = makeCtx('/validate btc not-an-address');
  await cmds.validate(ctx);
  assert.match(replies[0], /invalide/i);
});

test('/validate: validateAddress qui throw est traité comme invalide', async () => {
  const cmds = captureCommands({
    validateAddress: () => {
      throw new Error('boom');
    },
  });
  const { ctx, replies } = makeCtx('/validate eth 0xzzz');
  await cmds.validate(ctx);
  assert.match(replies[0], /invalide/i);
});

test('/validate: réseau non supporté', async () => {
  const cmds = captureCommands({ validateAddress: () => true });
  const { ctx, replies } = makeCtx('/validate doge addr');
  await cmds.validate(ctx);
  assert.match(replies[0], /non supporté/i);
});

test('/validate: sans arguments → aide', async () => {
  const cmds = captureCommands({ validateAddress: () => true });
  const { ctx, replies } = makeCtx('/validate');
  await cmds.validate(ctx);
  assert.match(replies[0], /Validation/i);
});

test('/validate et /check sont le même handler (alias)', () => {
  const cmds = captureCommands({ validateAddress: () => true });
  assert.equal(typeof cmds.validate, 'function');
  assert.equal(cmds.validate, cmds.check);
});

// ─────────────────────────────────────────────────────────────────────────────
// looksLikeTxHash — distingue un hash de transaction d'une adresse
// ─────────────────────────────────────────────────────────────────────────────
import { looksLikeTxHash } from '../src/bot/handlers/commands/wallet.commands.js';

test('SOL: signature 64 octets = hash, adresse 32 octets ≠ hash', () => {
  const sig = '3c6LpDEN3wQCUX8qLopfhCjq7Qw8VYFQP4mYQdhFwuSqfF1255ts7AwD9tQDM1HiQcmYjndpYCL81oqC4XuA64Hd';
  assert.equal(looksLikeTxHash('sol', sig), true);
  assert.equal(looksLikeTxHash('sol', '276LqiGMLnh3kkKG11111111111111111111111111'), false); // pas une signature
});

test('EVM: 0x+64 hex = hash, 0x+40 hex (adresse) ≠ hash', () => {
  assert.equal(looksLikeTxHash('eth', '0x' + 'a'.repeat(64)), true);
  assert.equal(looksLikeTxHash('eth', '0x' + 'a'.repeat(40)), false);
});

test('UTXO: txid 64 hex = hash', () => {
  assert.equal(looksLikeTxHash('btc', 'a'.repeat(64)), true);
  assert.equal(looksLikeTxHash('btc', 'bc1qxyz'), false);
});
