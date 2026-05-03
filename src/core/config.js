import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  botToken: process.env.BOT_TOKEN,
  masterKey: process.env.MASTER_ENCRYPTION_KEY,
  adminChatId: process.env.ADMIN_CHAT_ID
    ? process.env.ADMIN_CHAT_ID.split(',').map(id => Number(id.trim())).filter(id => !isNaN(id))
    : [],
  dataPath: process.env.DATA_PATH || resolve(__dirname, '../../data'),
  rateLimit: Number.parseInt(process.env.RATE_LIMIT || '30'),

  polymarket: {
    host: process.env.POLYMARKET_HOST || 'https://clob.polymarket.com',
    chainId: Number(process.env.POLYMARKET_CHAIN_ID || '137'),
    feedInterval: Number(process.env.POLYMARKET_FEED_INTERVAL || '60000'),
    feedEnabled: process.env.POLYMARKET_FEED_ENABLED === 'true',
    alertChatId: process.env.POLYMARKET_ALERT_CHAT_ID
      ? Number(process.env.POLYMARKET_ALERT_CHAT_ID)
      : null,
    polyfillEnvPath: process.env.POLYFILL_RS_ENV_PATH || '/home/ey9dyk3j8bg3/polymarket-copy-trade/.env',
  },

  rpc: {
    eth: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    sol: process.env.SOL_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff',
    btcApi: process.env.BTC_API_URL || 'https://mempool.space/api',
    arb: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    ltcApi: process.env.LTC_API_URL || 'https://mempool.space/api/litecoin',
    bchApi: process.env.BCH_API_URL || 'https://api.blockchain.info/bch',
    matic: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    op: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    base: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  },
};

// Validate required config
if (!config.botToken) {
  throw new Error('BOT_TOKEN est requis');
}
if (!config.masterKey || config.masterKey.length !== 64) {
  throw new Error('MASTER_ENCRYPTION_KEY doit etre une chaine hex de 64 caracteres (32 bytes)');
}
