import { Markup } from 'telegraf';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { safeAnswerCbQuery, safeEditMessage, escapeHtml } from '../../../shared/utils/telegram.js';
import { generateAddressQR } from '../../../shared/qr.js';
import { CHAIN_REGISTRY, CHAIN_EMOJIS } from '../../../shared/chains.js';
import { formatEUR } from '../../../shared/price.js';
import { logger } from '../../../shared/logger.js';

const STATE = 'ENTER_INVOICE_AMOUNT';
const STATUS_EMOJI = { new: '⏳', processing: '🟡', settled: '✅', complete: '✅', expired: '⌛', invalid: '❌' };
const fmt = (n) => String(Number(Number(n).toPrecision(8)));

// Receiving-method picker: a ⚡ Lightning entry (when the node is up) above the
// merchant's on-chain wallets.
function methodKeyboard(wallets, lnEnabled) {
  const rows = [];
  if (lnEnabled) rows.push([Markup.button.callback('⚡ Lightning (BTC · instantané)', 'pinv_ln')]);
  for (const w of wallets) {
    rows.push([Markup.button.callback(`${CHAIN_EMOJIS[w.chain] || '●'} ${w.label}`, `pinv_w_${w.id}`)]);
  }
  rows.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Payment gateway — merchant UI (Phase 1). Create a crypto invoice on one of your
 * own wallets, get a QR + address; the PaymentService watches for payment and
 * notifies you. Non-custodial: funds land directly in your wallet.
 */
export function setupPaymentHandlers(bot, storage, walletService, sessions, payments) {
  // /invoice — choose which wallet receives.
  bot.command(['invoice', 'facture'], async (ctx) => {
    const wallets = await storage.getWallets(ctx.chat.id);
    if (!wallets.length) {
      return ctx.reply("👻 Aucun wallet pour recevoir. Crée-en un d'abord (➕ Nouveau).");
    }
    sessions.clearState(ctx.chat.id);
    await ctx.reply('💳 <b>Créer une facture</b>\n\nComment veux-tu être payé ?', {
      parse_mode: 'HTML',
      ...methodKeyboard(wallets, payments.lightningEnabled()),
    });
  });

  // "💳 Facture" button (from ☰ Plus) — same flow as /invoice, but edits in place.
  bot.action(CALLBACKS.INVOICE_START, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const wallets = await storage.getWallets(ctx.chat.id);
    if (!wallets.length) {
      return safeEditMessage(ctx, "👻 Aucun wallet pour recevoir. Crée-en un d'abord (➕ Nouveau).", {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }
    sessions.clearState(ctx.chat.id);
    await safeEditMessage(ctx, '💳 <b>Créer une facture</b>\n\nComment veux-tu être payé ?', {
      parse_mode: 'HTML',
      ...methodKeyboard(wallets, payments.lightningEnabled()),
    });
  });

  // ⚡ Lightning chosen → ask the amount.
  bot.action('pinv_ln', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!payments.lightningEnabled()) return;
    sessions.setData(ctx.chat.id, { invoiceMethod: 'lightning', invoiceSymbol: 'BTC' });
    sessions.setState(ctx.chat.id, STATE);
    await safeEditMessage(
      ctx,
      '⚡ <b>Facture Lightning (BTC)</b>\n\nQuel montant veux-tu recevoir, en <b>EUR</b> ? (ex : 25)',
      { parse_mode: 'HTML' }
    );
  });

  // Wallet chosen → ask the amount (in EUR).
  bot.action(/^pinv_w_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    const wallet = (await storage.getWallets(ctx.chat.id)).find((w) => w.id === walletId);
    if (!wallet) return;
    const symbol = CHAIN_REGISTRY[wallet.chain]?.native || wallet.chain.toUpperCase();
    sessions.setData(ctx.chat.id, { invoiceChain: wallet.chain, invoiceSymbol: symbol });
    sessions.setState(ctx.chat.id, STATE);
    await safeEditMessage(
      ctx,
      `💳 <b>Facture en ${symbol}</b> · ${CHAIN_REGISTRY[wallet.chain]?.name || wallet.chain}\n\n` +
        'Quel montant veux-tu recevoir, en <b>EUR</b> ? (ex : 25)',
      { parse_mode: 'HTML' }
    );
  });

  // Amount entered → create the invoice + show address/QR. Falls through for other states.
  bot.on('text', async (ctx, next) => {
    if (sessions.getState(ctx.chat.id) !== STATE) return next();
    const data = sessions.getData(ctx.chat.id);
    sessions.clearState(ctx.chat.id);
    const amount = Number.parseFloat(ctx.message.text.trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return ctx.reply('⚠️ Montant invalide.');

    try {
      const lightning = data.invoiceMethod === 'lightning';
      const inv = lightning
        ? await payments.createLightningInvoice(ctx.chat.id, { amountFiat: amount })
        : await payments.createInvoice(ctx.chat.id, data.invoiceChain, data.invoiceSymbol, { amountFiat: amount });
      const mins = Math.max(1, Math.round((inv.expiresAt - Date.now()) / 60000));

      let caption;
      let qr;
      if (lightning) {
        caption =
          '⚡ <b>Facture Lightning</b>\n━━━━━━━━━━━━━━━\n' +
          `Montant : <b>${formatEUR(inv.amountFiat)}</b> ≈ <b>${inv.amountSat} sats</b> (${fmt(inv.amountCrypto)} BTC)\n` +
          `Invoice (BOLT11) :\n<code>${escapeHtml(inv.bolt11)}</code>\n` +
          `⌛ Expire dans ${mins} min · <code>${escapeHtml(inv.id)}</code>\n\n` +
          "Scanne / envoie l'invoice au client. Règlement <b>instantané</b>. ⚡";
        qr = await generateAddressQR(inv.bolt11, 'btc', { logoSymbol: 'btc', label: 'Lightning' });
      } else {
        caption =
          '💳 <b>Facture créée</b>\n━━━━━━━━━━━━━━━\n' +
          `Montant : <b>${formatEUR(inv.amountFiat)}</b> ≈ <b>${fmt(inv.amountCrypto)} ${inv.symbol}</b>\n` +
          `Réseau : <b>${escapeHtml(CHAIN_REGISTRY[inv.chain]?.name || inv.chain)}</b>\n` +
          `Adresse :\n<code>${inv.address}</code>\n` +
          `⌛ Expire dans ${mins} min · <code>${escapeHtml(inv.id)}</code>\n\n` +
          "Envoie ce QR (ou l'adresse) au client. Tu seras notifié dès réception. 🔔";
        qr = await generateAddressQR(inv.address, inv.chain);
      }
      await ctx.replyWithPhoto({ source: qr }, { caption, parse_mode: 'HTML' });
    } catch (e) {
      logger.warn('[Payments] createInvoice failed', { error: e.message });
      await ctx.reply(`❌ ${escapeHtml(e.message)}`);
    }
  });

  // /invoices — my recent invoices + their status.
  bot.command(['invoices', 'factures'], async (ctx) => {
    const list = (await storage.getInvoices(ctx.chat.id)).slice(-10).reverse();
    if (!list.length) return ctx.reply('🧾 Aucune facture. <code>/invoice</code> pour en créer une.', { parse_mode: 'HTML' });
    const lines = list.map(
      (i) => `${STATUS_EMOJI[i.status] || '•'} ${fmt(i.amountCrypto)} ${i.symbol} · ${i.status} · <code>${escapeHtml(i.id.slice(4, 20))}</code>`
    );
    await ctx.reply('🧾 <b>Mes factures</b>\n\n' + lines.join('\n'), { parse_mode: 'HTML' });
  });
}
