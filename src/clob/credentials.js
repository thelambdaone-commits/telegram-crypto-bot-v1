import { encrypt, decrypt } from '../shared/encryption.js';
import { ethers } from 'ethers';

const CRED_KEYS = ['apiKey', 'apiSecret', 'apiPassphrase'];

function polyfillEthersWallet(wallet) {
  if (!wallet._signTypedData && typeof wallet.signTypedData === 'function') {
    wallet._signTypedData = wallet.signTypedData.bind(wallet);
  }
  return wallet;
}

export function extractAddress(privateKey) {
  try {
    const wallet = new ethers.Wallet(formatPrivateKey(privateKey));
    return wallet.address;
  } catch {
    return null;
  }
}

export function validatePrivateKey(privateKey) {
  if (!privateKey) return false;
  const formatted = formatPrivateKey(privateKey);
  if (formatted.length !== 66) return false;
  if (!formatted.startsWith('0x')) return false;
  try {
    new ethers.Wallet(formatted);
    return true;
  } catch {
    return false;
  }
}

export function formatPrivateKey(key) {
  if (!key) return null;
  return key.startsWith('0x') ? key : `0x${key}`;
}

export function createWalletWithPolyfill(privateKey) {
  const wallet = new ethers.Wallet(formatPrivateKey(privateKey));
  return polyfillEthersWallet(wallet);
}

export function generateApiKeyMessage(_address) {
  const timestamp = Date.now().toString();
  return {
    message: `Click to sign in to Polymarket: ${timestamp}`,
    timestamp,
  };
}

export async function signApiKeyMessage(privateKey, _address) {
  try {
    const wallet = createWalletWithPolyfill(privateKey);
    const { message, timestamp } = generateApiKeyMessage(_address);
    const signature = await wallet.signMessage(message);
    return { signature, timestamp };
  } catch (err) {
    throw new Error(`Signature failed: ${err.message}`);
  }
}

export function encryptCredentials(creds, masterKey) {
  const encrypted = {};
  for (const key of CRED_KEYS) {
    if (creds[key]) {
      encrypted[key] = encrypt(creds[key], masterKey);
    }
  }
  return encrypted;
}

export function decryptCredentials(encrypted, masterKey) {
  const decrypted = {};
  for (const key of CRED_KEYS) {
    if (encrypted[key]) {
      try {
        decrypted[key] = decrypt(encrypted[key], masterKey);
      } catch {
        return null;
      }
    }
  }
  return decrypted;
}

export function formatCredentials(creds) {
  return {
    apiKey: creds.apiKey ? `****${creds.apiKey.slice(-8)}` : 'N/A',
    apiSecret: creds.apiSecret ? '************' : 'N/A',
    apiPassphrase: creds.apiPassphrase ? '******' : 'N/A',
    address: creds.address || 'N/A',
    connectedAt: creds.connectedAt || 'N/A',
    alertsEnabled: creds.alertsEnabled || false,
  };
}