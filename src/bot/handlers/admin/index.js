import { adminExtendedKeyboard } from '../../keyboards/index.js';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { setupAdminStats } from './stats.js';
import { setupAdminUsers } from './users.js';
import { setupAdminActions, setupAdminMisc } from './actions.js';
import { setupAdminDust } from './dust.js';
import { setupAdminSecrets } from './secrets.js';
import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { CALLBACKS } from '../../constants/callbacks.js';

export function setupAdminHandlers(bot, storage, sessions, walletService) {
  // Admin command
  bot.command('admin', async (ctx) => {
    if (!adminGuard(ctx)) return;

    ctx.reply('👑 *Panel Administrateur*\n\n_Accès superuser actif_', {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    });
  });

  // Admin panel back action
  bot.action(CALLBACKS.ADMIN_PANEL, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;
    sessions.clearState(ctx.chat.id);

    ctx.editMessageText('👑 *Panel Administrateur*\n\n_Accès superuser actif_', {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    });
  });

  // Initialize sub-modules
  setupAdminStats(bot, storage);
  setupAdminUsers(bot, storage);
  setupAdminActions(bot, storage, sessions);
  setupAdminMisc(bot, storage, sessions);
  setupAdminDust(bot, storage, walletService);
  setupAdminSecrets(bot, storage, sessions);
}
