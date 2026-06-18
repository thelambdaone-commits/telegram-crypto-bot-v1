import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
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

function parseUrlList(value) {
  return value
    ? value
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean)
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
  // Max length for any inbound text message. No legitimate input (addresses
  // ~106 chars max, 24-word seeds ~200 chars, amounts) gets close to this;
  // anything larger is a broken/flood message and is dropped early.
  maxMessageLength: Number.parseInt(process.env.MAX_MESSAGE_LENGTH || '512'),

  // No-KYC cross-chain exchange (Trocador aggregator, CakeWallet-style).
  // Quote-only for now: getQuote needs the API key, but NO funds are ever moved.
  exchange: {
    trocadorApiKey: vault.get('trocadorApiKey') || process.env.TROCADOR_API_KEY || '',
    trocadorBaseUrl: process.env.TROCADOR_API_URL || 'https://trocador.app/api',
    // Optional affiliate referral code, appended to keyless AnonPay links.
    trocadorRef: vault.get('trocadorRef') || process.env.TROCADOR_REF || '',
  },

  rpc: {
    eth: vault.get('ethRpc') || process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    sol: vault.get('solRpc') || process.env.SOL_RPC_URL,
    solFallbacks: parseUrlList(process.env.SOL_RPC_FALLBACK_URLS),
    btcApi: vault.get('btcApi') || process.env.BTC_API_URL || 'https://mempool.space/api',
    arb: vault.get('arbRpc') || process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    ltcApi: vault.get('ltcApi') || process.env.LTC_API_URL || 'https://litecoinspace.org/api',
    bchApi: vault.get('bchApi') || process.env.BCH_API_URL || 'https://api.blockchain.info/bch',
    matic: vault.get('maticRpc') || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    op: vault.get('opRpc') || process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    base: vault.get('baseRpc') || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    avax: vault.get('avaxRpc') || process.env.AVAX_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    xmrDaemon: vault.get('xmrDaemon') || process.env.XMR_DAEMON_URL || 'http://node.moneroworld.com:18089',
    xmrWalletRpc: vault.get('xmrWalletRpc') || process.env.XMR_WALLET_RPC_URL || '',
    xmrWalletAuth: vault.get('xmrWalletAuth') || process.env.XMR_WALLET_RPC_AUTH || '',
    zecApi: vault.get('zecApi') || process.env.ZEC_API_URL || 'https://api.zcha.in/v2/mainnet',
    zecRpc: vault.get('zecRpc') || process.env.ZEC_RPC_URL || '',
    zecRpcAuth: vault.get('zecRpcAuth') || process.env.ZEC_RPC_AUTH || '',
    trx: vault.get('tronRpc') || process.env.TRON_API_URL || 'https://api.trongrid.io',
    tronApiKey: vault.get('tronApiKey') || process.env.TRON_API_KEY || '',
    ton: vault.get('tonRpc') || process.env.TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC',
    tonApiKey: vault.get('tonApiKey') || process.env.TON_API_KEY || '',
  },
};

export const torProxyUrl = process.env.TOR_PROXY_URL || '';

// Validate required config
if (!process.env.COINGECKO_API_KEY) {
  console.warn('[CONFIG] COINGECKO_API_KEY not set — EUR price conversion will use free tier (rate-limited)');
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
