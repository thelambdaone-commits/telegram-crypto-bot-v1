import { Markup } from 'telegraf';
import { StakingService } from '../../../modules/staking/staking.service.js';
import { JitoService } from '../../../modules/staking/jito.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';
import { formatAmountShort as formatAmount } from '../../../shared/formatters.js';

function formatCurrency(value) {
  return StakingService.formatCurrency(value);
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

async function handleStakeCommand(ctx, _storage) {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply('📈 Chargement des rendements...');

  try {
    const apyData = await Promise.race([
      StakingService.getAllApy(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
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
        protocol: 'aave-v3',
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
        protocol: 'aave-v3',
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
        protocol: 'kamino',
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
        protocol: 'jupiter',
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
        protocol: 'jupiter',
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
    logger.logError(error, { context: 'handleStakeCommand', chatId });
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

async function handleYieldCommand(ctx, storage, _walletService) {
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
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
        } catch (e) {
          logger.warn('Failed to fetch Aave position', { walletAddress: wallet.address, error: e.message });
        }
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);

          for (const token of kaminoPos.tokens || []) {
            text += `Kamino ${token.symbol}: *${formatAmount(token.amount)}*\n`;
            hasPositions = true;
          }
        } catch (e) {
          logger.warn('Failed to fetch Kamino position', { walletAddress: wallet.address, error: e.message });
        }

        try {
          const jupiterPos = await Promise.race([
            StakingService.getUserJupiterPosition(wallet.address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);

          for (const token of jupiterPos.tokens || []) {
            text += `Jupiter ${token.symbol}: *${formatAmount(token.amount)}*\n`;
            hasPositions = true;
          }
        } catch (e) {
          logger.warn('Failed to fetch Jupiter position', { walletAddress: wallet.address, error: e.message });
        }

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
        } catch (e) {
          logger.warn('Failed to fetch Jito balance', { walletAddress: wallet.address, error: e.message });
        }
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
    logger.logError(error, { context: 'handleYieldCommand', chatId });
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

export { handleStakeCommand, handleYieldCommand, formatAmount, formatCurrency, stakingKeyboard };
