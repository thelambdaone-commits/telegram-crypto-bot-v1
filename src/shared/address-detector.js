/**
 * Detect blockchain from address format
 */
export function detectChain(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  address = address.trim();

  // Ethereum: 0x + 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return 'eth';
  }

  // Bitcoin Cash: CashAddr format (bitcoincash:q or bitcoincash:p)
  if (/^bitcoincash:[qp][a-z0-9]{41}$/i.test(address)) {
    return 'bch';
  }

  // Bitcoin: Legacy (1...), SegWit (3...), Bech32 (bc1...)
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
    return 'btc';
  }
  if (/^bc1[a-zA-HJ-NP-Z0-9]{25,90}$/.test(address)) {
    return 'btc';
  }

  // Litecoin: Legacy (L, M), Native SegWit (ltc1)
  if (/^ltc1[a-zA-HJ-NP-Z0-9]{25,90}$/.test(address)) {
    return 'ltc';
  }
  if (/^[LM][a-km-zA-HJ-NP-Z1-9]{25,33}$/.test(address)) {
    return 'ltc';
  }

  // Bitcoin Cash legacy: 1 and 3 (can overlap with BTC)
  // We check BCH after BTC to prioritize BTC for ambiguous cases
  
  // Solana: Base58, 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return 'sol';
  }

  return null;
}
