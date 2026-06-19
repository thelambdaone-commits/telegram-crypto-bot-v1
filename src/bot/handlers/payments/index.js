import { Markup } from 'telegraf';
import { mainMenuKeyboard } from '../../keyboards/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { adminGuard } from '../../middlewares/auth.middleware.js';
import { safeAnswerCbQuery, safeEditMessage, escapeHtml } from '../../../shared/utils/telegram.js';
import { generateAddressQR } from '../../../shared/qr.js';
import { CHAIN_REGISTRY, CHAIN_EMOJIS } from '../../../shared/chains.js';
import { getAllTokensForChain, getNativeSymbol } from '../../../core/tokens.config.js';
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

// /treasury actions: manual sweep, and (unless a cold address is forced by env)
// a button to choose which BTC wallet receives swept Lightning funds.
function treasuryKeyboard(coldForced) {
  const rows = [[Markup.button.callback('🧹 Balayer maintenant', 'treasury_sweep')]];
  if (!coldForced) rows.push([Markup.button.callback('💰 Changer le wallet de réception', 'treasury_pick')]);
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
  bot.action(CALLBACKS.INVOICE_LN, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!payments.lightningEnabled()) {
      return safeEditMessage(
        ctx,
        "⚡ <b>Lightning indisponible</b>\n\nAucun nœud n'est branché. Configure <code>LN_BACKEND_URL</code> + <code>LN_PASSWORD</code> (phoenixd) pour l'activer.\n\nEn attendant, utilise 💳 <b>Facture</b> (on-chain, 15 chaînes + stablecoins).",
        { parse_mode: 'HTML', ...mainMenuKeyboard() }
      );
    }
    sessions.setData(ctx.chat.id, { invoiceMethod: 'lightning', invoiceSymbol: 'BTC' });
    sessions.setState(ctx.chat.id, STATE);
    await safeEditMessage(
      ctx,
      '⚡ <b>Facture Lightning (BTC)</b>\n\nQuel montant veux-tu recevoir, en <b>EUR</b> ? (ex : 25)',
      { parse_mode: 'HTML' }
    );
  });

  // Ask the EUR amount for a chosen (chain, asset).
  const askAmount = (ctx, chain, symbol) => {
    sessions.setData(ctx.chat.id, { invoiceChain: chain, invoiceSymbol: symbol });
    sessions.setState(ctx.chat.id, STATE);
    return safeEditMessage(
      ctx,
      `💳 <b>Facture en ${symbol}</b> · ${CHAIN_REGISTRY[chain]?.name || chain}\n\n` +
        'Quel montant veux-tu recevoir, en <b>EUR</b> ? (ex : 25)',
      { parse_mode: 'HTML' }
    );
  };

  // Wallet chosen → pick the asset (native + tokens) when the chain has tokens,
  // else go straight to the amount.
  bot.action(/^pinv_w_(.+)$/, async (ctx) => {
    const walletId = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    const wallet = (await storage.getWallets(ctx.chat.id)).find((w) => w.id === walletId);
    if (!wallet) return;
    const native = getNativeSymbol(wallet.chain);
    const tokens = Object.keys(getAllTokensForChain(wallet.chain) || {});
    sessions.setData(ctx.chat.id, { invoiceChain: wallet.chain });
    if (!tokens.length) return askAmount(ctx, wallet.chain, native);

    const btns = [native, ...tokens].map((s) => Markup.button.callback(s, `pinv_a_${s}`));
    const rows = [];
    for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
    rows.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
    await safeEditMessage(
      ctx,
      `💳 <b>Facture · ${CHAIN_REGISTRY[wallet.chain]?.name || wallet.chain}</b>\n\nQuel actif veux-tu recevoir ?`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
    );
  });

  // Asset chosen → ask the amount. The chain is already in session.
  bot.action(/^pinv_a_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chain = sessions.getData(ctx.chat.id)?.invoiceChain;
    if (!chain) return;
    await askAmount(ctx, chain, ctx.match[1]);
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
        const dest = await payments.sweepDestination();
        const destLine = dest
          ? `💰 Encaissé sur : <b>${escapeHtml(dest.label || dest.address)}</b> <code>${escapeHtml(dest.address.slice(0, 8))}…</code>\n`
          : '';
        caption =
          '⚡ <b>Facture Lightning</b>\n━━━━━━━━━━━━━━━\n' +
          `Montant : <b>${formatEUR(inv.amountFiat)}</b> ≈ <b>${inv.amountSat} sats</b> (${fmt(inv.amountCrypto)} BTC)\n` +
          `Invoice (BOLT11) :\n<code>${escapeHtml(inv.bolt11)}</code>\n` +
          `⌛ Expire dans ${mins} min · <code>${escapeHtml(inv.id)}</code>\n` +
          destLine +
          "\nScanne / envoie l'invoice au client. Règlement <b>instantané</b>. ⚡";
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

  // /invoices — my recent invoices + their status (+ Lightning balance if any).
  bot.command(['invoices', 'factures'], async (ctx) => {
    const list = (await storage.getInvoices(ctx.chat.id)).slice(-10).reverse();
    const lnBal = await storage.getLnBalance(ctx.chat.id).catch(() => 0);
    const head = lnBal > 0 ? `⚡ Solde Lightning : <b>${lnBal} sats</b>\n\n` : '';
    if (!list.length) {
      return ctx.reply(head + '🧾 Aucune facture. <code>/invoice</code> pour en créer une.', { parse_mode: 'HTML' });
    }
    const lines = list.map(
      (i) => `${STATUS_EMOJI[i.status] || '•'} ${fmt(i.amountCrypto)} ${i.symbol} · ${i.status} · <code>${escapeHtml(i.id.slice(4, 20))}</code>`
    );
    await ctx.reply(head + '🧾 <b>Mes factures</b>\n\n' + lines.join('\n'), { parse_mode: 'HTML' });
  });

  // /treasury (admin) — node balance, recent payouts, manual sweep.
  bot.command(['treasury', 'tresorerie'], async (ctx) => {
    if (!adminGuard(ctx)) return;
    let st;
    try {
      st = await payments.treasuryStatus();
    } catch (e) {
      return ctx.reply(`❌ Nœud injoignable : ${escapeHtml(e.message)}`);
    }
    if (!st.enabled) return ctx.reply('⚡ Lightning non configuré.');
    const pe = { withdrawn: '✅', failed: '❌', pending: '⏳' };
    const lines = st.payouts.map((p) => `${pe[p.status] || '•'} ${p.amountSat} sats · ${p.status}${p.txid ? ` · <code>${escapeHtml(p.txid.slice(0, 14))}</code>` : ''}`);
    await ctx.reply(
      '🏦 <b>Trésorerie Lightning</b>\n' +
        `Solde nœud : <b>${st.balanceSat} sats</b>\n` +
        `Seuil de sweep : ${st.thresholdSat} sats\n` +
        `Destination : ${st.addressLabel ? `💰 <b>${escapeHtml(st.addressLabel)}</b>\n<code>${escapeHtml(st.address)}</code>` : `<code>${escapeHtml(st.address || '(non configurée)')}</code>`}\n\n` +
        (lines.length ? '<b>Derniers retraits</b>\n' + lines.join('\n') : 'Aucun retrait.'),
      { parse_mode: 'HTML', ...treasuryKeyboard(st.coldForced) }
    );
  });

  // Picker: choose WHICH BTC wallet receives swept Lightning funds.
  bot.action('treasury_pick', async (ctx) => {
    if (!adminGuard(ctx)) return safeAnswerCbQuery(ctx);
    await safeAnswerCbQuery(ctx);
    const { coldForced, wallets } = await payments.sweepWalletOptions();
    if (coldForced) return ctx.reply('🔒 Destination forcée par <code>LN_SWEEP_BTC_ADDRESS</code>.', { parse_mode: 'HTML' });
    if (!wallets.length) return ctx.reply('Aucun wallet BTC. Crée-en un avec /gen btc.');
    const rows = wallets.map((w) => [
      Markup.button.callback(`${w.active ? '✅ ' : ''}💰 ${w.label}`, `treasury_w_${w.id}`),
    ]);
    await ctx.reply(
      '💰 <b>Wallet de réception Lightning</b>\nOù veux-tu que les sats balayés depuis le nœud soient envoyés ?',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
    );
  });

  bot.action(/^treasury_w_(.+)$/, async (ctx) => {
    if (!adminGuard(ctx)) return safeAnswerCbQuery(ctx);
    await safeAnswerCbQuery(ctx);
    try {
      const w = await payments.setSweepWallet(ctx.match[1]);
      await safeEditMessage(
        ctx,
        `✅ Destination du sweep : 💰 <b>${escapeHtml(w.label)}</b>\n<code>${escapeHtml(w.address)}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      await ctx.reply(`❌ ${escapeHtml(e.message)}`);
    }
  });

  bot.action('treasury_sweep', async (ctx) => {
    if (!adminGuard(ctx)) return safeAnswerCbQuery(ctx);
    await safeAnswerCbQuery(ctx);
    const r = await payments.sweepLightningBalance();
    await ctx.reply(
      r.swept
        ? `✅ Balayé ${r.payout.amountSat} sats → trésorerie (txid <code>${escapeHtml(r.payout.txid)}</code>)`
        : `ℹ️ Rien à balayer (${r.reason}${r.balanceSat != null ? ` : ${r.balanceSat} sats` : ''})`,
      { parse_mode: 'HTML' }
    );
  });
}
