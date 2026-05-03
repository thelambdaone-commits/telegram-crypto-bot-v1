/**
 * NFT Handler Index - V1
 * Setup NFT creation handlers
 * 
 * Commands: /nft
 * Button: 🖼 Créer un NFT
 */

import { Markup } from 'telegraf';
import { NFTService } from '../../../modules/nfts/create.service.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';

/**
 * Start the NFT wizard - reusable function
 * Used by: button menu, /nft
 */
async function startNFTWizard(ctx, chatId, storage, sessions) {
  try {
    // Check if user is admin (V1: admins only)
    const { isAdmin } = await import('../../middlewares/auth.middleware.js');
    const isAdminUser = isAdmin(chatId);
    console.log('[NFT] Starting wizard for chatId:', chatId, 'isAdmin:', isAdminUser);
    
    if (!isAdminUser) {
      return ctx.reply(
        '❌ Commande reservee aux administrateurs.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    // Get SOL wallets
    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === 'sol');
    console.log('[NFT] SOL wallets:', solWallets.length);

    if (solWallets.length === 0) {
      return ctx.reply(
        '❌ *Aucun wallet Solana*\n\nTu dois d\'abord creer un wallet Solana pour creer un NFT.\n\n' +
        'Utilise le menu: 🆕 Nouveau Wallet → Solana',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    // If only 1 wallet, auto-select
    if (solWallets.length === 1) {
      const wallet = solWallets[0];
      const walletWithKey = await storage.getWalletWithKey(chatId, wallet.id);
      
      if (!walletWithKey || walletWithKey.isCorrupted || !walletWithKey.privateKey) {
        return ctx.reply(
          '❌ *Wallet invalide ou corrompu*\n\n' +
          'Impossible de recuperer la cle privee de ce wallet.\n\n' +
          'Essayez avec un autre wallet ou creez-en un nouveau.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

// Store wallet info and go directly to NFT name
      sessions.setData(chatId, {
        walletId: wallet.id,
        walletAddress: wallet.address,
        walletPrivateKey: walletWithKey.privateKey,
        walletLabel: wallet.label || wallet.address.slice(0, 8) + '...',
      });
      
      sessions.setState(chatId, 'NFT_NAME');
      
      // Verify state is set
      const verifyState = sessions.getState(chatId);
      const verifyData = sessions.getData(chatId);
      console.log('[NFT] State verified:', verifyState, 'walletId:', verifyData.walletId);

      return ctx.reply(
        '🖼 *Creer un NFT*\n\n' +
        `💼 Wallet: *${wallet.label || wallet.address.slice(0, 8)}...*\n\n` +
        'Entrez le nom du NFT :\n\n' +
        '_Exemples :_\n' +
        '• "Mon premier NFT"\n' +
        '• "Art #001"\n' +
        '• "Collectible Alpha"',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('TEST', 'nft_test_name')],
          [Markup.button.callback('❌ Annuler', 'cancel')],
        ]) }
      );
    }

    // Multiple wallets - show selection
    const buttons = solWallets.map((w) => [
      Markup.button.callback(
        `${w.label || w.address.slice(0, 8)}...`,
        `nft_wallet_${w.id}`
      ),
    ]);
    buttons.push([Markup.button.callback('❌ Annuler', 'cancel')]);

    return ctx.reply(
      '🖼 *Creer un NFT*\n\nSelectionne ton wallet Solana :',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (error) {
    console.error('[START_NFT_WIZARD] Error:', error);
    return ctx.reply(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }
}

export function setupNFTHandlers(bot, storage, walletService, sessions) {
  // Import text-input handlers
  import('./text-input.js').then(({ setupNFTTextInput }) => {
    setupNFTTextInput(bot, storage, walletService, sessions);
    console.log('[NFT] Text input handlers loaded');
  }).catch(err => console.error('[NFT] Failed to load text input handlers:', err));

  // === COMMAND: /nft ===
  bot.command('nft', async (ctx) => {
    const chatId = ctx.chat.id;
    await startNFTWizard(ctx, chatId, storage, sessions);
  });

  // === BUTTON: create_nft (menu) ===
  bot.action('create_nft', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    await startNFTWizard(ctx, chatId, storage, sessions);
  });

  // Wallet selected via callback
  bot.action(/^nft_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    try {
      const wallet = await storage.getWalletById(chatId, walletId);
      const walletWithKey = await storage.getWalletWithKey(chatId, walletId);

      if (!wallet || !walletWithKey || walletWithKey.isCorrupted || !walletWithKey.privateKey) {
        return ctx.editMessageText(
          '❌ Wallet invalide ou corrompu.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      sessions.setData(chatId, {
        walletId: wallet.id,
        walletAddress: wallet.address,
        walletPrivateKey: walletWithKey.privateKey,
        walletLabel: wallet.label || wallet.address.slice(0, 8) + '...',
      });

      sessions.setState(chatId, 'NFT_NAME');
      console.log('[NFT] State set to NFT_NAME for wallet selection, chatId:', chatId);

      await ctx.editMessageText(
        '🖼 *Creer un NFT*\n\n' +
        `💼 Wallet: *${wallet.label || wallet.address.slice(0, 8)}...*\n\n` +
        'Entrez le nom du NFT :\n\n' +
        '_Exemples :_\n' +
        '• "Mon premier NFT"\n' +
        '• "Art #001"\n' +
        '• "Collectible Alpha"',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('TEST', 'nft_test_name')],
          [Markup.button.callback('❌ Annuler', 'cancel')],
        ]) }
      );

    } catch (error) {
      console.error('[NFT_WALLET] Error:', error);
      await ctx.editMessageText(
        `❌ Erreur: ${error.message}`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }
  });

  // Test button handler - for debugging
  bot.action('nft_test_name', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    
    const data = sessions.getData(chatId);
    const state = sessions.getState(chatId);
    
    console.log('[NFT_TEST] Button clicked! Current state:', state, 'data:', data);
    
    // Simulate entering "TestNFT" as name
    if (data && data.walletPrivateKey) {
      sessions.setData(chatId, {
        ...data,
        nftName: 'TestNFT',
      });
      sessions.setState(chatId, 'NFT_DESCRIPTION');
      
      await ctx.editMessageText(
        '🖼 *Nom:* "TestNFT"\n\n' +
        'Entrez la description (optionnel) :\n\n' +
        '_Laissez vide si aucune_',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('Passer (pas de description)', 'nft_skip_desc')],
          [Markup.button.callback('❌ Annuler', 'cancel')],
        ]) }
      );
    } else {
      await ctx.editMessageText(
        '❌ Pas de wallet selectionne. Utilisez /nft',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }
  });

  console.log('[NFT_HANDLERS] Loaded - /nft, create_nft');
}