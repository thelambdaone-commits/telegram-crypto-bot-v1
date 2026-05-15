import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';

// Re-export specific modules
export * from './admin.keyboards.js';
export * from './wallet.keyboards.js';
export * from './staking.keyboards.js';
export * from './send.keyboards.js';

// Core/Infrastructure Keyboards
export function mainReplyKeyboard() {
  return Markup.keyboard([
    ['💰 Mes Wallets', '📡 Envoyer'],
    ['💵 Soldes', '🔎 Analyser'],
    ['🆕 Nouveau Wallet', '🔐 Mes Clés'],
    ['📊 Cours EUR', '🆘 Help'],
    ["➕ Plus d'actions", '❌ Fermer'],
  ]).resize();
}

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Mes Wallets', CALLBACKS.LIST_WALLETS),
      Markup.button.callback('📡 Envoyer', CALLBACKS.SEND_FUNDS),
    ],
    [
      Markup.button.callback('💵 Soldes', CALLBACKS.VIEW_BALANCES),
      Markup.button.callback('🔎 Analyser', CALLBACKS.ANALYZE_ADDRESS),
    ],
    [
      Markup.button.callback('🆕 Nouveau Wallet', CALLBACKS.CREATE_WALLET),
      Markup.button.callback('🔐 Mes Clés', CALLBACKS.VIEW_KEYS),
    ],
    [
      Markup.button.callback('📊 Cours EUR', CALLBACKS.PRICES_EUR),
      Markup.button.callback('🆘 Help', CALLBACKS.HELP_MENU),
    ],
    [
      Markup.button.callback("➕ Plus d'actions", CALLBACKS.PLUS_ACTIONS),
      Markup.button.callback('❌ Fermer', CALLBACKS.CLOSE_MENU),
    ],
  ]);
}

export function advancedActionsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📈 Staking', CALLBACKS.STAKING_YIELD),
      Markup.button.callback('💧 Liquid Staking', CALLBACKS.LIQUID_STAKING_MENU),
    ],
    [
      Markup.button.callback('📊 Cours EUR', CALLBACKS.PRICES_EUR),
      Markup.button.callback('🧹 Dust Keeper', CALLBACKS.DUST_ANALYSIS),
    ],
    [
      Markup.button.callback('🔥 Burn SOL', CALLBACKS.BURN_TOKENS),
      Markup.button.callback('🎯 Polymarket', CALLBACKS.PM_MENU_REFRESH),
    ],
    [
      Markup.button.callback('⛏️ Créer un Token', CALLBACKS.CREATE_TOKEN),
      Markup.button.callback('🖼 Créer un NFT', CALLBACKS.CREATE_NFT),
    ],
    [Markup.button.callback('⬅️ Retour', CALLBACKS.BACK_TO_MENU)],
  ]);
}

export function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]]);
}
