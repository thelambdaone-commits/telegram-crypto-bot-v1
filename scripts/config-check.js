import { config } from '../src/core/config.js';

const WARN = '\x1b[33m%s\x1b[0m';
const OK = '\x1b[32m%s\x1b[0m';
const ERR = '\x1b[31m%s\x1b[0m';
const BOLD = '\x1b[1m%s\x1b[0m';

const checks = [];

function check(label, value, severity = 'ok', hint = '') {
  checks.push({ label, value, severity, hint });
}

function display() {
  console.log(BOLD, '\n=== Configuration Check ===\n');
  let errors = 0;
  let warnings = 0;

  for (const c of checks) {
    const icon = c.severity === 'ok' ? '✅' : c.severity === 'warn' ? '⚠️' : '❌';
    if (c.severity === 'error') errors++;
    if (c.severity === 'warn') warnings++;
    const val = c.value !== undefined && c.value !== null ? c.value.toString() : '(none)';
    console.log(`  ${icon} ${c.label}: ${val}`);
    if (c.hint) console.log(`     → ${c.hint}`);
  }

  console.log(BOLD, `\n=== Result: ${errors} error(s), ${warnings} warning(s) ===\n`);
  process.exitCode = errors > 0 ? 1 : 0;
}

check('BOT_TOKEN', config.botToken ? 'defined' : 'missing', config.botToken ? 'ok' : 'error');
check('MASTER_ENCRYPTION_KEY', config.masterKey ? 'defined' : 'missing', config.masterKey ? 'ok' : 'error');
check('ADMIN_USER_ID / ADMIN_USER_IDS', config.adminUserId.length > 0 ? `${config.adminUserId.length} admin(s)` : 'none', config.adminUserId.length > 0 ? 'ok' : 'error');
check('SOL_RPC_URL', config.rpc.sol || 'using vault', 'ok');

check('ETH_RPC_URL', config.rpc.eth || 'using vault', 'ok');
check('POLYGON_RPC_URL', config.rpc.matic || 'using vault', 'ok');
check('ARB_RPC_URL', config.rpc.arb || 'using vault', 'ok');
check('OPTIMISM_RPC_URL', config.rpc.op || 'using vault', 'ok');
check('BASE_RPC_URL', config.rpc.base || 'using vault', 'ok');
check('BTC_API_URL', config.rpc.btcApi, 'ok');
check('LTC_API_URL', config.rpc.ltcApi, 'ok');
check('BCH_API_URL', config.rpc.bchApi, 'ok');
check('STAKING_SOL_RPC_URL', config.rpc.stakingSol || 'not set', config.rpc.stakingSol ? 'ok' : 'warn', 'Staking Solana may be unavailable');
check('COINGECKO_API_KEY', process.env.COINGECKO_API_KEY || 'not set', process.env.COINGECKO_API_KEY ? 'ok' : 'warn', 'EUR price conversion may be rate-limited');
check('POLYMARKET_FEED_ENABLED', String(config.polymarket.feedEnabled), 'ok');
if (config.polymarket.feedEnabled && !config.polymarket.alertChatId) {
  check('POLYMARKET_ALERT_CHAT_ID', 'not set', 'warn', 'Feed enabled but no alert chat configured');
}
check('Session timeout', `${config.sessionTimeout} min`, 'ok');
check('Rate limit', `${config.rateLimit} req/min`, 'ok');
check('Data path', config.dataPath, 'ok');
check('Polymarket host', config.polymarket.host, 'ok');
check('Polymarket chainId', config.polymarket.chainId, 'ok');

display();
