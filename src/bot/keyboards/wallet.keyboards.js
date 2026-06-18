import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';
import { CHAIN_EMOJIS } from '../ui/formatters.js';

export function walletListKeyboard(wallets, prefix = 'wallet_') {
  const chainEmojis = CHAIN_EMOJIS;
  const buttons = wallets.map((w) => [
    Markup.button.callback(
      `${chainEmojis[w.chain] || '●'} ${w.chain.toUpperCase()} - ${w.label}`,
      `${prefix}${w.id}`
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

export function walletActionsKeyboard(walletId) {
  // 2-column grid: more compact on mobile than a single tall column.
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📋 Copier', `copy_addr_${walletId}`),
      Markup.button.callback('📷 QR', `qr_addr_${walletId}`),
    ],
    [
      Markup.button.callback('🌱 Seed', `view_seed_${walletId}`),
      Markup.button.callback('🔑 Clé privée', `view_privkey_${walletId}`),
    ],
    [
      Markup.button.callback('📜 Historique', `wallet_history_${walletId}`),
      Markup.button.callback('🗑 Supprimer', `delete_wallet_${walletId}`),
    ],
    [Markup.button.callback('🔄 Échanger', `exch_w_${walletId}`)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.VIEW_KEYS)],
  ]);
}

export function deleteConfirmKeyboard(walletId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Oui, Supprimer', `confirm_delete_${walletId}`)],
    [Markup.button.callback('↩️ Annuler', 'view_keys')],
  ]);
}

export function corruptedWalletKeyboard(walletId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Supprimer ce wallet', `confirm_delete_${walletId}`)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.VIEW_KEYS)],
  ]);
}

export function walletCreationMethodKeyboard(chain) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🆕 Nouveau', `generate_${chain}`)],
    [Markup.button.callback('🌱 Dériver depuis une seed existante', `derive_seed_${chain}`)],
    [Markup.button.callback('🔑 Importer une Clé Privée', `import_key_${chain}`)],
    [Markup.button.callback('🔐 Importer une Seed Phrase', `import_seed_${chain}`)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.CREATE_WALLET)],
  ]);
}

export function chainSelectionKeyboard(actionPrefix = 'chain_') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Ξ Ethereum', `${actionPrefix}eth`),
      Markup.button.callback('₿ Bitcoin', `${actionPrefix}btc`),
    ],
    [
      Markup.button.callback('Ł Litecoin', `${actionPrefix}ltc`),
      Markup.button.callback('🅑 Bitcoin Cash', `${actionPrefix}bch`),
    ],
    [
      Markup.button.callback('◎ Solana', `${actionPrefix}sol`),
      Markup.button.callback('🔵 Arbitrum', `${actionPrefix}arb`),
    ],
    [
      Markup.button.callback('⬡ Polygon', `${actionPrefix}matic`),
      Markup.button.callback('🔴 Optimism', `${actionPrefix}op`),
    ],
    [
      Markup.button.callback('🟦 Base', `${actionPrefix}base`),
      Markup.button.callback('🔺 Avalanche', `${actionPrefix}avax`),
    ],
    [
      Markup.button.callback('🟡 BNB Chain', `${actionPrefix}bsc`),
    ],
    [
      Markup.button.callback('🟥 Tron', `${actionPrefix}trx`),
      Markup.button.callback('ɱ Monero', `${actionPrefix}xmr`),
    ],
    [
      Markup.button.callback('Ⓩ Zcash', `${actionPrefix}zec`),
      Markup.button.callback('💎 TON', `${actionPrefix}ton`),
    ],
    [Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)],
  ]);
}
