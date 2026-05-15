import { setupJitoMenuHandlers } from './jito/menu.js';
import { setupJitoEnterHandlers } from './jito/enter.js';
import { setupJitoWithdrawHandlers } from './jito/withdraw.js';
import { setupJitoUnstakeHandlers } from './jito/unstake.js';
import { syncJitoUnstakes } from './jito/sync.js';
import { logger } from '../../../shared/logger.js';

export { setupJitoMenuHandlers, setupJitoEnterHandlers, setupJitoWithdrawHandlers, setupJitoUnstakeHandlers, syncJitoUnstakes };

export function setupJitoHandlers(bot, storage, walletService, sessions) {
  setupJitoMenuHandlers(bot, storage, walletService, sessions);
  setupJitoEnterHandlers(bot, storage, walletService, sessions);
  setupJitoWithdrawHandlers(bot, storage, walletService, sessions);
  setupJitoUnstakeHandlers(bot, storage, walletService, sessions);

  logger.info('Jito handlers loaded');
}
