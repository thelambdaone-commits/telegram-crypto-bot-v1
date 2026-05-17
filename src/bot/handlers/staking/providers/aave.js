import { Markup } from 'telegraf';
import { getAaveChain, getAaveChains } from '../../../../core/staking.config.js';
import { aaveProvider } from '../../../../modules/staking/providers/registry.js';
import {
  aaveChainKeyboard,
  aaveMainKeyboard,
  aaveTokenKeyboard,
  aaveWalletKeyboard,
} from '../../../keyboards/staking.keyboards.js';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { logger } from '../../../../shared/logger.js';

function formatApy(apy) {
  const value = Number(apy);
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)}%` : 'N/A';
}

function formatTvl(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

async function renderAaveMenu(ctx) {
  let text = '🔷 *Aave V3 - USDC/USDT*\n\n';
  text += 'Dépôts et retraits directs depuis le bot sur les réseaux supportés.\n';
  text += '_APY live DefiLlama, contrôle on-chain au moment de la transaction._\n\n';

  for (const chain of getAaveChains()) {
    text += `${chain.icon} *${chain.displayName}*\n`;
    for (const symbol of Object.keys(chain.tokens)) {
      try {
        const quote = await aaveProvider.quote({ chainId: chain.id, symbol });
        const tvl = formatTvl(quote.tvlUsd);
        text += `${symbol}: *${formatApy(quote.apy)}*`;
        if (tvl) text += ` • TVL ${tvl}`;
        text += ` (${quote.apySource})\n`;
      } catch (error) {
        logger.warn('Failed to render Aave APY row', {
          chain: chain.id,
          symbol,
          error: error.message,
        });
        text += `${symbol}: *N/A* (source indisponible)\n`;
      }
    }
    text += '\n';
  }

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...aaveMainKeyboard(),
  });
}

async function selectToken(ctx, action, chainId) {
  const chain = getAaveChain(chainId);
  if (!chain) {
    return ctx.editMessageText('❌ Chaîne Aave inconnue.', mainMenuKeyboard());
  }

  await ctx.editMessageText(
    `${chain.icon} *${chain.displayName} - Aave V3*\n\nSélectionne le token :`,
    {
      parse_mode: 'Markdown',
      ...aaveTokenKeyboard(action, chainId),
    }
  );
}

async function selectWallet(ctx, storage, action, chainId, tokenSymbol) {
  const chatId = ctx.chat.id;
  const chain = getAaveChain(chainId);
  const wallets = (await storage.getWallets(chatId)).filter((wallet) => wallet.chain === chainId);

  if (wallets.length === 0) {
    return ctx.editMessageText(
      `❌ Aucun wallet ${chain.displayName}.\n\nCrée ou importe un wallet ${chain.displayName} pour utiliser Aave.`,
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  if (wallets.length === 1) {
    return wallets[0];
  }

  await ctx.editMessageText(
    `${chain.icon} *${chain.displayName} ${tokenSymbol}*\n\nSélectionne le wallet :`,
    {
      parse_mode: 'Markdown',
      ...aaveWalletKeyboard(action, chainId, tokenSymbol, wallets),
    }
  );
  return null;
}

async function askAmount(ctx, sessions, action, chainId, tokenSymbol, wallet) {
  const chain = getAaveChain(chainId);
  sessions.updateData(ctx.chat.id, {
    provider: 'aave-v3',
    action: `aave_${action}`,
    chainId,
    tokenSymbol,
    walletId: wallet.id,
  });
  sessions.setState(ctx.chat.id, action === 'deposit' ? 'AAVE_DEPOSIT_AMOUNT' : 'AAVE_WITHDRAW_AMOUNT');

  const verb = action === 'deposit' ? 'déposer' : 'retirer';
  const hint = action === 'withdraw' ? '\nTu peux aussi envoyer `max` pour tout retirer.' : '';

  await ctx.editMessageText(
    `${chain.icon} *Aave ${chain.displayName} - ${tokenSymbol}*\n\n` +
      `Wallet: \`${wallet.label || wallet.address.slice(0, 8)}...\`\n\n` +
      `Entre le montant de ${tokenSymbol} à ${verb}.${hint}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
    }
  );
}

export function setupAaveHandlers(bot, storage, _walletService, sessions) {
  bot.action('aave_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await renderAaveMenu(ctx);
  });

  bot.action('aave_deposit_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText('📥 *Dépôt Aave V3*\n\nSélectionne la chaîne :', {
      parse_mode: 'Markdown',
      ...aaveChainKeyboard('deposit'),
    });
  });

  bot.action('aave_withdraw_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText('📤 *Retrait Aave V3*\n\nSélectionne la chaîne :', {
      parse_mode: 'Markdown',
      ...aaveChainKeyboard('withdraw'),
    });
  });

  bot.action(/^aave_(deposit|withdraw)_chain_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await selectToken(ctx, ctx.match[1], ctx.match[2]);
  });

  bot.action(/^aave_(deposit|withdraw)_token_(.+)_(USDC|USDT)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const action = ctx.match[1];
    const chainId = ctx.match[2];
    const tokenSymbol = ctx.match[3];
    const wallet = await selectWallet(ctx, storage, action, chainId, tokenSymbol);
    if (wallet) await askAmount(ctx, sessions, action, chainId, tokenSymbol, wallet);
  });

  bot.action(/^aave_(deposit|withdraw)_wallet_(.+)_(USDC|USDT)_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const action = ctx.match[1];
    const chainId = ctx.match[2];
    const tokenSymbol = ctx.match[3];
    const walletId = ctx.match[4];
    const wallet = await storage.getWalletById(ctx.chat.id, walletId);

    if (!wallet) {
      return ctx.editMessageText('❌ Wallet introuvable.', mainMenuKeyboard());
    }

    try {
      await askAmount(ctx, sessions, action, chainId, tokenSymbol, wallet);
    } catch (error) {
      logger.logError(error, { context: 'aave.askAmount', chatId: ctx.chat.id });
      await ctx.editMessageText(`❌ Erreur: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }
  });

  logger.info('Aave handlers loaded', { service: 'staking' });
}
