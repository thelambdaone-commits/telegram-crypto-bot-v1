import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../src/core/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkExports() {
  const dataPath = config.dataPath;
  const exportsDir = path.join(dataPath, 'exports');

  console.log('📂 Verification des exports...\n');

  try {
    const files = await fs.readdir(exportsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse();

    if (jsonFiles.length === 0) {
      console.log('❌ Aucun fichier d\'export trouve.');
      return;
    }

    for (const file of jsonFiles) {
      const filepath = path.join(exportsDir, file);
      const content = await fs.readFile(filepath, 'utf8');
      const data = JSON.parse(content);

      console.log(`📄 ${file}`);
      console.log(`   - ${data.credentials?.length || 0} credential(s)`);
      console.log(`   - Exporte: ${data.exportedAt}`);

      for (const cred of data.credentials || []) {
        console.log(`   • ${cred.address?.slice(0, 6)}...${cred.address?.slice(-4)} (${cred.chain}) - ${cred.walletLabel || 'N/A'}`);
      }
      console.log();
    }
  } catch (e) {
    console.log('❌ Aucun export trouve.');
  }
}

checkExports().catch((err) => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});