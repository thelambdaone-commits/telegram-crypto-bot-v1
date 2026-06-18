import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAddress } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_CONFIGS,
  getTokenLabel,
  getAssetNetworks,
  getDepositAssets,
} from '../src/core/tokens.config.js';

/**
 * SECURITY LOCK — a wrong token address means permanent loss of user funds.
 * This is the canonical, officially-verified address set. Any change to
 * src/core/tokens.config.js that touches an address MUST be mirrored here
 * after re-verifying from the official source (Circle / Tether / explorer).
 * If this test fails, treat it as a production blocker, not a flaky test.
 */
const EXPECTED = {
  eth: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
    UNI: { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
  },
  arb: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    ARB: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  },
  op: {
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    OP: { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
    WBTC: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  },
  matic: {
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    WBTC: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
    DAI: { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
  },
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  },
  avax: {
    USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
    USDT: { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
    WBTC: { address: '0x50b7545627a5162F82A992c33b87aDc75187B218', decimals: 8 },
    DAI: { address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', decimals: 18 },
  },
  sol: {
    USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
    USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  },
  trx: {
    USDT: { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    USDC: { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
  },
};

// Chains whose `address` field is an EIP-55 EVM address (excludes Tron, whose
// token addresses are Tron base58, not EVM).
const EVM_CHAINS = new Set(['eth', 'arb', 'op', 'matic', 'base', 'avax']);

test('token addresses match the locked, officially-verified set', () => {
  for (const [chain, tokens] of Object.entries(EXPECTED)) {
    for (const [symbol, expected] of Object.entries(tokens)) {
      const actual = TOKEN_CONFIGS[chain]?.tokens?.[symbol];
      assert.ok(actual, `${chain}.${symbol} missing from TOKEN_CONFIGS`);
      const key = expected.address ? 'address' : 'mint';
      assert.equal(
        actual[key],
        expected[key],
        `${chain}.${symbol} ${key} drifted from the verified value`
      );
      assert.equal(actual.decimals, expected.decimals, `${chain}.${symbol} decimals drifted`);
    }
  }
});

test('every EVM token address is a valid EIP-55 checksummed address', () => {
  for (const [chain, cfg] of Object.entries(TOKEN_CONFIGS)) {
    if (!EVM_CHAINS.has(chain)) continue;
    for (const [symbol, token] of Object.entries(cfg.tokens)) {
      if (!token.address) continue;
      // getAddress throws on invalid checksum / malformed address.
      const checksummed = getAddress(token.address);
      assert.equal(
        token.address,
        checksummed,
        `${chain}.${symbol} is not EIP-55 checksummed (expected ${checksummed})`
      );
    }
  }
});

test('every Solana mint is a valid base58 public key', () => {
  for (const [symbol, token] of Object.entries(TOKEN_CONFIGS.sol.tokens)) {
    assert.doesNotThrow(
      () => new PublicKey(token.mint),
      `sol.${symbol} mint is not a valid public key`
    );
  }
});

test('no two tokens on the same chain share an address (catches copy/paste errors)', () => {
  for (const [chain, cfg] of Object.entries(TOKEN_CONFIGS)) {
    const seen = new Map();
    for (const [symbol, token] of Object.entries(cfg.tokens)) {
      const id = (token.address || token.mint || '').toLowerCase();
      if (!id) continue;
      assert.ok(
        !seen.has(id),
        `${chain}.${symbol} duplicates the address of ${chain}.${seen.get(id)}`
      );
      seen.set(id, symbol);
    }
  }
});

test('getTokenLabel renders an unambiguous network tag', () => {
  assert.equal(getTokenLabel('eth', 'USDT'), 'USDT (ERC-20)');
  assert.equal(getTokenLabel('base', 'USDC'), 'USDC (Base)');
  assert.equal(getTokenLabel('sol', 'USDT'), 'USDT (SPL)');
});

test('getDepositAssets lists majors first and de-dupes by symbol', () => {
  const assets = getDepositAssets();
  const symbols = assets.map((a) => a.symbol);
  // No duplicates.
  assert.equal(new Set(symbols).size, symbols.length);
  // Core assets present.
  for (const s of ['BTC', 'ETH', 'SOL', 'USDT', 'USDC']) {
    assert.ok(symbols.includes(s), `${s} missing from deposit assets`);
  }
  // Majors ordered first.
  assert.deepEqual(symbols.slice(0, 6), ['BTC', 'ETH', 'SOL', 'TRX', 'USDT', 'USDC']);
});

test('getAssetNetworks(USDT) covers every chain that defines USDT', () => {
  const chains = getAssetNetworks('USDT').map((n) => n.chain).sort();
  assert.deepEqual(chains, ['arb', 'avax', 'base', 'bsc', 'eth', 'matic', 'op', 'sol', 'trx'].sort());
  // None are native (USDT is always a token).
  assert.ok(getAssetNetworks('USDT').every((n) => !n.isNative));
});

test('getAssetNetworks(TRX) is a single native Tron network', () => {
  assert.deepEqual(getAssetNetworks('TRX'), [
    { chain: 'trx', chainName: 'Tron', standard: 'Tron', isNative: true, bridged: false, decimals: null },
  ]);
});

test('getAssetNetworks(ETH) returns native ETH chains only', () => {
  const nets = getAssetNetworks('ETH');
  assert.deepEqual(
    nets.map((n) => n.chain).sort(),
    ['arb', 'base', 'eth', 'op'].sort()
  );
  assert.ok(nets.every((n) => n.isNative));
});

test('getAssetNetworks(BTC) is a single native network', () => {
  assert.deepEqual(getAssetNetworks('BTC'), [
    { chain: 'btc', chainName: 'Bitcoin', standard: 'Bitcoin', isNative: true, bridged: false, decimals: null },
  ]);
});

test('Base USDT is flagged as bridged', () => {
  const baseUsdt = getAssetNetworks('USDT').find((n) => n.chain === 'base');
  assert.equal(baseUsdt.bridged, true);
});
