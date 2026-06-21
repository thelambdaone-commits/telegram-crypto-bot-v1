import { adminExtendedKeyboard } from '../../keyboards/index.js';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { setupAdminStats } from './stats.js';
import { setupAdminUsers } from './users.js';
import { setupAdminActions, setupAdminMisc } from './actions.js';
import { setupAdminSecrets } from './secrets.js';
import { setupAdminAudit } from './audit.js';
import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { CALLBACKS } from '../../constants/callbacks.js';

export function setupAdminHandlers(bot, storage, sessions, walletService) {
  // Admin command
  bot.command('admin', async (ctx) => {
    if (!adminGuard(ctx)) return;

    ctx.reply('👑 <b>Panel Administrateur</b>\n\n<i>Accès superuser actif</i>', {
      parse_mode: 'HTML',
      ...adminExtendedKeyboard(),
    });
  });

  // Admin panel back action
  bot.action(CALLBACKS.ADMIN_PANEL, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;
    sessions.clearState(ctx.chat.id);

    ctx.editMessageText('👑 <b>Panel Administrateur</b>\n\n<i>Accès superuser actif</i>', {
      parse_mode: 'HTML',
      ...adminExtendedKeyboard(),
    });
  });

  // Initialize sub-modules
  setupAdminStats(bot, storage, walletService);
  setupAdminUsers(bot, storage);
  setupAdminActions(bot, storage, sessions);
  setupAdminMisc(bot, storage, sessions);
  setupAdminSecrets(bot, storage, sessions);
  setupAdminAudit(bot, storage, sessions, walletService);
}
