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
import { PRICE_GROUPS, PRICE_ALIASES } from '../src/shared/price.js';

const SHOWN_KEYS = new Set(PRICE_GROUPS.flatMap(([, coins]) => coins.map(([key]) => key)));

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

test('every priced coin is shown in the price list, or is a declared alias', () => {
  const hidden = Object.keys(COIN_IDS).filter((k) => !SHOWN_KEYS.has(k) && !PRICE_ALIASES.has(k));
  assert.deepEqual(hidden, [], `priced but not displayed (add to PRICE_GROUPS or PRICE_ALIASES): ${hidden.join(', ')}`);
});

test('each PRICE_ALIASES entry shares a CoinGecko id with a displayed coin', () => {
  const shownIds = new Set([...SHOWN_KEYS].map((k) => COIN_IDS[k]));
  for (const alias of PRICE_ALIASES) {
    assert.ok(shownIds.has(COIN_IDS[alias]), `alias ${alias} (${COIN_IDS[alias]}) has no displayed twin`);
  }
});
