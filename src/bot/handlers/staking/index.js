import { Markup } from 'telegraf';
import { mainMenuKeyboard, liquidStakingKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { logger } from '../../../shared/logger.js';
import { handleStakeCommand, handleYieldCommand, stakingKeyboard } from './display.js';
import { handleCalcCommand } from './calculator.js';
import { setupJitoHandlers } from './jito.js';
import { setupMarinadeHandlers } from './marinade.js';
import { setupStakingTextInput } from './text-input.js';

export function setupStakingHandlers(bot, storage, walletService, sessions) {
  setupJitoHandlers(bot, storage, walletService, sessions);
  setupMarinadeHandlers(bot, storage, walletService, sessions);
  setupStakingTextInput(bot, storage, walletService, sessions);

  bot.command('stake', async (ctx) => {
    await handleStakeCommand(ctx, storage);
  });

  bot.command('yield', async (ctx) => {
    await handleYieldCommand(ctx, storage, walletService);
  });

  bot.command('calc', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    await handleCalcCommand(ctx, args);
  });

  bot.hears('📈 Staking', async (ctx) => {
    await handleStakeCommand(ctx, storage);
  });

  bot.action('staking_yield', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleYieldCommand(ctx, storage, walletService);
  });

  bot.action('liquid_staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);

    await ctx.editMessageText(
      '📈 *Liquid Staking Solana*\n\n' +
        'Stakez votre SOL et recevez des tokens liquides.\n\n' +
        '🥇 *JitoSOL* - Rendement eleve\n' +
        '🥈 *Marinade* - Equilibre\n\n' +
        '_Les deux offrent une sortie rapide_',
      { parse_mode: 'Markdown', ...liquidStakingKeyboard() }
    );
  });

  bot.action('stake_aave_usdc', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    ctx.reply(
      '🔷 *Depot Aave USDC*\n\n' +
        "1. Ouvrez l'app Aave:\n" +
        'https://app.aave.com\n\n' +
        '2. Selectionnez Arbitrum\n' +
        '3. Deposez USDC\n\n' +
        '_Liens officiels uniquement pour votre securite_',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  });

  bot.action('stake_aave_usdt', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    ctx.reply(
      '🔷 *Depot Aave USDT*\n\n' +
        "1. Ouvrez l'app Aave:\n" +
        'https://app.aave.com\n\n' +
        '2. Selectionnez Arbitrum\n' +
        '3. Deposez USDT\n\n' +
        '_Liens officiels uniquement pour votre securite_',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  });

  bot.action('stake_kamino', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    ctx.reply(
      '🟣 *Depot Kamino USDC*\n\n' +
        '1. Ouvrez Kamino:\n' +
        'https://app.kamino.finance/lend\n\n' +
        '2. Deposez USDC sur Solana\n\n' +
        '_Liens officiels uniquement pour votre securite_',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  });

  bot.action('stake_jupiter', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    ctx.reply(
      '🟣 *Depot Jupiter Lend*\n\n' +
        '1. Ouvrez Jupiter:\n' +
        'https://jup.ag/lend\n\n' +
        '2. Deposez USDC ou USDT\n\n' +
        '_Liens officiels uniquement pour votre securite_',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  });
}
