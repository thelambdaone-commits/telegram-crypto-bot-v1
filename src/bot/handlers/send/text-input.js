import {
  mainMenuKeyboard,
  amountTypeKeyboard,
  feeSelectionKeyboard,
} from '../../keyboards/index.js';
import { detectChain } from '../../../shared/address-detector.js';
import { convertToEUR, formatEUR } from '../../../shared/price.js';
import { getTokenExplorerUrl } from '../../../shared/explorer.js';
import { handleSendError } from './helpers.js';

// EVM addresses (0x…) are identical across all EVM networks, so an analyzed
// 0x address is scanned on each of these and reported per-network.
const EVM_NETWORKS = [
  { chain: 'eth', name: 'Ethereum', emoji: 'Ξ' },
  { chain: 'base', name: 'Base', emoji: '🟦' },
  { chain: 'op', name: 'Optimism', emoji: '🔴' },
  { chain: 'matic', name: 'Polygon', emoji: '⬡' },
  { chain: 'arb', name: 'Arbitrum', emoji: '🔵' },
  { chain: 'avax', name: 'Avalanche', emoji: '🔺' },
];

/**
 * Build the native-balance + tokens section for one chain.
 * @returns {Promise<{ text: string, valueEUR: number }>}
 */
async function buildChainSection(walletService, chain, address) {
  const balanceData = await walletService.getPublicAddressBalance(chain, address);
  const nativeSymbol = balanceData.symbol || chain.toUpperCase();
  const balanceNum = Number.parseFloat(balanceData.balance) || 0;
  const conversion = await convertToEUR(chain, balanceNum);
  let valueEUR = conversion.valueEUR || 0;

  let text = `💰 *${balanceData.balance} ${nativeSymbol}*`;
  text += valueEUR > 0 ? ` — ${formatEUR(valueEUR)}\n` : '\n';

  const tokens = await walletService.getPublicAddressTokens(chain, address);
  for (const token of tokens || []) {
    const sym = (token.symbol || '').toLowerCase();
    // Stablecoins price off USDC; other tokens only show an EUR value if known.
    const priceKey = sym.includes('usd') ? 'usdc' : sym;
    const tokenConv = await convertToEUR(priceKey, token.amount);
    const tokenValue = tokenConv.priceEUR > 0 ? tokenConv.valueEUR : 0;
    valueEUR += tokenValue;

    const amountStr = token.amount.toFixed(token.decimals <= 6 ? 2 : 6);
    text += `   ${token.icon || '🪙'} *${token.symbol}:* ${amountStr}`;
    text += tokenValue > 0 ? ` (${formatEUR(tokenValue)})\n` : '\n';

    if (!token.isKnown) {
      const tokenUrl = getTokenExplorerUrl(chain, token.mint);
      if (tokenUrl) text += `      └ [🔗 Voir](${tokenUrl})\n`;
    }
  }

  return { text, valueEUR };
}

