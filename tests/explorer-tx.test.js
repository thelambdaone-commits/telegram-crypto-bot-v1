import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTxExplorerUrl } from '../src/shared/explorer.js';
import { CHAIN_REGISTRY } from '../src/shared/chains.js';

const H = 'deadbeef';

test('getTxExplorerUrl couvre les 15 chaînes du registre', () => {
  for (const chain of Object.keys(CHAIN_REGISTRY)) {
    const url = getTxExplorerUrl(chain, H);
    assert.ok(url, `lien tx manquant pour ${chain}`);
    assert.ok(url.includes(H), `${chain}: le hash n'est pas dans l'URL`);
    assert.ok(url.startsWith('https://'), `${chain}: URL non https`);
  }
});

test('les chaînes auparavant cassées ont le bon explorateur (pas blockchain.com/btc)', () => {
  assert.match(getTxExplorerUrl('avax', H), /snowtrace\.io\/tx\//);
  assert.match(getTxExplorerUrl('bsc', H), /bscscan\.com\/tx\//);
  assert.match(getTxExplorerUrl('trx', H), /tronscan\.org\/#\/transaction\//);
});

test('chaîne inconnue → null (le caller gère le repli)', () => {
  assert.equal(getTxExplorerUrl('nope', H), null);
});
