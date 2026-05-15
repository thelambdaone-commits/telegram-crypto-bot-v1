import { Markup } from 'telegraf';
import { CALLBACKS, dynamicCallback } from '../../constants/callbacks.js';

export function polymarketMenuKeyboard(connected) {
  if (!connected) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔗 Connecter un wallet', CALLBACKS.PM_CONNECT)],
      [Markup.button.callback('🔄 Rafraîchir', CALLBACKS.PM_MENU_REFRESH)],
      [Markup.button.callback('🔙 Menu principal', CALLBACKS.BACK_TO_MENU)],
    ]);
  }

  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📜 Historique', CALLBACKS.PM_MENU_HISTORY),
      Markup.button.callback('📋 Ordres', CALLBACKS.PM_MENU_ORDERS),
    ],
    [
      Markup.button.callback('📊 Positions', CALLBACKS.PM_MENU_POSITIONS),
      Markup.button.callback('💰 PnL', CALLBACKS.PM_MENU_PNL),
    ],
    [
      Markup.button.callback('🔄 Rafraîchir', CALLBACKS.PM_MENU_REFRESH),
      Markup.button.callback('🔑 Voir clé privée', CALLBACKS.PM_SHOW_CREDENTIALS),
    ],
    [
      Markup.button.callback('🔁 Changer wallet', CALLBACKS.PM_CONNECT),
      Markup.button.callback('❌ Déconnecter', CALLBACKS.PM_DISCONNECT),
    ],
    [Markup.button.callback('🔙 Menu principal', CALLBACKS.BACK_TO_MENU)],
  ]);
}

export function polymarketConnectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Connecter avec wallet', CALLBACKS.PM_CONNECT)],
    [Markup.button.callback('❌ Annuler', CALLBACKS.PM_CANCEL)],
  ]);
}

export function confirmDisconnectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Oui, déconnecter', CALLBACKS.PM_CONFIRM_DISCONNECT),
      Markup.button.callback('❌ Non, annuler', CALLBACKS.PM_CANCEL_DISCONNECT),
    ],
  ]);
}

export function polymarketWalletSelectKeyboard(wallets, activeCredentials = null) {
  const buttons = [];
  const activeWalletId = activeCredentials?.walletId;
  const activeAddress = activeCredentials?.address?.toLowerCase();

  for (const wallet of wallets) {
    const chain = wallet.chain.toUpperCase();
    const isActive =
      (activeWalletId && wallet.id === activeWalletId) ||
      (activeAddress && wallet.address?.toLowerCase() === activeAddress);
    const prefix = isActive ? '⭐ ' : '';
    const label = `${prefix}${wallet.label} [${chain}] (${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)})`;
    buttons.push([Markup.button.callback(label, dynamicCallback.pmSelectWallet(wallet.id))]);
  }

  buttons.push([Markup.button.callback('➕ Générer nouveau wallet ETH', CALLBACKS.PM_NEW_WALLET)]);
  buttons.push([Markup.button.callback('❌ Annuler', CALLBACKS.PM_CANCEL)]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketHistoryKeyboard(page, totalPages) {
  const buttons = [];
  const navigation = [];

  if (page > 0) {
    navigation.push(Markup.button.callback('⬅️ Précédent', dynamicCallback.pmHistoryPage(page - 1)));
  }

  navigation.push(Markup.button.callback(`${page + 1}/${totalPages}`, CALLBACKS.PM_HISTORY_CURRENT));

  if (page < totalPages - 1) {
    navigation.push(Markup.button.callback('Suivant ➡️', dynamicCallback.pmHistoryPage(page + 1)));
  }

  buttons.push(navigation);
  buttons.push([Markup.button.callback('📝 Par thème', CALLBACKS.PM_MENU_THEMES)]);
  buttons.push([Markup.button.callback('🔙 Menu Polymarket', CALLBACKS.PM_MENU_REFRESH)]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketThemeSelectKeyboard(themes) {
  const buttons = themes.map((theme) => [
    Markup.button.callback(theme.label, dynamicCallback.pmThemePage(theme.id, 0)),
  ]);

  buttons.push([Markup.button.callback('🔙 Menu Polymarket', CALLBACKS.PM_MENU_REFRESH)]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketThemeTradesKeyboard(themeId, page, totalPages) {
  const buttons = [];
  const navigation = [];

  if (page > 0) {
    navigation.push(Markup.button.callback('⬅️ Précédent', dynamicCallback.pmThemePage(themeId, page - 1)));
  }

  navigation.push(Markup.button.callback(`${page + 1}/${totalPages}`, CALLBACKS.PM_THEME_CURRENT));

  if (page < totalPages - 1) {
    navigation.push(Markup.button.callback('Suivant ➡️', dynamicCallback.pmThemePage(themeId, page + 1)));
  }

  buttons.push(navigation);
  buttons.push([Markup.button.callback('📊 Changer thème', CALLBACKS.PM_MENU_THEMES)]);
  buttons.push([Markup.button.callback('🔙 Menu Polymarket', CALLBACKS.PM_MENU_REFRESH)]);

  return Markup.inlineKeyboard(buttons);
}
