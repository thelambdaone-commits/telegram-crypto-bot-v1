/**
 * SwapService Phase 1 — read-only quoting + gated executor. Aggregator is
 * mocked; no network, no funds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits } from 'ethers';
import { SwapService } from '../src/modules/swap/swap.service.js';
import { config } from '../src/core/config.js';

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI_ETH = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

function mockAggregator(captured) {
  return {
    isSwapSupported: () => true,
    getQuote: async (args) => {
      captured.args = args;
      // 100 USDC → 99.5 DAI (18 decimals)
      return { amountOut: parseUnits('99.5', 18).toString(), routeSummary: { r: 1 }, routerAddress: '0xRouter' };
    },
    buildSwapTx: async (args) => {
      captured.buildArgs = args;
      return { to: '0xRouter', data: '0xswapcalldata', value: '0', amountOut: parseUnits('99.5', 18).toString() };
    },
  };
}

// Provider + walletService mocks for executeSwap. allowance defaults to 0 so the
// approve branch fires for tokens.
function mockExecEnv(calls, { allowance = 0n, chain = 'eth' } = {}) {
  const provider = {
    getTokenAllowance: async () => allowance,
    approveSpender: async (...a) => {
      calls.approve = a;
      return { hash: '0xapprove', status: 'success' };
    },
    sendRaw: async (pk, tx) => {
      calls.sendRaw = { pk, tx };
      return { hash: '0xswap', status: 'success', from: '0xUser', to: tx.to };
    },
  };
  const walletService = {
    chains: { [chain]: provider },
    storage: {
      getWalletWithKey: async () => ({
        chain,
        address: '0xUser',
        privateKey: '0xpk',
        isCorrupted: false,
      }),
    },
  };
  return walletService;
}

test('getQuote resolves token addresses/decimals and parses amountOut', async () => {
  const captured = {};
  const svc = new SwapService(null, mockAggregator(captured));
  const q = await svc.getQuote('eth', 'USDC', 'DAI', 100);

  assert.equal(captured.args.tokenIn, USDC_ETH);
  assert.equal(captured.args.tokenOut, DAI_ETH);
  assert.equal(captured.args.amountInWei, '100000000'); // 100 * 10^6
  assert.equal(q.amountIn, 100);
  assert.equal(q.amountOut, 99.5);
  assert.equal(q.fromSymbol, 'USDC');
  assert.equal(q.toSymbol, 'DAI');
});

test('getQuote rejects non-EVM chains', async () => {
  const svc = new SwapService(null, mockAggregator({}));
  await assert.rejects(() => svc.getQuote('btc', 'BTC', 'USDC', 1), /EVM/i);
});

test('getQuote rejects identical assets', async () => {
  const svc = new SwapService(null, mockAggregator({}));
  await assert.rejects(() => svc.getQuote('eth', 'USDC', 'USDC', 100), /identiques/i);
});

test('getQuote rejects an invalid amount', async () => {
  const svc = new SwapService(null, mockAggregator({}));
  await assert.rejects(() => svc.getQuote('eth', 'USDC', 'DAI', 0), /Montant invalide/i);
});

test('executeSwap is hard-gated off by default', async () => {
  const svc = new SwapService(null, mockAggregator({}));
  await assert.rejects(() => svc.executeSwap(1, 'eth-1', 'USDC', 'DAI', 100), /désactivés|SWAP_ENABLED/i);
});

test('executeSwap (token): approves the router then sends the swap', async () => {
  const original = config.swapEnabled;
  config.swapEnabled = true;
  try {
    const calls = {};
    const svc = new SwapService(mockExecEnv(calls, { allowance: 0n }), mockAggregator({}));
    const res = await svc.executeSwap(1, 'eth-1', 'USDC', 'DAI', 100);
    assert.ok(calls.approve, 'low allowance must trigger approve');
    assert.equal(calls.sendRaw.tx.to, '0xRouter');
    assert.equal(calls.sendRaw.tx.data, '0xswapcalldata');
    assert.equal(res.hash, '0xswap');
    assert.equal(res.toSymbol, 'DAI');
  } finally {
    config.swapEnabled = original;
  }
});

test('executeSwap (native): skips approve, still sends', async () => {
  const original = config.swapEnabled;
  config.swapEnabled = true;
  try {
    const calls = {};
    const svc = new SwapService(mockExecEnv(calls), mockAggregator({}));
    await svc.executeSwap(1, 'eth-1', 'ETH', 'USDC', 0.5);
    assert.equal(calls.approve, undefined, 'native input must not approve');
    assert.ok(calls.sendRaw, 'swap tx still sent');
  } finally {
    config.swapEnabled = original;
  }
});

test('executeSwap (token, sufficient allowance): skips approve', async () => {
  const original = config.swapEnabled;
  config.swapEnabled = true;
  try {
    const calls = {};
    const svc = new SwapService(mockExecEnv(calls, { allowance: 10n ** 30n }), mockAggregator({}));
    await svc.executeSwap(1, 'eth-1', 'USDC', 'DAI', 100);
    assert.equal(calls.approve, undefined, 'sufficient allowance must not re-approve');
    assert.ok(calls.sendRaw);
  } finally {
    config.swapEnabled = original;
  }
});
