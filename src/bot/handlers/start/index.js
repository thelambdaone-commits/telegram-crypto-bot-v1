import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Markup } from 'telegraf';
import { mainMenuKeyboard, mainReplyKeyboard } from '../../keyboards/index.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { config } from '../../../core/config.js';
import { logger } from '../../../shared/logger.js';
import { escapeHtml, scheduleSecureDelete } from '../../../shared/utils/telegram.js';
import { sendWalletKeysFile } from '../wallet/key-file.js';
import { separator, CHAIN_EMOJIS } from '../../ui/index.js';

// Welcome video shown once, on a brand-new user's first /start. Resolved from
// the project root. The Telegram file_id is cached after the first upload so we
// never re-upload the ~38 MB file again (subsequent new users reuse the id).
const WELCOME_VIDEO_PATH = fileURLToPath(new URL('../../../../videoplayback.mp4', import.meta.url));
let welcomeVideoFileId = null;

/**
 * Send the onboarding video with a formatted caption. Best-effort: a missing
 * file or upload error is logged and swallowed so it never blocks onboarding.
 * @param {import('telegraf').Context} ctx
 * @param {string} caption HTML caption
 */
async function sendWelcomeVideo(ctx, caption) {
  if (!welcomeVideoFileId && !existsSync(WELCOME_VIDEO_PATH)) {
    logger.warn('[START] Welcome video file missing', { path: WELCOME_VIDEO_PATH });
    return;
  }
  try {
    const sent = await ctx.replyWithVideo(welcomeVideoFileId || { source: WELCOME_VIDEO_PATH }, {
      caption,
      parse_mode: 'HTML',
      supports_streaming: true,
    });
    const fileId = sent?.video?.file_id;
    if (fileId && !welcomeVideoFileId) welcomeVideoFileId = fileId;
  } catch (error) {
    logger.warn('[START] Welcome video not sent', { error: error.message });
  }
}

/**
 * Notify admin group about new user
 */
