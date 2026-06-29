import { Markup } from 'telegraf';
import {
  getPricesEUR,
  formatEUR,
  formatCryptoPricesEUR,
  PRICE_GROUPS,
  convertToEUR,
} from '../../../shared/price.js';
import { CHAIN_REGISTRY } from '../../../shared/chains.js';
import { generatePriceChart, parseGraphCommand } from '../../../shared/chart.js';
import { COIN_IDS } from '../../../shared/coingecko.js';
import { getEthFees, getBtcFees, getSolFees, SOL_TYPICAL_CU, SOL_BASE_LAMPORTS } from '../../../shared/fees.js';
import { escapeHtml } from '../../../shared/utils/telegram.js';
import { CALLBACKS } from '../../constants/callbacks.js';

// Graph picker grid — one button per graphable coin, deduped by CoinGecko id so
// ETH / ETH-on-Base / ETH-on-Arbitrum collapse to a single ETH button. Built from
// PRICE_GROUPS, so it always matches the price list (no drift).
export function graphGridKeyboard() {
  const seen = new Set();
  const btns = [];
  for (const [, coins] of PRICE_GROUPS) {
    for (const [key, emoji, label] of coins) {
      const id = COIN_IDS[key];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const ticker = label.match(/\(([^)]+)\)/)?.[1] || key.toUpperCase();
      btns.push(Markup.button.callback(`${emoji} ${ticker}`, `graph_${key}`));
    }
  }
  const rows = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  rows.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(rows);
}

