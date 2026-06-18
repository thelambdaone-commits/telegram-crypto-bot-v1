/**
 * Price coverage: every coin/token the bot supports must have a CoinGecko id in
 * COIN_IDS, otherwise getPricesEUR() (which now derives its map from COIN_IDS)
 * silently shows no EUR value for it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COIN_IDS } from '../src/shared/coingecko.js';
import { CHAIN_REGISTRY } from '../src/shared/chains.js';
import { TOKEN_CONFIGS } from '../src/core/tokens.config.js';

test('every native coin has a CoinGecko id', () => {
  const missing = [];
  for (const m of Object.values(CHAIN_REGISTRY)) {
    if (!COIN_IDS[m.native.toLowerCase()]) missing.push(m.native);
  }
  assert.deepEqual(missing, [], `natives without a price id: ${missing.join(', ')}`);
});

test('every wallet token has a CoinGecko id', () => {
  const missing = [];
  for (const cfg of Object.values(TOKEN_CONFIGS)) {
    for (const sym of Object.keys(cfg.tokens || {})) {
      if (!COIN_IDS[sym.toLowerCase()]) missing.push(sym);
    }
  }
  assert.deepEqual([...new Set(missing)], [], `tokens without a price id: ${missing.join(', ')}`);
});

test('TON specifically is priced (new chain)', () => {
  assert.equal(COIN_IDS.ton, 'the-open-network');
});
