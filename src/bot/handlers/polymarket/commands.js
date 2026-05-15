import { removeClobClient } from '../../../clob/client.js';
import { exportPolymarketCredentialsToPolyfillEnv } from '../../../clob/polyfill-env.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { escapeMarkdown, escapeMarkdownCode, safeEditMessage } from '../../../shared/utils/telegram.js';
import { confirmTexts, polymarketTexts } from './texts.js';
import {
  confirmDisconnectKeyboard,
  polymarketMenuKeyboard,
  polymarketThemeSelectKeyboard,
  polymarketWalletSelectKeyboard,
} from './keyboards.js';
import { getPolymarketTradeThemes } from '../../../modules/polymarket/analytics.js';
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
  const ethWallets = wallets.filter((w) => ['eth', 'matic', 'pol'].includes(w.chain));
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

export async function handleExportPolyfillCommand(ctx, storage) {
  const chatId = ctx.chat.id;

  try {
    const creds = await storage.getPolymarketCredentials(chatId);
    if (!creds) {
      return ctx.reply(polymarketTexts.noCredentials(), {
        parse_mode: 'Markdown',
        ...polymarketMenuKeyboard(false),
      });
    }

    const result = await exportPolymarketCredentialsToPolyfillEnv(creds);
    const address = creds.address
      ? `\nWallet: \`${creds.address.slice(0, 8)}...${creds.address.slice(-6)}\``
      : '';

    return ctx.reply(
      '✅ *Session exportée vers polymarket-copy-trade*\n\n' +
        `Fichier mis à jour: \`${escapeMarkdownCode(result.envPath)}\`\n` +
        `Variables écrites: *${result.keys.length}*${address}`,
      { parse_mode: 'Markdown', ...polymarketMenuKeyboard(true) }
    );
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
