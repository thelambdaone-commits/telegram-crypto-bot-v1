import { fr } from './fr.js';

const locales = { fr };
const DEFAULT_LANG = 'fr';

// Shown to a user (production) when a key is missing — never the raw `[path]`.
const GENERIC_USER_MESSAGE = fr.errors.generic;

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
    // Dev: surface the missing key loudly. Prod: never leak `[path]` to a user —
    // fall back to a clean generic message.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing translation key: ${path} for lang: ${lang}`);
      return `[${path}]`;
    }
    return GENERIC_USER_MESSAGE;
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

// Presentation helpers live alongside the strings — re-exported here so callers
// have a single `i18n` entry point (formatters + help/prompt texts).
export * from './formatters.js';
export { getFullHelpText, chainSelectionPrompt } from './fr.js';

// ── Backward compatibility — legacy MESSAGES / EMOJIS ──
// Lazy by design: every string is a getter so it's resolved on access, not
// eagerly at import time (lets the locale bundle stay the single source of
// truth and avoids import-order surprises).

export const MESSAGES = {
  welcome: (name) => t('fr', 'start.welcome', name),
  get walletGenerated() {
    return t('fr', 'wallet.generated');
  },
  get walletCreated() {
    return '🎉 Wallet Créé';
  },
  get noWallets() {
    return t('fr', 'wallet.noWallets');
  },
  get walletDeleted() {
    return '🗑️ Wallet supprimé';
  },
  get enterAddress() {
    return t('fr', 'send.enterAddress');
  },
  get enterAmount() {
    return t('fr', 'send.enterAmount');
  },
  get txSent() {
    return t('fr', 'send.sent');
  },
  get txFailed() {
    return t('fr', 'send.failed');
  },
  get invalidAddress() {
    return t('fr', 'errors.address');
  },
  get seedWarning() {
    return t('fr', 'wallet.seedWarning');
  },
  get neverShare() {
    return t('fr', 'wallet.neverShare');
  },
  autoDelete: (seconds) => t('fr', 'wallet.autoDelete', seconds),
  get totalBalance() {
    return t('fr', 'wallet.totalBalance');
  },
  get noBalance() {
    return t('fr', 'errors.noBalance');
  },
  get error() {
    return t('fr', 'errors.generic');
  },
  get tryAgain() {
    return t('fr', 'errors.tryAgain');
  },
  get success() {
    return t('fr', 'errors.generic');
  },
  get copied() {
    return t('fr', 'wallet.copied');
  },
  get adminPanel() {
    return t('fr', 'admin.panel');
  },
  get stats() {
    return t('fr', 'admin.stats');
  },
  get users() {
    return t('fr', 'admin.users');
  },
};

export const EMOJIS = {
  wallet: '💰',
  chain: '⛓️',
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
