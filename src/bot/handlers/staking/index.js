import { liquidStakingKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { handleStakeCommand, handleYieldCommand } from './display.js';
import { handleCalcCommand } from './calculator.js';
import { setupJitoHandlers } from './jito.js';
import { setupMarinadeHandlers } from './marinade.js';
import { setupAaveHandlers } from './providers/aave.js';
import { setupEthStakingHandlers } from './providers/eth-staking.js';
import { setupStakingOptimizerHandlers } from './optimizer.js';
import { setupStakingTextInput } from './text-input.js';

export function setupStakingHandlers(bot, storage, walletService, sessions) {
  setupStakingOptimizerHandlers(bot, storage, walletService, sessions);
  setupAaveHandlers(bot, storage, walletService, sessions);
  setupEthStakingHandlers(bot, storage, walletService, sessions);
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

  bot.action('staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleStakeCommand(ctx, storage, { edit: true });
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
}
