import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Markup } from 'telegraf';
import { mainMenuKeyboard, mainReplyKeyboard } from '../../keyboards/index.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { config } from '../../../core/config.js';
import { logger } from '../../../shared/logger.js';
import { escapeHtml, scheduleSecureDelete, safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { isAdmin } from '../../middlewares/auth.middleware.js';
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

// ── Anti-bot captcha ─────────────────────────────────────────────────────────
// A new user must solve a small addition before any (expensive, multi-chain)
// wallet provisioning runs — this stops scripts that spam /start.

function makeCaptcha() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const options = new Set([answer]);
  while (options.size < 4) {
    const delta = (1 + Math.floor(Math.random() * 4)) * (Math.random() < 0.5 ? -1 : 1);
    const candidate = answer + delta;
    if (candidate > 0) options.add(candidate);
  }
  // Shuffle.
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return { a, b, answer, options: shuffled };
}

function captchaKeyboard(options) {
  const buttons = options.map((n) => Markup.button.callback(String(n), `captcha_${n}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return Markup.inlineKeyboard(rows);
}

function captchaPrompt(c, retry = false) {
  return [
    '🤖 <b>Vérification anti-robot</b>',
    separator(),
    retry ? 'Mauvaise réponse. Réessaie :' : 'Pour continuer, résous ce calcul :',
    '',
    `<b>${c.a} + ${c.b} = ?</b>`,
  ].join('\n');
}

/**
 * Provision a full multi-chain wallet set for a new user (one BIP39 seed across
 * every supported chain) and reveal it once. Runs only after the captcha.
 */
async function provisionNewUser(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const userName = ctx.from.first_name || 'ami';
  const username = ctx.from.username || null;

  auditLogger.log(AUDIT_ACTIONS.USER_START, chatId, { isNewUser: true, username });
  await notifyAdminNewUser(ctx, chatId, userName, username);

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
    const { mnemonic, wallets: createdWallets } = await walletService.createInitialWallets(chatId);

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
    logger.logError(error, { context: 'provisionNewUser.createWallets', chatId });
    await ctx.reply(`❌ Erreur lors de la création des wallets: ${error.message}`, mainMenuKeyboard());
  }
}

/**
 * Setup start handler - gates new users behind a math captcha, then provisions
 * a full multi-chain wallet set.
 */
export function setupStartHandler(bot, storage, walletService, sessions) {
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const userName = ctx.from.first_name || 'ami';
    const username = ctx.from.username || null;

    try {
      await storage.updateUserProfile(chatId, userName, username);

      const existingWallets = await storage.getWallets(chatId);

      if (existingWallets.length === 0) {
        // Admins skip the captcha; everyone else must solve it before any wallet
        // is created (the expensive, bot-abusable step).
        if (isAdmin(ctx)) {
          return provisionNewUser(ctx, storage, walletService);
        }
        const c = makeCaptcha();
        sessions.setState(chatId, 'CAPTCHA');
        sessions.setData(chatId, { captchaAnswer: c.answer, captchaTries: 0 });
        return ctx.reply(captchaPrompt(c), { parse_mode: 'HTML', ...captchaKeyboard(c.options) });
      }

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
        { parse_mode: 'HTML', ...mainReplyKeyboard() }
      );
    } catch (error) {
      if (error.message?.includes('blocked by the user') || error.response?.error_code === 403) {
        logger.warn('[START] User has blocked the bot', { chatId, username: username || userName });
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

  // Captcha answer. Only meaningful while the user is in the CAPTCHA state and
  // still has no wallets; clicks otherwise are ignored.
  bot.action(/^captcha_(\d+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    if (sessions.getState(chatId) !== 'CAPTCHA') {
      return safeAnswerCbQuery(ctx);
    }
    const data = sessions.getData(chatId) || {};
    const guess = Number(ctx.match[1]);

    if (guess === data.captchaAnswer) {
      sessions.clearState(chatId);
      await safeAnswerCbQuery(ctx, '✅ Vérifié');
      const existing = await storage.getWallets(chatId);
      if (existing.length > 0) {
        return ctx.editMessageText('✅ Déjà vérifié.', { parse_mode: 'HTML' }).catch(() => {});
      }
      await ctx
        .editMessageText('✅ <b>Vérifié !</b> Je prépare tes wallets…', { parse_mode: 'HTML' })
        .catch(() => {});
      return provisionNewUser(ctx, storage, walletService);
    }

    // Wrong answer: regenerate after 3 tries, otherwise let them retry.
    const tries = (data.captchaTries || 0) + 1;
    if (tries >= 3) {
      const c = makeCaptcha();
      sessions.setData(chatId, { captchaAnswer: c.answer, captchaTries: 0 });
      await safeAnswerCbQuery(ctx, '🔄 Nouveau calcul');
      return ctx
        .editMessageText(captchaPrompt(c, true), { parse_mode: 'HTML', ...captchaKeyboard(c.options) })
        .catch(() => {});
    }
    sessions.setData(chatId, { ...data, captchaTries: tries });
    return safeAnswerCbQuery(ctx, '❌ Mauvaise réponse, réessaie.');
  });
}
