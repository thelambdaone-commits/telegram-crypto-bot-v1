import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';

// Re-export specific modules
export * from './admin.keyboards.js';
export * from './wallet.keyboards.js';
export * from './send.keyboards.js';

// Core/Infrastructure Keyboards
export function mainReplyKeyboard() {
  // Mirrors the inline menu (same labels/emojis), with Receive included.
  return Markup.keyboard([
    ['💰 Mes Wallets', '➕ Nouveau'],
    ['📥 Recevoir', '📤 Envoyer'],
    ['💵 Soldes', '📊 Cours'],
    ['🔎 Analyser', '❓ Aide'],
  ]).resize();
}

export function mainMenuKeyboard() {
  // Balanced 2-column layout, grouped by intent (Telegram ergonomics):
  // wallets · move funds · info · tools · footer.
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Mes Wallets', CALLBACKS.LIST_WALLETS),
      Markup.button.callback('➕ Nouveau', CALLBACKS.CREATE_WALLET),
    ],
    [
      Markup.button.callback('📥 Recevoir', CALLBACKS.DEPOSIT),
      Markup.button.callback('📤 Envoyer', CALLBACKS.SEND_FUNDS),
    ],
    [
      Markup.button.callback('💵 Soldes', CALLBACKS.VIEW_BALANCES),
      Markup.button.callback('📊 Cours', CALLBACKS.PRICES_EUR),
    ],
    [
      Markup.button.callback('🔎 Analyser', CALLBACKS.ANALYZE_ADDRESS),
      Markup.button.callback('🔐 Mes Clés', CALLBACKS.VIEW_KEYS),
    ],
    [
      Markup.button.callback('❓ Aide', CALLBACKS.HELP_MENU),
      Markup.button.callback('❌ Fermer', CALLBACKS.CLOSE_MENU),
    ],
  ]);
}

export function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]]);
}
