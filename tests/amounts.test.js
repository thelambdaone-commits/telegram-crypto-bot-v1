import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiToBaseUnits } from '../src/shared/amounts.js';

test('SOL: convertit en lamports (9 décimales)', () => {
  assert.equal(uiToBaseUnits('0.012111', 9), 12111000n);
  assert.equal(uiToBaseUnits('1', 9), 1_000_000_000n);
  assert.equal(uiToBaseUnits('0.000000001', 9), 1n); // 1 lamport
});

test('SPL: convertit en base units (6 décimales)', () => {
  assert.equal(uiToBaseUnits('0.012111', 6), 12111n);
  assert.equal(uiToBaseUnits('0.01551', 6), 15510n);
});

test('arrondit vers le bas (jamais vers le haut)', () => {
  // 0.0000000005 SOL = 0.5 lamport → 0, surtout pas 1 (cf. danger Math.round)
  assert.equal(uiToBaseUnits('0.0000000005', 9), 0n);
  // décimales excédentaires tronquées, pas arrondies
  assert.equal(uiToBaseUnits('0.0121119999', 6), 12111n);
});

test('poussière → 0n (le provider bloquera la transaction)', () => {
  assert.equal(uiToBaseUnits('0.0000001', 6), 0n);
  assert.equal(uiToBaseUnits('0.0000000009', 9), 0n);
});

test('accepte un Number, même en notation scientifique', () => {
  assert.equal(uiToBaseUnits(0.012111, 9), 12111000n);
  assert.equal(uiToBaseUnits(1e-7, 6), 0n); // String(1e-7) === "1e-7"
  assert.equal(uiToBaseUnits(1e-9, 9), 1n);
  assert.equal(uiToBaseUnits(2.5e-3, 9), 2_500_000n);
});

test('accepte la virgule décimale (saisie FR)', () => {
  assert.equal(uiToBaseUnits('0,012111', 9), 12111000n);
});

test('pas d\'erreur de flottant sur les valeurs piégeuses', () => {
  // 0.1 + 0.2 en float ≠ 0.3 ; ici on part de strings → exact
  assert.equal(uiToBaseUnits('0.3', 9), 300_000_000n);
  assert.equal(uiToBaseUnits('1.1', 6), 1_100_000n);
});

test('rejette les montants invalides ou négatifs', () => {
  assert.throws(() => uiToBaseUnits('-1', 9));
  assert.throws(() => uiToBaseUnits('abc', 9));
  assert.throws(() => uiToBaseUnits('1.2.3', 9));
  assert.throws(() => uiToBaseUnits('1', -1));
});
