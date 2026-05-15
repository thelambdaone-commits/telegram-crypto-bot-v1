import {
  adminExtendedKeyboard,
  adminUserKeyboard,
  adminCancelKeyboard,
} from '../../keyboards/index.js';
import { safeAnswerCbQuery, escapeMarkdown } from '../../../shared/utils/telegram.js';
import { adminGuard, isAdmin } from '../../middlewares/auth.middleware.js';
import {
  getRateLimitStats,
  blacklistUser,
  unblacklistUser,
} from '../../middlewares/security.middleware.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { logger } from '../../../shared/logger.js';



const TELEGRAM_MESSAGE_LIMIT = 4096;

function splitTelegramMessage(text) {
  const value = String(text || '');
  const chunks = [];

  for (let i = 0; i < value.length; i += TELEGRAM_MESSAGE_LIMIT) {
    chunks.push(value.slice(i, i + TELEGRAM_MESSAGE_LIMIT));
  }

  return chunks.length > 0 ? chunks : [''];
}

async function sendMessageWithMarkdownFallback(telegram, chatId, text) {
  try {
    await telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (error) {
    if (!/can't parse entities|message is too long|MESSAGE_TOO_LONG/i.test(error.message || '')) {
      throw error;
    }

    await telegram.sendMessage(chatId, text);
  }
}

async function sendBroadcast(ctx, storage, text) {
  const chatId = ctx.chat.id;
  const users = await storage.getAllUsers();
  const chunks = splitTelegramMessage(text);

  // Filter out groups/channels (negative IDs) and admin's own chat ID.
  const validUsers = users.filter((u) => u.chatId > 0 && u.chatId !== chatId);

  let sent = 0;
  let failed = 0;

  await ctx.reply(`🚀 Diffusion en cours vers ${validUsers.length} utilisateurs...`);

  for (const user of validUsers) {
    try {
      for (const chunk of chunks) {
        await sendMessageWithMarkdownFallback(ctx.telegram, user.chatId, chunk);
      }
      sent++;
    } catch (e) {
      logger.warn(`Broadcast failed for ${user.chatId}`, { error: e.message });
      failed++;
    }
  }

  auditLogger.log(
    AUDIT_ACTIONS.ADMIN_BROADCAST,
    chatId,
    { sent, failed, total: validUsers.length, chunks: chunks.length },
    true
  );

  return ctx.reply(
    `✅ *Broadcast terminé*\n\n✨ Envoyés : ${sent}\n❌ Échecs : ${failed}\n📄 Parties : ${chunks.length}`,
    {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    }
  );
}

function promptBroadcast(ctx, sessions, edit = false) {
  const chatId = ctx.chat.id;
  sessions.setState(chatId, 'ADMIN_ENTER_BROADCAST');

  const message =
    '📣 *Broadcast Global*\n\nEnvoie-moi le message à diffuser à tous les utilisateurs.\n\n_Le Markdown est supporté._';
  const options = {
    parse_mode: 'Markdown',
    ...adminCancelKeyboard(),
  };

  if (edit) {
    return ctx.editMessageText(message, options);
  }

  return ctx.reply(message, options);
}

export function setupAdminActions(bot, storage, sessions) {
  // Security stats
  bot.action('admin_security', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const securityStats = getRateLimitStats();

    let text = '🛡️ *Sécurité & Limites*\n\n';
    text += '🚦 *Global :*\n';
    text += `🔹 Actifs : ${securityStats.global.activeUsers}\n`;
    text += `🚫 Bloqués : ${securityStats.global.blacklistedUsers}\n\n`;
    text += '🔐 *Actions Sensibles :*\n';
    text += `🔹 Actifs : ${securityStats.sensitive.activeUsers}\n\n`;
    text += '💸 *Transactions :*\n';
    text += `🔹 Actifs : ${securityStats.transaction.activeUsers}`;

    if (securityStats.global.blacklist.length > 0) {
      text += '\n\n🚫 *IDs bloqués :*\n';
      securityStats.global.blacklist.forEach((id) => {
        text += `\`${id}\` `;
      });
    }

    ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    });
  });

  // View audit logs
  bot.action('admin_logs', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const logs = auditLogger.getRecent(15);

    if (logs.length === 0) {
      return ctx.editMessageText('*Aucun log récent*', {
        parse_mode: 'Markdown',
        ...adminExtendedKeyboard(),
      });
    }

    let text = "📝 *Logs d'Audit Récents*\n\n";
    for (const log of logs) {
      const time = new Date(log.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      text += `🕒 \`${time}\` *${log.action}*\n`;
      text += `👤 ID: \`${log.chatId}\`${log.isAdmin ? ' (ADMIN)' : ''}\n\n`;
    }

    ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...adminExtendedKeyboard(),
    });
  });

  // Broadcast menu
  bot.action('admin_broadcast', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    return promptBroadcast(ctx, sessions, true);
  });

  bot.command('broadcast', async (ctx) => {
    if (!adminGuard(ctx)) return;

    const text = ctx.message.text.replace(/^\/broadcast(?:@\w+)?\s*/i, '').trim();
    if (!text) {
      return promptBroadcast(ctx, sessions);
    }

    return sendBroadcast(ctx, storage, text);
  });

  // Ban/Unban menus
  bot.action('admin_ban', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_BAN_ID');
    ctx.editMessageText('🚫 *Bannir un utilisateur*\n\nEntre le Chat ID à bannir :', {
      parse_mode: 'Markdown',
    });
  });

  bot.action('admin_unban', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_UNBAN_ID');
    ctx.editMessageText('✅ *Débannir un utilisateur*\n\nEntre le Chat ID à débannir :', {
      parse_mode: 'Markdown',
    });
  });

  // View user - prompt for ID
  bot.action('admin_view_user', async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_USER_ID');
    ctx.editMessageText("🔍 *Voir un utilisateur*\n\nEntre le Chat ID de l'utilisateur :", {
      parse_mode: 'Markdown',
      ...adminCancelKeyboard(),
    });
  });

  // View user keys (admin)
  bot.action(/^admin_user_keys_(\d+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    try {
      const userData = await storage.loadUserData(targetUserId);
      const wallets = userData.wallets || [];

      if (wallets.length === 0) {
        return ctx.reply('ℹ️ Aucun wallet pour cet utilisateur.', adminExtendedKeyboard());
      }

      auditLogger.log(AUDIT_ACTIONS.ADMIN_VIEW_USER_KEYS, chatId, { targetUserId }, true);

      let message = `🔐 *Clés de l'utilisateur ${targetUserId}*\n\n`;
      message += '⚠️ Ces informations sont extrêmement sensibles\n\n';

      for (const wallet of wallets) {
        try {
          const fullWallet = await storage.getWalletWithKey(targetUserId, wallet.id);

          if (fullWallet && !fullWallet.isCorrupted) {
            message += `*${wallet.label}*\n`;
            message += `🔑 \`${fullWallet.privateKey}\`\n\n`;
          } else {
            message += `*${wallet.label}* : ⚠️ CORROMPU\n\n`;
          }
        } catch (e) {
          message += `*${wallet.label}* : ❌ ERREUR\n\n`;
        }
      }

      const sentMsg = await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...adminExtendedKeyboard(),
      });

      // Auto-delete after 60s
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
        } catch (e) {
          logger.warn('Failed to auto-delete keys message', { error: e.message });
        }
      }, 60000);
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`, adminExtendedKeyboard());
    }
  });

  // Delete user wallet (admin)
  bot.action(/^admin_delete_wallet_(\d+)_(.+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    const walletId = ctx.match[2];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    try {
      await storage.deleteWallet(targetUserId, walletId);
      auditLogger.log(AUDIT_ACTIONS.ADMIN_DELETE_WALLET, chatId, { targetUserId, walletId }, true);

      ctx.reply(
        `🗑️ *Wallet supprimé*\n\nUtilisateur : \`${targetUserId}\`\nID Wallet : \`${walletId}\``,
        {
          parse_mode: 'Markdown',
          ...adminExtendedKeyboard(),
        }
      );
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`, adminExtendedKeyboard());
    }
  });
}

export function setupAdminMisc(bot, storage, sessions) {
  // Handle text inputs for admin states
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const state = sessions.getState(chatId);

    if (!state?.startsWith('ADMIN_') || !isAdmin(ctx)) {
      return next();
    }

    if (state === 'ADMIN_ENTER_BROADCAST') {
      sessions.setState(chatId, 'IDLE');
      return sendBroadcast(ctx, storage, text);
    }

    if (state === 'ADMIN_ENTER_BAN_ID') {
      const banId = Number(text);
      sessions.setState(chatId, 'IDLE');
      if (isNaN(banId)) return ctx.reply('❌ ID invalide.');

      blacklistUser(banId);
      auditLogger.log(AUDIT_ACTIONS.ADMIN_BAN, chatId, { targetUserId: banId }, true);
      return ctx.reply(`🚫 Utilisateur \`${banId}\` banni.`, {
        parse_mode: 'Markdown',
        ...adminExtendedKeyboard(),
      });
    }

    if (state === 'ADMIN_ENTER_UNBAN_ID') {
      const unbanId = Number(text);
      sessions.setState(chatId, 'IDLE');
      if (isNaN(unbanId)) return ctx.reply('❌ ID invalide.');

      unblacklistUser(unbanId);
      auditLogger.log(AUDIT_ACTIONS.ADMIN_UNBAN, chatId, { targetUserId: unbanId }, true);
      return ctx.reply(`✅ Utilisateur \`${unbanId}\` débanni.`, {
        parse_mode: 'Markdown',
        ...adminExtendedKeyboard(),
      });
    }

    if (state === 'ADMIN_ENTER_USER_ID') {
      const targetUserId = Number(text);
      sessions.setState(chatId, 'IDLE');
      if (isNaN(targetUserId)) return ctx.reply('❌ ID invalide.');

      try {
        const userData = await storage.loadUserData(targetUserId);
        const wallets = userData.wallets || [];

        auditLogger.log(AUDIT_ACTIONS.ADMIN_VIEW_USER, chatId, { targetUserId }, true);

        const displayName = escapeMarkdown(userData.firstName);
        const usernameText = userData.username ? `@${escapeMarkdown(userData.username)}` : 'N/A';

        let message = `👤 *Utilisateur ${targetUserId}*\n\n`;
        message += `🔹 Nom : ${displayName}\n`;
        message += `🔹 Username : ${usernameText}\n`;
        message += `🔹 Portefeuilles : ${wallets.length}\n\n`;

        for (const wallet of wallets) {
          message += `🔸 *${escapeMarkdown(wallet.label)}*\n`;
          message += `\`${wallet.address}\`\n\n`;
        }

        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...adminUserKeyboard(targetUserId),
        });
      } catch (error) {
        await ctx.reply(`❌ Erreur : ${error.message}`, adminExtendedKeyboard());
      }
    }

    return next();
  });
}
