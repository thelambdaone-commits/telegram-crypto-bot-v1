import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EthereumChain } from '../src/providers/ethereum.js';

test('EthereumChain validates addresses correctly', () => {
  const provider = new EthereumChain('https://eth.llamarpc.com');
  
  assert.equal(provider.validateAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'), true);
  assert.equal(provider.validateAddress('0xInvalidAddress'), false);
  assert.equal(provider.validateAddress('not-an-address'), false);
});

test('EthereumChain imports from key correctly', async () => {
  const provider = new EthereumChain('https://eth.llamarpc.com');
  const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const wallet = await provider.importFromKey(privateKey);
  
  assert.equal(wallet.address, '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c');
  assert.equal(wallet.privateKey.toLowerCase(), privateKey.toLowerCase());
});

test('EthereumChain imports from seed correctly', async () => {
  const provider = new EthereumChain('https://eth.llamarpc.com');
  const mnemonic = 'test test test test test test test test test test test junk';
  const wallet = await provider.importFromSeed(mnemonic);
  
  assert.equal(wallet.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(wallet.mnemonic, mnemonic);
});
