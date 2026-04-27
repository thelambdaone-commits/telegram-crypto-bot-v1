import { ClobClient } from '@polymarket/clob-client';
import { webcrypto } from 'node:crypto';
import { createWalletWithPolyfill, validatePrivateKey } from './credentials.js';
import { config } from '../core/config.js';

const clients = new Map();

function ensureWebCrypto() {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }
}

function assertCredentials(privateKey, creds) {
  if (!validatePrivateKey(privateKey)) {
    throw new Error('Private key Polymarket invalide');
  }

  if (!creds?.apiKey || !creds?.apiSecret || !creds?.apiPassphrase) {
    throw new Error('Credentials API Polymarket incomplets');
  }
}

export function buildClobClient(chatId, privateKey, creds) {
  ensureWebCrypto();
  assertCredentials(privateKey, creds);

  const wallet = createWalletWithPolyfill(privateKey);
  const client = new ClobClient(config.polymarket.host, config.polymarket.chainId, wallet, {
    key: creds.apiKey,
    secret: creds.apiSecret,
    passphrase: creds.apiPassphrase,
  });
  clients.set(chatId, client);
  return client;
}

export async function deriveClobApiCredentials(privateKey) {
  ensureWebCrypto();
  if (!validatePrivateKey(privateKey)) {
    throw new Error('Private key Polymarket invalide');
  }

  const wallet = createWalletWithPolyfill(privateKey);
  const client = new ClobClient(config.polymarket.host, config.polymarket.chainId, wallet);
  const creds = await client.createOrDeriveApiKey();

  if (!creds?.key || !creds?.secret || !creds?.passphrase) {
    throw new Error('Credentials CLOB incomplets');
  }

  return {
    apiKey: creds.key,
    apiSecret: creds.secret,
    apiPassphrase: creds.passphrase,
  };
}

export async function getOrBuildClobClient(chatId, storage) {
  const creds = await storage.getPolymarketCredentials(chatId);
  if (!creds) return { client: null, creds: null };

  const existing = getClobClient(chatId);
  if (existing) return { client: existing, creds };

  const client = buildClobClient(chatId, creds.privateKey, creds);
  return { client, creds };
}

export function getClobClient(chatId) {
  return clients.get(chatId) || null;
}

export function removeClobClient(chatId) {
  clients.delete(chatId);
}

export async function getServerTime(chatId) {
  const client = getClobClient(chatId);
  if (!client) return null;
  try { return await client.getServerTime(); } catch { return null; }
}

export function hasClobClient(chatId) {
  return clients.has(chatId);
}

export async function reconnectClient(chatId, privateKey, creds) {
  removeClobClient(chatId);
  return buildClobClient(chatId, privateKey, creds);
}
