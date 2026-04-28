/**
 * Token Text Input Handlers - V1
 * Handle amount input for token creation
 */

import { Markup } from 'telegraf';
import { TokenService } from '../../../modules/tokens/create.service.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';

function formatSOL(amount) {
  return amount.toFixed(6);
}

export function setupTokenTextInput(bot, storage, walletService, sessions) {
  // Handle text input for supply
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    const state = sessions.getState(chatId);

    if (!state) return;

    if (text?.startsWith('/')) {
      sessions.clearState(chatId);
      sessions.clearData(chatId);
      return;
    }

    if (state === 'TOKEN_SUPPLY') {
      await handleTokenSupply(ctx, text, storage, sessions);
      return;
    }
  });

  // Confirm button
  bot.action('confirm_create_token', async (ctx) => {
    await handleTokenConfirm(ctx, storage, sessions);
  });

  // Revoke authority option
  bot.action(/^token_revoke_(yes|no)$/, async (ctx) => {
    await handleRevokeOption(ctx, ctx.match[1], storage, sessions);
  });

  console.log('[TOKEN_TEXT_INPUT] Loaded');
}

async function handleTokenSupply(ctx, text, storage, sessions) {
  const chatId = ctx.chat.id;

  // Parse supply
  const supply = parseFloat(text.replace(/,/g, ''));
  if (isNaN(supply) || supply <= 0) {
    return ctx.reply(
      '❌ Supply invalide.\n\nEntrez un nombre positif (ex: 1000000000)',
      { parse_mode: 'Markdown' }
    );
  }

  // Max supply check (100 billion max for safety)
  if (supply > 100000000000) {
    return ctx.reply(
      '❌ Supply trop élevée.\n\nMaximum: 100 milliards (100000000000)',
      { parse_mode: 'Markdown' }
    );
  }

  const data = sessions.getData(chatId);

  sessions.setData(chatId, {
    ...data,
    supply: supply,
  });

  // Estimate costs
  const fees = await TokenService.estimateRealCost();

  sessions.setState(chatId, 'TOKEN_CONFIRM');

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Oui - recommandé', 'token_revoke_yes'),
    ],
    [
      Markup.button.callback('❌ Non', 'token_revoke_no'),
    ],
    [
      Markup.button.callback('❌ Annuler', 'cancel'),
    ],
  ]);

  await ctx.reply(
    '🔨 *Confirmer la création*\n\n' +
    '━━━━━━━━━━━━\n' +
    `💼 Wallet: *${data.walletLabel}*\n` +
    `🔢 Decimals: *${data.decimals}*\n` +
    `📦 Supply: *${supply.toLocaleString('fr-FR')} tokens*\n` +
    '━━━━━━━━━━━━\n\n' +
    '⛽ *Frais estimés :*\n' +
    `• Rent mint: *${formatSOL(fees.mintRent)} SOL*\n` +
    `• Rent ATA: *${formatSOL(fees.ataRent)} SOL*\n` +
    `• Frais réseau: *${formatSOL(fees.networkFeeEstimate)} SOL*\n` +
    `• *Total: ${formatSOL(fees.totalEstimate)} SOL*\n\n` +
    '🪙 Mint: *sera créé à l\'exécution*\n\n' +
    '━━━━━━━━━━━━\n\n' +
    '🔒 *Révoquer le Mint Authority ?*\n\n' +
    'Recommandé: OUI\n' +
    '_Cela verrouillera la supply définitivement.\n' +
    'Personne ne pourra créer plus de tokens._\n\n' +
    '⚠️ *Attention*\n' +
    'Un token créé sans utilité ni liquidité\n' +
    'n\'a pas de valeur automatiquement.',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function handleRevokeOption(ctx, option, storage, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  const data = sessions.getData(chatId);
  const shouldRevoke = option === 'yes';

  sessions.setData(chatId, {
    ...data,
    revokeMintAuthority: shouldRevoke,
  });

  // Show final confirmation
  const fees = await TokenService.estimateRealCost();

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirmer création', 'confirm_create_token')],
    [Markup.button.callback('❌ Annuler', 'cancel')],
  ]);

  await ctx.editMessageText(
    '🔨 *Finaliser la création*\n\n' +
    '━━━━━━━━━━━━\n' +
    `💼 Wallet: *${data.walletLabel}*\n` +
    `🔢 Decimals: *${data.decimals}*\n` +
    `📦 Supply: *${data.supply.toLocaleString('fr-FR')} tokens*\n` +
    `🔒 Mint Authority: *${shouldRevoke ? 'révoqué (verrouillé)' : 'conservé'}*\n` +
    '━━━━━━━━━━━━\n\n' +
    `⛽ *Frais totaux : ${formatSOL(fees.totalEstimate)} SOL*\n\n` +
    '🪙 Mint: *sera créé à l\'exécution*\n\n' +
    '━━━━━━━━━━━━\n\n' +
    '⚠️ Vérifiez les détails avant confirmation.\n' +
    'Cette action est irréversible.',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function handleTokenConfirm(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  const data = sessions.getData(chatId);

  console.log('[TOKEN_CONFIRM] Starting...', {
    hasPrivateKey: !!data.walletPrivateKey,
    decimals: data.decimals,
    supply: data.supply,
    hasWallet: !!data.walletId
  });

  if (!data.walletPrivateKey || !data.decimals || !data.supply) {
    console.error('[TOKEN_CONFIRM] Missing data:', {
      walletPrivateKey: !!data.walletPrivateKey,
      decimals: data.decimals,
      supply: data.supply
    });
    return ctx.editMessageText(
      '❌ Donnees incompletes. Veuillez recommencer le processus /mint.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  await ctx.editMessageText('🔨 *Creation en cours...*', { parse_mode: 'Markdown' });

  try {
    console.log('[TOKEN_CONFIRM] Creating mint with decimals:', data.decimals);
    
    // Step 1: Create Mint
    const mintResult = await TokenService.createMint(
      data.walletPrivateKey,
      data.decimals
    );

    console.log('[TOKEN_CONFIRM] Mint result:', mintResult.success ? 'success' : 'failed');

    if (!mintResult.success) {
      throw new Error(mintResult.error);
    }

    const mintAddress = mintResult.mint.toString();

    // Step 2: Create ATA
    const ataResult = await TokenService.createATA(
      data.walletPrivateKey,
      mintAddress,
      data.walletAddress
    );

    if (!ataResult.success) {
      throw new Error(ataResult.error);
    }

    const ataAddress = ataResult.ata.toString();

    // Step 3: Mint supply
    const mintToResult = await TokenService.mintTo(
      data.walletPrivateKey,
      mintAddress,
      ataAddress,
      data.supply,
      data.decimals
    );

    if (!mintToResult.success) {
      throw new Error(mintToResult.error);
    }

    // Step 4: Optional - Revoke Mint Authority
    let revokeTxHash = null;
    if (data.revokeMintAuthority) {
      const revokeResult = await TokenService.revokeMintAuthority(
        data.walletPrivateKey,
        mintAddress
      );

      if (!revokeResult.success) {
        console.warn('[TOKEN] Failed to revoke mint authority:', revokeResult.error);
      } else {
        revokeTxHash = revokeResult.txHash;
      }
    }

    // Success message
    const explorerLink = TokenService.getExplorerLink(mintAddress);

    await ctx.editMessageText(
      '✅ *Token créé avec succès !*\n\n' +
      '━━━━━━━━━━━━\n' +
      '🪙 *Mint Address:*\n' +
      `\`${mintAddress}\`\n\n` +
      `📦 *Supply:* ${data.supply.toLocaleString('fr-FR')} tokens\n` +
      `🔢 *Decimals:* ${data.decimals}\n` +
      `🔒 *Mint Authority:* ${data.revokeMintAuthority ? 'révoqué (verrouillé)' : 'actif'}\n` +
      '━━━━━━━━━━━━\n\n' +
      `🔗 [Voir sur Solscan](${explorerLink})\n\n` +
      '⛽ Frais réels:\n' +
      '_Les frais peuvent varier des estimations_',
      { 
        parse_mode: 'Markdown', 
        disable_web_page_preview: true,
        ...mainMenuKeyboard() 
      }
    );

    sessions.clearData(chatId);
    sessions.clearState(chatId);

  } catch (error) {
    console.error('[TOKEN_CREATE] Error:', error);
    
    let errorMessage = error.message || 'Erreur inconnue';
    
    // Détection des erreurs courantes
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('Not enough SOL')) {
      errorMessage = 'Solde SOL insuffisant pour payer les frais de création.\n\n' +
        'Vous avez besoin d\'au moins 0.01 SOL pour créer un token.';
    } else if (errorMessage.includes('private key')) {
      errorMessage = 'Clé privée invalide. Le wallet n\'a pas pu signer la transaction.';
    } else if (errorMessage.includes('connection') || errorMessage.includes('RPC')) {
      errorMessage = 'Erreur de connexion au réseau Solana.\n\n' +
        'Veuillez réessayer plus tard.';
    }

    await ctx.editMessageText(
      '❌ *Échec de création du token*\n\n' +
      `${errorMessage}\n\n` +
      'Le mint nécessite un wallet Solana avec des fonds suffisants et une clé privée valide.\n\n' +
      'Vérifiez :\n' +
      '• Que votre wallet SOL a des fonds (> 0.01 SOL)\n' +
      '• Que le réseau Solana fonctionne correctement',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
    sessions.clearState(chatId);
  }
}