import { Markup } from 'telegraf';
import { SolanaStakingOptimizer } from '../../../modules/staking/comparator/solana-optimizer.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { logger } from '../../../shared/logger.js';

function formatApy(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(2)}%` : 'N/A';
}

function optimizerKeyboard(opportunities) {
  const buttons = opportunities.map((item) => [
    Markup.button.callback(
      `${item.icon} ${item.name} (${formatApy(item.apy)})`,
      item.actionCallback
    ),
  ]);
  buttons.push([Markup.button.callback('🔄 Actualiser', 'staking_optimizer_refresh')]);
  buttons.push([Markup.button.callback('↩️ Retour', 'staking_menu')]);
  return Markup.inlineKeyboard(buttons);
}

export async function renderStakingOptimizer(ctx, { edit = true, force = false } = {}) {
  const opportunities = await SolanaStakingOptimizer.getOpportunities({ force });
  const cache = SolanaStakingOptimizer.getCacheInfo();
  const updatedAt = cache.updatedAt
    ? new Date(cache.updatedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    : 'N/A';

  let text = '🏆 *Staking Optimizer Solana*\n\n';
  text += 'Classement par APY décroissant, avec sortie rapide disponible.\n\n';

  opportunities.forEach((item, index) => {
    text += `${index + 1}. ${item.icon} *${item.name}* → ${item.token}\n`;
    text += `   APY estimé: *${formatApy(item.apy)}*\n`;
    text += `   Lock: ${item.lockPeriod}\n`;
    text += `   Source: ${item.source}\n\n`;
  });

  text += `Dernière mise à jour: ${updatedAt}\n`;
  text += '_Cache APY: 6h_';

  const payload = {
    parse_mode: 'Markdown',
    ...optimizerKeyboard(opportunities),
  };

  if (edit) {
    await ctx.editMessageText(text, payload);
  } else {
    await ctx.reply(text, payload);
  }
}

export function setupStakingOptimizerHandlers(bot) {
  bot.action('staking_optimizer', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    try {
      await renderStakingOptimizer(ctx);
    } catch (error) {
      logger.logError(error, { context: 'staking_optimizer', chatId: ctx.chat.id });
      await ctx.editMessageText(`❌ Erreur optimizer: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }
  });

  bot.action('staking_optimizer_refresh', async (ctx) => {
    await safeAnswerCbQuery(ctx, 'Actualisation...');
    try {
      await renderStakingOptimizer(ctx, { force: true });
    } catch (error) {
      logger.logError(error, { context: 'staking_optimizer_refresh', chatId: ctx.chat.id });
      await ctx.editMessageText(`❌ Erreur optimizer: ${error.message}`, {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }
  });

  bot.hears('🏆 Staking Optimizer', async (ctx) => {
    await renderStakingOptimizer(ctx, { edit: false });
  });

  logger.info('Staking optimizer handlers loaded', { service: 'staking' });
}
