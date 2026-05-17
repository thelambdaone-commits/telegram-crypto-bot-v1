import { Markup } from 'telegraf';
import { getCurveLpPools, getEthStakingProvider } from '../../../../core/staking.config.js';
import { ethLstProvider } from '../../../../modules/staking/providers/registry.js';
import {
  curveLpKeyboard,
  ethStakingKeyboard,
  ethStakingProtocolKeyboard,
  ethStakingWalletKeyboard,
} from '../../../keyboards/staking.keyboards.js';
import { mainMenuKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { logger } from '../../../../shared/logger.js';

function fmt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(2)}%` : 'N/A';
}

async function renderEthStakingMenu(ctx) {
  let text = '⚡ *ETH Staking*\n\n';
  for (const protocol of ethLstProvider.getSupportedProtocols()) {
    const quote = await ethLstProvider.quote({ protocolId: protocol.id });
    text += `${protocol.icon} *${protocol.displayName}* → ${protocol.receiptToken}\n`;
    text += `APY: *${fmt(quote.apy)}*`;
    if (!quote.directDepositEnabled) text += ' • dépôt direct désactivé';
    text += '\n\n';
  }

  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...ethStakingKeyboard() });
}

async function renderProtocolMenu(ctx, protocolId) {
  const protocol = getEthStakingProvider(protocolId);
  if (!protocol) return ctx.editMessageText('❌ Provider ETH inconnu.', mainMenuKeyboard());
  const quote = await ethLstProvider.quote({ protocolId });

  let text =
    `${protocol.icon} *${protocol.displayName}*\n\n` +
    `Token reçu: *${protocol.receiptToken}*\n` +
    `APY estimé: *${fmt(quote.apy)}* (${quote.source})\n\n`;

  if (protocol.directDepositEnabled === false) {
    text += 'Le dépôt direct est désactivé ici. Utilise le front officiel ou un DEX avec liquidité rETH.\n\n';
  }

  text += `Source contrats: ${protocol.sourceUrl}`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...ethStakingProtocolKeyboard(protocolId, protocol.directDepositEnabled !== false),
  });
}

async function selectEthWallet(ctx, storage, sessions, action, protocolId) {
  const chatId = ctx.chat.id;
  const wallets = (await storage.getWallets(chatId)).filter((wallet) => wallet.chain === 'eth');

  if (wallets.length === 0) {
    return ctx.editMessageText(
      '❌ Aucun wallet Ethereum.\n\nCrée ou importe un wallet ETH pour utiliser le staking ETH.',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  if (wallets.length === 1) {
    sessions.updateData(chatId, { action: `eth_stake_${action}`, protocolId, walletId: wallets[0].id });
    sessions.setState(chatId, action === 'deposit' ? 'ETH_STAKE_DEPOSIT_AMOUNT' : 'ETH_STAKE_WITHDRAW_AMOUNT');
    return ctx.editMessageText(
      action === 'deposit'
        ? 'Entre le montant d’ETH à staker :'
        : 'Entre le montant à retirer, ou `max` :',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
      }
    );
  }

  await ctx.editMessageText('Sélectionne ton wallet Ethereum :', {
    parse_mode: 'Markdown',
    ...ethStakingWalletKeyboard(action, protocolId, wallets),
  });
}

export function setupEthStakingHandlers(bot, storage, _walletService, sessions) {
  bot.action('eth_staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await renderEthStakingMenu(ctx);
  });

  bot.action(/^eth_stake_menu_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await renderProtocolMenu(ctx, ctx.match[1]);
  });

  bot.action(/^eth_stake_(deposit|withdraw)_(lido|rocketpool|frax)_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const action = ctx.match[1];
    const protocolId = ctx.match[2];
    const walletId = ctx.match[3];
    sessions.updateData(ctx.chat.id, { action: `eth_stake_${action}`, protocolId, walletId });
    sessions.setState(ctx.chat.id, action === 'deposit' ? 'ETH_STAKE_DEPOSIT_AMOUNT' : 'ETH_STAKE_WITHDRAW_AMOUNT');
    await ctx.editMessageText(
      action === 'deposit' ? 'Entre le montant d’ETH à staker :' : 'Entre le montant à retirer, ou `max` :',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'cancel_staking')]]),
      }
    );
  });

  bot.action(/^eth_stake_(deposit|withdraw)_(lido|rocketpool|frax)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await selectEthWallet(ctx, storage, sessions, ctx.match[1], ctx.match[2]);
  });

  bot.action('curve_lp_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText(
      '🔄 *Curve LP*\n\nPools préparées pour la phase 2. Pour l’instant, le bot affiche les options sans dépôt direct.',
      { parse_mode: 'Markdown', ...curveLpKeyboard() }
    );
  });

  bot.action(/^curve_pool_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const pool = getCurveLpPools().find((item) => item.id === ctx.match[1]);
    if (!pool) return ctx.editMessageText('❌ Pool Curve inconnue.', mainMenuKeyboard());
    await ctx.editMessageText(
      `${pool.icon} *Curve ${pool.name}*\n\n` +
        `Actifs: *${pool.assets.join(' + ')}*\n` +
        'Statut: *Phase 2*\n\n' +
        'Je garde les dépôts Curve désactivés tant que le flux complet dépôt → gauge → retrait n’est pas testé.',
      { parse_mode: 'Markdown', ...curveLpKeyboard() }
    );
  });

  logger.info('ETH staking handlers loaded', { service: 'staking' });
}
