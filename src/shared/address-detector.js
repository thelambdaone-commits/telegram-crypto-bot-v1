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

  // Bitcoin Cash: CashAddr format, with or without the bitcoincash: prefix.
  // Prefixless q.../p... addresses overlap Solana's base58 shape, so BCH must be checked first.
  if (/^(bitcoincash:)?[qp][ac-hj-np-z02-9]{41}$/i.test(address)) {
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

  // Zcash: Transparent t1 or t3 addresses
  if (/^t[13][a-km-zA-HJ-NP-Z1-9]{33}$/.test(address)) {
    return 'zec';
  }

  // Monero: Standard (4...) or subaddress (8...), 95 chars
  if (/^[48][A-Za-z0-9]{94}$/.test(address)) {
    return 'xmr';
  }

  // Monero integrated address: 106 chars
  if (/^[48][A-Za-z0-9]{105}$/.test(address)) {
    return 'xmr';
  }

  // TON: friendly address, 48 chars base64url starting with E/U + Q (UQ…/EQ…).
  // Checked before Solana: TON's '_'/'-' and 48-char length don't fit base58.
  if (/^[EU]Q[A-Za-z0-9_-]{46}$/.test(address)) {
    return 'ton';
  }

  // Solana: Base58, 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return 'sol';
  }

  return null;
}
