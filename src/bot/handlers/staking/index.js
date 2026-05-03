import { Markup } from 'telegraf';
import { StakingService } from '../../../modules/staking/staking.service.js';
import { JitoService } from '../../../modules/staking/jito.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../utils.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';

function formatAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value) {
  return StakingService.formatCurrency(value);
}

async function handleStakeCommand(ctx, storage) {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply('📈 Chargement des rendements...');

  try {
    const apyData = await Promise.race([
      StakingService.getAllApy(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);

    const defaultAmount = 1000;

    let text = '📈 *Staking - Rendements*\n\n';
    text += '💡 *Exemple: depot de 1000$*\n\n';

    text += '━━━━━━━━━━━━\n';
    text += '🔷 *Arbitrum - Aave V3*\n';
    text += '━━━━━━━━━━━━\n';

    if (apyData.aave.tokens.USDC) {
      const apy = apyData.aave.tokens.USDC.apy;
      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'aave-v3'
      });

      text += `USDC • APY: *${StakingService.formatApy(apy)}*\n\n`;
      text += `📅 1 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 1))}*\n`;
      text += `📅 3 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 3))}*\n`;
      text += `📅 6 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 6))}*\n`;
      text += `📅 1 an: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 12))}*\n\n`;
      text += `⚠️ Frais totaux: *${formatCurrency(profit.totalFees)}*\n`;
    }

    if (apyData.aave.tokens.USDT) {
      const apy = apyData.aave.tokens.USDT.apy;
      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'aave-v3'
      });

      text += `USDT • APY: *${StakingService.formatApy(apy)}*\n\n`;
      text += `📅 1 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 1))}*\n`;
      text += `📅 3 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 3))}*\n`;
      text += `📅 6 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 6))}*\n`;
      text += `📅 1 an: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 12))}*\n\n`;
      text += `⚠️ Frais totaux: *${formatCurrency(profit.totalFees)}*\n`;
    }

    text += '\n━━━━━━━━━━━━\n';
    text += '🟣 *Solana - Kamino*\n';
    text += '━━━━━━━━━━━━\n';

    if (apyData.kamino.tokens.USDC) {
      const apy = apyData.kamino.tokens.USDC.apy;
      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'kamino'
      });

      text += `USDC • APY: *${StakingService.formatApy(apy)}*\n\n`;
      text += `📅 1 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 1))}*\n`;
      text += `📅 3 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 3))}*\n`;
      text += `📅 6 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 6))}*\n`;
      text += `📅 1 an: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 12))}*\n\n`;
      text += `⚠️ Frais totaux: *${formatCurrency(profit.totalFees)}*\n`;
    }

    text += '\n━━━━━━━━━━━━\n';
    text += '🟣 *Solana - Jupiter Lend*\n';
    text += '━━━━━━━━━━━━\n';

    if (apyData.jupiter.tokens.USDC) {
      const apy = apyData.jupiter.tokens.USDC.apy;
      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'jupiter'
      });

      text += `USDC • APY: *${StakingService.formatApy(apy)}*\n\n`;
      text += `📅 1 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 1))}*\n`;
      text += `📅 3 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 3))}*\n`;
      text += `📅 6 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 6))}*\n`;
      text += `📅 1 an: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 12))}*\n\n`;
      text += `⚠️ Frais totaux: *${formatCurrency(profit.totalFees)}*\n`;
    }

    if (apyData.jupiter.tokens.USDT) {
      const apy = apyData.jupiter.tokens.USDT.apy;
      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'jupiter'
      });

      text += `USDT • APY: *${StakingService.formatApy(apy)}*\n\n`;
      text += `📅 1 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 1))}*\n`;
      text += `📅 3 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 3))}*\n`;
      text += `📅 6 mois: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 6))}*\n`;
      text += `📅 1 an: *+${formatCurrency(StakingService.calculateYield(defaultAmount, apy, 12))}*\n\n`;
      text += `⚠️ Frais totaux: *${formatCurrency(profit.totalFees)}*\n`;
    }

    text += '\n━━━━━━━━━━━━\n';
    text += '_Utilisez /calc <montant> <token> <protocole>_\n';
    text += '_pour calculer avec votre propre montant_\n';
    text += '_ou /yield pour voir vos positions_';

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...stakingKeyboard(apyData),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(
      '❌ Impossible de charger les rendements.\n\n' +
      '━━━━━━━━━━━━\n' +
      '🔷 Arbitrum - Aave V3: USDC ~1.65%, USDT ~2.13%\n' +
      '🟣 Solana - Kamino: USDC ~3.80%\n' +
      '🟣 Solana - Jupiter: USDC ~5.20%, USDT ~4.80%\n' +
      '━━━━━━━━━━━━\n' +
      '_Ces taux sont approximatifs_',
      mainMenuKeyboard()
    );
  }
}

