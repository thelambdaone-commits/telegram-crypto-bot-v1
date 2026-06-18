/**
 * ExchangeService — no-KYC cross-chain quotes (Trocador). Aggregator mocked;
 * no network, no funds. Quote-only feature, so there is no execute path to test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeService, TROCADOR_COINS } from '../src/modules/swap/exchange.service.js';
import { TOKEN_CONFIGS } from '../src/core/tokens.config.js';

function mockAggregator(captured = {}, { configured = true } = {}) {
  return {
    hasApiKey: () => configured,
    getRate: async (args) => {
      captured.args = args;
      // 0.1 BTC → 21.5 XMR
      return { amountTo: 21.5, provider: 'GodexNow', tradeId: 't1', rateMode: 'flottant', raw: {} };
    },
  };
}

test('getQuote maps chains to Trocador ticker/network and returns a devis', async () => {
  const captured = {};
  const svc = new ExchangeService(mockAggregator(captured));
  const q = await svc.getQuote('btc', 'xmr', 0.1);

  assert.equal(captured.args.tickerFrom, TROCADOR_COINS.btc.ticker);
  assert.equal(captured.args.networkFrom, TROCADOR_COINS.btc.network);
  assert.equal(captured.args.tickerTo, TROCADOR_COINS.xmr.ticker);
  assert.equal(captured.args.networkTo, TROCADOR_COINS.xmr.network);
  assert.equal(captured.args.amountFrom, 0.1);

  assert.equal(q.fromSymbol, 'BTC');
  assert.equal(q.toSymbol, 'XMR');
  assert.equal(q.amountIn, 0.1);
  assert.equal(q.amountOut, 21.5);
  assert.equal(q.rate, 215); // 21.5 / 0.1
  assert.equal(q.provider, 'GodexNow');
});

test('getQuote accepts a comma decimal separator', async () => {
  const captured = {};
  const svc = new ExchangeService(mockAggregator(captured));
  const q = await svc.getQuote('eth', 'sol', '1,5');
  assert.equal(q.amountIn, 1.5);
  assert.equal(captured.args.amountFrom, 1.5);
});

test('getQuote rejects identical coins', async () => {
  const svc = new ExchangeService(mockAggregator());
  await assert.rejects(() => svc.getQuote('btc', 'btc', 1), /différentes/i);
});

test('getQuote rejects an unsupported chain', async () => {
  const svc = new ExchangeService(mockAggregator());
  await assert.rejects(() => svc.getQuote('btc', 'doge', 1), /non supporté/i);
});

test('getQuote rejects an invalid amount', async () => {
  const svc = new ExchangeService(mockAggregator());
  await assert.rejects(() => svc.getQuote('btc', 'xmr', 0), /Montant invalide/i);
  await assert.rejects(() => svc.getQuote('btc', 'xmr', 'abc'), /Montant invalide/i);
});

test('TON is quotable (ticker/network) without a wallet provider', async () => {
  const captured = {};
  const svc = new ExchangeService(mockAggregator(captured));
  assert.ok(svc.isSupported('ton'));
  assert.equal(TROCADOR_COINS.ton.ticker, 'ton');

  const q = await svc.getQuote('ton', 'xmr', 50);
  assert.equal(captured.args.tickerFrom, 'ton');
  assert.equal(captured.args.networkFrom, 'TON');
  assert.equal(q.fromSymbol, 'TON');

  const ton = svc.listChains().find((c) => c.chain === 'ton');
  assert.equal(ton.symbol, 'TON');
  assert.ok(ton.emoji, 'TON needs its own emoji (absent from CHAIN_REGISTRY)');
});

test('TON stablecoins are quotable as (ticker, network) jetton pairs', async () => {
  const svc = new ExchangeService(mockAggregator());
  assert.ok(svc.isSupported('usdt_ton'));
  assert.ok(svc.isSupported('usdc_ton'));
  assert.equal(TROCADOR_COINS.usdt_ton.ticker, 'usdt');
  assert.equal(TROCADOR_COINS.usdt_ton.network, 'TON');

  const captured = {};
  await new ExchangeService(mockAggregator(captured)).getQuote('usdt_ton', 'btc', 100);
  assert.equal(captured.args.tickerFrom, 'usdt');
  assert.equal(captured.args.networkFrom, 'TON');

  const list = svc.listChains();
  const usdt = list.find((c) => c.chain === 'usdt_ton');
  assert.equal(usdt.symbol, 'USDT');
  assert.ok(usdt.emoji && usdt.name);
});

test('wallet tokens are now covered: USDT quotable on many networks', async () => {
  const svc = new ExchangeService(mockAggregator());
  // Generated from TOKEN_CONFIGS + EXTRA_COINS — same ticker, distinct networks.
  for (const key of ['usdt_eth', 'usdt_trx', 'usdt_arb', 'usdt_sol', 'usdt_ton']) {
    assert.ok(svc.isSupported(key), `missing ${key}`);
    assert.equal(TROCADOR_COINS[key].ticker, 'usdt');
  }
  assert.notEqual(TROCADOR_COINS.usdt_eth.network, TROCADOR_COINS.usdt_trx.network);

  const captured = {};
  await new ExchangeService(mockAggregator(captured)).getQuote('usdt_eth', 'usdc_trx', 100);
  assert.equal(captured.args.tickerFrom, 'usdt');
  assert.equal(captured.args.networkFrom, 'ETH');
  assert.equal(captured.args.tickerTo, 'usdc');
  assert.equal(captured.args.networkTo, 'Mainnet'); // Tron label
});

test('every wallet token in TOKEN_CONFIGS has an exchange entry', () => {
  const svc = new ExchangeService(mockAggregator());
  const keys = new Set(svc.listChains().map((c) => c.chain));
  for (const [chain, cfg] of Object.entries(TOKEN_CONFIGS)) {
    for (const sym of Object.keys(cfg.tokens || {})) {
      assert.ok(keys.has(`${sym.toLowerCase()}_${chain}`), `uncovered: ${sym} on ${chain}`);
    }
  }
});

test('anonPayUrl builds a keyless AnonPay link with the right pair + address', () => {
  const svc = new ExchangeService(mockAggregator());
  const addr = '0xRecipient';
  const url = svc.anonPayUrl({ fromKey: 'btc', toKey: 'usdt_eth', address: addr });
  assert.ok(url.startsWith('https://trocador.app/anonpay/?'), url);
  const q = new URL(url).searchParams;
  assert.equal(q.get('ticker_from'), 'btc');
  assert.equal(q.get('network_from'), 'Mainnet');
  assert.equal(q.get('ticker_to'), 'usdt');
  assert.equal(q.get('network_to'), 'ETH');
  assert.equal(q.get('address'), addr);
});

test('anonPayUrl rejects identical coins and missing address', () => {
  const svc = new ExchangeService(mockAggregator());
  assert.throws(() => svc.anonPayUrl({ fromKey: 'btc', toKey: 'btc', address: 'x' }), /différentes/i);
  assert.throws(() => svc.anonPayUrl({ fromKey: 'btc', toKey: 'eth', address: '' }), /Adresse/i);
});

test('simpleSwapUrl builds a keyless fallback link (from/to base tickers)', () => {
  const svc = new ExchangeService(mockAggregator());
  const url = svc.simpleSwapUrl({ fromKey: 'btc', toKey: 'xmr' });
  assert.ok(url.startsWith('https://simpleswap.io/?'), url);
  const q = new URL(url).searchParams;
  assert.equal(q.get('from'), 'btc');
  assert.equal(q.get('to'), 'xmr');
});

test('walletChainFor maps a coin to its receiving wallet chain', () => {
  const svc = new ExchangeService(mockAggregator());
  assert.equal(svc.walletChainFor('eth'), 'eth');
  assert.equal(svc.walletChainFor('usdt_trx'), 'trx');
  assert.equal(svc.walletChainFor('usdt_ton'), 'ton');
  assert.equal(svc.walletChainFor('nope'), null);
});

test('listSymbols compacts coins into unique symbols, natives first', () => {
  const svc = new ExchangeService(mockAggregator());
  const syms = svc.listSymbols();
  const names = syms.map((s) => s.symbol);
  // Far fewer entries than the 48 coin keys.
  assert.ok(syms.length < Object.keys(TROCADOR_COINS).length / 2, `too many symbols: ${syms.length}`);
  // No duplicates; BTC sorts before the stablecoins/tokens.
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.indexOf('BTC') < names.indexOf('USDT'));
  assert.ok(names.indexOf('USDT') < names.indexOf('LINK'));
  // Single-network coin carries a direct key; multi-network does not.
  const btc = syms.find((s) => s.symbol === 'BTC');
  const usdt = syms.find((s) => s.symbol === 'USDT');
  assert.equal(btc.singleKey, 'btc');
  assert.equal(usdt.singleKey, null);
  assert.ok(usdt.count > 1);
});

test('coinsForSymbol returns the per-network coin keys with friendly chain names', () => {
  const svc = new ExchangeService(mockAggregator());
  const usdt = svc.coinsForSymbol('usdt');
  assert.ok(usdt.length > 1);
  assert.ok(usdt.every((c) => c.key && c.chainName && c.emoji));
  assert.ok(usdt.some((c) => c.key === 'usdt_ton' && c.chainName === 'TON'));
  assert.deepEqual(svc.coinsForSymbol('btc').map((c) => c.key), ['btc']);
  assert.equal(svc.symbolOf('usdt_eth'), 'USDT');
});

test('isConfigured reflects aggregator API key presence', () => {
  assert.equal(new ExchangeService(mockAggregator({}, { configured: true })).isConfigured(), true);
  assert.equal(new ExchangeService(mockAggregator({}, { configured: false })).isConfigured(), false);
});

test('listChains exposes a symbol for every supported coin', () => {
  const svc = new ExchangeService(mockAggregator());
  const chains = svc.listChains();
  assert.equal(chains.length, Object.keys(TROCADOR_COINS).length);
  for (const c of chains) {
    assert.ok(c.symbol, `missing symbol for ${c.chain}`);
    assert.ok(svc.isSupported(c.chain));
  }
});
