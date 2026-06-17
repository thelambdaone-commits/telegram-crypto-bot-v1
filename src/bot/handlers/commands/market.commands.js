import { getPricesEUR, formatEUR } from '../../../shared/price.js';
import { generatePriceChart, parseGraphCommand } from '../../../shared/chart.js';
import { getEthFees, getBtcFees, getSolFees, SOL_TYPICAL_CU, SOL_BASE_LAMPORTS } from '../../../shared/fees.js';
import { escapeHtml } from '../../../shared/utils/telegram.js';

// Rough vsize/gas footprints of a *typical* transfer, used to turn a per-unit
// fee rate into a concrete "what a transfer costs" estimate (presentation only).
const BTC_TYPICAL_VBYTES = 140; // native-segwit 1-in / 2-out
const ETH_GAS = { transfer: 21000, swap: 150000, defi: 300000 };

function nowLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function setupMarketCommands(bot) {
  // ⛽ /gas - Prix du gas / frais de transaction (multi-chaînes)
  bot.command('gas', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const chain = args[0]?.toLowerCase();

    const loadingMsg = await ctx.reply('⛽ Récupération des frais de transaction...');

    // EUR price table is best-effort: fees are still shown without it.
    const prices = await getPricesEUR().catch(() => null);
    // Append " ≈ €x.xx" only when we have a price for that asset.
    const eur = (key, amount) =>
      prices && prices[key] ? ` ≈ ${formatEUR(amount * prices[key])}` : '';

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      if (chain === 'eth') {
        const eth = await getEthFees();
        const t = eth.cost(ETH_GAS.transfer);
        const s = eth.cost(ETH_GAS.swap);
        const d = eth.cost(ETH_GAS.defi);
        return ctx.reply(
          `Ξ <b>Frais Ethereum</b> ${eth.level}\n\n` +
            `💨 Gas Price : <b>${eth.gasPrice.toFixed(2)} Gwei</b>\n` +
            `🎯 Base Fee : <b>${eth.baseFee.toFixed(2)} Gwei</b>\n` +
            `🏷 Pourboire (priority) : <b>${eth.priorityFee.toFixed(2)} Gwei</b>\n` +
            `📈 Max Fee : <b>${eth.maxFee.toFixed(2)} Gwei</b>\n\n` +
            '📤 <b>Coûts estimés :</b>\n' +
            `   • Transfert ETH (21k) : ~${t.toFixed(7)} ETH${eur('eth', t)}\n` +
            `   • Swap (~150k) : ~${s.toFixed(6)} ETH${eur('eth', s)}\n` +
            `   • DeFi complexe (~300k) : ~${d.toFixed(6)} ETH${eur('eth', d)}\n\n` +
            `🕒 Mis à jour à ${nowLabel()}`,
          { parse_mode: 'HTML' }
        );
      }

      if (chain === 'btc') {
        const btc = await getBtcFees();
        const fast = btc.fastestFee * BTC_TYPICAL_VBYTES;
        const eco = btc.economyFee * BTC_TYPICAL_VBYTES;
        return ctx.reply(
          `₿ <b>Frais Bitcoin</b> ${btc.level}\n\n` +
            `⚡ Rapide (~10 min) : <b>${btc.fastestFee} sat/vB</b>\n` +
            `🕐 ~30 min : <b>${btc.halfHourFee} sat/vB</b>\n` +
            `🕑 ~1 h : <b>${btc.hourFee} sat/vB</b>\n` +
            `🐢 Économique : <b>${btc.economyFee} sat/vB</b>\n` +
            `🧊 Minimum : <b>${btc.minimumFee} sat/vB</b>\n\n` +
            `📤 <b>Transfert typique (~${BTC_TYPICAL_VBYTES} vB) :</b>\n` +
            `   • Rapide : ~${fast.toLocaleString('fr-FR')} sat${eur('btc', fast / 1e8)}\n` +
            `   • Économique : ~${eco.toLocaleString('fr-FR')} sat${eur('btc', eco / 1e8)}\n\n` +
            `🕒 Mis à jour à ${nowLabel()}`,
          { parse_mode: 'HTML' }
        );
      }

      if (chain === 'sol') {
        const sol = await getSolFees();
        return ctx.reply(
          `◎ <b>Frais Solana</b> ${sol.level}\n\n` +
            `🧱 Frais de base : <b>${SOL_BASE_LAMPORTS.toLocaleString('fr-FR')} lamports</b> (0.000005 ◎ / signature)\n` +
            `💎 Priority Fee (moy.) : <b>${sol.priorityFee.toLocaleString('fr-FR')} µ◎/CU</b>\n\n` +
            `📤 <b>Transfert estimé (~${SOL_TYPICAL_CU.toLocaleString('fr-FR')} CU) :</b>\n` +
            `   • Base + priority : ~${sol.totalSol.toFixed(7)} SOL${eur('sol', sol.totalSol)}\n\n` +
            'ℹ️ 1 ◎ = 1 000 000 000 lamports · µ◎ = micro-lamport/CU\n' +
            `🕒 Mis à jour à ${nowLabel()}`,
          { parse_mode: 'HTML' }
        );
      }

      // Summary across all chains.
      const [eth, btc, sol] = await Promise.all([
        getEthFees().catch(() => null),
        getBtcFees().catch(() => null),
        getSolFees().catch(() => null),
      ]);

      let text = '⛽ <b>Frais de Transaction</b>\n\n';

      if (eth) {
        const t = eth.cost(ETH_GAS.transfer);
        text +=
          `Ξ <b>Ethereum</b> ${eth.level}\n` +
          `   💨 Gas : <b>${eth.gasPrice.toFixed(2)} Gwei</b>\n` +
          `   📤 Transfert : ~${t.toFixed(7)} ETH${eur('eth', t)}\n\n`;
      } else {
        text += 'Ξ <b>Ethereum</b> ❓ indisponible\n\n';
      }

      if (btc) {
        const fast = btc.fastestFee * BTC_TYPICAL_VBYTES;
        text +=
          `₿ <b>Bitcoin</b> ${btc.level}\n` +
          `   ⚡ Rapide : <b>${btc.fastestFee} sat/vB</b> · 🐢 Éco : <b>${btc.economyFee}</b>\n` +
          `   📤 Transfert : ~${fast.toLocaleString('fr-FR')} sat${eur('btc', fast / 1e8)}\n\n`;
      } else {
        text += '₿ <b>Bitcoin</b> ❓ indisponible\n\n';
      }

      if (sol) {
        text +=
          `◎ <b>Solana</b> ${sol.level}\n` +
          `   💎 Priority : <b>${sol.priorityFee.toLocaleString('fr-FR')} µ◎/CU</b>\n` +
          `   📤 Transfert : ~${sol.totalSol.toFixed(7)} SOL${eur('sol', sol.totalSol)}\n\n`;
      } else {
        text += '◎ <b>Solana</b> ❓ indisponible\n\n';
      }

      text +=
        `🕒 Mis à jour à ${nowLabel()}\n` +
        '<i>Détails :</i> <code>/gas eth</code> · <code>/gas btc</code> · <code>/gas sol</code>';

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch {
        /* message may already be gone */
      }
      ctx.reply(`❌ Impossible de récupérer les frais : ${escapeHtml(error.message)}`, {
        parse_mode: 'HTML',
      });
    }
  });

  // 💹 /price - Prix des cryptos
  bot.command('price', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    try {
      const prices = await getPricesEUR();
      if (args.length === 0) {
        return ctx.reply(
          '💹 <b>Prix des Cryptos (EUR)</b>\n\n' +
            `Ξ <b>ETH</b> : ${formatEUR(prices.eth)}\n` +
            `₿ <b>BTC</b> : ${formatEUR(prices.btc)}\n` +
            `◎ <b>SOL</b> : ${formatEUR(prices.sol)}\n` +
            `💵 <b>USDC</b> : ${formatEUR(prices.usdc)}\n` +
            `💵 <b>USDT</b> : ${formatEUR(prices.usdt)}`,
          { parse_mode: 'HTML' }
        );
      }

      const crypto = args[0].toLowerCase();
      if (prices[crypto]) {
        return ctx.reply(
          `💹 <b>${escapeHtml(crypto.toUpperCase())}</b> : <b>${formatEUR(prices[crypto])}</b>`,
          {
            parse_mode: 'HTML',
          }
        );
      }
      ctx.reply('❌ Crypto non supportée.');
    } catch (error) {
      ctx.reply(`❌ Erreur : ${escapeHtml(error.message)}`, { parse_mode: 'HTML' });
    }
  });

  // 📊 /graph - Graphique des prix d'une crypto
  bot.command('graph', async (ctx) => {
    const command = parseGraphCommand(ctx.message.text);
    if (!command.ok) {
      return ctx.reply(`📊 ${escapeHtml(command.error)}`, { parse_mode: 'HTML' });
    }

    const loadingMsg = await ctx.reply('📊 Génération du graphique...');
    try {
      const { buffer, stats } = await generatePriceChart(command.symbol, command.days);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      const changeEmoji = stats.isPositive ? '📈' : '📉';
      const caption =
        `${changeEmoji} <b>${escapeHtml(command.symbol.toUpperCase())}</b> — ${stats.periodLabel}\n\n` +
        `💰 Prix : <b>€${stats.currentPrice.toLocaleString('fr-FR')}</b>\n` +
        `📊 Var. : <b>${stats.isPositive ? '+' : ''}${stats.priceChange.toFixed(2)}%</b>\n` +
        `🕒 Mis à jour le <b>${stats.generatedAtLabel}</b>`;

      await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: 'HTML' });
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch {
        /* message may already be gone */
      }
      ctx.reply(`❌ Erreur : ${escapeHtml(error.message)}`, { parse_mode: 'HTML' });
    }
  });
}
