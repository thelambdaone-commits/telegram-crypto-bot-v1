import { setupWalletCommands } from './wallet.commands.js';
import { setupMarketCommands } from './market.commands.js';
import { setupInfoCommands } from './info.commands.js';

/**
 * Initialize all slash commands
 * Groups commands by category for better modularity
 */
export function setupCommands(bot, storage, walletService, sessions) {
  setupWalletCommands(bot, storage, walletService, sessions);
  setupMarketCommands(bot);
  setupInfoCommands(bot);
}
