import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { decrypt, encrypt } from '../src/shared/encryption.js';
import { config } from '../src/core/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function exportCredentials() {
  const dataPath = config.dataPath;
  const exportsDir = path.join(dataPath, 'exports');

  console.log('🔐 Export des credentials Polymarket...\n');

  try {
    await fs.mkdir(exportsDir, { recursive: true });
  } catch {}

  const files = await fs.readdir(dataPath);
  const userFiles = files.filter((f) => f.endsWith('.enc') && !f.startsWith('_'));

  if (userFiles.length === 0) {
    console.log('❌ Aucun utilisateur trouve.');
    return;
  }

  const exportsData = {
    version: '1.0',
    platform: 'polymarket',
    credentials: [],
    exportedAt: new Date().toISOString(),
  };

  for (const file of userFiles) {
    const chatId = file.replace('.enc', '');
    try {
      const encryptedData = await fs.readFile(path.join(dataPath, file), 'utf8');
      const decryptedData = decrypt(encryptedData, config.masterKey);
      const userData = JSON.parse(decryptedData);

      const credentialsList = userData.pmCredentialsList || [];

      for (const cred of credentialsList) {
        try {
          exportsData.credentials.push({
            id: cred.id,
            address: cred.address,
            apiKey: cred.apiKey,
            apiSecret: cred.apiSecret,
            apiPassphrase: cred.apiPassphrase,
            chain: cred.chain || 'ethereum',
            connectedAt: cred.connectedAt,
            walletLabel: cred.walletLabel || null,
            chatId: Number(chatId),
          });
        } catch (e) {
          console.log(`⚠️ Credential ${cred.id} corrompu pour user ${chatId}`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Impossible de lire user ${chatId}: ${e.message}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `credentials-export-${timestamp}.enc`;
  const filepath = path.join(exportsDir, filename);

  const plaintext = JSON.stringify(exportsData, null, 2);
  const encrypted = encrypt(plaintext, config.masterKey);
  await fs.writeFile(filepath, encrypted, 'utf8');

  console.log(`✅ ${exportsData.credentials.length} credential(s) exportee(s)`);
  console.log(`📁 Fichier chiffré: ${filepath}`);
  console.log('\n🔐 Fichier chiffré avec AES-256-GCM (masterKey)');
  console.log('💡 Pour importer: dechiffrer avec la meme masterKey.\n');
}

exportCredentials().catch((err) => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