async function handleYieldCommand(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply('📊 Chargement de vos positions...');

  try {
    const wallets = await storage.getWallets(chatId);
    const ethWallets = wallets.filter((w) => w.chain === 'eth');
    const solWallets = wallets.filter((w) => w.chain === 'sol');

    let text = '📊 *Mes Positions de Staking*\n\n';
    let totalStaked = 0;
    let totalMonthlyYield = 0;
    let hasPositions = false;

    if (ethWallets.length > 0) {
      text += '🔷 *Arbitrum - Aave V3*\n';
      text += '━━━━━━━━━━━━\n';

      const apyData = await StakingService.getAaveApy();

      for (const wallet of ethWallets) {
        try {
          const positions = await Promise.race([
            StakingService.getUserAavePosition(wallet.address, 'arbitrum'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]);

          for (const [symbol, pos] of Object.entries(positions)) {
            const apy = apyData[symbol]?.apy || '1.65';
            const monthlyYield = StakingService.calculateMonthlyYield(pos.amount, apy);

            text += `${symbol}: *${formatAmount(pos.amount)} $*\n`;
            text += `APY: ${StakingService.formatApy(apy)}\n`;
            text += `Gains/mois: ~${formatCurrency(monthlyYield)}\n\n`;

            totalStaked += parseFloat(pos.amount);
            totalMonthlyYield += monthlyYield;
            hasPositions = true;
          }
        } catch (e) {}
      }

      if (!hasPositions) {
        text += '_Aucune position_\n\n';
      }
    }

    if (solWallets.length > 0) {
      text += '🟣 *Solana*\n';
      text += '━━━━━━━━━━━━\n';

      for (const wallet of solWallets) {
        try {
          const kaminoPos = await Promise.race([
            StakingService.getUserKaminoPosition(wallet.address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]);

          for (const token of kaminoPos.tokens || []) {
            text += `Kamino ${token.symbol}: *${formatAmount(token.amount)}*\n`;
            hasPositions = true;
          }
        } catch (e) {}

        try {
          const jupiterPos = await Promise.race([
            StakingService.getUserJupiterPosition(wallet.address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]);

          for (const token of jupiterPos.tokens || []) {
            text += `Jupiter ${token.symbol}: *${formatAmount(token.amount)}*\n`;
            hasPositions = true;
          }
        } catch (e) {}

        // JitoSOL balance - use CoinGecko direct price
        try {
          const jitoBalance = await JitoService.getBalance(wallet.address);
          if (jitoBalance.success && jitoBalance.balance > 0) {
            const prices = await getPricesEUR();
            const jitoPriceEur = prices.jitosol || 0;
            const valueEur = jitoBalance.balance * jitoPriceEur;
            text += `JitoSOL: *${jitoBalance.balance.toFixed(4)}*`;
            if (jitoPriceEur > 0) {
              text += ` (~${formatEUR(valueEur)})`;
            }
            text += '\n';
            hasPositions = true;
          }
        } catch (e) {}
      }

      if (!hasPositions) {
        text += '_Aucune position_\n\n';
      }
    }

    if (!hasPositions) {
      text = '📊 *Mes Positions de Staking*\n\n';
      text += '━━━━━━━━━━━━\n';
      text += '❌ *Aucune position detectee*\n\n';
      text += 'Utilisez /stake pour voir les rendements\n';
      text += '━━━━━━━━━━━━\n\n';
    }

    text += '━━━━━━━━━━━━\n';
    if (totalStaked > 0) {
      text += `💰 *Total staked:* ${formatAmount(totalStaked)} $\n`;
      text += `📈 *Gains/mois:* ~${formatCurrency(totalMonthlyYield)}\n`;
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(
      '❌ Impossible de charger les positions.\n\n' +
      '━━━━━━━━━━━━\n' +
      'Le service est temporairement indisponible.\n' +
      '━━━━━━━━━━━━\n' +
      '_Utilisez /stake pour voir les rendements_',
      mainMenuKeyboard()
    );
  }
}

async function handleCalcCommand(ctx, args) {
  const chatId = ctx.chat.id;

  if (!args || args.length < 2) {
    return ctx.reply(
      '📊 *Calculateur de Gains*\n\n' +
      '━━━━━━━━━━━━\n' +
      '*Usage:*\n' +
      '`/calc <montant> <token> [protocole]`\n\n' +
      '*Exemples:*\n' +
      '`/calc 1000 USDC`\n' +
      '`/calc 500 USDT aave`\n' +
      '`/calc 1000 USDC kamino`\n' +
      '`/calc 1000 USDC jupiter`\n\n' +
      '*Protocoles:* aave, kamino, jupiter\n' +
      '*Tokens:* USDC, USDT\n' +
      '━━━━━━━━━━━━',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  const amount = parseFloat(args[0]);
  const token = args[1].toUpperCase();
  const protocol = args[2]?.toLowerCase() || null;

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply(
      '❌ *Montant invalide*\n\n' +
      'Le montant doit etre un nombre positif.\n' +
      '━━━━━━━━━━━━',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  if (token !== 'USDC' && token !== 'USDT') {
    return ctx.reply(
      '❌ *Token invalide*\n\n' +
      'Tokens supportes: USDC, USDT\n' +
      '━━━━━━━━━━━━',
      { parse_mode: 'Markdown', ...mainMenuKeyboard() }
    );
  }

  const loadingMsg = await ctx.reply('📊 Calcul en cours...');

  try {
    const [aaveApy, kaminoApy, jupiterApy] = await Promise.all([
      StakingService.getAaveApy(),
      StakingService.getKaminoApy(),
      StakingService.getJupiterApy(),
    ]);

    let text = '📊 *Calculateur de Gains*\n\n';
    text += '━━━━━━━━━━━━\n';
    text += `Depot: *${formatAmount(amount)} ${token}*\n`;
    text += '━━━━━━━━━━━━\n';

    const protocolsToShow = [];

    if (!protocol || protocol === 'aave') {
      const apy = token === 'USDT' ? aaveApy.USDT?.apy : aaveApy.USDC?.apy;
      if (apy) {
        protocolsToShow.push({
          name: 'Aave V3',
          chain: 'Arbitrum',
          protocol: 'aave-v3',
          apy,
        });
      }
    }

    if ((!protocol || protocol === 'kamino') && token === 'USDC') {
      const apy = kaminoApy.USDC?.apy;
      if (apy) {
        protocolsToShow.push({
          name: 'Kamino',
          chain: 'Solana',
          protocol: 'kamino',
          apy,
        });
      }
    }

    if (!protocol || protocol === 'jupiter') {
      const apy = token === 'USDT' ? jupiterApy.USDT?.apy : jupiterApy.USDC?.apy;
      if (apy) {
        protocolsToShow.push({
          name: 'Jupiter Lend',
          chain: 'Solana',
          protocol: 'jupiter',
          apy,
        });
      }
    }

    for (const p of protocolsToShow) {
      const profit = StakingService.calculateProfit({
        amount,
        apy: p.apy,
        months: 12,
        protocol: p.protocol,
      });

      text += `${p.name} - ${p.chain}\n`;
      text += '━━━━━━━━━━━━\n';
      text += `${token} • APY: *${StakingService.formatApy(p.apy)}*\n\n`;

      text += '📈 *Gains bruts*\n';
      text += `1 mois: *+${formatCurrency(StakingService.calculateYield(amount, p.apy, 1))}*\n`;
      text += `3 mois: *+${formatCurrency(StakingService.calculateYield(amount, p.apy, 3))}*\n`;
      text += `6 mois: *+${formatCurrency(StakingService.calculateYield(amount, p.apy, 6))}*\n`;
      text += `1 an: *+${formatCurrency(StakingService.calculateYield(amount, p.apy, 12))}*\n\n`;

      text += '💸 *Frais*\n';
      text += `Depot: ${formatCurrency(profit.breakdown.depositFee)}\n`;
      text += `Retrait: ${formatCurrency(profit.breakdown.withdrawFee)}\n`;
      text += `Slippage (${profit.breakdown.slippagePercent}%): ${formatCurrency(profit.breakdown.slippageCost)}\n`;
      text += `Total: ${formatCurrency(profit.totalFees)}\n\n`;

      text += '💰 *Gains nets*\n';
      text += `1 mois: *+${formatCurrency(profit.netProfit / 12)}*\n`;
      text += `3 mois: *+${formatCurrency(profit.netProfit / 12 * 3)}*\n`;
      text += `6 mois: *+${formatCurrency(profit.netProfit / 12 * 6)}*\n`;
      text += `1 an: *+${formatCurrency(profit.netProfit)}*\n\n`;

      text += `📊 ROI annualise: *${profit.roi}%*\n`;
      text += '━━━━━━━━━━━━\n\n';
    }

    if (protocolsToShow.length === 0) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      return ctx.reply(
        '❌ *Aucune donnee disponible*\n\n' +
        `Pour ${token}, les protocoles disponibles sont:\n` +
        '- Aave V3 (USDC, USDT)\n' +
        '- Jupiter Lend (USDC, USDT)\n' +
        '- Kamino (USDC uniquement)\n' +
        '━━━━━━━━━━━━',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    text += '_Prix mis a jour automatiquement_\n';
    text += '_Frais fixes (non garanties)_\n';

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard(),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(
      '❌ Erreur lors du calcul.\n' +
      '━━━━━━━━━━━━\n' +
      '_Reessayez plus tard_',
      mainMenuKeyboard()
    );
  }
}

export function setupStakingHandlers(bot, storage, walletService, sessions) {
  // Import and setup Jito handlers
  import('./jito.js').then(({ setupJitoHandlers }) => {
    setupJitoHandlers(bot, storage, walletService, sessions);
    console.log('[STAKING] Jito handlers loaded');
  }).catch(err => console.error('[STAKING] Failed to load Jito handlers:', err));

  // Import and setup Marinade handlers
  import('./marinade.js').then(({ setupMarinadeHandlers }) => {
    setupMarinadeHandlers(bot, storage, walletService, sessions);
    console.log('[STAKING] Marinade handlers loaded');
  }).catch(err => console.error('[STAKING] Failed to load Marinade handlers:', err));

  // Import and setup Staking text input handlers
  import('./text-input.js').then(({ setupStakingTextInput }) => {
    setupStakingTextInput(bot, storage, walletService, sessions);
    console.log('[STAKING] Text input handlers loaded');
  }).catch(err => console.error('[STAKING] Failed to load text input handlers:', err));

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

  // Liquid Staking menu
  bot.action('liquid_staking_menu', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const { liquidStakingKeyboard, mainMenuKeyboard } = await import('../../keyboards/index.js');
    
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
        '1. Ouvrez l\'app Aave:\n' +
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
        '1. Ouvrez l\'app Aave:\n' +
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

function stakingKeyboard(apyData) {
  const buttons = [];

  if (apyData?.aave?.tokens?.USDC || apyData?.aave?.tokens?.USDT) {
    const aaveButtons = [];
    if (apyData.aave.tokens.USDC) {
      aaveButtons.push(Markup.button.callback('Aave USDC', 'stake_aave_usdc'));
    }
    if (apyData.aave.tokens.USDT) {
      aaveButtons.push(Markup.button.callback('Aave USDT', 'stake_aave_usdt'));
    }
    if (aaveButtons.length > 0) {
      buttons.push(aaveButtons);
    }
  }

  if (apyData?.kamino?.tokens?.USDC) {
    buttons.push([Markup.button.callback('Kamino USDC', 'stake_kamino')]);
  }

  if (apyData?.jupiter?.tokens?.USDC || apyData?.jupiter?.tokens?.USDT) {
    buttons.push([Markup.button.callback('Jupiter Lend', 'stake_jupiter')]);
  }

  buttons.push([Markup.button.callback('📊 Mes Positions', 'staking_yield')]);
  buttons.push([Markup.button.callback('🔙 Menu', 'back_to_menu')]);

  return Markup.inlineKeyboard(buttons);
}
