/**
 * Textes centralisés - Messages longs du bot Slash
 * @module ui/texts
 */

import { sectionTitle, separator } from './formatters.js';

/**
 * Texte d'aide complet pour /help
 * @returns {string}
 */
export function getFullHelpText() {
  return `
🎮 <b>Aide du Bot</b>

${sectionTitle('🔐', 'WALLETS')}
<code>/wallet</code> — 💰 Afficher mes wallets
<code>/gen &lt;réseau&gt;</code> — 🆕 Générer un wallet (<code>/gen</code> pour la liste)
<code>/receive</code> — 📥 Adresse + QR (par actif/réseau)
<code>/bal &lt;réseau&gt; &lt;adresse&gt;</code> — 💰 Vérifier un solde

${sectionTitle('💸', 'TRANSACTIONS')}
<code>/send &lt;réseau&gt; &lt;adresse&gt; &lt;montant&gt;</code> — 📤 Envoyer des cryptos
<code>/tx &lt;réseau&gt; &lt;adresse&gt; [limite]</code> — 📜 Historique des transactions

${sectionTitle('📊', 'INFOS MARCHÉ')}
<code>/price</code> — 💹 Prix en EUR
<code>/gas [eth|btc|sol]</code> — ⛽ Frais de transaction
<code>/graph &lt;token&gt; [7|30|90|365]</code> — 📈 Graphique (défaut 365j)

${sectionTitle('🔢', "CONVERSION D'UNITÉS")}
<code>/unit &lt;montant&gt; &lt;unité&gt;</code> — Convertir les unités crypto
BTC ↔ satoshi · ETH ↔ gwei/wei · SOL ↔ lamport
XMR ↔ piconero · ZEC ↔ zatoshi · TRX ↔ sun

<i>Ex : /unit 1 btc → 100 000 000 satoshis</i>

${sectionTitle('💱', 'EXCHANGE')}
<code>/list</code> — 📋 Cryptos &amp; tokens supportés
<code>/swaps</code> — 💱 Échange sans KYC (cross-chain)
<code>/invoice</code> — 💳 Créer une facture (recevoir un paiement)
<code>/invoices</code> — 🧾 Mes factures

${sectionTitle('📚', 'ÉDUCATION')}
<code>/learn</code> — 📖 Coin vs Token

${sectionTitle('🆘', 'GÉNÉRAL')}
<code>/start</code> — 🚀 Démarrer
<code>/menu</code> — 🎮 Menu principal
<code>/chains</code> — 🔗 Blockchains supportées
<code>/id</code> — 🆔 Ton ChatID / UserID
<code>/help</code> — ❓ Cette aide

💡 <b>Astuce :</b> Utilise les boutons du menu pour naviguer plus facilement
  `.trim();
}

/**
 * Prompt premium et unique de sélection de réseau (création de wallet et
 * réception). Le corps du message porte le titre/séparateur/avertissement —
 * le clavier (chainSelectionKeyboard) ne porte que les boutons.
 * @returns {string}
 */
export function chainSelectionPrompt() {
  return [
    '🌐 <b>Choisis ton réseau</b>',
    separator(),
    '🔑 Chaque réseau possède sa propre adresse.',
    "💵 Les stablecoins <b>USDT</b> / <b>USDC</b> arrivent sur le réseau de l'adresse choisie.",
    '',
    '⚠️ Un envoi depuis un <b>mauvais réseau</b> entraîne une <b>perte définitive</b> des fonds.',
  ].join('\n');
}
