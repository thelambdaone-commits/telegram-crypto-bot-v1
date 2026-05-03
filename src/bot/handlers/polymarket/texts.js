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

    if (details.balances) {
      text += `💵 Solde Polymarket: *${details.balances.polymarket || 'indisponible'}*\n`;
      text += `👛 Actifs wallet: *${details.balances.wallet || 'indisponible'}*\n`;
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

  pnl: (summary) => {
    if (!summary || (summary.positionCount === 0 && summary.realizedTradeCount === 0)) {
      return '💰 *PnL du portefeuille*\n\n━━━━━━━━━━━━\n❌ Aucune position ouverte ni trade exploitable\n━━━━━━━━━━━━';
    }

    const sign = summary.unrealizedPnl >= 0 ? '+' : '';
    const icon = summary.unrealizedPnl >= 0 ? '🟢' : '🔴';
    const realizedSign = summary.realizedPnl >= 0 ? '+' : '';
    const realizedIcon = summary.realizedPnl >= 0 ? '🟢' : '🔴';
    const totalPnl = summary.unrealizedPnl + summary.realizedPnl;
    const totalSign = totalPnl >= 0 ? '+' : '';
    const totalIcon = totalPnl >= 0 ? '🟢' : '🔴';
    let text =
      '💰 *PnL du portefeuille*\n\n' +
      '━━━━━━━━━━━━\n' +
      `Positions ouvertes: *${summary.positionCount}*\n` +
      `Positions clôturées: *${summary.closedPositionCount || 0}*\n` +
      `Valeur actuelle: *$${summary.currentValue.toFixed(2)}*\n` +
      `Coût estimé: *$${summary.costBasis.toFixed(2)}*\n` +
      `${icon} PnL non réalisé: *${sign}$${summary.unrealizedPnl.toFixed(2)}*\n` +
      `${realizedIcon} PnL réalisé estimé: *${realizedSign}$${summary.realizedPnl.toFixed(2)}*\n` +
      `${totalIcon} Total estimé: *${totalSign}$${totalPnl.toFixed(2)}*`;

    if (summary.pnlPercent !== null) {
      text += `\nROI ouvert: *${sign}${summary.pnlPercent.toFixed(2)}%*`;
    }

    if (summary.unmatchedSellCount > 0) {
      text += `\n⚠️ Ventes sans achat retrouvé: *${summary.unmatchedSellCount}*`;
    }

    text += '\n\n';

    for (const item of summary.items.slice(0, 8)) {
      const itemSign = item.pnl >= 0 ? '+' : '';
      const itemIcon = item.pnl >= 0 ? '🟢' : '🔴';
      text += `${itemIcon} ${item.title}\n`;
      text += `• Taille: ${item.size.toFixed(4)}\n`;
      text += `• Valeur: $${item.currentValue.toFixed(2)}\n`;
      text += `• PnL: *${itemSign}$${item.pnl.toFixed(2)}*`;
      if (item.pnlPercent !== null) {
        text += ` (${itemSign}${item.pnlPercent.toFixed(2)}%)`;
      }
      text += '\n\n';
    }

    if (summary.items.length > 8) {
      text += `_${summary.items.length - 8} position(s) supplémentaire(s) masquée(s)_\n`;
    }

    text += '━━━━━━━━━━━━\n_PnL basé sur les endpoints positions Polymarket._';
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

  history: (trades, page = 0, pageSize = 10, wallet = null, summary = null) => {
    if (!trades || trades.length === 0) {
      return '📜 *Historique Polymarket*\n\n━━━━━━━━━━━━\n❌ Aucun trade trouvé pour ce wallet\n━━━━━━━━━━━━';
    }

    const totalPages = Math.max(1, Math.ceil(trades.length / pageSize));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * pageSize;
    const pageTrades = trades.slice(start, start + pageSize);

    let text =
      '📜 *Historique Polymarket*\n' +
      `Page *${safePage + 1}/${totalPages}* - Trades *${start + 1}-${start + pageTrades.length}/${trades.length}*\n`;

    if (wallet?.address) {
      const label = wallet.label ? `⭐ *${wallet.label}*\n` : '';
      text += `${label}Adresse: \`${wallet.address}\`\n`;
    }

    if (summary) {
      const totalSign = summary.totalPnl >= 0 ? '+' : '';
      const totalIcon = summary.totalPnl >= 0 ? '🟢' : '🔴';
      const realizedSign = summary.realizedPnl >= 0 ? '+' : '';
      const realizedIcon = summary.realizedPnl >= 0 ? '🟢' : '🔴';
      text += `Volume total: *$${summary.totalVolume.toFixed(2)}*\n`;
      text += `Positions ouvertes: *${summary.positionCount}*\n`;
      text += `Positions clôturées: *${summary.closedPositionCount || 0}*\n`;
      text += `${realizedIcon} PnL réalisé estimé: *${realizedSign}$${summary.realizedPnl.toFixed(2)}*\n`;
      text += `${totalIcon} Total estimé: *${totalSign}$${summary.totalPnl.toFixed(2)}*\n`;
    }

    text += '\n' +
      '━━━━━━━━━━━━\n';

    for (const trade of pageTrades) {
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

  themeSelect: () =>
    '📊 *Trades par thème*\n\n' +
    'Choisissez un thème pour filtrer les trades du wallet Polymarket actif.',

  themeTrades: (theme, trades, page = 0, pageSize = 10, wallet = null) => {
    if (!trades || trades.length === 0) {
      return `📊 *${theme.label}*\n\n━━━━━━━━━━━━\n❌ Aucun trade trouvé pour ce thème\n━━━━━━━━━━━━`;
    }

    const totalPages = Math.max(1, Math.ceil(trades.length / pageSize));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * pageSize;
    const pageTrades = trades.slice(start, start + pageSize);

    let text =
      `📊 *${theme.label}*\n` +
      `Page *${safePage + 1}/${totalPages}* - Trades *${start + 1}-${start + pageTrades.length}/${trades.length}*\n`;

    if (wallet?.address) {
      const label = wallet.label ? `⭐ *${wallet.label}*\n` : '';
      text += `${label}Adresse: \`${wallet.address}\`\n`;
    }

    text += '\n━━━━━━━━━━━━\n';

    for (const trade of pageTrades) {
      const when = trade.timestamp
        ? new Date(Number(trade.timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 16)
        : trade.match_time || trade.last_update || 'N/A';
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
