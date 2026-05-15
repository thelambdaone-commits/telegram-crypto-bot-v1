import { deriveClobApiCredentials, removeClobClient } from '../../../clob/client.js';
import { escapeMarkdown } from '../../../shared/utils/telegram.js';
import { polymarketTexts } from './texts.js';
import { polymarketMenuKeyboard } from './keyboards.js';

export async function generatePolymarketWalletSession(chatId, storage, walletService, sessions) {
  const wallet = await walletService.createWallet(chatId, 'eth', 'Polymarket Wallet');
  const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

  if (!fullWallet || fullWallet.isCorrupted) {
    throw new Error('Impossible de générer ou relire le wallet Polymarket');
  }

  sessions.setData(chatId, {
    createNewWallet: true,
    walletId: fullWallet.id,
    address: fullWallet.address,
    chain: fullWallet.chain,
    label: fullWallet.label,
  });

  return fullWallet;
}

export async function autoConnectPolymarket(ctx, storage, sessions, wallet, generated) {
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

export async function switchStoredPolymarketCredentials(ctx, storage, wallet) {
  if (typeof storage.getPolymarketCredentialsList !== 'function') return null;

  const chatId = ctx.chat.id;
  const credentialsList = await storage.getPolymarketCredentialsList(chatId);
  const stored = credentialsList.find(
    (creds) => creds.address?.toLowerCase() === wallet.address.toLowerCase()
  );
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

export async function handleWalletSelection(ctx, storage, walletService, sessions) {
  const chatId = ctx.chat.id;
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData === 'pm_new_wallet') {
    try {
      const wallet = await generatePolymarketWalletSession(
        chatId,
        storage,
        walletService,
        sessions
      );
      const result = await autoConnectPolymarket(ctx, storage, sessions, wallet, true);
      return ctx.editMessageText(result.text, {
        parse_mode: 'Markdown',
        ...(result.connected ? polymarketMenuKeyboard(true) : {}),
      });
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

    return ctx.editMessageText(result.text, {
      parse_mode: 'Markdown',
      ...(result.connected ? polymarketMenuKeyboard(true) : {}),
    });
  }
}

export async function handleApiKeyInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiKey: text });
  sessions.setState(chatId, 'AWAITING_POLY_SECRET');

  await ctx.reply('📌 *Étape 2/3*\n\nEntrez votre *API Secret*:', { parse_mode: 'Markdown' });
}

export async function handleApiSecretInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  sessions.setData(chatId, { ...data, apiSecret: text });
  sessions.setState(chatId, 'AWAITING_POLY_PASSPHRASE');

  await ctx.reply('📌 *Étape 3/3*\n\nEntrez votre *API Passphrase*:', { parse_mode: 'Markdown' });
}

export async function handleApiPassphraseInput(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const data = sessions.getData(chatId);
  const walletId = data.walletId;
  const fullWallet = await storage.getWalletWithKey(chatId, walletId);

  if (!fullWallet || fullWallet.isCorrupted) {
    sessions.clearState(chatId);
    return ctx.reply('❌ Wallet Polymarket manquant ou corrompu. Réessayez avec /polyconnect.');
  }

  const privateKey = fullWallet.privateKey;
  const address = fullWallet.address;
  const walletLabel = fullWallet.label;
  const walletChain = fullWallet.chain;

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
    polymarketTexts.connectSuccess(address || data.address) + `\n\n🔑 *Wallet:* ${walletType}`,
    { parse_mode: 'Markdown', ...polymarketMenuKeyboard(true) }
  );
}
