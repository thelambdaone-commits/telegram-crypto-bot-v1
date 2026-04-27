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
      Markup.button.callback('🔄 Rafraîchir', 'pm_menu_refresh'),
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

export function polymarketWalletSelectKeyboard(wallets) {
  const buttons = [];

  for (const wallet of wallets) {
    const chain = wallet.chain.toUpperCase();
    const label = `${wallet.label} [${chain}] (${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)})`;
    buttons.push([Markup.button.callback(label, `pm_select_wallet_${wallet.id}`)]);
  }

  buttons.push([Markup.button.callback('➕ Générer nouveau wallet ETH', 'pm_new_wallet')]);
  buttons.push([Markup.button.callback('❌ Annuler', 'pm_cancel')]);

  return Markup.inlineKeyboard(buttons);
}
