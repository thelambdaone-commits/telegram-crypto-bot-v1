import { deriveClobApiCredentials, getOrBuildClobClient, removeClobClient } from '../../../clob/client.js';
import { getPositions, getOrders } from '../../../clob/markets.js';
import { getUserActivity } from '../../../clob/data-api.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, safeEditMessage } from '../../utils.js';
import { polymarketTexts, confirmTexts } from './texts.js';
import { polymarketMenuKeyboard, confirmDisconnectKeyboard, polymarketWalletSelectKeyboard } from './keyboards.js';

function escapeMarkdown(text) {
  return String(text || '').replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

async function initClient(chatId, storage) {
  try {
    const { client, creds } = await getOrBuildClobClient(chatId, storage);
    if (!client || !creds?.privateKey) {
      return { error: 'wallet' };
    }
    return { client, address: creds.address, connected: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function generatePolymarketWalletSession(chatId, storage, walletService, sessions) {
  const wallet = await walletService.createWallet(chatId, 'eth', 'Polymarket Wallet');
  const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

  if (!fullWallet || fullWallet.isCorrupted) {
    throw new Error('Impossible de générer ou relire le wallet Polymarket');
  }

  sessions.setData(chatId, {
    createNewWallet: true,
    walletId: fullWallet.id,
    privateKey: fullWallet.privateKey,
    address: fullWallet.address,
    chain: fullWallet.chain,
    label: fullWallet.label,
  });

  return fullWallet;
}

async function autoConnectPolymarket(ctx, storage, sessions, wallet, generated) {
  const chatId = ctx.chat.id;

  try {
    const apiCreds = await deriveClobApiCredentials(wallet.privateKey);
    await storage.addPolymarketCredentials(
      chatId,
      wallet.privateKey,
      wallet.address,
      apiCreds.apiKey,
      apiCreds.apiSecret,
      apiCreds.apiPassphrase,
      Date.now().toString(),
      {
        walletId: wallet.id,
        walletLabel: wallet.label,
        chain: wallet.chain,
      }
    );
    removeClobClient(chatId);

    sessions.clearState(chatId);

    const walletType = generated
      ? `nouveau wallet généré: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})`
      : `wallet choisi: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})`;

    return {
      connected: true,
      text:
        polymarketTexts.connectSuccess(wallet.address) +
        `\n\n🔑 *Wallet:* ${walletType}\n🔐 Credentials CLOB générés automatiquement.`,
    };
  } catch (err) {
    sessions.setState(chatId, 'AWAITING_POLY_API_KEY');
    sessions.setData(chatId, {
      createNewWallet: generated,
      walletId: wallet.id,
      privateKey: wallet.privateKey,
      address: wallet.address,
      chain: wallet.chain,
      label: wallet.label,
    });

    return {
      connected: false,
      text:
        '🔗 *Connexion Polymarket*\n\n' +
        `${generated ? 'Nouveau wallet Ethereum généré automatiquement' : 'Wallet Polymarket choisi'}.\n\n` +
        `Wallet: *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})\n` +
        `Adresse: \`${wallet.address}\`\n\n` +
        `La génération automatique CLOB a échoué: ${escapeMarkdown(err.message)}\n\n` +
        'Fallback manuel: entre votre *API Key* Polymarket:',
    };
  }
}

async function switchStoredPolymarketCredentials(ctx, storage, wallet) {
  if (typeof storage.getPolymarketCredentialsList !== 'function') return null;

  const chatId = ctx.chat.id;
  const credentialsList = await storage.getPolymarketCredentialsList(chatId);
  const stored = credentialsList.find((creds) => creds.address?.toLowerCase() === wallet.address.toLowerCase());
  if (!stored) return null;

  await storage.setActivePolymarketCredentials(chatId, stored.id);
  removeClobClient(chatId);

  return {
    text:
      polymarketTexts.connectSuccess(wallet.address) +
      `\n\n🔑 *Wallet actif:* *${escapeMarkdown(wallet.label)}* (${wallet.chain.toUpperCase()})\n` +
      '🔁 Session Polymarket existante réactivée.',
  };
}

async function handlePolyCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const creds = await storage.getPolymarketCredentials(chatId);
  const credentialsList = typeof storage.getPolymarketCredentialsList === 'function'
    ? await storage.getPolymarketCredentialsList(chatId)
    : [];
  const connected = !!creds;

  const text = polymarketTexts.menu(connected, {
    active: creds ? { ...creds, walletLabel: escapeMarkdown(creds.walletLabel || 'Wallet Polymarket') } : null,
    savedCount: credentialsList.length,
  });

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...polymarketMenuKeyboard(connected),
  });
}

async function handleConnectStart(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;

  const wallets = await storage.getWallets(chatId);
  const ethWallets = wallets.filter((w) => ['eth', 'matic', 'pol'].includes(w.chain));

  if (ethWallets.length === 0) {
    try {
      const wallet = await generatePolymarketWalletSession(chatId, storage, walletService, sessions);
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.reply(
        result.text,
        { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
      );
    } catch (err) {
      sessions.clearState(chatId);
      return ctx.reply(`❌ ${err.message}`);
    }
  }

  sessions.setState(chatId, 'AWAITING_POLY_WALLET_SELECT');
  await ctx.reply(
    '🔗 *Connexion Polymarket*\n\n' +
    'Choisissez un wallet ETH/Polygon ou générez-en un nouveau:',
    { parse_mode: 'Markdown', ...polymarketWalletSelectKeyboard(ethWallets) }
  );
}

async function handleWalletSelection(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData === 'pm_new_wallet') {
    try {
      const wallet = await generatePolymarketWalletSession(chatId, storage, walletService, sessions);
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.editMessageText(
        result.text,
        { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
      );
    } catch (err) {
      sessions.clearState(chatId);
      return ctx.editMessageText(`❌ ${err.message}`);
    }
  }

  if (callbackData?.startsWith('pm_select_wallet_')) {
    const walletId = callbackData.replace('pm_select_wallet_', '');
    const fullWallet = await storage.getWalletWithKey(chatId, walletId);

    if (!fullWallet || fullWallet.isCorrupted) {
      return ctx.editMessageText('❌ Wallet invalide ou corrompu.');
    }

    const switched = await switchStoredPolymarketCredentials(ctx, storage, fullWallet);
    if (switched) {
      return ctx.editMessageText(switched.text, {
        parse_mode: 'Markdown',
        ...polymarketMenuKeyboard(true),
      });
    }

    const result = await autoConnectPolymarket(ctx, storage, sessions, fullWallet, false);

    return ctx.editMessageText(
      result.text,
      { parse_mode: 'Markdown', ...(result.connected ? polymarketMenuKeyboard(true) : {}) }
    );
  }
}

async function handleApiKeyInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiKey: text });
  sessions.setState(chatId, 'AWAITING_POLY_SECRET');

  await ctx.reply(
    '📌 *Étape 2/3*\n\nEntrez votre *API Secret*:',
    { parse_mode: 'Markdown' }
  );
}

