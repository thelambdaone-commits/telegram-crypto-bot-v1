/**
 * NFT Text Input Handlers - V1
 * Handle input for NFT creation wizard
 */

import { Markup } from 'telegraf';
import { NFTService } from '../../../modules/nfts/create.service.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';

function formatSOL(amount) {
  return amount.toFixed(6);
}

export function setupNFTTextInput(bot, storage, walletService, sessions) {
  console.log('[NFT_TEXT_INPUT] Setting up handlers...');
  
  // Handle text input for NFT steps - add next parameter
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    const state = sessions.getState(chatId);

    console.log('[NFT_TEXT_INPUT] ANY text received! state:', state, 'text:', text?.substring(0, 30));

    // If not NFT state, pass to next handler
    if (!state) {
      console.log('[NFT_TEXT_INPUT] No state, passing to next');
      return next();
    }
    
    const stateStr = String(state);
    console.log('[NFT_TEXT_INPUT] State is:', stateStr, 'startsWith NFT_:', stateStr.startsWith('NFT_'));
    
    if (!stateStr.startsWith('NFT_')) {
      console.log('[NFT_TEXT_INPUT] Not NFT state, calling next()');
      return next();
    }

    if (text?.startsWith('/')) {
      sessions.clearState(chatId);
      sessions.clearData(chatId);
      return next();
    }

    if (stateStr === 'NFT_NAME') {
      console.log('[NFT_TEXT_INPUT] Handling NFT_NAME');
      await handleNFTName(ctx, text, sessions);
      return;
    }

    if (stateStr === 'NFT_DESCRIPTION') {
      await handleNFTDescription(ctx, text, sessions);
      return;
    }

    if (stateStr === 'NFT_IMAGE_URL') {
      await handleNFTImageUrl(ctx, text, sessions);
      return;
    }
    
    // If nothing matched, continue to next handler
    return next();
  });

  // Confirm button
  bot.action('confirm_create_nft', async (ctx) => {
    await handleNFTConfirm(ctx, storage, sessions);
  });

  // Handle "pass description" button
  bot.action('nft_skip_desc', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const data = sessions.getData(chatId);
    
    sessions.setData(chatId, {
      ...data,
      nftDescription: '',
    });

    sessions.setState(chatId, 'NFT_IMAGE_URL');

    await ctx.editMessageText(
      '🖼 *Description:* aucune\n\n' +
      'Entrez l\'URL de l\'image :\n\n' +
      '_Formats acceptes: PNG, JPG\n' +
      'Doit etre une URL HTTPS directe_',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Annuler', 'cancel')],
      ]) }
    );
  });

  console.log('[NFT_TEXT_INPUT] Loaded');
}

async function handleNFTName(ctx, text, sessions) {
  const chatId = ctx.chat.id;
  console.log('[NFT_TEXT_INPUT] handleNFTName called with:', text);

  if (!text || text.length < 1 || text.length > 50) {
    return ctx.reply(
      '❌ Nom invalide.\n\nEntrez un nom (1-50 caracteres).',
      { parse_mode: 'Markdown' }
    );
  }

  const data = sessions.getData(chatId);
  sessions.setData(chatId, {
    ...data,
    nftName: text,
  });

  sessions.setState(chatId, 'NFT_DESCRIPTION');

  await ctx.reply(
    `🖼 *Nom:* "${text}"\n\n` +
    'Entrez la description (optionnel) :\n\n' +
    '_Laissez vide si aucune_',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
      [Markup.button.callback('Passer (pas de description)', 'nft_skip_desc')],
      [Markup.button.callback('❌ Annuler', 'cancel')],
    ]) }
  );
}

async function handleNFTDescription(ctx, text, sessions) {
  const chatId = ctx.chat.id;

  const data = sessions.getData(chatId);
  sessions.setData(chatId, {
    ...data,
    nftDescription: text || '',
  });

  sessions.setState(chatId, 'NFT_IMAGE_URL');

  await ctx.reply(
    `🖼 *Description:* ${text || '(aucune)'}\n\n` +
    'Entrez l\'URL de l\'image :\n\n' +
    '_Formats acceptes: PNG, JPG\n' +
    'Doit etre une URL HTTPS directe_',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Annuler', 'cancel')],
    ]) }
  );
}