async function notifyAdminNewUser(ctx, chatId, userName, username) {
  if (!config.adminChatId || config.adminChatId.length === 0) return;

  try {
    const safeUserName = escapeHtml(userName);
    const safeUsername = username ? escapeHtml(username) : null;
    const contactUrl = `tg://user?id=${chatId}`;

    const message =
      '✨ <b>Nouvel utilisateur</b>\n\n' +
      `👤 Nom: ${safeUserName}\n` +
      `🔹 Username: ${safeUsername ? `@${safeUsername}` : 'N/A'}\n` +
      `🆔 ID: <code>${chatId}</code>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('💬 Contacter', contactUrl)],
      [Markup.button.callback('👤 Voir Profil', `admin_view_user_quick_${chatId}`)],
    ]);

    for (const adminId of config.adminChatId) {
      await ctx.telegram
        .sendMessage(adminId, message, {
          parse_mode: 'HTML',
          ...keyboard,
        })
        .catch((e) => logger.error(`Failed to notify admin ${adminId}`, { chatId, error: e.message }));
    }
  } catch (error) {
    logger.logError(error, { context: 'notifyAdminNewUser', chatId });
  }
}

const REVEAL_CHAIN_NAMES = {
  btc: 'Bitcoin',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
  sol: 'Solana',
  trx: 'Tron',
  zec: 'Zcash',
};

/**
 * One-time onboarding reveal. A single BIP39 phrase backs every main chain
 * (the EVM chains share one address, shown once); Monero is listed with its
 * own separate seed. Seeds/addresses go in <code> spans (Telegram HTML does
 * not reformat code-span content, so no escaping needed there).
 * @param {string} mnemonic
 * @param {Array<{chain:string,address:string,mnemonic:string}>} wallets
 * @returns {string}
 */
function buildOnboardingReveal(mnemonic, wallets) {
  const byChain = (c) => wallets.find((w) => w.chain === c);
  const lines = [
    '🎉 <b>Ton portefeuille multi-chaînes est prêt !</b>',
    separator(),
    '🔑 <b>Une seule phrase secrète</b> contrôle tous tes réseaux principaux.',
    'Note-la et garde-la hors ligne :',
    '',
    `<code>${mnemonic}</code>`,
    separator(),
    '📬 <b>Tes adresses de réception</b>',
    '',
  ];

  const evm = byChain('eth');
  if (evm) {
    lines.push('Ξ <b>EVM</b> · ETH · Arbitrum · Polygon · Optimism · Base · Avalanche');
    lines.push(`<code>${evm.address}</code>`);
    lines.push('');
  }

  for (const chain of ['btc', 'ltc', 'bch', 'sol', 'trx', 'zec']) {
    const wallet = byChain(chain);
    if (!wallet) continue;
    lines.push(`${CHAIN_EMOJIS[chain] || '🔗'} <b>${REVEAL_CHAIN_NAMES[chain]}</b>`);
    lines.push(`<code>${wallet.address}</code>`);
    lines.push('');
  }

  const xmr = byChain('xmr');
  if (xmr) {
    lines.push(`${CHAIN_EMOJIS.xmr} <b>Monero</b> · phrase de récupération séparée`);
    lines.push(`<code>${xmr.address}</code>`);
    lines.push(`🔐 Seed Monero : <code>${xmr.mnemonic}</code>`);
    lines.push('');
  }

  lines.push(separator());
  lines.push('⚠️ <b>IMPORTANT :</b> sauvegarde ces phrases. Elles ne seront plus affichées.');
  lines.push("🕐 <i>Ce message s'efface dans 60 s pour ta sécurité.</i>");
  return lines.join('\n');
}

/**
 * Setup start handler - provisions a full multi-chain wallet set for new users
 */
export function setupStartHandler(bot, storage, walletService) {
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const userName = ctx.from.first_name || 'ami';
    const username = ctx.from.username || null;

    try {
      // Update user profile info
      await storage.updateUserProfile(chatId, userName, username);

      // Check if user already has wallets
      const existingWallets = await storage.getWallets(chatId);

      if (existingWallets.length === 0) {
        // Log new user
        auditLogger.log(AUDIT_ACTIONS.USER_START, chatId, { isNewUser: true, username });

        // Notify admin group
        await notifyAdminNewUser(ctx, chatId, userName, username);

        // New user - greet with the onboarding video, then provision one BIP39
        // seed across every supported chain.
        await sendWelcomeVideo(
          ctx,
          [
            `🎬 <b>Bienvenue ${escapeHtml(userName)} !</b>`,
            separator(),
            'Ton portefeuille crypto multi-chaînes, simple et sécurisé.',
            'Regarde cette intro rapide, et pendant ce temps, je prépare tes wallets ↓',
          ].join('\n')
        );

        try {
          const { mnemonic, wallets: createdWallets } =
            await walletService.createInitialWallets(chatId);

          for (const wallet of createdWallets) {
            auditLogger.log(AUDIT_ACTIONS.CREATE_WALLET, chatId, {
              chain: wallet.chain,
              address: wallet.address,
            });
          }

          await sendWalletKeysFile(ctx, createdWallets, storage);

          const sentMsg = await ctx.reply(buildOnboardingReveal(mnemonic, createdWallets), {
            parse_mode: 'HTML',
            ...mainReplyKeyboard(),
          });

          // Silent, keyed auto-delete after 60s (no lingering confirmation).
          scheduleSecureDelete(ctx, `start_${chatId}`, sentMsg.message_id, 60000);
        } catch (error) {
          logger.logError(error, { context: 'setupStartHandler.createWallets', chatId });
          return ctx.reply(
            `❌ Erreur lors de la création des wallets: ${error.message}`,
            mainMenuKeyboard()
          );
        }
      } else {
        // Existing user
        auditLogger.log(AUDIT_ACTIONS.USER_START, chatId, { isNewUser: false });
        await ctx.reply(
          [
            `👋 <b>Content de te revoir, ${escapeHtml(userName)} !</b>`,
            separator(),
            '🔐 Ton coffre multi-chain est prêt.',
            '',
            'Que veux-tu faire ? 👇',
          ].join('\n'),
          {
            parse_mode: 'HTML',
            ...mainReplyKeyboard(),
          }
        );
      }
    } catch (error) {
      // Handle "bot was blocked by user" error gracefully
      if (error.message?.includes('blocked by the user') || error.response?.error_code === 403) {
        logger.warn('[START] User has blocked the bot', {
          chatId,
          username: username || userName,
        });
        return;
      }

      logger.logError(error, { context: 'setupStartHandler', chatId });
      try {
        return await ctx.reply(
          '👋 Bienvenue. Le profil a été réinitialisé, tu peux utiliser le menu ci-dessous.',
          mainReplyKeyboard()
        );
      } catch (replyError) {
        logger.logError(replyError, { context: 'setupStartHandler.fallbackReply', chatId });
      }
    }
  });
}
