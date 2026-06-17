import { Markup } from 'telegraf';
import { chainSelectionKeyboard, walletCreationMethodKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery, scheduleSecureDelete } from '../../utils.js';
import { auditLogger, AUDIT_ACTIONS } from '../../../shared/security/audit-logger.js';
import { config } from '../../../core/config.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';
import { logger } from '../../../shared/logger.js';
import { sendWalletKeysFile } from './key-file.js';

// Guards against a double tap / Telegram callback retry creating two wallets.
const inFlightGenerations = new Set();

export function setupWalletCreate(bot, storage, walletService, sessions) {
  // Create wallet - show chain selection
  bot.action('create_wallet', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    ctx.editMessageText(
      `${EMOJIS.chain} *Choisis le réseau de ton wallet*\n\n` +
        'Chaque réseau a sa propre adresse.\n' +
        '💵 Les stablecoins *USDT* / *USDC* se reçoivent sur le réseau de cette adresse.\n\n' +
        `${EMOJIS.warning} Un envoi depuis un autre réseau peut entraîner une *perte définitive* des fonds.`,
      {
        parse_mode: 'Markdown',
        ...chainSelectionKeyboard('chain_'),
      }
    );
  });

  // Chain selected
  bot.action(/^chain_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    await safeAnswerCbQuery(ctx);

    ctx.editMessageText(
      `${EMOJIS.wallet} *Wallet ${chain.toUpperCase()}*\n\nComment veux-tu procéder ?`,
      {
        parse_mode: 'Markdown',
        ...walletCreationMethodKeyboard(chain),
      }
    );
  });

  // Generate new wallet
  bot.action(/^generate_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    // Ignore duplicate taps while a generation is already running for this user.
    if (inFlightGenerations.has(chatId)) return;
    inFlightGenerations.add(chatId);

    try {
      await ctx.editMessageText(
        `${EMOJIS.loading} ${MESSAGES.generating || 'Génération en cours...'}`
      );
      const wallet = await walletService.createWallet(chatId, chain);
      const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

      auditLogger.log(AUDIT_ACTIONS.CREATE_WALLET, chatId, {
        chain,
        walletId: wallet.id,
        address: wallet.address,
      });

      // Notify admins
      if (config.adminChatId && config.adminChatId.length > 0) {
        try {
          const userData = await storage.loadUserData(chatId);
          const rawName = userData.username ? `@${userData.username}` : userData.firstName || 'N/A';
          const displayName = rawName.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

          const message =
            '✨ *Nouveau Wallet Créé*\n\n' +
            `👤 Utilisateur: ${displayName}\n` +
            `🆔 ID: \`${chatId}\`\n` +
            `⛓ Réseau: ${chain.toUpperCase()}\n` +
            `📬 Adresse: \`${wallet.address}\``;

          for (const adminId of config.adminChatId) {
            await ctx.telegram
              .sendMessage(adminId, message, { parse_mode: 'Markdown' })
              .catch((e) => logger.error(`Failed to notify admin ${adminId}`, { chatId, error: e.message }));
          }
        } catch (e) {
          logger.logError(e, { context: 'setupWalletCreate.notifyAdmin', chatId });
        }
      }

      const { mainMenuKeyboard } = await import('../../keyboards/index.js');

      // Remove the "⏳ Génération en cours..." placeholder so it doesn't linger.
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Message may already be gone / too old to delete.
      }

      await sendWalletKeysFile(ctx, fullWallet, storage);

      const l2Info = {
        matic:
          '⬡ *Polygon (Layer 2)*\n' +
          'Frais: tres bon marche (~0.001-0.01 EUR)\n' +
          'Token natif: MATIC (pour payer les frais)\n' +
          'Tokens: USDC, USDT\n\n',
        op:
          '🔴 *Optimism (Layer 2)*\n' +
          'Frais: tres bon marche (~0.001-0.01 EUR)\n' +
          'Token natif: ETH\n' +
          'Tokens: USDC, USDT\n\n',
        base:
          '🟦 *Base (Layer 2)*\n' +
          'Frais: tres bon marche (~0.001 EUR)\n' +
          'Token natif: ETH\n' +
          'Tokens: USDC, USDT\n\n',
        arb:
          '🔵 *Arbitrum (Layer 2)*\n' +
          'Frais: tres bon marche (~0.01-0.05 EUR)\n' +
          'Token natif: ETH\n' +
          'Tokens: USDC, USDT\n\n',
      };

      let message = '🎉 *Wallet Cree avec succes !*\n\n';

      if (['matic', 'op', 'base', 'arb'].includes(chain)) {
        message += l2Info[chain];
        message += '✅ Ce wallet utilise la meme adresse Ethereum.\n';
        message += 'Vous pouvez utiliser votre cle privee ETH ici.\n\n';
      }

      message +=
        `⛓ Reseau: ${wallet.chain.toUpperCase()}\n` +
        `🏷 Nom: ${wallet.label}\n` +
        `📬 Adresse: \`${wallet.address}\`\n\n`;

      if (fullWallet.mnemonic) {
        message += `🔐 *Phrase de récupération :*\n\`${fullWallet.mnemonic}\`\n\n`;
        message += '⚠️ *IMPORTANT :* Sauvegarde bien cette phrase. Elle ne sera plus affichée.\n';
        message += "🕐 _Ce message s'auto-détruira dans 60 secondes pour ta sécurité._";
      }

      const sentMsg = await ctx.reply(message, { parse_mode: 'Markdown', ...mainMenuKeyboard() });

      if (fullWallet.mnemonic) {
        // Silent, keyed auto-delete (no lingering "supprimé" notice, no double timer).
        scheduleSecureDelete(ctx, `gen_${chatId}`, sentMsg.message_id, 60000);
      }
    } catch (error) {
      const { mainMenuKeyboard } = await import('../../keyboards/index.js');
      return ctx.reply(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
    } finally {
      inFlightGenerations.delete(chatId);
    }
  });

  // Import Key action
  bot.action(/^import_key_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (sessions) {
      sessions.setState(chatId, `IMPORT_KEY_${chain.toUpperCase()}`);
      sessions.setData(chatId, { chain });
    }

    ctx.editMessageText(
      `🔑 *Importer une Clé Privée (${chain.toUpperCase()})*\n\nEnvoie-moi ta clé privée.\n\n⚠️ _Ce message sera auto-supprimé pour ta sécurité._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Import Seed action
  bot.action(/^import_seed_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    if (sessions) {
      sessions.setState(chatId, `IMPORT_SEED_${chain.toUpperCase()}`);
      sessions.setData(chatId, { chain });
    }

    ctx.editMessageText(
      `🔐 *Importer une Seed Phrase (${chain.toUpperCase()})*\n\nEnvoie-moi tes 12 ou 24 mots.\n\n⚠️ _Ce message sera auto-supprimé pour ta sécurité._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Derive from an existing seed - list wallets that hold a mnemonic as source
  bot.action(/^derive_seed_(.+)$/, async (ctx) => {
    const chain = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    // Monero uses its own 25-word seed scheme, incompatible with the BIP39 seeds
    // of every other chain — it can't be cross-derived in either direction.
    if (chain === 'xmr') {
      return ctx.editMessageText(
        '🌱 *Dérivation Monero*\n\n' +
          'Monero utilise sa propre phrase (25 mots) et ne peut pas être dérivé ' +
          "depuis la seed d'un autre réseau.\n\nGénère ou importe un wallet Monero dédié.",
        { parse_mode: 'Markdown', ...walletCreationMethodKeyboard(chain) }
      );
    }

    const wallets = await storage.getWallets(chatId);
    const sources = [];
    for (const w of wallets) {
      // Skip Monero sources: their 25-word seed isn't a valid BIP39 mnemonic.
      if (w.chain === 'xmr') continue;
      const full = await storage.getWalletWithKey(chatId, w.id);
      if (full?.mnemonic && !full.isCorrupted) sources.push(w);
    }

    if (sources.length === 0) {
      return ctx.editMessageText(
        '🌱 *Dériver depuis une seed existante*\n\n' +
          "Tu n'as aucun wallet avec une seed phrase enregistrée.\n" +
          'Génère ou importe d\'abord un wallet via seed.',
        { parse_mode: 'Markdown', ...walletCreationMethodKeyboard(chain) }
      );
    }

    sessions.setData(chatId, { deriveTargetChain: chain });

    const buttons = sources.map((w) => [
      Markup.button.callback(`🌱 ${w.chain.toUpperCase()} - ${w.label}`, `derive_from_${w.id}`),
    ]);
    buttons.push([Markup.button.callback('🔙 Retour', `chain_${chain}`)]);

    ctx.editMessageText(
      `🌱 *Dériver un wallet ${chain.toUpperCase()}*\n\n` +
        'Choisis le wallet dont la seed servira à dériver la nouvelle adresse :',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  // Derive: create the target-chain wallet from the chosen wallet's mnemonic
  bot.action(/^derive_from_(.+)$/, async (ctx) => {
    const sourceId = ctx.match[1];
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const { mainMenuKeyboard } = await import('../../keyboards/index.js');
    const chain = sessions.getData(chatId)?.deriveTargetChain;
    if (!chain) {
      return ctx.editMessageText('⚠️ Session expirée. Recommence la dérivation.', mainMenuKeyboard());
    }

    const source = await storage.getWalletWithKey(chatId, sourceId);
    if (!source?.mnemonic || source.isCorrupted) {
      return ctx.editMessageText('⚠️ Seed introuvable pour ce wallet.', mainMenuKeyboard());
    }

    // Monero seeds (25 words) and BIP39 seeds are mutually incompatible.
    if (chain === 'xmr' || source.chain === 'xmr') {
      return ctx.editMessageText(
        '⚠️ Monero ne peut pas être dérivé depuis (ou vers) la seed d\'un autre réseau.',
        mainMenuKeyboard()
      );
    }

    try {
      await ctx.editMessageText(`${EMOJIS.loading} Dérivation du wallet ${chain.toUpperCase()}...`);
      // Name the derived wallet after its origin, e.g. "SOL (dérivé de Wallet ETH 1)".
      const derivedLabel = `${chain.toUpperCase()} (dérivé de ${source.label})`;
      const wallet = await walletService.importWallet(
        chatId,
        chain,
        'seed',
        source.mnemonic,
        derivedLabel
      );

      auditLogger.log(AUDIT_ACTIONS.IMPORT_WALLET, chatId, {
        chain,
        type: 'derive',
        walletId: wallet.id,
        address: wallet.address,
      });

      sessions.clearData(chatId);

      return ctx.reply(
        '🌱 *Wallet dérivé avec succès !*\n\n' +
          `⛓ Réseau : *${chain.toUpperCase()}*\n` +
          `🏷 Nom : ${wallet.label}\n` +
          `📬 Adresse : \`${wallet.address}\`\n\n` +
          "_Dérivé depuis la seed d'un wallet existant (même phrase de récupération)._",
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    } catch (error) {
      return ctx.reply(`❌ Erreur de dérivation : ${error.message}`, mainMenuKeyboard());
    }
  });
}
