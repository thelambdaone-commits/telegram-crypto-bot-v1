/**
 * Equivalence lock for the CHAIN_REGISTRY refactor: the maps derived from
 * CHAIN_REGISTRY must EXACTLY equal the historical hand-maintained values.
 * If this fails, the registry drifted — treat as a regression, not a flake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_EMOJIS,
  LOGO_SYMBOL,
  NETWORK_LABEL,
  SUPPORTED_CHAINS,
  EVM_CHAINS,
} from '../src/shared/chains.js';

const EXPECTED_EMOJIS = {
  eth: 'Ξ', btc: '₿', ltc: 'Ł', bch: '🅑', sol: '◎', arb: '🔵', matic: '⬡',
  op: '🔴', base: '🟦', avax: '🔺', trx: '🟥', xmr: 'ɱ', zec: 'Ⓩ', ton: '💎',
};

const EXPECTED_LOGO = {
  eth: 'eth', arb: 'eth', op: 'eth', base: 'eth', btc: 'btc', ltc: 'ltc',
  bch: 'bch', sol: 'sol', matic: 'matic', avax: 'avax', xmr: 'xmr', zec: 'zec', trx: 'trx', ton: 'ton',
};

const EXPECTED_LABEL = {
  eth: 'Ethereum', arb: 'Arbitrum', op: 'Optimism', base: 'Base', matic: 'Polygon',
  avax: 'Avalanche', btc: 'Bitcoin', ltc: 'Litecoin', bch: 'Bitcoin Cash', sol: 'Solana',
  xmr: 'Monero', zec: 'Zcash', trx: 'Tron', ton: 'TON',
};

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort());

test('CHAIN_EMOJIS derived map matches the historical values', () => {
  assert.deepEqual(sortKeys(CHAIN_EMOJIS), sortKeys(EXPECTED_EMOJIS));
});

test('LOGO_SYMBOL derived map matches the historical values', () => {
  assert.deepEqual(sortKeys(LOGO_SYMBOL), sortKeys(EXPECTED_LOGO));
});

test('NETWORK_LABEL derived map matches the historical values', () => {
  assert.deepEqual(sortKeys(NETWORK_LABEL), sortKeys(EXPECTED_LABEL));
});

test('SUPPORTED_CHAINS unchanged set; EVM_CHAINS are the 6 EVM chains', () => {
  assert.deepEqual(
    [...SUPPORTED_CHAINS].sort(),
    ['arb', 'avax', 'base', 'bch', 'btc', 'eth', 'ltc', 'matic', 'op', 'sol', 'ton', 'trx', 'xmr', 'zec']
  );
  assert.deepEqual([...EVM_CHAINS].sort(), ['arb', 'avax', 'base', 'eth', 'matic', 'op']);
});
