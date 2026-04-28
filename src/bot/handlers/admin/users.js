import { adminExtendedKeyboard, adminUserKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
import { blacklistUser, unblacklistUser } from '../../middlewares/security.middleware.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';

// Helper to escape Markdown special characters
function escapeMarkdown(text) {
  if (!text) return 'N/A';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export function setupAdminUsers(bot, storage, sessions) {
  // List all users
  bot.action('admin_list_users', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (!isAdmin(chatId)) return;

    const allEntities = await storage.getAllUsers();

    if (allEntities.length === 0) {
      return ctx.editMessageText('*Aucun utilisateur*', {
        parse_mode: 'Markdown',
        ...adminExtendedKeyboard(),
      });
    }

    // Séparer utilisateurs et groupes (IDs négatifs = groupes)
    const users = allEntities.filter(u => u.chatId > 0);
    const groups = allEntities.filter(u => u.chatId < 0);

    let text = '📊 *Tableau de Bord*\n\n';

    // Section Utilisateurs
    text += `👥 *UTILISATEURS* (${users.length})\n`;
    text += '━━━━━━━━━━━━\n';
    
    for (const user of users.slice(0, 15)) {
      const displayName = user.username ? `@${user.username}` : escapeMarkdown(user.firstName);
      const walletEmoji = user.walletCount > 0 ? '👛' : '📭';
      text += `\n👤 *${displayName}*\n`;
      text += `   🆔 \`${user.chatId}\`\n`;
      text += `   ${walletEmoji} ${user.walletCount} wallet${user.walletCount > 1 ? 's' : ''} • 📅 ${new Date(user.createdAt).toLocaleDateString('fr-FR')}\n`;
    }
    
    if (users.length > 15) {
      text += `\n_... +${users.length - 15} autres_\n`;
    }

    // Section Groupes
    if (groups.length > 0) {
      text += `\n\n🏢 *GROUPES* (${groups.length})\n`;
      text += '━━━━━━━━━━━━\n';
      
      for (const group of groups.slice(0, 10)) {
        const displayName = group.username ? `@${group.username}` : escapeMarkdown(group.firstName || 'Groupe sans nom');
        const walletEmoji = group.walletCount > 0 ? '👛' : '📭';
        text += `\n💬 *${displayName}*\n`;
        text += `   🆔 \`${group.chatId}\`\n`;
        text += `   ${walletEmoji} ${group.walletCount} wallet${group.walletCount > 1 ? 's' : ''} • 📅 ${new Date(group.createdAt).toLocaleDateString('fr-FR')}\n`;
      }
      
      if (groups.length > 10) {
        text += `\n_... +${groups.length - 10} autres_\n`;
      }
    }

    // Résumé
    const totalWallets = allEntities.reduce((sum, e) => sum + e.walletCount, 0);
    text += '\n━━━━━━━━━━━━\n';
    text += `📈 *Total :* ${users.length} users • ${groups.length} groupes • ${totalWallets} wallets`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
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

      auditLogger.log(AUDIT_ACTIONS.ADMIN_VIEW_USER, chatId, { targetUserId, source: 'quick_view' }, true);

      const displayName = escapeMarkdown(userData.firstName);
      const usernameText = userData.username ? `@${escapeMarkdown(userData.username)}` : 'N/A';

      let message = `👤 *Utilisateur ${targetUserId}*\n\n`;
      message += `🔹 Nom : ${displayName}\n`;
      message += `🔹 Username : ${usernameText}\n`;
      message += `🔹 Wallets : ${wallets.length}\n\n`;

      for (const wallet of wallets) {
        message += `🔸 *${escapeMarkdown(wallet.label)}*\n`;
        message += `\`${wallet.address}\`\n\n`;
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...adminUserKeyboard(targetUserId),
      });
    } catch (error) {
      await ctx.reply(`❌ Erreur : ${escapeMarkdown(error.message)}`, adminExtendedKeyboard());
    }
  });
}
