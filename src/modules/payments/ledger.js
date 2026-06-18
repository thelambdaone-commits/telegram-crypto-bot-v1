/**
 * Payment gateway — double-entry ledger (Phase 0).
 *
 * Non-custodial: funds go to the merchant's own wallet. This ledger is a
 * reconciliation/reporting record — every settled invoice produces a balanced
 * (debit = credit) pair so totals can be audited against on-chain reality by a
 * later reconciliation job. Pure helpers; persistence is wired in a later phase.
 */

const merchantAccount = (merchantId, symbol) => `merchant:${merchantId}:${symbol}`;
const externalAccount = (symbol) => `external:${symbol}`;

/** The balanced debit/credit pair for a settled invoice. */
export function settlementEntries(invoice) {
  const amount = invoice.receivedCrypto;
  const common = { amount, symbol: invoice.symbol, ref: invoice.id, merchantId: invoice.merchantId, at: invoice.paidAt };
  return [
    { account: externalAccount(invoice.symbol), dir: 'debit', ...common },
    { account: merchantAccount(invoice.merchantId, invoice.symbol), dir: 'credit', ...common },
  ];
}

/** Net credited balance for a merchant in one asset. */
export function balance(entries, merchantId, symbol) {
  const acct = merchantAccount(merchantId, symbol);
  return entries
    .filter((e) => e.account === acct)
    .reduce((sum, e) => sum + (e.dir === 'credit' ? e.amount : -e.amount), 0);
}

/** Invariant: per asset, total debits equal total credits (books balance). */
export function isBalanced(entries) {
  const by = {};
  for (const e of entries) {
    by[e.symbol] ||= { debit: 0, credit: 0 };
    by[e.symbol][e.dir] += e.amount;
  }
  return Object.values(by).every((x) => Math.abs(x.debit - x.credit) < 1e-9);
}
