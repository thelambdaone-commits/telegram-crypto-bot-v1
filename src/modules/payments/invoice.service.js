/**
 * Payment gateway — invoice domain (Phase 0).
 *
 * Pure, framework-free domain logic: the invoice STATE MACHINE, fiat→crypto
 * rate-lock at creation, and under/over-payment matching. No I/O, no funds, no
 * Telegram — persistence, address generation, the DepositMonitor watcher, and
 * the merchant UI are wired in later phases. Deps (price source, clock) are
 * injected so this is deterministic and unit-testable.
 *
 * Design (BTCPay-inspired, see CLAUDE.md payments plan):
 *  - An INVOICE is the merchant's intent (amount + currency + expiry).
 *  - One or more PAYMENTS are the funds actually received (separate concern).
 *  - Lightning settles instantly (new → settled); on-chain goes new → processing
 *    (seen) → settled (confirmed). Under-payment stays open; over-payment settles
 *    with a flag; nothing paid by expiry → expired.
 */
import crypto from 'node:crypto';
import { getPricesEUR } from '../../shared/price.js';

export const INVOICE_STATES = Object.freeze({
  NEW: 'new', // created, awaiting payment
  PROCESSING: 'processing', // payment seen (mempool / partial), not yet final
  SETTLED: 'settled', // paid in full (within tolerance) and confirmed
  COMPLETE: 'complete', // merchant acknowledged / funds swept
  EXPIRED: 'expired', // no (sufficient) payment before expiry
  INVALID: 'invalid', // unrecoverable (e.g. wrong asset)
});

// Allowed transitions — any other move throws (guards against bad state changes).
const TRANSITIONS = Object.freeze({
  new: ['processing', 'settled', 'expired', 'invalid'],
  processing: ['settled', 'expired', 'invalid'],
  settled: ['complete'],
  complete: [],
  expired: [],
  invalid: [],
});

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

// Default acceptance window for a received amount (covers on-chain fee shaving
// and rounding). Received ≥ amount × (1 − tolerance) counts as paid-in-full.
const DEFAULT_UNDERPAY_TOLERANCE = 0.01; // 1%
const DEFAULT_EXPIRY_SEC = 900; // 15 min — short, because the rate is locked

/**
 * Create a NEW invoice. Either `amountCrypto` (crypto-denominated) or
 * `amountFiat` (+ currency, default EUR — the rate is locked now) is required.
 * @returns {Promise<object>} the invoice
 */
export async function createInvoice(input, deps = {}) {
  const {
    merchantId,
    chain, // wallet chain key the funds are received on (e.g. 'eth', 'btc')
    symbol, // asset symbol (e.g. 'BTC', 'USDT')
    amountFiat,
    amountCrypto,
    currency = 'EUR',
    memo = '',
    expirySec = DEFAULT_EXPIRY_SEC,
    idempotencyKey = null,
    underpayTolerance = DEFAULT_UNDERPAY_TOLERANCE,
  } = input;

  const now = deps.now || Date.now;
  const priceFn = deps.priceFn || getPricesEUR;

  if (!merchantId) throw new Error('merchantId requis');
  if (!chain || !symbol) throw new Error('chain et symbol requis');
  if (amountCrypto == null && amountFiat == null) {
    throw new Error('amountFiat ou amountCrypto requis');
  }

  let cryptoAmount = amountCrypto != null ? Number(amountCrypto) : null;
  let lockedRate = null;
  if (cryptoAmount == null) {
    if (currency !== 'EUR') throw new Error('Seule la devise EUR est supportée pour le moment');
    const amt = Number(amountFiat);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Montant fiat invalide');
    const prices = await priceFn();
    const price = prices?.[String(symbol).toLowerCase()];
    if (!price || price <= 0) throw new Error(`Pas de prix EUR pour ${symbol}`);
    lockedRate = price; // EUR per 1 unit of the asset, frozen for this invoice
    cryptoAmount = amt / price;
  }
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    throw new Error('Montant crypto invalide');
  }

  const ts = now();
  return {
    id: `inv-${ts}-${crypto.randomUUID().slice(0, 8)}`,
    idempotencyKey,
    merchantId,
    chain,
    symbol: String(symbol).toUpperCase(),
    amountCrypto: cryptoAmount,
    amountFiat: amountFiat != null ? Number(amountFiat) : null,
    currency,
    lockedRate,
    underpayTolerance,
    memo,
    status: INVOICE_STATES.NEW,
    receivedCrypto: 0,
    overpaid: false,
    createdAt: ts,
    expiresAt: ts + expirySec * 1000,
    paidAt: null,
  };
}

/** True once the invoice window has passed (used by the watcher/expiry sweep). */
export function isExpired(invoice, now = Date.now()) {
  return now >= invoice.expiresAt;
}

function withStatus(invoice, to, extra = {}) {
  if (invoice.status === to) return { ...invoice, ...extra };
  if (!canTransition(invoice.status, to)) {
    throw new Error(`Transition invalide ${invoice.status} → ${to}`);
  }
  return { ...invoice, status: to, ...extra };
}

/**
 * Apply an observed payment to an invoice and return the NEXT invoice (pure).
 * @param {object} invoice
 * @param {number} receivedCrypto cumulative amount received for this invoice
 * @param {{confirmed?: boolean, now?: number}} opts confirmed = on-chain final / LN settled
 */
export function applyPayment(invoice, receivedCrypto, opts = {}) {
  const now = opts.now ?? Date.now();
  const received = Number(receivedCrypto);
  if (!Number.isFinite(received) || received < 0) throw new Error('Montant reçu invalide');

  // Terminal states are immutable.
  if ([INVOICE_STATES.SETTLED, INVOICE_STATES.COMPLETE, INVOICE_STATES.EXPIRED, INVOICE_STATES.INVALID].includes(invoice.status)) {
    return { ...invoice, receivedCrypto: received };
  }

  const required = invoice.amountCrypto * (1 - invoice.underpayTolerance);
  const paidEnough = received >= required;

  // Expired with insufficient funds → expire. (A full payment that lands exactly
  // at/after expiry is still honoured — merchants prefer settling real money.)
  if (isExpired(invoice, now) && !paidEnough) {
    return withStatus(invoice, INVOICE_STATES.EXPIRED, { receivedCrypto: received });
  }

  if (!paidEnough) {
    // Partial / not-yet-enough: surface it as processing so the UI can show progress.
    return withStatus(invoice, INVOICE_STATES.PROCESSING, { receivedCrypto: received });
  }

  const overpaid = received > invoice.amountCrypto * 1.0;
  if (opts.confirmed) {
    return withStatus(invoice, INVOICE_STATES.SETTLED, {
      receivedCrypto: received,
      overpaid,
      paidAt: now,
    });
  }
  // Seen but not yet confirmed (on-chain mempool).
  return withStatus(invoice, INVOICE_STATES.PROCESSING, { receivedCrypto: received, overpaid });
}

/** Expire a still-open invoice whose window has passed (sweep job helper). */
export function expireIfDue(invoice, now = Date.now()) {
  if ([INVOICE_STATES.NEW, INVOICE_STATES.PROCESSING].includes(invoice.status) && isExpired(invoice, now)) {
    // Only expire if not already paid enough.
    const required = invoice.amountCrypto * (1 - invoice.underpayTolerance);
    if (invoice.receivedCrypto < required) {
      return withStatus(invoice, INVOICE_STATES.EXPIRED);
    }
  }
  return invoice;
}
