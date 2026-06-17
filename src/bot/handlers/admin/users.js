import { adminExtendedKeyboard, adminUserKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, escapeHtml } from '../../../shared/utils/telegram.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';

export function setupAdminUsers(bot, storage) {
  // List all users
  bot.action('admin_list_users', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (!isAdmin(chatId)) return;

    const allEntities = await storage.getAllUsers();

    if (allEntities.length === 0) {
      return ctx.editMessageText('<b>Aucun utilisateur</b>', {
        parse_mode: 'HTML',
        ...adminExtendedKeyboard(),
      });
    }

    // Séparer utilisateurs et groupes (IDs négatifs = groupes)
    const users = allEntities.filter((u) => u.chatId > 0);
    const groups = allEntities.filter((u) => u.chatId < 0);

    let text = '📊 <b>Tableau de Bord</b>\n\n';

    // Section Utilisateurs
    text += `👥 <b>UTILISATEURS</b> (${users.length})\n`;
    text += '───────────\n';

    for (const user of users.slice(0, 15)) {
      const displayName = user.username
        ? `@${escapeHtml(user.username)}`
        : escapeHtml(user.firstName);
      const walletEmoji = user.walletCount > 0 ? '👛' : '📭';
      text += `\n👤 <b>${displayName}</b>\n`;
      text += `   🆔 <code>${user.chatId}</code>\n`;
      text += `   ${walletEmoji} ${user.walletCount} wallet${user.walletCount > 1 ? 's' : ''} • 📅 ${new Date(user.createdAt).toLocaleDateString('fr-FR')}\n`;
    }

    if (users.length > 15) {
      text += `\n<i>... +${users.length - 15} autres</i>\n`;
    }

    // Section Groupes
    if (groups.length > 0) {
      text += `\n\n🏢 <b>GROUPES</b> (${groups.length})\n`;
      text += '───────────\n';

      for (const group of groups.slice(0, 10)) {
        const displayName = group.username
          ? `@${escapeHtml(group.username)}`
          : escapeHtml(group.firstName || 'Groupe sans nom');
        const walletEmoji = group.walletCount > 0 ? '👛' : '📭';
        text += `\n💬 <b>${displayName}</b>\n`;
        text += `   🆔 <code>${group.chatId}</code>\n`;
        text += `   ${walletEmoji} ${group.walletCount} wallet${group.walletCount > 1 ? 's' : ''} • 📅 ${new Date(group.createdAt).toLocaleDateString('fr-FR')}\n`;
      }

      if (groups.length > 10) {
        text += `\n<i>... +${groups.length - 10} autres</i>\n`;
      }
    }

    // Résumé
    const totalWallets = allEntities.reduce((sum, e) => sum + e.walletCount, 0);
    text += '\n───────────\n';
    text += `📈 <b>Total :</b> ${users.length} users • ${groups.length} groupes • ${totalWallets} wallets`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...adminExtendedKeyboard(),
      });
    } catch (e) {
      // Ignore "message is not modified" error
      if (!e.message?.includes('message is not modified')) {
        throw e;
      }
    }
  });

  // View user details
  bot.action(/^admin_view_user_quick_(\d+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (!isAdmin(chatId)) return;

    try {
      const userData = await storage.loadUserData(targetUserId);
      const wallets = userData.wallets || [];

      auditLogger.log(
        AUDIT_ACTIONS.ADMIN_VIEW_USER,
        chatId,
        { targetUserId, source: 'quick_view' },
        true
      );

      const displayName = escapeHtml(userData.firstName);
      const usernameText = userData.username ? `@${escapeHtml(userData.username)}` : 'N/A';

      let message = `👤 <b>Utilisateur ${targetUserId}</b>\n\n`;
      message += `🔹 Nom : ${displayName}\n`;
      message += `🔹 Username : ${usernameText}\n`;
      message += `🔹 Wallets : ${wallets.length}\n\n`;

      for (const wallet of wallets) {
        message += `🔸 <b>${escapeHtml(wallet.label)}</b>\n`;
        message += `<code>${escapeHtml(wallet.address)}</code>\n\n`;
      }

      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...adminUserKeyboard(targetUserId),
      });
    } catch (error) {
      await ctx.reply(`❌ Erreur : ${escapeHtml(error.message)}`, adminExtendedKeyboard());
    }
  });
}
