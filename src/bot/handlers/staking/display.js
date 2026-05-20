import { StakingService } from '../../../modules/staking/staking.service.js';
import { JitoService } from '../../../modules/staking/jito.js';
import { ethLstProvider } from '../../../modules/staking/providers/registry.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { stakingHubKeyboard } from '../../keyboards/staking.keyboards.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';
import { formatAmountShort as formatAmount } from '../../../shared/formatters.js';
import { getAaveChains } from '../../../core/staking.config.js';

function formatCurrency(value) {
  return StakingService.formatCurrency(value);
}

function toNumber(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function formatFee(value) {
  if (value <= 0.005) return '<$0.01';
  return formatCurrency(value);
}

function getOpportunityUrl(row) {
  if (row.protocol === 'Aave V3') {
    return 'https://app.aave.com/';
  }
  if (row.protocol === 'Kamino') {
    return 'https://app.kamino.finance/lend';
  }
  if (row.protocol === 'Jupiter Lend') {
    return 'https://jup.ag/lend';
  }
  return null;
}

function buildYieldRows(apyData, defaultAmount) {
  const rows = [];

  for (const chain of getAaveChains()) {
    const chainApy = apyData.aave?.chains?.[chain.id];
    if (!chainApy?.tokens) continue;

    for (const token of ['USDC', 'USDT']) {
      const entry = chainApy.tokens[token];
      const apy = toNumber(entry?.apy);
      if (!entry || apy <= 0) continue;

      const profit = StakingService.calculateProfit({
        amount: defaultAmount,
        apy,
        months: 12,
        protocol: 'aave-v3',
      });

      rows.push({
        apy,
        token,
        protocol: 'Aave V3',
        chain: chain.displayName,
        icon: chain.icon,
        source: entry.source || 'llama.fi',
        yearlyYield: StakingService.calculateYield(defaultAmount, apy, 12),
        monthlyYield: StakingService.calculateYield(defaultAmount, apy, 1),
        fees: profit.totalFees,
      });
    }
  }

  if (apyData.jupiter?.tokens?.USDC) {
    const apy = toNumber(apyData.jupiter.tokens.USDC.apy);
    const profit = StakingService.calculateProfit({
      amount: defaultAmount,
      apy,
      months: 12,
      protocol: 'jupiter',
    });
    rows.push({
      apy,
      token: 'USDC',
      protocol: 'Jupiter Lend',
      chain: 'Solana',
      icon: '🟣',
      source: 'estimation',
      yearlyYield: StakingService.calculateYield(defaultAmount, apy, 12),
      monthlyYield: StakingService.calculateYield(defaultAmount, apy, 1),
      fees: profit.totalFees,
    });
  }

  if (apyData.jupiter?.tokens?.USDT) {
    const apy = toNumber(apyData.jupiter.tokens.USDT.apy);
    const profit = StakingService.calculateProfit({
      amount: defaultAmount,
      apy,
      months: 12,
      protocol: 'jupiter',
    });
    rows.push({
      apy,
      token: 'USDT',
      protocol: 'Jupiter Lend',
      chain: 'Solana',
      icon: '🟣',
      source: 'estimation',
      yearlyYield: StakingService.calculateYield(defaultAmount, apy, 12),
      monthlyYield: StakingService.calculateYield(defaultAmount, apy, 1),
      fees: profit.totalFees,
    });
  }

  if (apyData.kamino?.tokens?.USDC) {
    const apy = toNumber(apyData.kamino.tokens.USDC.apy);
    const profit = StakingService.calculateProfit({
      amount: defaultAmount,
      apy,
      months: 12,
      protocol: 'kamino',
    });
    rows.push({
      apy,
      token: 'USDC',
      protocol: 'Kamino',
      chain: 'Solana',
      icon: '🟣',
      source: 'live',
      yearlyYield: StakingService.calculateYield(defaultAmount, apy, 12),
      monthlyYield: StakingService.calculateYield(defaultAmount, apy, 1),
      fees: profit.totalFees,
    });
  }

  return rows.sort((a, b) => b.apy - a.apy);
}

function formatYieldRows(rows) {
  if (rows.length === 0) {
    return 'Aucun rendement disponible pour le moment.\n';
  }

  return rows
    .map((row, index) => {
      const rank = index + 1;
      const url = getOpportunityUrl(row);
      const link = url ? `\n   [Ouvrir le site officiel](${url})` : '';
      return (
        `${rank}. ${row.icon} *${row.apy.toFixed(2)}%* • ${row.protocol} ${row.token}\n` +
        `   ${row.chain} • 1 an: *+${formatCurrency(row.yearlyYield)}* • 1 mois: +${formatCurrency(row.monthlyYield)}\n` +
        `   Frais estimés: ~${formatFee(row.fees)} • source: ${row.source}` +
        link
      );
    })
    .join('\n\n');
}

async function handleStakeCommand(ctx, _storage, { edit = false } = {}) {
  const chatId = ctx.chat.id;

  if (edit) {
    try {
      const apyData = await Promise.race([
        StakingService.getAllApy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);

      const defaultAmount = 1000;
      let text = '📈 *Staking - Rendements*\n\n';
      text += '💡 *Exemple: depot de 1000$*\n\n';
      const rows = buildYieldRows(apyData, defaultAmount);
      text += '━━━━━━━━━━━━\n';
      text += '🏆 *Meilleurs rendements disponibles*\n';
      text += '━━━━━━━━━━━━\n';
      text += formatYieldRows(rows);
      text += '\n━━━━━━━━━━━━\n';
      text += '_Utilisez /calc <montant> <token> <protocole>_\n';
      text += '_pour calculer avec votre propre montant_\n';
      text += '_ou /yield pour voir vos positions_';

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...stakingHubKeyboard(),
      });
    } catch (error) {
      logger.logError(error, { context: 'handleStakeCommand', chatId });
      try {
        await ctx.editMessageText(
          '❌ Impossible de charger les rendements.\n\n' +
            '━━━━━━━━━━━━\n' +
            '🔷 Arbitrum - Aave V3: USDC ~1.65%, USDT ~2.13%\n' +
            '🟣 Solana - Kamino: USDC ~3.80%\n' +
            '🟣 Solana - Jupiter: USDC ~5.20%, USDT ~4.80%\n' +
            '━━━━━━━━━━━━\n' +
            '_Ces taux sont approximatifs_',
          { parse_mode: 'Markdown', ...mainMenuKeyboard() }
        );
      } catch (e) {}
    }
    return;
  }

  const loadingMsg = await ctx.reply('📈 Chargement des rendements...');

  try {
    const apyData = await Promise.race([
      StakingService.getAllApy(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);

    const defaultAmount = 1000;

    let text = '📈 *Staking - Rendements*\n\n';
    text += '💡 *Exemple: depot de 1000$*\n\n';

    const rows = buildYieldRows(apyData, defaultAmount);

    text += '━━━━━━━━━━━━\n';
    text += '🏆 *Meilleurs rendements disponibles*\n';
    text += '━━━━━━━━━━━━\n';
    text += formatYieldRows(rows);

    text += '\n━━━━━━━━━━━━\n';
    text += '_Utilisez /calc <montant> <token> <protocole>_\n';
    text += '_pour calculer avec votre propre montant_\n';
    text += '_ou /yield pour voir vos positions_';

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...stakingHubKeyboard(),
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
    const evmWallets = wallets.filter((w) => ['eth', 'arb', 'matic', 'op', 'base'].includes(w.chain));
    const solWallets = wallets.filter((w) => w.chain === 'sol');

    let text = '📊 *Mes Positions de Staking*\n\n';
    let totalStaked = 0;
    let totalMonthlyYield = 0;
    let hasPositions = false;

    if (evmWallets.length > 0) {
      text += '🔷 *Aave V3*\n';
      text += '━━━━━━━━━━━━\n';

      const apyData = await StakingService.getAaveApy();

      for (const wallet of evmWallets) {
        try {
          const positions = await Promise.race([
            StakingService.getUserAavePosition(wallet.address, wallet.chain),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);

          for (const pos of Object.values(positions)) {
            const apy = apyData.chains?.[pos.chain]?.tokens?.[pos.symbol]?.apy || '1.65';
            const monthlyYield = StakingService.calculateMonthlyYield(pos.amount, apy);

            text += `${pos.chainName || wallet.chain.toUpperCase()} ${pos.symbol}: *${formatAmount(pos.amount)} $*\n`;
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

    const ethOnlyWallets = wallets.filter((w) => w.chain === 'eth');
    if (ethOnlyWallets.length > 0) {
      text += '⚡ *ETH Staking*\n';
      text += '━━━━━━━━━━━━\n';

      for (const wallet of ethOnlyWallets) {
        try {
          const positions = await Promise.race([
            ethLstProvider.getPositions(wallet.address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);

          for (const pos of positions) {
            const monthlyYield = StakingService.calculateMonthlyYield(pos.amount, pos.apy);
            text += `${pos.name} ${pos.symbol}: *${formatAmount(pos.amount)}*\n`;
            text += `APY: ${StakingService.formatApy(pos.apy)}\n`;
            text += `Gains/mois: ~${formatAmount(monthlyYield)} ${pos.symbol}\n\n`;
            hasPositions = true;
          }
        } catch (e) {
          logger.warn('Failed to fetch ETH staking position', {
            walletAddress: wallet.address,
            error: e.message,
          });
        }
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

export { handleStakeCommand, handleYieldCommand, formatAmount, formatCurrency };
