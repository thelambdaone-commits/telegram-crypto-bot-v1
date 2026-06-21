/**
 * Shared unit tests for the EVM providers (Polygon, Arbitrum, Optimism, Base,
 * Avalanche). They all extend EvmBaseProvider, so address validation, key/seed
 * import and native-balance parsing are mutualised here in one table-driven run.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

import { PolygonChain } from '../src/providers/polygon.js';
import { ArbitrumChain } from '../src/providers/arbitrum.js';
import { OptimismChain } from '../src/providers/optimism.js';
import { BaseChain } from '../src/providers/base.js';
import { AvalancheChain } from '../src/providers/avalanche.js';

// Hardhat account #0 — a stable, well-known secp256k1 test vector.
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const TEST_PRIVKEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const PROVIDERS = [
  { name: 'Polygon', symbol: 'MATIC', nativeSymbol: 'MATIC', make: () => new PolygonChain() },
  { name: 'Arbitrum', symbol: 'ARB', nativeSymbol: 'ETH', make: () => new ArbitrumChain() },
  { name: 'Optimism', symbol: 'OP', nativeSymbol: 'ETH', make: () => new OptimismChain() },
  { name: 'Base', symbol: 'BASE', nativeSymbol: 'ETH', make: () => new BaseChain() },
  { name: 'Avalanche', symbol: 'AVAX', nativeSymbol: 'AVAX', make: () => new AvalancheChain() },
];

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

for (const def of PROVIDERS) {
  test(`${def.name}: constructor sets name/symbol/nativeSymbol`, () => {
    const p = def.make();
    assert.equal(p.name, def.name);
    assert.equal(p.symbol, def.symbol);
    assert.equal(p.nativeSymbol, def.nativeSymbol);
  });

  test(`${def.name}: validateAddress accepts valid and rejects invalid`, () => {
    const p = def.make();
    assert.equal(p.validateAddress(TEST_ADDRESS), true);
    assert.equal(p.validateAddress('0x' + 'a'.repeat(40)), true);
    assert.equal(p.validateAddress('not-an-address'), false);
    assert.equal(p.validateAddress('0x123'), false);
    assert.equal(p.validateAddress(''), false);
  });

  test(`${def.name}: createWallet yields a self-consistent wallet`, async () => {
    const p = def.make();
    const w = await p.createWallet();
    assert.ok(p.validateAddress(w.address), 'address must validate');
    assert.match(w.privateKey, /^0x[0-9a-fA-F]{64}$/);
    assert.equal(typeof w.mnemonic, 'string');
    // Re-importing the private key must reproduce the same address.
    const reimported = await p.importFromKey(w.privateKey);
    assert.equal(reimported.address, w.address);
  });

  test(`${def.name}: importFromSeed is deterministic (BIP-44 m/44'/60'/0'/0/0)`, async () => {
    const p = def.make();
    const w = await p.importFromSeed(TEST_MNEMONIC);
    assert.equal(w.address, TEST_ADDRESS);
    assert.equal(w.mnemonic, TEST_MNEMONIC);
  });

  test(`${def.name}: importFromKey derives the matching address`, async () => {
    const p = def.make();
    const w = await p.importFromKey(TEST_PRIVKEY);
    assert.equal(w.address, TEST_ADDRESS);
    assert.equal(w.mnemonic, null);
  });

  test(`${def.name}: getBalance parses native balance from a mocked RPC`, async () => {
    const p = def.make();
    // 2 ETH/MATIC/AVAX in wei.
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x1bc16d674ec80000' }),
    });
    const bal = await p.getBalance(TEST_ADDRESS);
    assert.equal(bal.balance, '2.0');
    assert.equal(bal.symbol, def.nativeSymbol);
    assert.equal(bal.isToken, false);
    assert.equal(ethers.formatEther(bal.balanceWei), '2.0');
  });
}

// Fee estimation: a stub provider lets us drive estimateFees over both gas
// models without a live RPC. Picks Polygon as a representative EVM chain.
const stubFeeData = (feeData) => {
  const p = new PolygonChain();
  p.getProvider = () => ({ getFeeData: async () => feeData });
  return p;
};

test('estimateFees: EIP-1559 chain uses max/priority and emits a 1559 override', async () => {
  const p = stubFeeData({
    maxFeePerGas: ethers.parseUnits('100', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
    gasPrice: ethers.parseUnits('90', 'gwei'),
  });
  const fees = await p.estimateFees(TEST_ADDRESS, TEST_ADDRESS, 1);
  assert.equal(fees.average.legacy, false);
  assert.equal(fees.average.maxFeePerGas, ethers.parseUnits('100', 'gwei').toString());
  assert.equal(fees.average.maxPriorityFeePerGas, ethers.parseUnits('2', 'gwei').toString());
  const ov = p._gasOverrides(fees.average);
  assert.ok('maxFeePerGas' in ov && 'maxPriorityFeePerGas' in ov);
  assert.ok(!('gasPrice' in ov));
});

test('estimateFees: legacy chain (BSC-style null 1559) falls back to gasPrice — no throw', async () => {
  const p = stubFeeData({
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    gasPrice: ethers.parseUnits('5', 'gwei'),
  });
  const fees = await p.estimateFees(TEST_ADDRESS, TEST_ADDRESS, 1);
  assert.equal(fees.average.legacy, true);
  assert.equal(fees.average.maxFeePerGas, ethers.parseUnits('5', 'gwei').toString());
  assert.equal(fees.average.maxPriorityFeePerGas, '0'); // legacy → no tip
  // slow tier scales the gasPrice down to 80%.
  assert.equal(fees.slow.maxFeePerGas, ethers.parseUnits('4', 'gwei').toString());
  const ov = p._gasOverrides(fees.average);
  assert.deepEqual(ov, { gasPrice: ethers.parseUnits('5', 'gwei') });
});

test('estimateFees: throws cleanly when the RPC returns no usable fee data', async () => {
  const p = stubFeeData({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: null });
  await assert.rejects(() => p.estimateFees(TEST_ADDRESS, TEST_ADDRESS, 1), /frais/i);
});
