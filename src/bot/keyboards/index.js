import { Markup } from 'telegraf';

// Re-export specific modules
export * from './admin.keyboards.js';
export * from './wallet.keyboards.js';
export * from './staking.keyboards.js';
export * from './send.keyboards.js';

// Core/Infrastructure Keyboards
export function mainReplyKeyboard() {
  return Markup.keyboard([
    ['💰 Mes Wallets', '💸 Envoyer'],
    ['🔍 Analyser', '📊 Cours EUR'],
    ['➕ Nouveau Wallet', '💵 Soldes'],
    ['❓ Aide'],
  ]).resize();
}

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Mes Wallets', 'list_wallets'),
      Markup.button.callback('💸 Envoyer', 'send_funds'),
    ],
    [
      Markup.button.callback('📈 Staking', 'staking_yield'),
      Markup.button.callback('💧 Liquid Staking', 'liquid_staking_menu'),
    ],
    [
      Markup.button.callback('🧹 Dust Keeper', 'dust_analysis'),
      Markup.button.callback('🔥 Burn SOL', 'burn_tokens'),
    ],
    [
      Markup.button.callback('🎯 Polymarket', 'pm_menu_refresh'),
      Markup.button.callback('🔨 Créer un Token', 'create_token'),
    ],
    [
      Markup.button.callback('🖼 Créer un NFT', 'create_nft'),
      Markup.button.callback('📊 Cours EUR', 'prices_eur'),
    ],
    [
      Markup.button.callback('➕ Nouveau Wallet', 'create_wallet'),
      Markup.button.callback('❌ Fermer', 'close_menu'),
    ],
  ]);
}

export function cancelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Annuler', 'cancel')],
  ]);
}
