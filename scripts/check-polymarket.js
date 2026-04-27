import { config } from '../src/core/config.js';
import { StorageService } from '../src/core/storage.js';

const chatId = Number(process.argv[2]);

if (!chatId) {
  console.error('Usage: node scripts/check-polymarket.js <chatId>');
  process.exit(1);
}

const storage = new StorageService(config.dataPath, config.masterKey);
await storage.init();

const active = await storage.getPolymarketCredentials(chatId);
const list = typeof storage.getPolymarketCredentialsList === 'function'
  ? await storage.getPolymarketCredentialsList(chatId)
  : [];

console.log(`Chat ID: ${chatId}`);
console.log(`Credentials sauvegardés: ${list.length}`);
console.log(`Wallet actif: ${active ? active.address : 'aucun'}`);

for (const creds of list) {
  const marker = creds.active ? '*' : ' ';
  const label = creds.walletLabel || 'Wallet Polymarket';
  console.log(`${marker} ${label} ${creds.chain || ''} ${creds.address} connectedAt=${creds.connectedAt || 'N/A'}`);
}