async function handleNFTImageUrl(ctx, text, sessions) {
  const chatId = ctx.chat.id;

  // Validate URL
  const validation = NFTService.validateImageUrl(text);
  if (!validation.valid) {
    return ctx.reply(
      `❌ URL invalide: ${validation.error}\n\n` +
      'Entrez une URL HTTPS vers une image PNG ou JPG.',
      { parse_mode: 'Markdown' }
    );
  }

  const data = sessions.getData(chatId);
  sessions.setData(chatId, {
    ...data,
    nftImageUrl: text,
  });

  // Estimate costs
  const fees = await NFTService.estimateRealCost();

  sessions.setState(chatId, 'NFT_CONFIRM');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirmer', 'confirm_create_nft')],
    [Markup.button.callback('❌ Annuler', 'cancel')],
  ]);

  await ctx.reply(
    '🖼 *Confirmer la creation*\n\n' +
    '━━━━━━━━━━━━\n' +
    `💼 Wallet: *${data.walletLabel}*\n` +
    `📛 Nom: *${data.nftName}*\n` +
    `📝 Description: *${data.nftDescription || 'Aucune'}*\n` +
    '🖼 Image: *[Image]*\n' +
    '━━━━━━━━━━━━\n\n' +
    '⛽ *Frais estimees :*\n' +
    `• Rent mint: *${formatSOL(fees.mintRent)} SOL*\n` +
    `• Rent ATA: *${formatSOL(fees.ataRent)} SOL*\n` +
    `• Frais reseau: *${formatSOL(fees.networkFeeEstimate)} SOL*\n` +
    `• *Total: ${formatSOL(fees.totalEstimate)} SOL*\n\n` +
    '━━━━━━━━━━━━\n\n' +
    '⚠️ *NFT simplifie*\n' +
    'Image et metadata stockees hors chane.\n\n' +
    '⚠️ *Attention*\n' +
    'Un NFT sans utilite ni liquidite n\'a pas de valeur automatiquement.',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function handleNFTConfirm(ctx, storage, sessions) {
  const chatId = ctx.chat.id;
  await safeAnswerCbQuery(ctx);

  const data = sessions.getData(chatId);

  console.log('[NFT_CONFIRM] Starting...', {
    hasPrivateKey: !!data.walletPrivateKey,
    name: data.nftName,
    description: data.nftDescription,
    imageUrl: data.nftImageUrl,
  });

  if (!data.walletPrivateKey || !data.nftName || !data.nftImageUrl) {
    console.error('[NFT_CONFIRM] Missing data:', {
      walletPrivateKey: !!data.walletPrivateKey,
      nftName: data.nftName,
      nftImageUrl: data.nftImageUrl,
    });
    return ctx.editMessageText(
      '❌ Donnees incompletes. Veuillez recommencer le processus /nft.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  await ctx.editMessageText('🖼 *Creation en cours...*', { parse_mode: 'Markdown' });

  try {
    console.log('[NFT_CONFIRM] Creating NFT:', data.nftName);
    
    // Create NFT
    const nftResult = await NFTService.createNFT(
      data.walletPrivateKey,
      data.nftName,
      data.nftDescription,
      data.nftImageUrl
    );

    console.log('[NFT_CONFIRM] NFT result:', nftResult.success ? 'success' : 'failed');

    if (!nftResult.success) {
      throw new Error(nftResult.error);
    }

    const mintAddress = nftResult.mint;
    const txHash = nftResult.txHash;

    // Success message
    const explorerLink = NFTService.getExplorerLink(mintAddress);

    await ctx.editMessageText(
      '✅ *NFT cree avec succes !*\n\n' +
      '━━━━━━━━━━━━\n' +
      `🖼 *Nom:* ${data.nftName}\n` +
      '📛 *Mint Address:*\n' +
      `\`${mintAddress}\`\n\n` +
      `📝 Description: ${data.nftDescription || 'Aucune'}\n` +
      '🖼 Image: [Lien]\n\n' +
      `🔗 [Voir sur Solscan](${explorerLink})\n\n` +
      '━━━━━━━━━━━━\n\n' +
      '⚠️ *NFT simplifie*\n' +
      'Image et metadata stockees hors chane.\n' +
      'Ce NFT peut ne pas etre compatible avec tous les marketplaces.',
      { 
        parse_mode: 'Markdown', 
        disable_web_page_preview: true,
        ...mainMenuKeyboard() 
      }
    );

    sessions.clearData(chatId);
    sessions.clearState(chatId);

  } catch (error) {
    console.error('[NFT_CREATE] Error:', error);
    
    let errorMessage = error.message || 'Erreur inconnue';
    
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('Not enough SOL')) {
      errorMessage = 'Solde SOL insuffisant pour payer les frais de creation.\n\n' +
        'Vous avez besoin d\'au moins 0.01 SOL.';
    } else if (errorMessage.includes('private key')) {
      errorMessage = 'Cle privee invalide. Le wallet n\'a pas pu signer la transaction.';
    } else if (errorMessage.includes('connection') || errorMessage.includes('RPC')) {
      errorMessage = 'Erreur de connexion au reseau Solana.\n\n' +
        'Veuillez reessayer plus tard.';
    }

    await ctx.editMessageText(
      '❌ *Echec de creation du NFT*\n\n' +
      `${errorMessage}\n\n` +
      'Le mint necessite un wallet Solana avec des fonds suffisantes.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
    sessions.clearState(chatId);
  }
}