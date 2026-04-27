import { config } from '../src/core/config.js';
import { StorageService } from '../src/core/storage.js';
import { buildClobClient, removeClobClient } from '../src/clob/client.js';
import { getUserActivity } from '../src/clob/data-api.js';

const chatId = Number(process.argv[2]);

if (!chatId) {
  console.error('Usage: node scripts/check-polymarket-history.js <chatId>');
  process.exit(1);
}

const storage = new StorageService(config.dataPath, config.masterKey);
await storage.init();

const list = await storage.getPolymarketCredentialsList(chatId);
console.log(`Credentials sauvegardés: ${list.length}`);

for (const summary of list) {
  const creds = await storage.getPolymarketCredentialsById(chatId, summary.id);
  if (!creds) {
    console.log(`- ${summary.address}: illisible`);
    continue;
  }

  try {
    const { userAddress, activity } = await getUserActivity(creds.address, { limit: 10, type: 'TRADE' });
    removeClobClient(chatId);
    const client = buildClobClient(chatId, creds.privateKey, creds);
    const allTradesResult = await client.getTradesPaginated();
    const makerTradesResult = await client.getTradesPaginated({ maker_address: creds.address });
    const allTrades = allTradesResult.trades || [];
    const makerTrades = makerTradesResult.trades || [];

    console.log(`- ${summary.active ? '*' : ' '} ${creds.address}`);
    console.log(`  label=${summary.walletLabel || 'N/A'} chain=${summary.chain || 'N/A'}`);
    console.log(`  dataApiUser=${userAddress}`);
    console.log(`  dataApiActivityTrades=${activity.length}`);
    console.log(`  allTradesFirstPage=${allTrades.length}`);
    console.log(`  makerTradesFirstPage=${makerTrades.length}`);

    const sample = activity[0] || allTrades[0] || makerTrades[0];
    if (sample) {
      console.log(`  sample=${sample.title || sample.id || sample.market || sample.asset_id} side=${sample.side || 'N/A'} size=${sample.size || 'N/A'} price=${sample.price || 'N/A'}`);
    }
  } catch (error) {
    console.log(`- ${summary.active ? '*' : ' '} ${creds.address}`);
    console.log(`  ERROR=${error.message}`);
  } finally {
    removeClobClient(chatId);
  }
}
