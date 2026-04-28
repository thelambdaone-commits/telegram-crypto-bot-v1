/**
 * Token Handler Index - V1
 * Setup all token creation handlers
 * 
 * Commands: /mint, /createtoken
 * Button: 🔨 Créer un Token
 */

import { Markup } from 'telegraf';
import { TokenService } from '../../../modules/tokens/create.service.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';

function formatSOL(amount) {
  return amount.toFixed(6);
}

/**
 * Start the mint wizard - reusable function
 * Used by: button menu, /mint, /createtoken
 */
async function startMintWizard(ctx, chatId, storage, sessions) {
  try {
    // Debug: log chatId pour vérification
    console.log('[MINT] Starting wizard for chatId:', chatId);
    
    // Check if user is admin (V1: admins only)
    const { isAdmin } = await import('../../middlewares/auth.middleware.js');
    const isAdminUser = isAdmin(chatId);
    console.log('[MINT] Is admin:', isAdminUser, 'chatId:', chatId);
    
    if (!isAdminUser) {
      return ctx.reply(
        '❌ Commande reservée aux administrateurs.\n\n' +
        `Votre chatId: ${chatId}\n` +
        `Admin chatId: ${-1002825094847}\n\n` +
        'Contactez l\'admin du bot.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    // Get SOL wallets
    const wallets = await storage.getWallets(chatId);
    console.log('[MINT] Total wallets:', wallets.length);
    const solWallets = wallets.filter((w) => w.chain === 'sol');
    console.log('[MINT] SOL wallets:', solWallets.length);

    if (solWallets.length === 0) {
      return ctx.reply(
        '❌ *Aucun wallet Solana*\n\nTu dois d\'abord creer un wallet Solana pour creer un token.\n\n' +
        'Utilise le menu: ➕ Nouveau Wallet → Solana',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    // If only 1 wallet, auto-select
    if (solWallets.length === 1) {
      const wallet = solWallets[0];
      console.log('[MINT] Auto-selecting wallet:', wallet.id, wallet.address);
      
      const walletWithKey = await storage.getWalletWithKey(chatId, wallet.id);
      console.log('[MINT] WalletWithKey:', walletWithKey ? 'found' : 'not found', 
                   walletWithKey?.privateKey ? 'has key' : 'no key',
                   walletWithKey?.isCorrupted ? 'corrupted' : 'ok');
      
      // Verifier si le wallet existe, a une cle privee, et n'est pas corrompu
      if (!walletWithKey || walletWithKey.isCorrupted) {
        return ctx.reply(
          '❌ *Wallet invalide ou corrompu*\n\n' +
          'Impossible de recuperer la cle privee de ce wallet.\n\n' +
          'Le wallet semble etre corrompu ou la cle est invalide.\n' +
          'Essayez avec un autre wallet ou creez-en un nouveau.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }
      
      if (!walletWithKey.privateKey) {
        return ctx.reply(
          '❌ *Wallet sans cle privee*\n\n' +
          'Ce wallet n\'a pas de cle privee sauvegardee.\n\n' +
          'Le mint necessite un wallet avec une cle de signature.\n' +
          'Creez un nouveau wallet et reessayez.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      sessions.setData(chatId, {
        walletId: wallet.id,
        walletAddress: wallet.address,
        walletPrivateKey: walletWithKey.privateKey,
        walletLabel: wallet.label || wallet.address.slice(0, 8) + '...',
        decimals: 9, // Auto-sélectionné
      });
      
      // Passer directement à l'étape supply (pas de choix decimals)
      sessions.setState(chatId, 'TOKEN_SUPPLY');
      
      return ctx.reply(
        '🔨 *Créer un Token SPL*\n\n' +
        `💼 Wallet: *${wallet.label || wallet.address.slice(0, 8)}...*\n` +
        '🔢 Decimals: *9 (auto)*\n\n' +
        'Entrez la supply initiale :\n\n' +
        '_Exemples :_\n' +
        '• `1000000000` → 1 milliard\n' +
        '• `1000000` → 1 million\n\n' +
        'Cette amount sera mintée vers votre wallet.',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Annuler', 'cancel')],
        ]) }
      );
    }

    // Multiple wallets - show selection
    const buttons = solWallets.map((w) => [
      Markup.button.callback(
        `${w.label || w.address.slice(0, 8)}...`,
        `token_wallet_${w.id}`
      ),
    ]);
    buttons.push([Markup.button.callback('❌ Annuler', 'cancel')]);

    return ctx.reply(
      '🔨 *Créer un Token SPL*\n\nSélectionne ton wallet Solana :',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );

  } catch (error) {
    console.error('[START_MINT_WIZARD] Error:', error);
    return ctx.reply(
      `❌ Erreur: ${error.message}`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }
}

export function setupTokenHandlers(bot, storage, walletService, sessions) {
  // Import text-input handlers
  import('./text-input.js').then(({ setupTokenTextInput }) => {
    setupTokenTextInput(bot, storage, walletService, sessions);
    console.log('[TOKEN] Text input handlers loaded');
  }).catch(err => console.error('[TOKEN] Failed to load text input handlers:', err));

  // === COMMAND: /mint ===
  bot.command('mint', async (ctx) => {
    const chatId = ctx.chat.id;
    await startMintWizard(ctx, chatId, storage, sessions);
  });

  // === COMMAND: /createtoken (alias) ===
  bot.command('createtoken', async (ctx) => {
    const chatId = ctx.chat.id;
    await startMintWizard(ctx, chatId, storage, sessions);
  });

  // === BUTTON: create_token (menu) ===
  bot.action('create_token', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    await startMintWizard(ctx, chatId, storage, sessions);
  });

  // Wallet selected via callback
  bot.action(/^token_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    try {
      const wallet = await storage.getWalletById(chatId, walletId);
      const walletWithKey = await storage.getWalletWithKey(chatId, walletId);

      if (!wallet) {
        return ctx.editMessageText(
          '❌ *Wallet introuvable*\n\n' +
          'Ce wallet n\'existe plus ou a été supprimé.\n\n' +
          'Veuillez créer un nouveau wallet Solana et réessayer.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      if (!walletWithKey || !walletWithKey.privateKey) {
        return ctx.editMessageText(
          '❌ *Wallet invalide*\n\n' +
          'Impossible de récupérer la clé privée de ce wallet.\n\n' +
          'Le mint nécessite un wallet enregistré avec sa clé de signature.\n' +
          'Essayez avec un autre wallet ou créez-en un nouveau.',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      }

      sessions.setData(chatId, {
        walletId: wallet.id,
        walletAddress: wallet.address,
        walletPrivateKey: walletWithKey.privateKey,
        walletLabel: wallet.label || wallet.address.slice(0, 8) + '...',
      });

      sessions.setState(chatId, 'TOKEN_DECIMALS');

      await ctx.editMessageText(
        '🔨 *Créer un Token SPL*\n\n' +
        `💼 Wallet: *${wallet.label || wallet.address.slice(0, 8)}...*\n\n` +
        'Entrez le nombre de decimals (0-9) :\n\n' +
        '_Exemples :_\n' +
        '• `0` → sans décimales\n' +
        '• `6` → comme USDC\n' +
        '• `9` → par défaut\n\n' +
        'Recommandé: `9`',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('9 (par défaut)', 'token_decimals_9')],
          [Markup.button.callback('6 (USDC)', 'token_decimals_6')],
          [Markup.button.callback('0 (sans décimales)', 'token_decimals_0')],
          [Markup.button.callback('❌ Annuler', 'cancel')],
        ]) }
      );

    } catch (error) {
      console.error('[TOKEN_WALLET] Error:', error);
      await ctx.editMessageText(
        '❌ *Erreur lors de la sélection du wallet*\n\n' +
        `${error.message}\n\n` +
        'Le mint nécessite un wallet Solana avec une clé privée valide.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }
  });

  // Decimals quick buttons
  bot.action(/^token_decimals_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const decimals = parseInt(ctx.match[1]);

    const data = sessions.getData(chatId);
    sessions.setData(chatId, { ...data, decimals: decimals });

    sessions.setState(chatId, 'TOKEN_SUPPLY');

    await ctx.editMessageText(
      '🔨 *Créer un Token SPL*\n\n' +
      `💼 Wallet: *${data.walletLabel}*\n` +
      `🔢 Decimals: *${decimals}*\n\n` +
      'Entrez la supply initiale :\n\n' +
      '_Exemples :_\n' +
      '• `1000000000` → 1 milliard\n' +
      '• `1000000000000` → 1 billion\n' +
      '• `1000000` → 1 million\n\n' +
      'Cette amount sera mintée vers votre wallet.',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Annuler', 'cancel')],
      ]) }
    );
  });

  console.log('[TOKEN_HANDLERS] Loaded - /mint, /createtoken, create_token');
}