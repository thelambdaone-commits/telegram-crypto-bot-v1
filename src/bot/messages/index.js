/**
 * Messages utilisateur - Textes ludiques et agréables
 */

export const MESSAGES = {
  // Welcome & Start
  welcome: (name) => `👋 Salut ${name} ! Bienvenue sur ton wallet crypto sécurisé !`,
  walletGenerated: '✨ Ton wallet a été créé avec succès !',
  
  // Wallet
  walletCreated: '🎉 Wallet Créé',
  noWallets: '🔍 Aucun wallet pour le moment',
  walletDeleted: '🗑️ Wallet supprimé',
  
  // Send
  enterAddress: '📬 Entre l\'adresse du destinataire',
  enterAmount: '💰 Quel montant veux-tu envoyer ?',
  txSent: '✅ Transaction envoyée',
  txFailed: '❌ Échec de la transaction',
  invalidAddress: '⚠️ Cette adresse n\'est pas valide',
  
  // Security
  seedWarning: '🔐 Garde cette phrase secrète ! C\'est la clé de tes fonds.',
  neverShare: '⚠️ Ne la partage JAMAIS avec personne.',
  autoDelete: (seconds) => `🕐 Ce message sera supprimé dans ${seconds} secondes`,
  
  // Balances
  totalBalance: '💎 Solde Total',
  noBalance: '💸 Aucun solde disponible',
  
  // Errors
  error: '😕 Oups ! Une erreur est survenue',
  tryAgain: '🔄 Réessaye dans quelques instants',
  
  // Success
  success: '✨ Opération réussie !',
  copied: '📋 Copié !',
  
  // Admin
  adminPanel: '👑 Panel Admin',
  stats: '📊 Statistiques',
  users: '👥 Utilisateurs',
};

export const EMOJIS = {
  wallet: '👛',
  send: '📤',
  receive: '📥',
  key: '🔑',
  seed: '🔐',
  warning: '⚠️',
  success: '✅',
  error: '❌',
  loading: '⏳',
  money: '💰',
  chart: '📈',
  lock: '🔒',
  unlock: '🔓',
};
