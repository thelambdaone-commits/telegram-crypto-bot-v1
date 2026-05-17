import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { SecretVault } from './secret-vault.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = process.env.DATA_PATH || resolve(__dirname, '../../data');
const masterKey = process.env.MASTER_ENCRYPTION_KEY;

// Initialize vault synchronously for boot
const vault = new SecretVault(dataPath, masterKey);
vault.loadSync();

function parseIdList(value) {
  return value
    ? value
        .split(',')
        .map((id) => {
          const trimmed = id.trim();
          if (!/^-?\d+$/.test(trimmed)) return NaN;
          return Number(trimmed);
        })
        .filter((id) => !isNaN(id))
    : [];
}

const adminChatId = parseIdList(process.env.ADMIN_CHAT_ID);
const configuredAdminUserId = parseIdList(process.env.ADMIN_USER_ID || process.env.ADMIN_USER_IDS);
const adminUserId = [...configuredAdminUserId, ...adminChatId.filter((id) => id > 0)];

export const config = {
  botToken: process.env.BOT_TOKEN,
  masterKey,
  adminChatId,
  adminUserId: [...new Set(adminUserId)],
  dataPath,
  rateLimit: Number.parseInt(process.env.RATE_LIMIT || '30'),
  sessionTimeout: Number.parseInt(process.env.SESSION_TIMEOUT || '5'),

  polymarket: {
    host: process.env.POLYMARKET_HOST || 'https://clob.polymarket.com',
    chainId: Number(process.env.POLYMARKET_CHAIN_ID || '137'),
    feedInterval: Number(process.env.POLYMARKET_FEED_INTERVAL || '60000'),
    feedEnabled: process.env.POLYMARKET_FEED_ENABLED === 'true',
    alertChatId: process.env.POLYMARKET_ALERT_CHAT_ID
      ? Number(process.env.POLYMARKET_ALERT_CHAT_ID)
      : null,
    // Hardcoded path to avoid leak and simplify config
    polyfillEnvPath: join(dataPath, 'polymarket-copy-trade', 'runtime.env'),
  },

  rpc: {
    eth: vault.get('ethRpc') || process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    sol: vault.get('solRpc') || process.env.SOL_RPC_URL,
    btcApi: vault.get('btcApi') || process.env.BTC_API_URL || 'https://mempool.space/api',
    arb: vault.get('arbRpc') || process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    ltcApi: vault.get('ltcApi') || process.env.LTC_API_URL || 'https://litecoinspace.org/api',
    bchApi: vault.get('bchApi') || process.env.BCH_API_URL || 'https://api.blockchain.info/bch',
    matic: vault.get('maticRpc') || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    op: vault.get('opRpc') || process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    base: vault.get('baseRpc') || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    // Preference for vault-stored secret
    stakingSol: vault.get('stakingRpc') || process.env.STAKING_SOL_RPC_URL,
  },
};

// Validate required config
if (!process.env.COINGECKO_API_KEY) {
  console.warn('[CONFIG] COINGECKO_API_KEY not set — EUR price conversion will use free tier (rate-limited)');
}
if (config.polymarket.feedEnabled && !config.polymarket.alertChatId) {
  console.warn('[CONFIG] POLYMARKET_FEED_ENABLED=true but POLYMARKET_ALERT_CHAT_ID not set — alerts disabled');
}
if (!config.rpc.stakingSol) {
  console.warn('[CONFIG] STAKING_SOL_RPC_URL not set — staking may be unavailable');
}
if (!config.botToken) {
  throw new Error('BOT_TOKEN est requis');
}
if (!config.masterKey || !/^[a-fA-F0-9]{64}$/.test(config.masterKey)) {
  throw new Error('MASTER_ENCRYPTION_KEY doit etre une chaine hex de 64 caracteres (32 bytes)');
}
if (!config.rpc.sol) {
  throw new Error('SOL_RPC_URL est requis');
}
if (configuredAdminUserId.length === 0) {
  throw new Error('ADMIN_USER_ID ou ADMIN_USER_IDS est requis');
}
