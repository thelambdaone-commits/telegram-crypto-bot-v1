import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeNative } from '../src/bot/handlers/commands/market.commands.js';

// Each case mirrors the *actual* shape returned by that provider's
// estimateFees() (one fee level), so the uniform /gas resolver is locked to
// reality. The expected value is the fee in the chain's NATIVE coin.

test('EVM: estimatedFee (ether) is taken as-is', () => {
  // evm-base.js: { estimatedFee: ethers.formatEther(...), estimatedFeeWei, gasLimit }
  assert.equal(feeNative({ estimatedFee: '0.0000042', estimatedFeeWei: '4200000000000' }), 0.0000042);
});

test('Bitcoin: estimatedFee (BTC) preferred over sats', () => {
  // bitcoin.js: { estimatedFee: '0.00000280', estimatedFeeSats: 280, satPerVbyte }
  assert.equal(feeNative({ estimatedFee: '0.00000280', estimatedFeeSats: 280, satPerVbyte: 2 }), 0.0000028);
});

test('Bitcoin Cash: estimatedFee (BCH)', () => {
  // bitcoincash.js: { estimatedFee: '0.00001', feeSats: 1000 }
  assert.equal(feeNative({ estimatedFee: '0.00001', feeSats: 1000 }), 0.00001);
});

test('TON: estimatedFee (TON)', () => {
  // ton.js: { fee: Number(toNano('0.012')), feeTON: '0.012', estimatedFee: '0.012' }
  assert.equal(feeNative({ fee: 12000000, feeTON: '0.012', estimatedFee: '0.012' }), 0.012);
});

test('Solana: feeSOL', () => {
  // solana.js: { fee: 6000, feeSOL: '0.000006', priorityFee: 1000 }
  assert.equal(feeNative({ fee: 6000, feeSOL: '0.000006', priorityFee: 1000 }), 0.000006);
});

test('Litecoin: feeSats → /1e8 (NOT the sats-valued `fee`)', () => {
  // litecoin.js: { fee: '140' (sats!), feeSats: '140' }
  assert.equal(feeNative({ fee: '140', feeSats: '140' }), 0.0000014);
});

test('Zcash: feeSats → /1e8', () => {
  // zcash.js: { fee: '0.00001000', feeSats: 1000 }
  assert.equal(feeNative({ fee: '0.00001000', feeSats: 1000 }), 0.00001);
});

test('Monero: feeAtomic → /1e12', () => {
  // monero.js: { fee: '0.000060000000', feeAtomic: 60000 }
  assert.equal(feeNative({ fee: '0.000060000000', feeAtomic: 60000 }), 6e-8);
});

test('Tron: native TRX in `fee`', () => {
  // tron.js: { fee: '1.10' }
  assert.equal(feeNative({ fee: '1.10' }), 1.1);
});

test('null / missing level → null', () => {
  assert.equal(feeNative(null), null);
  assert.equal(feeNative({}), null);
});
