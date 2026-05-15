import { adminExtendedKeyboard } from '../../keyboards/index.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
import { setupAdminStats } from './stats.js';
import { setupAdminUsers } from './users.js';
import { setupAdminActions, setupAdminMisc } from './actions.js';
import { setupAdminDust } from './dust.js';
import { setupAdminSecrets } from './secrets.js';
import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';

export function setupAdminHandlers(bot, storage, sessions, walletService) {
  // Admin command
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('❌ Accès refusé.');
    }

    ctx.reply('👑 *Panel Administrateur*\n\n_Accès superuser actif_', {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    });
  });

  // Admin panel back action
  bot.action('admin_panel', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!isAdmin(ctx)) return;
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
