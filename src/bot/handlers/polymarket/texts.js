export const polymarketTexts = {
  menu: (connected, details = {}) => {
    const active = details.active;
    const savedCount = details.savedCount || 0;
    let text =
      '🎯 *Polymarket*\n' +
      '━━━━━━━━━━━━\n\n' +
      `${connected ? '✅ *Connecté*' : '❌ *Non connecté*'}\n`;

    if (active?.address) {
      const label = active.walletLabel || 'Wallet Polymarket';
      const chain = active.chain ? active.chain.toUpperCase() : 'EVM';
      text += `🔑 Wallet actif: *${label}* (${chain})\n`;
      text += `📬 \`${active.address.slice(0, 8)}...${active.address.slice(-6)}\`\n`;
    }

    if (savedCount > 0) {
      text += `💾 Connexions sauvegardées: *${savedCount}*\n`;
    }

    text += '\n━━━━━━━━━━━━';
    return text;
  },

  connect: () =>
    '🔗 *Connexion Polymarket*\n\n' +
    'Pour utiliser Polymarket, vous devez:\n\n' +
    '1. avoir une private key Ethereum/Polygon\n' +
    '2. connecter vos identifiants API\n\n' +
    'Contactez l\'admin pour obtenir vos identifiants.',

  connectSuccess: (address) =>
    '✅ *Connecté à Polymarket*\n\n' +
    `Adresse: \`${address}\`\n\n` +
    'Vous pouvez maintenant trader via le bot.',

  disconnectSuccess: () =>
    '✅ *Déconnexion Polymarket*\n\n' +
    'Le wallet Polymarket actif a été désactivé.\n' +
    'Vos credentials restent sauvegardés pour pouvoir switcher plus tard.',

  noCredentials: () =>
    '❌ *Non connecté*\n\n' +
    'Utilisez `/polyconnect` pour connecter votre compte Polymarket.',

  positions: (positions) => {
    if (!positions || positions.length === 0) {
      return '📊 *Mes Positions*\n\n━━━━━━━━━━━━\n❌ Aucune position ouverte\n━━━━━━━━━━━━';
    }

    let text = '📊 *Mes Positions*\n\n━━━━━━━━━━━━\n';
    for (const pos of positions) {
      text += `${pos.conditionId}\n`;
      text += `Size: ${pos.size}\n`;
      text += `Side: ${pos.side}\n`;
      text += `Price: ${pos.price}\n\n`;
    }
    text += '━━━━━━━━━━━━';
    return text;
  },

  orders: (orders) => {
    if (!orders || orders.length === 0) {
      return '📋 *Mes Ordres*\n\n━━━━━━━━━━━━\n❌ Aucun ordre actif\n━━━━━━━━━━━━';
    }

    let text = '📋 *Mes Ordres*\n\n━━━━━━━━━━━━\n';
    for (const order of orders) {
      text += `ID: ${order.orderID}\n`;
      text += `Condition: ${order.conditionId}\n`;
      text += `Size: ${order.size}\n`;
      text += `Side: ${order.side}\n`;
      text += `Price: ${order.price}\n\n`;
    }
    text += '━━━━━━━━━━━━';
    return text;
  },

  history: (trades) => {
    if (!trades || trades.length === 0) {
      return '📜 *Historique Polymarket*\n\n━━━━━━━━━━━━\n❌ Aucun trade trouvé pour ce wallet\n━━━━━━━━━━━━';
    }

    let text = '📜 *Historique Polymarket*\n\n━━━━━━━━━━━━\n';
    for (const trade of trades.slice(0, 10)) {
      const when = trade.timestamp
        ? new Date(Number(trade.timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 16)
        : trade.match_time || trade.last_update || 'N/A';
      const label = trade.walletLabel ? `${trade.active ? '⭐ ' : ''}${trade.walletLabel}` : null;
      if (label) text += `${label}\n`;
      text += `🎯 ${trade.title || trade.market || trade.asset_id || trade.id}\n`;
      text += `• Side: *${trade.side || 'N/A'}*\n`;
      text += `• Outcome: ${trade.outcome || 'N/A'}\n`;
      text += `• Size: ${trade.size || 'N/A'}\n`;
      text += `• Price: ${trade.price || 'N/A'}\n`;
      text += `• Date: ${when}\n\n`;
    }
    text += '━━━━━━━━━━━━';
    return text;
  },

  error: (msg) => `❌ *Erreur*\n\n${msg}`,
};

export const confirmTexts = {
  disconnect: () =>
    '⚠️ *Confirmation*\n\n' +
    'Voulez-vous vraiment supprimer vos identifiants Polymarket?\n\n' +
    'Cette action est irréversible.',
};
