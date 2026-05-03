import { Markup } from 'telegraf';

export function polymarketMenuKeyboard(connected) {
  if (!connected) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔗 Connecter un wallet', 'pm_connect')],
      [Markup.button.callback('🔄 Rafraîchir', 'pm_menu_refresh')],
      [Markup.button.callback('🔙 Menu principal', 'back_to_menu')],
    ]);
  }

  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📜 Historique', 'pm_menu_history'),
      Markup.button.callback('📋 Ordres', 'pm_menu_orders'),
    ],
    [
      Markup.button.callback('📊 Positions', 'pm_menu_positions'),
      Markup.button.callback('💰 PnL', 'pm_menu_pnl'),
    ],
    [
      Markup.button.callback('🔄 Rafraîchir', 'pm_menu_refresh'),
      Markup.button.callback('📤 Exporter', 'pm_export_polyfill'),
    ],
    [
      Markup.button.callback('🔁 Changer wallet', 'pm_connect'),
      Markup.button.callback('❌ Déconnecter', 'pm_disconnect'),
    ],
    [Markup.button.callback('🔙 Menu principal', 'back_to_menu')],
  ]);
}

export function polymarketConnectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Connecter avec wallet', 'pm_connect')],
    [Markup.button.callback('❌ Annuler', 'pm_cancel')],
  ]);
}

export function confirmDisconnectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Oui, déconnecter', 'pm_confirm_disconnect'),
      Markup.button.callback('❌ Non, annuler', 'pm_cancel_disconnect'),
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
    buttons.push([Markup.button.callback(label, `pm_select_wallet_${wallet.id}`)]);
  }

  buttons.push([Markup.button.callback('➕ Générer nouveau wallet ETH', 'pm_new_wallet')]);
  buttons.push([Markup.button.callback('❌ Annuler', 'pm_cancel')]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketHistoryKeyboard(page, totalPages) {
  const buttons = [];
  const navigation = [];

  if (page > 0) {
    navigation.push(Markup.button.callback('⬅️ Précédent', `pm_history_page_${page - 1}`));
  }

  navigation.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'pm_history_current'));

  if (page < totalPages - 1) {
    navigation.push(Markup.button.callback('Suivant ➡️', `pm_history_page_${page + 1}`));
  }

  buttons.push(navigation);
  buttons.push([Markup.button.callback('📝 Par thème', 'pm_menu_themes')]);
  buttons.push([Markup.button.callback('🔙 Menu Polymarket', 'pm_menu_refresh')]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketThemeSelectKeyboard(themes) {
  const buttons = themes.map((theme) => [
    Markup.button.callback(theme.label, `pm_theme_${theme.id}_page_0`),
  ]);

  buttons.push([Markup.button.callback('🔙 Menu Polymarket', 'pm_menu_refresh')]);

  return Markup.inlineKeyboard(buttons);
}

export function polymarketThemeTradesKeyboard(themeId, page, totalPages) {
  const buttons = [];
  const navigation = [];

  if (page > 0) {
    navigation.push(Markup.button.callback('⬅️ Précédent', `pm_theme_${themeId}_page_${page - 1}`));
  }

  navigation.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'pm_theme_current'));

  if (page < totalPages - 1) {
    navigation.push(Markup.button.callback('Suivant ➡️', `pm_theme_${themeId}_page_${page + 1}`));
  }

  buttons.push(navigation);
  buttons.push([Markup.button.callback('📊 Changer thème', 'pm_menu_themes')]);
  buttons.push([Markup.button.callback('🔙 Menu Polymarket', 'pm_menu_refresh')]);

  return Markup.inlineKeyboard(buttons);
}
