/**
 * Centralized Telegram Callback Constants
 * Prevents drift between keyboards and handlers
 */

export const CALLBACKS = {
  // Navigation
  BACK_TO_MENU: 'back_to_menu',
  CLOSE_MENU: 'close_menu',
  CANCEL: 'cancel',
  PLUS_ACTIONS: 'plus_actions',

  // Wallet
  LIST_WALLETS: 'list_wallets',
  CREATE_WALLET: 'create_wallet',
  VIEW_KEYS: 'view_keys',
  VIEW_BALANCES: 'view_balances',

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
  STAKING_MENU: 'staking_menu',
  STAKING_OPTIMIZER: 'staking_optimizer',
  STAKING_YIELD: 'staking_yield',
  LIQUID_STAKING_MENU: 'liquid_staking_menu',
  DUST_ANALYSIS: 'dust_analysis',
  BURN_TOKENS: 'burn_tokens',
  CREATE_TOKEN: 'create_token',
  CREATE_NFT: 'create_nft',

  // Staking
  JITO_STAKING: 'jito_staking',
  MARINADE_STAKING: 'marinade_staking',
  JITO_EXIT_FAST_SELECT: 'jito_exit_fast_select',
  JITO_EXIT_STANDARD_SELECT: 'jito_exit_standard_select',
  JITO_EXIT_QUICK_25: 'jito_exit_quick_25',
  JITO_EXIT_QUICK_50: 'jito_exit_quick_50',
  JITO_EXIT_QUICK_100: 'jito_exit_quick_100',
  JITO_EXIT_MANUAL: 'jito_exit_manual',
  JITO_EXIT_STD_25: 'jito_exit_std_25',
  JITO_EXIT_STD_50: 'jito_exit_std_50',
  JITO_EXIT_STD_100: 'jito_exit_std_100',
  JITO_EXIT_STD_MANUAL: 'jito_exit_std_manual',
  JITO_WITHDRAW: 'jito_withdraw',
  JITO_UNSTAKE_PENDING_INFO: 'jito_unstake_pending_info',
  AAVE_MENU: 'aave_menu',
  AAVE_DEPOSIT_MENU: 'aave_deposit_menu',
  AAVE_WITHDRAW_MENU: 'aave_withdraw_menu',
  ETH_STAKING_MENU: 'eth_staking_menu',
  CURVE_LP_MENU: 'curve_lp_menu',

  // Admin
  ADMIN_PANEL: 'admin_panel',
  ADMIN_STATS: 'admin_stats',
  ADMIN_SECURITY: 'admin_security',
  ADMIN_LIST_USERS: 'admin_list_users',
  ADMIN_VIEW_USER: 'admin_view_user',
  ADMIN_DUST: 'admin_dust',
  ADMIN_LOGS: 'admin_logs',
  ADMIN_SECRETS: 'admin_secrets',
  ADMIN_BROADCAST: 'admin_broadcast',
  ADMIN_BAN: 'admin_ban',
  ADMIN_UNBAN: 'admin_unban',

  // Polymarket
  PM_CONNECT: 'pm_connect',
  PM_MENU_REFRESH: 'pm_menu_refresh',
  PM_MENU_HISTORY: 'pm_menu_history',
  PM_MENU_ORDERS: 'pm_menu_orders',
  PM_MENU_POSITIONS: 'pm_menu_positions',
  PM_MENU_PNL: 'pm_menu_pnl',
  PM_DISCONNECT: 'pm_disconnect',
  PM_CANCEL: 'pm_cancel',
  PM_CONFIRM_DISCONNECT: 'pm_confirm_disconnect',
  PM_CANCEL_DISCONNECT: 'pm_cancel_disconnect',
  PM_NEW_WALLET: 'pm_new_wallet',
  PM_HISTORY_CURRENT: 'pm_history_current',
  PM_MENU_THEMES: 'pm_menu_themes',
  PM_THEME_CURRENT: 'pm_theme_current',
};

// Factory functions for dynamic callbacks
export const dynamicCallback = {
  walletAction: (walletId, action) => `${action}_${walletId}`,
  walletPrefix: (walletId, prefix = 'wallet_') => `${prefix}${walletId}`,
  generateChain: (chain) => `generate_${chain}`,
  importKeyChain: (chain) => `import_key_${chain}`,
  importSeedChain: (chain) => `import_seed_${chain}`,
  chainSelect: (chain, prefix = 'chain_') => `${prefix}${chain}`,
  tokenSelect: (chain, token) => `token_${chain}_${token}`,
  sendToAnalyzed: (chain) => `send_to_analyzed_${chain}`,
  adminUserKeys: (userId) => `admin_user_keys_${userId}`,
  pmSelectWallet: (walletId) => `pm_select_wallet_${walletId}`,
  pmHistoryPage: (page) => `pm_history_page_${page}`,
  pmThemePage: (themeId, page) => `pm_theme_${themeId}_page_${page}`,
  jitoClaimUnstake: (requestId) => `jito_claim_unstake_${requestId}`,
  jitoUnstakeAutoRepair: (requestId) => `jito_unstake_auto_repair_${requestId}`,
  jitoUnstakeManualSync: (requestId) => `jito_unstake_manual_sync_${requestId}`,
  jitoUnstakeDelete: (requestId) => `jito_unstake_delete_${requestId}`,
  aaveChain: (action, chain) => `aave_${action}_chain_${chain}`,
  aaveToken: (action, chain, token) => `aave_${action}_token_${chain}_${token}`,
  aaveWallet: (action, chain, token, walletId) => `aave_${action}_wallet_${chain}_${token}_${walletId}`,
  ethStakeAction: (action, protocol) => `eth_stake_${action}_${protocol}`,
  ethStakeWallet: (action, protocol, walletId) => `eth_stake_${action}_${protocol}_${walletId}`,
  curvePool: (poolId) => `curve_pool_${poolId}`,
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
  PM_SELECT_WALLET: /^pm_select_wallet_(\d+)$/,
  PM_HISTORY_PAGE: /^pm_history_page_(\d+)$/,
  PM_THEME_PAGE: /^pm_theme_(.+)_page_(\d+)$/,
  JITO_CLAIM_UNSTAKE: /^jito_claim_unstake_(\d+)$/,
  JITO_UNSTAKE_AUTO_REPAIR: /^jito_unstake_auto_repair_(\d+)$/,
  JITO_UNSTAKE_MANUAL_SYNC: /^jito_unstake_manual_sync_(\d+)$/,
  JITO_UNSTAKE_DELETE: /^jito_unstake_delete_(\d+)$/,
  AAVE_CHAIN: /^aave_(deposit|withdraw)_chain_(.+)$/,
  AAVE_TOKEN: /^aave_(deposit|withdraw)_token_(.+)_(USDC|USDT)$/,
  AAVE_WALLET: /^aave_(deposit|withdraw)_wallet_(.+)_(USDC|USDT)_(.+)$/,
};
