import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChain } from '../src/shared/address-detector.js';

test('detects prefixless Bitcoin Cash cashaddr before Solana', () => {
  assert.equal(detectChain('qrmfkegyf83zh5kauzwgygf82sdahd5a55x9wse7ve'), 'bch');
  assert.equal(detectChain('bitcoincash:qrmfkegyf83zh5kauzwgygf82sdahd5a55x9wse7ve'), 'bch');
});

test('detects common chain address formats', () => {
  assert.equal(detectChain('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'), 'eth');
  assert.equal(detectChain('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), 'btc');
  assert.equal(detectChain('ltc1qr07zu594qf63xm7l7x6pu3a2v39m2z6hh5pp4t'), 'ltc');
  assert.equal(detectChain('So11111111111111111111111111111111111111112'), 'sol');
});

test('rejects unsupported address input', () => {
  assert.equal(detectChain('not-an-address'), null);
  assert.equal(detectChain(''), null);
  assert.equal(detectChain(null), null);
});