async function handleApiSecretInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiSecret: text });
  sessions.setState(chatId, 'AWAITING_POLY_PASSPHRASE');

  await ctx.reply(
    '📌 *Étape 3/3*\n\nEntrez votre *API Passphrase*:',
    { parse_mode: 'Markdown' }
  );
}

async function handleApiPassphraseInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);

  const privateKey = data.privateKey;
  const address = data.address;
  const walletLabel = data.label;
  const walletChain = data.chain;
  if (!privateKey || !address) {
    sessions.clearState(chatId);
    return ctx.reply('❌ Wallet Polymarket manquant en session. Réessayez avec /polyconnect.');
  }

  await storage.addPolymarketCredentials(
    chatId,
    privateKey,
    address,
    data.apiKey,
    data.apiSecret,
    text,
    Date.now().toString(),
    {
      walletId: data.walletId,
      walletLabel: data.label,
      chain: data.chain,
    }
  );
  removeClobClient(chatId);

  sessions.clearState(chatId);

  const walletType = data.createNewWallet
    ? `nouveau wallet généré: *${escapeMarkdown(walletLabel)}* (${walletChain.toUpperCase()})`
    : `wallet choisi: *${escapeMarkdown(walletLabel)}* (${walletChain.toUpperCase()})`;

  await ctx.reply(
    polymarketTexts.connectSuccess(address || data.address) +
    `\n\n🔑 *Wallet:* ${walletType}`,
    { parse_mode: 'Markdown', ...polymarketMenuKeyboard(true) }
  );
}

