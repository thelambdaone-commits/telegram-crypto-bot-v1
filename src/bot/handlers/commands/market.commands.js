import { config } from '../../../core/config.js';
import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { generatePriceChart, parsePeriod } from '../../../shared/chart.js';

export function setupMarketCommands(bot) {
  // ⛽ /gas - Prix du gas / frais de transaction
  bot.command('gas', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const chain = args[0]?.toLowerCase();

    const loadingMsg = await ctx.reply('⛽ Récupération des frais de transaction...');

    try {
      const { ethers } = await import('ethers');

      const getEthFees = async () => {
        const ethProvider = new ethers.JsonRpcProvider(config.rpc?.eth || 'https://eth.llamarpc.com');
        const feeData = await ethProvider.getFeeData();
        const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 0;
        let level = gasPrice > 80 ? '🔴 Élevé' : gasPrice > 30 ? '🟡 Moyen' : '🟢 Bas';
        return { gasPrice, level };
      };

      const getBtcFees = async () => {
        const btcResponse = await fetch('https://mempool.space/api/v1/fees/recommended');
        const fees = await btcResponse.json();
        let level = fees.fastestFee > 100 ? '🔴 Élevé' : fees.fastestFee > 50 ? '🟡 Moyen' : '🟢 Bas';
        return { ...fees, level };
      };

      const getSolFees = async () => {
        const solResponse = await fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [] }),
        });
        const solData = await solResponse.json();
        let priorityFee = 5000;
        if (solData.result?.length > 0) {
          const fees = solData.result.map(f => f.prioritizationFee).filter(f => f > 0);
          priorityFee = fees.length > 0 ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 5000;
        }
        let level = priorityFee > 50000 ? '🔴 Élevé' : priorityFee > 10000 ? '🟡 Moyen' : '🟢 Bas';
        return { priorityFee, level };
      };

      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      if (chain === 'eth') {
        const eth = await getEthFees();
        return ctx.reply(`🔷 *Frais Ethereum* ${eth.level}\n\n💨 Gas Price : *${eth.gasPrice.toFixed(2)} Gwei*`, { parse_mode: 'Markdown' });
      }

      if (chain === 'btc') {
        const btc = await getBtcFees();
        return ctx.reply(`🟠 *Frais Bitcoin* ${btc.level}\n\n⚡ Rapide : *${btc.fastestFee} sat/vB*\n🕐 Moyen : *${btc.halfHourFee} sat/vB*`, { parse_mode: 'Markdown' });
      }

      if (chain === 'sol') {
        const sol = await getSolFees();
        return ctx.reply(`🟣 *Frais Solana* ${sol.level}\n\n💎 Priority Fee : *${sol.priorityFee.toLocaleString()} µ◎*`, { parse_mode: 'Markdown' });
      }

      // Show all
      const [eth, btc, sol] = await Promise.all([
        getEthFees().catch(() => ({ gasPrice: 0, level: '❓' })),
        getBtcFees().catch(() => ({ fastestFee: 0, level: '❓' })),
        getSolFees().catch(() => ({ priorityFee: 0, level: '❓' }))
      ]);

      await ctx.reply(
        '⛽ *Frais de Transaction*\n\n' +
        `🔷 *Ethereum* ${eth.level} : *${eth.gasPrice.toFixed(1)} Gwei*\n` +
        `🟠 *Bitcoin* ${btc.level} : *${btc.fastestFee} sat/vB*\n` +
        `🟣 *Solana* ${sol.level} : *${sol.priorityFee.toLocaleString()} µ◎*\n\n` +
        '_Utilise_ `/gas eth|btc|sol` _pour plus de détails_',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer les frais : ${error.message}`);
    }
  });

  // 💹 /price - Prix des cryptos
  bot.command('price', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    try {
      const prices = await getPricesEUR();
      if (args.length === 0) {
        return ctx.reply(
          '💹 *Prix des Cryptos (EUR)*\n\n' +
          `🔷 *ETH* : ${formatEUR(prices.eth)}\n` +
          `🟠 *BTC* : ${formatEUR(prices.btc)}\n` +
          `🟣 *SOL* : ${formatEUR(prices.sol)}\n` +
          `💵 *USDC* : ${formatEUR(prices.usdc)}\n` +
          `💵 *USDT* : ${formatEUR(prices.usdt)}`,
          { parse_mode: 'Markdown' }
        );
      }

      const crypto = args[0].toLowerCase();
      if (prices[crypto]) {
        return ctx.reply(`💹 *${crypto.toUpperCase()}* : *${formatEUR(prices[crypto])}*`, { parse_mode: 'Markdown' });
      }
      ctx.reply('❌ Crypto non supportée.');
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });

  // 📊 /graph - Graphique des prix d'une crypto
  bot.command('graph', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) return ctx.reply('📊 Utilisation : `/graph <crypto> [période]`', { parse_mode: 'Markdown' });

    let crypto = args[0].toLowerCase();
    const days = parsePeriod(args[1] || '30');

    const loadingMsg = await ctx.reply(`📊 Génération du graphique...`);
    try {
      const { buffer, stats } = await generatePriceChart(crypto, days);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      const changeEmoji = stats.isPositive ? '📈' : '📉';
      const caption = 
        `${changeEmoji} *${crypto.toUpperCase()}* — ${days} jours\n\n` +
        `💰 Prix : *€${stats.currentPrice.toLocaleString('fr-FR')}*\n` +
        `📊 Var. : *${stats.isPositive ? '+' : ''}${stats.priceChange.toFixed(2)}%*`;

      await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: 'Markdown' });
    } catch (error) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });
}