// Render a price chart for `symbol` (chain key or token) over `days`. Shared by
// /graph, the picker grid, and the address-analysis graph button.
async function sendChart(ctx, symbol, days = 365) {
  const loading = await ctx.reply('📊 Génération du graphique...');
  const drop = () => ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
  try {
    const { buffer, stats } = await generatePriceChart(symbol, days);
    await drop();
    const changeEmoji = stats.isPositive ? '📈' : '📉';
    const caption =
      `${changeEmoji} <b>${escapeHtml(symbol.toUpperCase())}</b> — ${stats.periodLabel}\n\n` +
      `💰 Prix : <b>€${stats.currentPrice.toLocaleString('fr-FR')}</b>\n` +
      `📊 Var. : <b>${stats.isPositive ? '+' : ''}${stats.priceChange.toFixed(2)}%</b>\n` +
      `🕒 Mis à jour le <b>${stats.generatedAtLabel}</b>`;
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('📈 Autre crypto', 'graph_pick')],
      [Markup.button.callback('🎮 Menu', CALLBACKS.BACK_TO_MENU)],
    ]);
    await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: 'HTML', ...kb });
  } catch (error) {
    await drop();
    await ctx.reply(`❌ Erreur : ${escapeHtml(error.message)}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📈 Autre crypto', 'graph_pick')],
        [Markup.button.callback('🎮 Menu', CALLBACKS.BACK_TO_MENU)],
      ]),
    });
  }
}

// Rough vsize/gas footprints of a *typical* transfer, used to turn a per-unit
// fee rate into a concrete "what a transfer costs" estimate (presentation only).
const BTC_TYPICAL_VBYTES = 140; // native-segwit 1-in / 2-out
const ETH_GAS = { transfer: 21000, swap: 150000, defi: 300000 };

function nowLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Native fee (in the chain's own coin) for one fee level, resolved uniformly
// across every provider's heterogeneous estimateFees() shape. Order matters:
// `estimatedFee` (EVM/BTC/BCH/TON, already native) is checked before the
// smallest-unit fields so a sats-valued `fee` (UTXO chains) is never mistaken
// for a native amount.
export function feeNative(lvl) {
  if (!lvl) return null;
  if (lvl.estimatedFee != null) return Number(lvl.estimatedFee); // EVM, BTC, BCH, TON
  if (lvl.feeSOL != null) return Number(lvl.feeSOL); // Solana
  if (lvl.feeTON != null) return Number(lvl.feeTON); // TON (fallback)
  if (lvl.feeSats != null) return Number(lvl.feeSats) / 1e8; // LTC, Zcash
  if (lvl.feeAtomic != null) return Number(lvl.feeAtomic) / 1e12; // Monero
  if (lvl.fee != null) return Number(lvl.fee); // Tron (native TRX)
  return null;
}

function fmtFee(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 12 });
}

// Generic per-chain fee card for any supported network that doesn't have a
// bespoke view (eth/btc/sol keep their richer ones). Derived from the registry
// + the provider's estimateFees, so adding a chain needs no change here.
async function genericFeeCard(ctx, walletService, chain) {
  const meta = CHAIN_REGISTRY[chain];
  const provider = walletService?.chains?.[chain];
  if (!meta || !provider) {
    return ctx.reply(
      `❌ Réseau inconnu pour <code>/gas</code> : <code>${escapeHtml(chain)}</code>\n\n` +
        `Réseaux : <code>${Object.keys(CHAIN_REGISTRY).join(', ')}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  let fees;
  try {
    fees = await provider.estimateFees('', '', 0.001);
  } catch {
    return ctx.reply(`⚠️ Frais ${escapeHtml(meta.native)} momentanément indisponibles. Réessaie.`, {
      parse_mode: 'HTML',
    });
  }

  const unit = await convertToEUR(chain, 1).catch(() => null);
  const price = unit?.priceEUR || null;
  const eurStr = (f) => (price && f != null ? ` ≈ ${formatEUR(f * price)}` : '');

  const rows = [
    ['🐢 Lent', 'slow'],
    ['⚙️ Normal', 'average'],
    ['⚡ Rapide', 'fast'],
  ].map(([label, key]) => [label, feeNative(fees[key])]);

  // Many chains (Tron, flat-fee fallbacks) price every tier the same → collapse.
  const allSame = rows.every(([, v]) => v === rows[0][1]);
  const body = allSame
    ? `💸 Frais d’un transfert : <b>${fmtFee(rows[0][1])} ${escapeHtml(meta.native)}</b>${eurStr(rows[0][1])}`
    : rows
        .map(([label, f]) => `${label} : <b>${fmtFee(f)} ${escapeHtml(meta.native)}</b>${eurStr(f)}`)
        .join('\n');

  const note = fees.feeNote ? `\n\nℹ️ <i>${escapeHtml(fees.feeNote)}</i>` : '';

  return ctx.reply(
    `${meta.emoji} <b>Frais ${escapeHtml(meta.name)}</b>\n\n${body}${note}\n\n🕒 Mis à jour à ${nowLabel()}`,
    { parse_mode: 'HTML' }
  );
}

export function setupMarketCommands(bot, walletService) {
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

      // Any other supported chain → generic registry-derived fee card.
      if (chain) {
        return await genericFeeCard(ctx, walletService, chain);
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
        '<i>Détail par réseau :</i> <code>/gas eth</code> · <code>/gas btc</code> · <code>/gas sol</code>\n' +
        '<i>…ou n’importe quelle chaîne :</i> <code>/gas xmr</code> · <code>/gas trx</code> · <code>/gas ltc</code> · <code>/gas ton</code> …';

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
        // Full list (same as the 📊 Cours button) + a 📈 graph entry point.
        return ctx.reply(formatCryptoPricesEUR(prices), {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📈 Graphique', 'graph_pick')],
            [Markup.button.callback('🎮 Menu', CALLBACKS.BACK_TO_MENU)],
          ]),
        });
      }

      const crypto = args[0].toLowerCase();
      if (prices[crypto]) {
        return ctx.reply(
          `💹 <b>${escapeHtml(crypto.toUpperCase())}</b> : <b>${formatEUR(prices[crypto])}</b>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback(`📈 Graphique ${escapeHtml(crypto.toUpperCase())}`, `graph_${crypto}`)]]),
          }
        );
      }
      ctx.reply('❌ Crypto non supportée.');
    } catch (error) {
      ctx.reply(`❌ Erreur : ${escapeHtml(error.message)}`, { parse_mode: 'HTML' });
    }
  });

  // 📈 /graph <token> [période] — chart by command.
  bot.command('graph', async (ctx) => {
    const command = parseGraphCommand(ctx.message.text);
    if (!command.ok) {
      return ctx.reply(`📊 ${escapeHtml(command.error)}`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('📈 Choisir une crypto', 'graph_pick')]]),
      });
    }
    await sendChart(ctx, command.symbol, command.days);
  });

  // 📈 Graph picker grid (from the 📈 button on /price, or after a chart). Edits
  // the current message in place (delete+reply fallback when it's a photo/chart)
  // so opening the grid never stacks a new message on the price list.
  bot.action('graph_pick', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const opts = { parse_mode: 'HTML', ...graphGridKeyboard() };
    const text = '📈 <b>Graphique des prix</b>\n\nChoisis une crypto :';
    try {
      await ctx.editMessageText(text, opts);
    } catch {
      try {
        await ctx.deleteMessage();
      } catch {
        /* already gone */
      }
      await ctx.reply(text, opts);
    }
  });

  // 📈 A coin was picked (grid tap or analysis button) → replace the current
  // message with its chart (a photo can't be edited from text, so delete first).
  bot.action(/^graph_(.+)$/, async (ctx) => {
    if (ctx.match[1] === 'pick') return; // 'graph_pick' is handled by the exact action above
    await ctx.answerCbQuery().catch(() => {});
    try {
      await ctx.deleteMessage();
    } catch {
      /* already gone */
    }
    await sendChart(ctx, ctx.match[1], 365);
  });
}
