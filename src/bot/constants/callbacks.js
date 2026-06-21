/**
 * Centralized Telegram Callback Constants
 * Prevents drift between keyboards and handlers
 */

export const CALLBACKS = {
  // Navigation
  BACK_TO_MENU: 'back_to_menu',
  CLOSE_MENU: 'close_menu',
  CANCEL: 'cancel',
  MORE_MENU: 'more_menu',
  INVOICE_START: 'invoice_start',
  INVOICE_LN: 'pinv_ln',

  // Wallet
  LIST_WALLETS: 'list_wallets',
  CREATE_WALLET: 'create_wallet',
  VIEW_KEYS: 'view_keys',
  VIEW_BALANCES: 'view_balances',
  DEPOSIT: 'deposit',

  // Send
  SEND_FUNDS: 'send_funds',
  ANALYZE_ADDRESS: 'analyze_address',
  CONFIRM_SEND: 'confirm_send',
  MANUAL_AMOUNT: 'manual_amount',
  QUICK_AMOUNT_ALL: 'quick_amount_all',
  QUICK_AMOUNT_50: 'quick_amount_50',
  AMOUNT_TYPE_NATIVE: 'amount_type_native',
  AMOUNT_TYPE_EUR: 'amount_type_eur',

  // Fees
  FEE_SLOW: 'fee_slow',
  FEE_AVERAGE: 'fee_average',
  FEE_FAST: 'fee_fast',
  FEE_AUTO: 'fee_auto',

  // Market
  PRICES_EUR: 'prices_eur',
  HELP_MENU: 'help_menu',

  // Exchange (no-KYC cross-chain, quote-only)
  EXCHANGE: 'exchange',

  // Admin
  ADMIN_PANEL: 'admin_panel',
  ADMIN_STATS: 'admin_stats',
  ADMIN_SECURITY: 'admin_security',
  ADMIN_AUDIT: 'admin_audit',
  ADMIN_LIST_USERS: 'admin_list_users',
  ADMIN_VIEW_USER: 'admin_view_user',
  ADMIN_LOGS: 'admin_logs',
  ADMIN_SECRETS: 'admin_secrets',
  ADMIN_BROADCAST: 'admin_broadcast',
  ADMIN_BAN: 'admin_ban',
  ADMIN_UNBAN: 'admin_unban',
};

// Factory functions for dynamic callbacks
export const dynamicCallback = {
  walletAction: (walletId, action) => `${action}_${walletId}`,
  walletPrefix: (walletId, prefix = 'wallet_') => `${prefix}${walletId}`,
  generateChain: (chain) => `generate_${chain}`,
  exchangeFromSym: (sym) => `exch_fs_${sym}`,
  exchangeToSym: (sym) => `exch_ts_${sym}`,
  exchangeFrom: (chain) => `exch_from_${chain}`,
  exchangeTo: (chain) => `exch_to_${chain}`,
  importKeyChain: (chain) => `import_key_${chain}`,
  importSeedChain: (chain) => `import_seed_${chain}`,
  chainSelect: (chain, prefix = 'chain_') => `${prefix}${chain}`,
  tokenSelect: (chain, token) => `token_${chain}_${token}`,
  sendToAnalyzed: (chain) => `send_to_analyzed_${chain}`,
  adminUserKeys: (userId) => `admin_user_keys_${userId}`,
};

// Regex patterns for dynamic callbacks
export const CALLBACK_REGEX = {
  AMOUNT_TYPE: /^amount_type_(.+)$/,
  WALLET_ACTION: /^(.+)_(\d+)$/,
  GENERATE_CHAIN: /^generate_(.+)$/,
  IMPORT_KEY_CHAIN: /^import_key_(.+)$/,
  IMPORT_SEED_CHAIN: /^import_seed_(.+)$/,
  CHAIN_SELECT: /^chain_(.+)$/,
  CONFIRM_DELETE: /^confirm_delete_(\d+)$/,
  DELETE_WALLET: /^delete_wallet_(\d+)$/,
  COPY_ADDR: /^copy_addr_(\d+)$/,
  VIEW_SEED: /^view_seed_(\d+)$/,
  VIEW_PRIVKEY: /^view_privkey_(\d+)$/,
  WALLET_HISTORY: /^wallet_history_(\d+)$/,
  TOKEN_SELECT: /^token_(.+)_(.+)$/,
  SEND_TO_ANALYZED: /^send_to_analyzed_(.+)$/,
  ADMIN_USER_KEYS: /^admin_user_keys_(\d+)$/,
  EXCHANGE_WALLET: /^exch_w_(.+)$/,
  EXCHANGE_FROM_SYM: /^exch_fs_(.+)$/,
  EXCHANGE_TO_SYM: /^exch_ts_(.+)$/,
  EXCHANGE_FROM: /^exch_from_(.+)$/,
  EXCHANGE_TO: /^exch_to_(.+)$/,
};
