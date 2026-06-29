/**
 * Public command list shown in the Telegram client (the "/" autocomplete and
 * the blue Menu button). Registered via setMyCommands at startup, per Telegram's
 * official bot guidelines. Admin/internal commands are intentionally excluded.
 */
import { logger } from '../shared/logger.js';

export const BOT_COMMANDS = [
  { command: 'start', description: '🚀 Démarrer le bot' },
  { command: 'menu', description: '🎮 Menu principal' },
  { command: 'wallet', description: '💰 Mes wallets' },
  { command: 'gen', description: '🆕 Générer un nouveau wallet' },
  { command: 'recevoir', description: '📥 Recevoir des fonds (adresse + QR)' },
  { command: 'send', description: '📤 Envoyer des cryptos (montant, € ou max)' },
  { command: 'validate', description: '✅ Vérifier qu’une adresse est valide' },
  { command: 'bal', description: '💰 Vérifier un solde' },
  { command: 'tx', description: '📜 Historique des transactions' },
  { command: 'price', description: '💹 Prix des cryptos en EUR' },
  { command: 'gas', description: '⛽ Frais de transaction (toutes les chaînes)' },
  { command: 'graph', description: '📈 Graphique des prix' },
  { command: 'unit', description: '🔢 Conversion d’unités' },
  { command: 'chains', description: '🔗 Blockchains supportées' },
  { command: 'list', description: '📋 Cryptos & tokens supportés' },
  { command: 'swaps', description: '💱 Échange sans KYC' },
  { command: 'invoice', description: '💳 Créer une facture (recevoir un paiement)' },
  { command: 'invoices', description: '🧾 Mes factures' },
  { command: 'learn', description: '📚 Leçon : Coin vs Token' },
  { command: 'help', description: '❓ Aide' },
  { command: 'id', description: '🆔 Mon ChatID / UserID' },
];

/**
 * Register the command list with Telegram so the client shows the command menu.
 * Best-effort: a failure here must never block startup.
 */
export async function registerBotCommands(bot) {
  try {
    await bot.telegram.setMyCommands(BOT_COMMANDS);
    logger.info('Bot command menu registered', { count: BOT_COMMANDS.length });
  } catch (e) {
    logger.warn('Failed to register bot command menu', { error: e.message });
  }
}