export function setupSendTextInput(bot, storage, walletService, sessions) {
  bot.on('text', async (ctx, next) => {
    const chatId = ctx.chat.id;
    const state = sessions.getState(chatId);
    const text = ctx.message.text.trim();

    if (state === 'ENTER_ADDRESS') {
      const detected = detectChain(text);
      const data = sessions.getData(chatId);

      // Pour les tokens SPL personnalisés sur Solana, utiliser "sol" pour la validation
      // Ne jamais utiliser le nom/symbole du token comme chaîne
      let validationChain = data.selectedChain;

      // Si selectedChain n'est pas une blockchain connue (ex: "DECIMALS"), forcer "sol"
      const validChains = ['eth', 'btc', 'ltc', 'bch', 'sol', 'arb', 'matic', 'op', 'base', 'xmr', 'zec'];
      if (!validChains.includes(validationChain)) {
        validationChain = 'sol';
      }

      if (detected !== validationChain) {
        return ctx.reply(
          `⚠️ *Adresse invalide*\n\nL'adresse saisie n'est pas une adresse ${validationChain.toUpperCase()} valide.`,
          { parse_mode: 'Markdown' }
        );
      }

      sessions.setData(chatId, { ...data, toAddress: text });
      sessions.setState(chatId, 'SELECT_AMOUNT_TYPE');

      return ctx.reply('👉 *Vérification réussie*\n\nComment souhaites-tu saisir le montant ?', {
        parse_mode: 'Markdown',
        ...amountTypeKeyboard(),
      });
    }

    if (state === 'ENTER_AMOUNT') {
      const data = sessions.getData(chatId);
      const amountStr = text.replace(',', '.');
      const inputAmount = Number.parseFloat(amountStr);

      if (Number.isNaN(inputAmount) || inputAmount <= 0) {
        return ctx.reply('⚠️ Montant invalide. Entre un nombre positif.');
      }

      try {
        let amount = inputAmount;
        const tokenSymbol = data.selectedToken;
        const displaySymbol = tokenSymbol || data.selectedChain.toUpperCase();

        if (data.amountType === 'eur' && !tokenSymbol) {
          const conversion = await convertToEUR(data.selectedChain, 1);
          amount = inputAmount / conversion.rate;
        }

        const balanceData = await walletService.getBalance(
          chatId,
          data.selectedWalletId,
          tokenSymbol
        );
        if (amount > Number.parseFloat(balanceData.balance)) {
          return ctx.reply(`💸 Solde insuffisant (${balanceData.balance} ${balanceData.symbol})`);
        }

        sessions.setData(chatId, { ...data, amount });

        const fees = await walletService.estimateFees(
          chatId,
          data.selectedWalletId,
          data.toAddress,
          amount,
          tokenSymbol
        );
        sessions.setData(chatId, { ...sessions.getData(chatId), fees });

        const amountEUR = tokenSymbol
          ? await convertToEUR('usd', amount)
          : await convertToEUR(data.selectedChain, amount);

        ctx.reply(
          '✅ *Montant validé*\n\n' +
            `💰 Montant : *${amount.toFixed(8)} ${displaySymbol}*\n` +
            `💶 Valeur : ${formatEUR(amountEUR.valueEUR)}\n\n` +
            'Choisis la vitesse de transaction :',
          {
            parse_mode: 'Markdown',
            ...feeSelectionKeyboard('slow'),
          }
        );
        sessions.setState(chatId, 'SELECT_FEE');
      } catch (error) {
        await handleSendError(ctx, error, mainMenuKeyboard);
      }
      return;
    }

    if (state === 'ENTER_ADDRESS_ANALYZE') {
      // Ignore commands and menu buttons
      if (
        text.startsWith('/') ||
        [
          '💰 Mes Wallets',
          '💸 Envoyer',
          '💵 Soldes',
          '🔍 Analyser',
          '🔎 Analyser',
          '📊 Cours EUR',
          '❓ Aide',
          '🆘 Help',
          '➕ Nouveau Wallet',
          '❌ Fermer',
          '👑 Admin',
          'Stop',
          'Annuler',
          'Retour',
        ].includes(text)
      ) {
        sessions.setState(chatId, 'IDLE');
        return next();
      }

      const { logger } = await import('../../../shared/logger.js');
      const chain = detectChain(text);
      if (!chain) {
        logger.warn('Invalid address provided for analysis', { address: text, chatId });
        return ctx.reply(
          '⚠️ Adresse non reconnue (ETH, BTC, LTC, BCH, SOL, XMR, ZEC, Arbitrum, Polygon, Optimism, Base, Avalanche acceptés).'
        );
      }

      // A 0x… address exists identically on every EVM network, so it can't be
      // attributed to a single one — scan them all.
      const isEvm = EVM_NETWORKS.some((n) => n.chain === chain);

      try {
        logger.info('Analyzing external address', { chain, address: text, chatId, multiEvm: isEvm });

        let message;
        if (isEvm) {
          message =
            "🔍 *Analyse d'adresse EVM*\n\n" +
            `📬 \`${text}\`\n` +
            '_Même adresse scannée sur tous les réseaux EVM._\n';

          let total = 0;
          for (const net of EVM_NETWORKS) {
            message += `\n${net.emoji} *${net.name}*\n`;
            try {
              const section = await buildChainSection(walletService, net.chain, text);
              message += section.text;
              total += section.valueEUR;
            } catch (e) {
              message += '   ⚠️ _Réseau indisponible_\n';
              logger.warn('EVM network scan failed', { chain: net.chain, error: e.message });
            }
          }
          message += `\n💶 *Valeur totale (EVM):* ${formatEUR(total)}`;
        } else {
          const section = await buildChainSection(walletService, chain, text);
          message =
            "🔍 *Analyse d'adresse*\n\n" +
            `⛓ Réseau : *${chain.toUpperCase()}*\n` +
            `📬 \`${text}\`\n\n` +
            section.text +
            `\n💶 *Valeur totale :* ${formatEUR(section.valueEUR)}`;
        }

        // Keep the rendered analysis so the history view can restore it on "Retour".
        sessions.setData(chatId, {
          analyzedAddress: text,
          analyzedChain: chain,
          analyzedMessage: message,
        });

        const { addressAnalyzedKeyboard } = await import('../../keyboards/index.js');
        ctx.reply(message, {
          parse_mode: 'Markdown',
          ...addressAnalyzedKeyboard(chain, text),
        });
        sessions.setState(chatId, 'IDLE');
        logger.info('Address analysis completed', { chain, address: text, chatId });
      } catch (error) {
        logger.logError(error, {
          context: 'Address analysis',
          chain,
          address: text,
          chatId,
        });
        ctx.reply(`❌ Erreur d'analyse : ${error.message}`);
      }
      return;
    }

    return next();
  });
}
