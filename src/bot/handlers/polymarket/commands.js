import { removeClobClient } from '../../../clob/client.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { escapeMarkdown, safeEditMessage } from '../../../shared/utils/telegram.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { confirmTexts, polymarketTexts } from './texts.js';
import {
  confirmDisconnectKeyboard,
  polymarketMenuKeyboard,
  polymarketWalletSelectKeyboard,
} from './keyboards.js';
import { loadPolymarketMenuBalances } from './ui.js';
import { autoConnectPolymarket, generatePolymarketWalletSession } from './trading.js';

export async function handlePolyCommand(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const creds = await storage.getPolymarketCredentials(chatId);
  const credentialsList =
    typeof storage.getPolymarketCredentialsList === 'function'
      ? await storage.getPolymarketCredentialsList(chatId)
      : [];
  const connected = !!creds;
  const balances = connected
    ? await loadPolymarketMenuBalances(chatId, storage, walletService, creds)
    : null;

  const text = polymarketTexts.menu(connected, {
    active: creds
      ? { ...creds, walletLabel: escapeMarkdown(creds.walletLabel || 'Wallet Polymarket') }
      : null,
    savedCount: credentialsList.length,
    balances,
  });

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...polymarketMenuKeyboard(connected),
  });
}

export async function handleConnectStart(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;

  const wallets = await storage.getWallets(chatId);
  const ethWallets = wallets.filter((w) => ['eth', 'matic'].includes(w.chain));
  const activeCredentials =
    typeof storage.getPolymarketCredentials === 'function'
      ? await storage.getPolymarketCredentials(chatId)
      : null;

  if (ethWallets.length === 0) {
    try {
      const wallet = await generatePolymarketWalletSession(
        chatId,
        storage,
        walletService,
        sessions
      );
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.reply(result.text, {
        parse_mode: 'Markdown',
        ...(result.connected ? polymarketMenuKeyboard(true) : {}),
      });
    } catch (err) {
      sessions.clearState(chatId);
      return ctx.reply(`❌ ${err.message}`);
    }
  }

  sessions.setState(chatId, 'AWAITING_POLY_WALLET_SELECT');
  const activeText = activeCredentials?.address
    ? '\n\nWallet Polymarket actif:\n' +
      `⭐ *${escapeMarkdown(activeCredentials.walletLabel || 'Wallet Polymarket')}* ` +
      `(${(activeCredentials.chain || 'EVM').toUpperCase()})\n` +
      `\`${activeCredentials.address.slice(0, 8)}...${activeCredentials.address.slice(-6)}\``
    : '\n\nAucun wallet Polymarket actif actuellement.';

  await ctx.reply(
    '🔗 *Connexion Polymarket*\n\n' +
      'Choisissez un wallet ETH/Polygon ou générez-en un nouveau:' +
      activeText,
    { parse_mode: 'Markdown', ...polymarketWalletSelectKeyboard(ethWallets, activeCredentials) }
  );
}

const displayLocks = new Map();
const pendingTimeouts = new Map();

function clearableTimeout(key, callback, delay) {
  const existing = pendingTimeouts.get(key);
  if (existing) clearTimeout(existing);

  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(key);
    callback();
  }, delay);
  timeoutId.unref();

  pendingTimeouts.set(key, timeoutId);
}

export function buildCredentialsDisplayMessage(creds) {
  const address = creds.address ? escapeMarkdown(creds.address) : 'N/A';
  const chain = creds.chain ? creds.chain.toUpperCase() : 'EVM';

  return (
    '🔐 *Credentials Polymarket*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `*Wallet* : \`${address}\`\n` +
    `*Chaine* : ${chain}\n\n` +
    `*Private Key* :\n\`${escapeMarkdown(creds.privateKey)}\`\n\n` +
    `*API Key* :\n\`${escapeMarkdown(creds.apiKey)}\`\n\n` +
    `*API Secret* :\n\`${escapeMarkdown(creds.apiSecret)}\`\n\n` +
    `*API Passphrase* :\n\`${escapeMarkdown(creds.apiPassphrase)}\`\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    '📦 _Source : stockage chiffré .enc_\n' +
    '⚠️ _Ce message sera supprimé dans 30 secondes._'
  );
}

export const buildExportMessage = buildCredentialsDisplayMessage;

export async function handleShowCredentialsCommand(ctx, storage) {
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  if (!chatId) return;

  const now = Date.now();
  const lastDisplay = displayLocks.get(chatId);
  if (lastDisplay && now - lastDisplay < 5000) {
    return;
  }
  displayLocks.set(chatId, now);
  const lockTimer = setTimeout(() => {
    if (displayLocks.get(chatId) === now) displayLocks.delete(chatId);
  }, 5000);
  lockTimer.unref();

  try {
    const creds = await storage.getPolymarketCredentials(chatId);
    if (!creds) {
      return ctx.reply(polymarketTexts.noCredentials(), {
        parse_mode: 'Markdown',
        ...polymarketMenuKeyboard(false),
      });
    }

    const triggerMsgId =
      ctx.callbackQuery?.message?.message_id || ctx.message?.message_id;
    if (triggerMsgId) {
      ctx.telegram.deleteMessage(chatId, triggerMsgId).catch(() => {});
    }

    const message = buildCredentialsDisplayMessage(creds);

    const sentMsg = await ctx.reply(message, {
      parse_mode: 'Markdown',
      protect_content: true,
      disable_web_page_preview: true,
      ...polymarketMenuKeyboard(true),
    });

    auditLogger.log(AUDIT_ACTIONS.EXPORT_CREDENTIALS, chatId, {
      address: creds.address
        ? `${creds.address.slice(0, 8)}...${creds.address.slice(-6)}`
        : 'N/A',
    });

    clearableTimeout(`pm_credentials_${chatId}`, () => {
      ctx.telegram.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
    }, 30000);
  } catch (err) {
    return ctx.reply(polymarketTexts.error(escapeMarkdown(err.message)), {
      parse_mode: 'Markdown',
      ...polymarketMenuKeyboard(true),
    });
  }
}

export async function handleDisconnectCommand(ctx) {
  const options = {
    parse_mode: 'Markdown',
    ...confirmDisconnectKeyboard(),
  };

  try {
    await ctx.editMessageText(confirmTexts.disconnect(), options);
  } catch {
    await ctx.reply(confirmTexts.disconnect(), options);
  }
}

export async function handleConfirmDisconnect(ctx, storage) {
  const chatId = ctx.chat.id;

  try {
    await storage.deletePolymarketCredentials(chatId);
    removeClobClient(chatId);

    await safeEditMessage(ctx, polymarketTexts.disconnectSuccess(), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await safeEditMessage(ctx, polymarketTexts.error(err.message), {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    } catch {
      await ctx
        .reply(polymarketTexts.error(err.message), {
          parse_mode: 'Markdown',
          ...mainMenuKeyboard(),
        })
        .catch(() => {});
    }
  }
}
