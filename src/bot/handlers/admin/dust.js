import { isAdmin } from '../../middlewares/auth.middleware.js';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';
import { config } from '../../../core/config.js';
import { Markup } from 'telegraf';

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

async function getEthGasPrice() {
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.rpc?.eth || 'https://eth.llamarpc.com');
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 30;
    return gasPrice;
  } catch {
    return 30;
  }
}

async function handleAdminDust(ctx, storage, walletService) {
  const chatId = ctx.chat.id;

  if (!isAdmin(chatId)) {
    return ctx.reply('❌ Accès réservé aux admins.');
  }

  const loadingMsg = await ctx.reply('👑 Analyse globale du dust en cours...');

  try {
    const users = await storage.getAllUsers();
    const prices = await getPricesEUR();
    const chainAdapters = walletService.chains;
    const gasGwei = await getEthGasPrice();
    const gasUnits = 21000;
    const gasCostEth = (gasGwei * gasUnits) / 1_000_000_000;

    let summaryText = '👑 *Admin - Dust Global*\n\n';
    summaryText += '━━━━━━━━━━━━\n';
    summaryText += `📊 ${users.length} utilisateur(s) analyse(s)\n\n`;

    let globalStats = {
      totalEthDust: 0,
      totalBtcDust: 0,
      totalDustValue: 0,
      usersWithDust: 0,
      totalWallets: 0,
    };

    const userDustList = [];

    for (const user of users) {
      const wallets = await storage.getWallets(user.chatId);
      if (wallets.length === 0) continue;

      globalStats.totalWallets += wallets.length;

      let userEthDust = 0;
      let userBtcDust = 0;
      let userDustFound = false;

      const ethWallets = wallets.filter((w) => w.chain === 'eth');
      const btcWallets = wallets.filter((w) => w.chain === 'btc');

      for (const wallet of ethWallets) {
        try {
          const balance = await walletService.getBalance(user.chatId, wallet.id);
          const balanceEth = parseFloat(balance.balance) || 0;

          if (balanceEth > 0) {
            const valueUsd = balanceEth * prices.eth;
            const gasCostUsd = gasCostEth * prices.eth;
            const isDust = valueUsd < gasCostUsd;

            if (isDust) {
              userEthDust += valueUsd;
              userDustFound = true;
            }
          }
        } catch (e) {}
      }

      for (const wallet of btcWallets) {
        try {
          const utxos = await chainAdapters.btc.getUtxos(wallet.address);
          const feeEstimates = await chainAdapters.btc.estimateFees(
            wallet.address,
            wallet.address,
            0
          );
          const avgFeeRate = feeEstimates.average.satPerVbyte;

          const dustUtxos = utxos.filter(
            (utxo) => utxo.value <= avgFeeRate * 140
          );

          if (dustUtxos.length > 0) {
            const totalDustSats = dustUtxos.reduce((s, u) => s + u.value, 0);
            const totalDustBtc = totalDustSats / 100_000_000;
            userBtcDust += totalDustBtc * prices.btc;
            userDustFound = true;
          }
        } catch (e) {}
      }

      if (userDustFound) {
        globalStats.usersWithDust++;
        globalStats.totalEthDust += userEthDust;
        globalStats.totalBtcDust += userBtcDust;
        globalStats.totalDustValue += userEthDust + userBtcDust;

        userDustList.push({
          user,
          ethDust: userEthDust,
          btcDust: userBtcDust,
          total: userEthDust + userBtcDust,
          walletCount: wallets.length,
        });
      }
    }

    userDustList.sort((a, b) => b.total - a.total);

    summaryText += '━━━━━━━━━━━━\n';
    summaryText += '📈 *Statistiques globales*\n\n';
    summaryText += `👥 Users avec dust: ${globalStats.usersWithDust}\n`;
    summaryText += `👛 Total wallets: ${globalStats.totalWallets}\n`;
    summaryText += '━━━━━━━━━━━━\n';
    summaryText += `🔷 ETH dust: ${formatEUR(globalStats.totalEthDust)}\n`;
    summaryText += `🟠 BTC dust: ${formatEUR(globalStats.totalBtcDust)}\n`;
    summaryText += '━━━━━━━━━━━━\n';
    summaryText += `💰 *Total dust:* ${formatEUR(globalStats.totalDustValue)}\n`;
    summaryText += '\n';

    if (userDustList.length > 0) {
      summaryText += '━━━━━━━━━━━━\n';
      summaryText += '📋 *Top 10 utilisateurs*\n\n';

      const topUsers = userDustList.slice(0, 10);
      for (let i = 0; i < topUsers.length; i++) {
        const u = topUsers[i];
        const name = u.user.username
          ? escapeMarkdown(`@${u.user.username}`)
          : escapeMarkdown(u.user.firstName || 'Inconnu');
        summaryText += `${i + 1}. ${name}\n`;
        if (u.ethDust > 0) summaryText += `   🔷 ETH: ${formatEUR(u.ethDust)}\n`;
        if (u.btcDust > 0) summaryText += `   🟠 BTC: ${formatEUR(u.btcDust)}\n`;
        summaryText += `   💵 Total: ${formatEUR(u.total)}\n\n`;
      }

      if (userDustList.length > 10) {
        summaryText += `...et ${userDustList.length - 10} autres`;
      }
    } else {
      summaryText += '✅ *Aucun dust detecte.*';
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(summaryText, {
      parse_mode: 'Markdown',
      ...adminDustKeyboard(),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
  }
}

export function setupAdminDust(bot, storage, walletService) {
  bot.command('admin_dust', async (ctx) => {
    await handleAdminDust(ctx, storage, walletService);
  });

  bot.action('admin_dust', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await handleAdminDust(ctx, storage, walletService);
  });

  bot.action('admin_dust_refresh', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await handleAdminDust(ctx, storage, walletService);
  });
}

function adminDustKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Actualiser', 'admin_dust_refresh'),
      Markup.button.callback('🔙 Panel Admin', 'admin_panel'),
    ],
  ]);
}
