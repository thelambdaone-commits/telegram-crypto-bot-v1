import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/core/config.js';
import { StorageService } from '../src/core/storage.js';
import { generateKey } from '../src/shared/encryption.js';

const requiredEnv = ['BOT_TOKEN', 'MASTER_ENCRYPTION_KEY'];

function assertRequiredEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variables .env manquantes: ${missing.join(', ')}`);
  }

  if (!/^[a-fA-F0-9]{64}$/.test(process.env.MASTER_ENCRYPTION_KEY)) {
    throw new Error('MASTER_ENCRYPTION_KEY doit etre une chaine hex de 64 caracteres');
  }
}

async function assertStorage() {
  const dataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'telegram-crypto-bot-precheck-'));
  const storage = new StorageService(dataPath, generateKey());
  const chatId = 999001;

  await storage.init();
  await storage.addPolymarketCredentials(
    chatId,
    '0x'.padEnd(66, '1'),
    '0x0000000000000000000000000000000000000001',
    'api-key',
    'api-secret',
    'api-passphrase',
    Date.now().toString()
  );

  const creds = await storage.getPolymarketCredentials(chatId);
  if (!creds || creds.apiKey !== 'api-key') {
    throw new Error('Storage chiffré indisponible ou illisible');
  }
}

async function assertCriticalImports() {
  await Promise.all([
    import('../src/clob/client.js'),
    import('../src/clob/credentials.js'),
    import('../src/clob/markets.js'),
    import('../src/bot/handlers/polymarket/index.js'),
    import('../src/modules/wallet/wallet.service.js'),
  ]);
}

async function main() {
  assertRequiredEnv();
  await assertStorage();
  await assertCriticalImports();

  console.log('✅ Precheck OK');
  console.log(`Data path: ${config.dataPath}`);
  console.log(`Polymarket chainId: ${config.polymarket.chainId}`);
}

main().catch((error) => {
  console.error(`❌ Precheck failed: ${error.message}`);
  process.exitCode = 1;
});
