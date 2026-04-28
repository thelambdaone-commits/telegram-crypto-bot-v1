/**
 * Textes centralisés - Messages longs du bot Slash
 * @module ui/texts
 */

import { separator, sectionTitle } from './formatters.js';

/**
 * Texte d'aide principal du bot
 * @returns {string}
 */
export function getHelpText() {
  return `
🎮 *Aide du Bot Slash*

${sectionTitle('🔐', 'WALLETS')}
\`/wallet\` — 👛 Affiche tes wallets
\`/gen btc|eth|sol\` — 🆕 Génère un wallet
\`/bal <réseau> <adresse>\` — 💰 Vérifie un solde

${sectionTitle('💸', 'TRANSACTIONS')}
\`/send <réseau> <adresse> <montant>\` — 📤 Envoie
\`/tx <réseau> <adresse>\` — 📜 Historique

${sectionTitle('📊', 'INFOS MARCHÉ')}
\`/price\` — 💹 Prix des cryptos
\`/gas\` — ⛽ Prix du gas ETH
\`/graph btc|eth|sol [période]\` — 📈 Graphique des prix
\`/unit <montant> <unité>\` — 🔢 Conversion d'unités

${sectionTitle('🆘', 'GÉNÉRAL')}
\`/start\` — 🚀 Menu principal
\`/help\` — ❓ Cette aide
\`/learn\` — 📚 Leçon : Coin vs Token

💡 Utilise les boutons pour naviguer !
  `.trim();
}

/**
 * Texte d'aide complet pour /help
 * @returns {string}
 */
export function getFullHelpText() {
  return `
🎮 *Bienvenue dans l'aide du Bot Slash !*

${sectionTitle('🔐', 'WALLETS')}
\`/wallet\` — 👛 Affiche tes wallets
\`/gen btc|eth|sol\` — 🆕 Génère un nouveau wallet
\`/bal <réseau> <adresse>\` — 💰 Vérifie un solde

${sectionTitle('💸', 'TRANSACTIONS')}
\`/send <réseau> <adresse> <montant>\` — 📤 Envoie des cryptos
\`/tx <réseau> <adresse> [limite]\` — 📜 Historique des transactions

${sectionTitle('📊', 'INFOS MARCHÉ')}
\`/price btc|eth|sol\` — 💹 Prix actuel en EUR
\`/gas\` — ⛽ Prix du gas Ethereum
\`/graph btc|eth|sol [7j|30j|90j|1an]\` — 📈 Graphique des prix

${sectionTitle('🔢', 'CONVERSION D\'UNITÉS')}
\`/unit <montant> <unité>\` — Convertit les unités crypto

*Unités supportées :*
• BTC ↔ satoshi (1 BTC = 100M sat)
• ETH ↔ gwei ↔ wei (1 ETH = 1G gwei)
• SOL ↔ lamport (1 SOL = 1G lamports)

_Ex: /unit 1 btc → 100000000 satoshis_

${sectionTitle('📚', 'ÉDUCATION')}
\`/learn\` — 📖 Leçon : Coin vs Token

${sectionTitle('🆘', 'GÉNÉRAL')}
\`/start\` — 🚀 Démarrer / Menu principal
\`/help\` — ❓ Cette aide

💡 *Astuce :* Utilise les boutons du menu pour une navigation plus facile !
  `.trim();
}
