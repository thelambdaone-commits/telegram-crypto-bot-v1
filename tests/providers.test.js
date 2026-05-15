import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { LitecoinChain } from '../src/providers/litecoin.js';
import { BitcoinCashChain } from '../src/providers/bitcoincash.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('Litecoin provider falls back from dead mempool litecoin endpoint to litecoinspace', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);

    if (url.includes('mempool.space')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    return {
      ok: true,
      json: async () => ({
        chain_stats: {
          funded_txo_sum: 576538944976992,
          spent_txo_sum: 356038036807196,
        },
      }),
    };
  };

  const provider = new LitecoinChain('https://mempool.space/api/litecoin');
  const balance = await provider.getBalance('ltc1qr07zu594qf63xm7l7x6pu3a2v39m2z6hh5pp4t');

  assert.equal(balance.symbol, 'LTC');
  assert.equal(balance.balance, 2205009.08169796);
  assert.equal(balance.balanceSats, '220500908169796');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^https:\/\/litecoinspace\.org\/api\/address\//);
});

test('Bitcoin Cash provider validates prefixless cashaddr and reads Bitcore balance', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(
      url,
      'https://api.bitcore.io/api/BCH/mainnet/address/qrmfkegyf83zh5kauzwgygf82sdahd5a55x9wse7ve/balance'
    );

    return {
      ok: true,
      json: async () => ({
        confirmed: 53847710594513,
        unconfirmed: 0,
        balance: 53847710594513,
      }),
    };
  };

  const provider = new BitcoinCashChain();
  const address = 'qrmfkegyf83zh5kauzwgygf82sdahd5a55x9wse7ve';

  assert.equal(provider.validateAddress(address), true);
  assert.equal(provider.cashAddrToLegacy(address), '1PUwPCNqKiC6La8wtbJEAhnBvtc8gdw19h');

  const balance = await provider.getBalance(address);
  assert.equal(balance.symbol, 'BCH');
  assert.equal(balance.balance, '538477.10594513');
  assert.equal(balance.balanceSats, '53847710594513');
});