async function handlePositionsCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('📊 Chargement des positions...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const positions = await getPositions(chatId);
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.positions(positions), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleOrdersCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('📋 Chargement des ordres...');

  try {
    const result = await initClient(chatId, storage);

    if (result.error === 'wallet') {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    if (result.error) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.error(result.error), mainMenuKeyboard());
    }

    const orders = await getOrders(chatId);
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.orders(orders), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleHistoryCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loading = await ctx.reply('📜 Chargement de l\'historique...');

  try {
    const credentialsList = typeof storage.getPolymarketCredentialsList === 'function'
      ? await storage.getPolymarketCredentialsList(chatId)
      : [];
    const walletsToCheck = credentialsList.filter((wallet) => wallet.address);
    if (walletsToCheck.length === 0) {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
      return ctx.reply(polymarketTexts.noCredentials(), mainMenuKeyboard());
    }

    const trades = [];
    const errors = [];

    for (const wallet of walletsToCheck) {
      try {
        const { userAddress, activity } = await getUserActivity(wallet.address, { limit: 100, type: 'TRADE' });
        for (const item of activity) {
          trades.push({
            ...item,
            sourceAddress: wallet.address,
            userAddress,
            walletLabel: wallet.walletLabel || 'Wallet Polymarket',
            active: wallet.active,
          });
        }
      } catch (error) {
        errors.push(`${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}: ${error.message}`);
      }
    }

    if (trades.length === 0 && errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    trades.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    await ctx.telegram.deleteMessage(chatId, loading.message_id);

    await ctx.reply(polymarketTexts.history(trades), {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (err) {
    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {
      // Ignore
    }
    ctx.reply(polymarketTexts.error(err.message), mainMenuKeyboard());
  }
}

async function handleDisconnectCommand(ctx) {
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

async function handleConfirmDisconnect(ctx, storage) {
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
      await ctx.reply(polymarketTexts.error(err.message), {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      }).catch(() => {});
    }
  }
}

export function setupPolymarketHandlers(bot, storage, walletService, sessions) {
  // Callback query handler for wallet selection
  bot.on('callback_query', async (ctx, next) => {
    const callbackData = ctx.callbackQuery?.data;

    if (callbackData?.startsWith('pm_select_wallet_') || callbackData === 'pm_new_wallet') {
      await safeAnswerCbQuery(ctx);
      await handleWalletSelection(ctx, storage, walletService, sessions);
      return;
    }

    return next();
  });

  // Text input handler for polymarket flow
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const state = sessions.getState(chatId);
    const text = ctx.message?.text?.trim();
    if (!text) return next();

    if (state === 'AWAITING_POLY_API_KEY') {
      await handleApiKeyInput(ctx, storage, sessions);
      return;
    }

    if (state === 'AWAITING_POLY_SECRET') {
      await handleApiSecretInput(ctx, storage, sessions);
      return;
    }

    if (state === 'AWAITING_POLY_PASSPHRASE') {
      await handleApiPassphraseInput(ctx, storage, sessions);
      return;
    }

    if (state?.startsWith('AWAITING_POLY_')) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Opération annulée. Réessayez avec /polyconnect');
    }

    return next();
  });

  // Commands
  bot.command('poly', async (ctx) => {
    await handlePolyCommand(ctx, storage);
  });

  bot.command('polyconnect', async (ctx) => {
    await handleConnectStart(ctx, storage, walletService, sessions);
  });

  bot.command('polypos', async (ctx) => {
    await handlePositionsCommand(ctx, storage);
  });

  bot.command('polyorders', async (ctx) => {
    await handleOrdersCommand(ctx, storage);
  });

  bot.command('polyhistory', async (ctx) => {
    await handleHistoryCommand(ctx, storage);
  });

  bot.command('polydisconnect', async (ctx) => {
    await handleDisconnectCommand(ctx);
  });

  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = sessions.getState(chatId);
    if (state?.startsWith('AWAITING_POLY_')) {
      sessions.clearState(chatId);
      return ctx.reply('❌ Opération annulée.');
    }
  });

  // Callback actions
  bot.action('pm_menu_positions', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePositionsCommand(ctx, storage);
  });

  bot.action('pm_menu_orders', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleOrdersCommand(ctx, storage);
  });

  bot.action('pm_menu_history', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleHistoryCommand(ctx, storage);
  });

  bot.action('pm_menu_refresh', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePolyCommand(ctx, storage);
  });

  bot.action('pm_connect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleConnectStart(ctx, storage, walletService, sessions);
  });

  bot.action('pm_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleDisconnectCommand(ctx);
  });

  bot.action('pm_confirm_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleConfirmDisconnect(ctx, storage);
  });

  bot.action('pm_cancel_disconnect', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handlePolyCommand(ctx, storage);
  });

  bot.action('pm_cancel', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    sessions.clearState(chatId);
    await handlePolyCommand(ctx, storage);
  });
}
