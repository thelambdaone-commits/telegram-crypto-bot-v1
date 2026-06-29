import {
  adminExtendedKeyboard,
  adminSecurityKeyboard,
  adminUserKeyboard,
  adminCancelKeyboard,
} from '../../keyboards/index.js';
import { safeAnswerCbQuery, escapeHtml } from '../../../shared/utils/telegram.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { adminGuard } from '../../middlewares/auth.middleware.js';
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
    await telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
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
    `✅ <b>Broadcast terminé</b>\n\n✨ Envoyés : ${sent}\n❌ Échecs : ${failed}\n📄 Parties : ${chunks.length}`,
    {
      parse_mode: 'HTML',
      ...adminExtendedKeyboard(),
    }
  );
}

function promptBroadcast(ctx, sessions, edit = false) {
  const chatId = ctx.chat.id;
  sessions.setState(chatId, 'ADMIN_ENTER_BROADCAST');

  const message =
    '📣 <b>Broadcast Global</b>\n\nEnvoie-moi le message à diffuser à tous les utilisateurs.\n\n<i>Le HTML est supporté.</i>';
  const options = {
    parse_mode: 'HTML',
    ...adminCancelKeyboard(),
  };

  if (edit) {
    return ctx.editMessageText(message, options);
  }

  return ctx.reply(message, options);
}

