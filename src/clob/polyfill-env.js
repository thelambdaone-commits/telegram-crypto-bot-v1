import fs from 'fs/promises';
import path from 'path';
import { config } from '../core/config.js';
import { formatPrivateKey } from './credentials.js';

const EXPORT_KEYS = [
  'POLYMARKET_HOST',
  'POLYMARKET_CHAIN_ID',
  'POLYMARKET_PRIVATE_KEY',
  'POLYMARKET_API_KEY',
  'POLYMARKET_SECRET',
  'POLYMARKET_PASSPHRASE',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_API_PASSPHRASE',
];

function quoteEnvValue(value) {
  const stringValue = String(value ?? '');
  if (/^[A-Za-z0-9_./:+=@-]*$/.test(stringValue)) return stringValue;
  return JSON.stringify(stringValue);
}

function setEnvValue(content, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${separator}${line}\n`;
}

export async function exportPolymarketCredentialsToPolyfillEnv(creds, envPath = config.polymarket.polyfillEnvPath) {
  if (!creds?.privateKey || !creds?.apiKey || !creds?.apiSecret || !creds?.apiPassphrase) {
    throw new Error('Session Polymarket incomplete');
  }

  await fs.mkdir(path.dirname(envPath), { recursive: true });

  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    content = '# Polymarket API Credentials\n';
  }

  const values = {
    POLYMARKET_HOST: config.polymarket.host,
    POLYMARKET_CHAIN_ID: String(config.polymarket.chainId),
    POLYMARKET_PRIVATE_KEY: formatPrivateKey(creds.privateKey),
    POLYMARKET_API_KEY: creds.apiKey,
    POLYMARKET_SECRET: creds.apiSecret,
    POLYMARKET_PASSPHRASE: creds.apiPassphrase,
    POLYMARKET_API_SECRET: creds.apiSecret,
    POLYMARKET_API_PASSPHRASE: creds.apiPassphrase,
  };

  let nextContent = content;
  for (const key of EXPORT_KEYS) {
    nextContent = setEnvValue(nextContent, key, values[key]);
  }

  await fs.writeFile(envPath, nextContent, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(envPath, 0o600);

  return {
    envPath,
    keys: EXPORT_KEYS,
  };
}
