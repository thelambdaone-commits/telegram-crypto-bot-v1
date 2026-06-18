/**
 * Payment gateway — application service (Phase 1).
 *
 * Wires the pure invoice domain (invoice.service.js) to the bot: resolves the
 * merchant's own receiving wallet (NON-CUSTODIAL — funds go straight to the
 * merchant), persists invoices, and watches for payment by balance delta (same
 * mechanism the DepositMonitor already uses). On settlement it notifies the
 * merchant and records a balanced ledger pair.
 *
 * v1 limitation: matching is by balance increase on the merchant's wallet, so we
 * allow only ONE open invoice per (merchant, chain, asset) at a time. Per-invoice
 * HD-derived addresses (BTCPay-style) would lift that — a later phase.
 */
import { createInvoice, applyPayment, expireIfDue, INVOICE_STATES } from './invoice.service.js';
import { settlementEntries } from './ledger.js';
import { CHAIN_REGISTRY } from '../../shared/chains.js';
import { formatEUR } from '../../shared/price.js';
import { logger } from '../../shared/logger.js';

const OPEN = [INVOICE_STATES.NEW, INVOICE_STATES.PROCESSING];

export class PaymentService {
  constructor(storage, walletService, bot, { intervalMs = 30_000 } = {}) {
    this.storage = storage;
    this.walletService = walletService;
    this.bot = bot;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.ledger = []; // in-memory reconciliation log (persisted in a later phase)
  }

  // The token symbol to read, or null when the asset IS the chain's native coin.
  _tokenSymbol(chain, symbol) {
    const native = CHAIN_REGISTRY[chain]?.native;
    return symbol && native && symbol.toUpperCase() === native.toUpperCase() ? null : symbol;
  }

  async _balance(merchantId, walletId, chain, symbol) {
    const b = await this.walletService.getBalance(merchantId, walletId, this._tokenSymbol(chain, symbol));
    return Number.parseFloat(b.balance) || 0;
  }

  /** Create + persist an invoice; returns it with the receiving address attached. */
  async createInvoice(merchantId, chain, symbol, { amountFiat, amountCrypto, memo = '', expirySec } = {}) {
    const wallets = await this.storage.getWallets(merchantId);
    const wallet = wallets.find((w) => w.chain === chain && !w.isCorrupted);
    if (!wallet?.address) throw new Error(`Aucun wallet ${chain.toUpperCase()} pour recevoir.`);

    const existing = (await this.storage.getInvoices(merchantId)).find(
      (i) => i.chain === chain && i.symbol === String(symbol).toUpperCase() && OPEN.includes(i.status)
    );
    if (existing) throw new Error(`Une facture ${symbol} sur ${chain.toUpperCase()} est déjà ouverte.`);

    const invoice = await createInvoice({ merchantId, chain, symbol, amountFiat, amountCrypto, memo, expirySec });
    invoice.walletId = wallet.id;
    invoice.address = wallet.address;
    invoice.baseline = await this._balance(merchantId, wallet.id, chain, symbol);
    await this.storage.addInvoice(merchantId, invoice);
    logger.info('[Payments] invoice created', { id: invoice.id, chain, symbol });
    return invoice;
  }

  /** Re-check one invoice against the chain; persist + notify on a state change. */
  async checkInvoice(invoice, now = Date.now()) {
    if (!OPEN.includes(invoice.status)) return invoice;

    let next = invoice;
    try {
      const current = await this._balance(invoice.merchantId, invoice.walletId, invoice.chain, invoice.symbol);
      const received = Math.max(0, current - (invoice.baseline || 0));
      next = applyPayment(invoice, received, { confirmed: true, now });
    } catch (e) {
      logger.debug('[Payments] balance check failed', { id: invoice.id, error: e.message });
      next = expireIfDue(invoice, now); // still expire on time even if RPC is down
    }

    if (next.status !== invoice.status || next.receivedCrypto !== invoice.receivedCrypto) {
      await this.storage.updateInvoice(invoice.merchantId, next);
      if (next.status === INVOICE_STATES.SETTLED) await this._onSettled(next);
      else if (next.status === INVOICE_STATES.EXPIRED) await this._notify(next, `⌛ Facture expirée (${next.symbol}).`);
    }
    return next;
  }

  async _onSettled(invoice) {
    this.ledger.push(...settlementEntries(invoice));
    const fiat = invoice.amountFiat != null ? ` (${formatEUR(invoice.amountFiat)})` : '';
    const over = invoice.overpaid ? ' ⚠️ trop-perçu' : '';
    await this._notify(
      invoice,
      `✅ <b>Paiement reçu</b>\n${invoice.receivedCrypto} ${invoice.symbol}${fiat}${over}\nFacture <code>${invoice.id}</code> réglée.`
    );
  }

  async _notify(invoice, text) {
    try {
      await this.bot.telegram.sendMessage(invoice.merchantId, text, { parse_mode: 'HTML' });
    } catch (e) {
      logger.debug('[Payments] notify failed', { id: invoice.id, error: e.message });
    }
  }

  /** One poll pass over every merchant's open invoices. */
  async pollOnce(now = Date.now()) {
    const users = await this.storage.getAllUsers();
    for (const user of users) {
      let invoices;
      try {
        invoices = await this.storage.getInvoices(user.chatId);
      } catch {
        continue;
      }
      for (const inv of invoices.filter((i) => OPEN.includes(i.status))) {
        await this.checkInvoice(inv, now);
      }
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.pollOnce().catch((e) => logger.warn('[Payments] poll error', { error: e.message })), this.intervalMs);
    logger.info('[Payments] watcher started', { intervalMs: this.intervalMs });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