export function setupAdminActions(bot, storage, sessions) {
  // Security stats
  bot.action(CALLBACKS.ADMIN_SECURITY, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const securityStats = getRateLimitStats();

    let text = '🛡️ <b>Sécurité &amp; Limites</b>\n\n';
    text += '🚦 <b>Global :</b>\n';
    text += `🔹 Actifs : ${securityStats.global.activeUsers}\n`;
    text += `🚫 Bloqués : ${securityStats.global.blacklistedUsers}\n\n`;
    text += '⚡ <b>Anti-burst :</b>\n';
    text += `🔹 Actifs : ${securityStats.burst.activeUsers}\n\n`;
    text += '🔐 <b>Actions Sensibles :</b>\n';
    text += `🔹 Actifs : ${securityStats.sensitive.activeUsers}\n\n`;
    text += '💸 <b>Transactions :</b>\n';
    text += `🔹 Actifs : ${securityStats.transaction.activeUsers}`;

    if (securityStats.global.blacklist.length > 0) {
      text += '\n\n🚫 <b>IDs bloqués :</b>\n';
      securityStats.global.blacklist.forEach((id) => {
        text += `<code>${id}</code> `;
      });
    }

    text += '\n\n<i>🧪 Lance un audit passif complet pour un rapport détaillé.</i>';

    ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...adminSecurityKeyboard(),
    });
  });

  // View audit logs
  bot.action(CALLBACKS.ADMIN_LOGS, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    const logs = auditLogger.getRecent(15);

    if (logs.length === 0) {
      return ctx.editMessageText('<b>Aucun log récent</b>', {
        parse_mode: 'HTML',
        ...adminExtendedKeyboard(),
      });
    }

    let text = "📝 <b>Logs d'Audit Récents</b>\n\n";
    for (const log of logs) {
      const time = new Date(log.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      text += `🕒 <code>${time}</code> <b>${escapeHtml(log.action)}</b>\n`;
      text += `👤 ID: <code>${log.chatId}</code>${log.isAdmin ? ' (ADMIN)' : ''}\n\n`;
    }

    ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...adminExtendedKeyboard(),
    });
  });

  // Broadcast menu
  bot.action(CALLBACKS.ADMIN_BROADCAST, async (ctx) => {
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
  bot.action(CALLBACKS.ADMIN_BAN, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_BAN_ID');
    ctx.editMessageText('🚫 <b>Bannir un utilisateur</b>\n\nEntre le Chat ID à bannir :', {
      parse_mode: 'HTML',
      ...adminCancelKeyboard(),
    });
  });

  bot.action(CALLBACKS.ADMIN_UNBAN, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_UNBAN_ID');
    ctx.editMessageText('✅ <b>Débannir un utilisateur</b>\n\nEntre le Chat ID à débannir :', {
      parse_mode: 'HTML',
      ...adminCancelKeyboard(),
    });
  });

  // View user - prompt for ID
  bot.action(CALLBACKS.ADMIN_VIEW_USER, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);
    if (!adminGuard(ctx)) return;

    sessions.setState(chatId, 'ADMIN_ENTER_USER_ID');
    ctx.editMessageText("🔍 <b>Voir un utilisateur</b>\n\nEntre le Chat ID de l'utilisateur :", {
      parse_mode: 'HTML',
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

      let message = `🔐 <b>Clés de l'utilisateur ${targetUserId}</b>\n\n`;
      message += '⚠️ Ces informations sont extrêmement sensibles\n\n';

      for (const wallet of wallets) {
        try {
          const fullWallet = await storage.getWalletWithKey(targetUserId, wallet.id);

          if (fullWallet && !fullWallet.isCorrupted) {
            message += `<b>${escapeHtml(wallet.label)}</b>\n`;
            message += `🔑 <code>${escapeHtml(fullWallet.privateKey)}</code>\n\n`;
          } else {
            message += `<b>${escapeHtml(wallet.label)}</b> : ⚠️ CORROMPU\n\n`;
          }
        } catch (e) {
          message += `<b>${escapeHtml(wallet.label)}</b> : ❌ ERREUR\n\n`;
        }
      }

      const sentMsg = await ctx.reply(message, {
        parse_mode: 'HTML',
        ...adminExtendedKeyboard(),
      });

      // Auto-delete after 15s — private keys persist on Telegram's servers, so
      // minimise the exposure window.
      const deleteTimer = setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
        } catch (e) {
          logger.warn('Failed to auto-delete keys message', { error: e.message });
        }
      }, 15000);
      deleteTimer.unref();
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
        `🗑️ <b>Wallet supprimé</b>\n\nUtilisateur : <code>${targetUserId}</code>\nID Wallet : <code>${escapeHtml(walletId)}</code>`,
        {
          parse_mode: 'HTML',
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

    if (!state?.startsWith('ADMIN_') || !adminGuard(ctx)) {
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
      return ctx.reply(`🚫 Utilisateur <code>${banId}</code> banni.`, {
        parse_mode: 'HTML',
        ...adminExtendedKeyboard(),
      });
    }

    if (state === 'ADMIN_ENTER_UNBAN_ID') {
      const unbanId = Number(text);
      sessions.setState(chatId, 'IDLE');
      if (isNaN(unbanId)) return ctx.reply('❌ ID invalide.');

      unblacklistUser(unbanId);
      auditLogger.log(AUDIT_ACTIONS.ADMIN_UNBAN, chatId, { targetUserId: unbanId }, true);
      return ctx.reply(`✅ Utilisateur <code>${unbanId}</code> débanni.`, {
        parse_mode: 'HTML',
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

        const displayName = escapeHtml(userData.firstName);
        const usernameText = userData.username ? `@${escapeHtml(userData.username)}` : 'N/A';

        let message = `👤 <b>Utilisateur ${targetUserId}</b>\n\n`;
        message += `🔹 Nom : ${displayName}\n`;
        message += `🔹 Username : ${usernameText}\n`;
        message += `🔹 Portefeuilles : ${wallets.length}\n\n`;

        for (const wallet of wallets) {
          message += `🔸 <b>${escapeHtml(wallet.label)}</b>\n`;
          message += `<code>${escapeHtml(wallet.address)}</code>\n\n`;
        }

        await ctx.reply(message, {
          parse_mode: 'HTML',
          ...adminUserKeyboard(targetUserId),
        });
      } catch (error) {
        await ctx.reply(`❌ Erreur : ${error.message}`, adminExtendedKeyboard());
      }
    }

    return next();
  });
}
