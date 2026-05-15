import { fr } from './fr.js';

const locales = { fr };
const DEFAULT_LANG = 'fr';

/**
 * Translate a key from the messages bundle.
 *
 * @param {string} lang - Language code ('fr', 'en')
 * @param {string} path - Dot-separated key path, e.g. 'wallet.created'
 * @param {...any} args - Arguments passed to the value if it's a function
 * @returns {string} The translated string
 */
export function t(lang, path, ...args) {
  const locale = locales[lang] || locales[DEFAULT_LANG];
  const value = path.split('.').reduce((obj, key) => obj?.[key], locale);

  if (typeof value === 'function') {
    return value(...args);
  }

  if (value === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing translation key: ${path} for lang: ${lang}`);
    }
    return `[${path}]`;
  }

  return value;
}

/**
 * Convenience wrapper: same as t('fr', path, ...args)
 */
export function tt(path, ...args) {
  return t('fr', path, ...args);
}

export { fr } from './fr.js';

// ── Backward compatibility — legacy MESSAGES / EMOJIS ──

export const MESSAGES = {
  welcome: (name) => t('fr', 'start.welcome', name),
  walletGenerated: t('fr', 'wallet.generated'),
  walletCreated: t('fr', 'wallet.created'),
  noWallets: t('fr', 'wallet.noWallets'),
  walletDeleted: t('fr', 'wallet.deleted'),
  enterAddress: t('fr', 'send.enterAddress'),
  enterAmount: t('fr', 'send.enterAmount'),
  txSent: t('fr', 'send.sent'),
  txFailed: t('fr', 'send.failed'),
  invalidAddress: t('fr', 'errors.address'),
  seedWarning: t('fr', 'wallet.seedWarning'),
  neverShare: t('fr', 'wallet.neverShare'),
  autoDelete: (seconds) => t('fr', 'wallet.autoDelete', seconds),
  totalBalance: t('fr', 'wallet.totalBalance'),
  noBalance: t('fr', 'wallet.noBalance'),
  error: t('fr', 'errors.generic'),
  tryAgain: t('fr', 'errors.tryAgain'),
  success: t('fr', 'errors.generic'),
  copied: t('fr', 'wallet.copied'),
  adminPanel: t('fr', 'admin.panel'),
  stats: t('fr', 'admin.stats'),
  users: t('fr', 'admin.users'),
};

export const EMOJIS = {
  wallet: '👛',
  send: '📤',
  receive: '📥',
  key: '🔑',
  seed: '🔐',
  warning: '⚠️',
  success: '✅',
  error: '❌',
  loading: '⏳',
  money: '💰',
  chart: '📈',
  lock: '🔒',
  unlock: '🔓',
};
