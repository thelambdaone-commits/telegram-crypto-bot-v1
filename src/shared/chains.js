/**
 * Single source of truth for per-chain metadata. The display/label/logo maps
 * used across the bot are DERIVED from CHAIN_REGISTRY so adding a chain means
 * editing one entry here instead of 4-5 scattered maps. Values are locked by
 * tests/chain-registry.test.js (derived maps must equal the historical values).
 *
 * Fields:
 *  - name:      human network label (qr badge / pickers)
 *  - emoji:     canonical chain glyph
 *  - logo:      cryptocurrency-icons symbol for the QR center (EVM L2s reuse eth)
 *  - native:    native asset symbol
 *  - evm:       true for EVM chains (share the 0x address format)
 *  - coingecko: CoinGecko id of the NATIVE asset (reference; price maps are not
 *               rewired here to avoid the chain-key/token-symbol collisions in
 *               coingecko.js)
 */
export const CHAIN_REGISTRY = {
  eth: { name: 'Ethereum', emoji: 'Ξ', logo: 'eth', native: 'ETH', evm: true, coingecko: 'ethereum' },
  btc: { name: 'Bitcoin', emoji: '₿', logo: 'btc', native: 'BTC', evm: false, coingecko: 'bitcoin' },
  sol: { name: 'Solana', emoji: '◎', logo: 'sol', native: 'SOL', evm: false, coingecko: 'solana' },
  arb: { name: 'Arbitrum', emoji: '🔵', logo: 'eth', native: 'ETH', evm: true, coingecko: 'ethereum' },
  matic: { name: 'Polygon', emoji: '⬡', logo: 'matic', native: 'MATIC', evm: true, coingecko: 'polygon-ecosystem-token' },
  op: { name: 'Optimism', emoji: '🔴', logo: 'eth', native: 'ETH', evm: true, coingecko: 'ethereum' },
  base: { name: 'Base', emoji: '🟦', logo: 'eth', native: 'ETH', evm: true, coingecko: 'ethereum' },
  avax: { name: 'Avalanche', emoji: '🔺', logo: 'avax', native: 'AVAX', evm: true, coingecko: 'avalanche-2' },
  ltc: { name: 'Litecoin', emoji: 'Ł', logo: 'ltc', native: 'LTC', evm: false, coingecko: 'litecoin' },
  bch: { name: 'Bitcoin Cash', emoji: '🅑', logo: 'bch', native: 'BCH', evm: false, coingecko: 'bitcoin-cash' },
  xmr: { name: 'Monero', emoji: 'ɱ', logo: 'xmr', native: 'XMR', evm: false, coingecko: 'monero' },
  zec: { name: 'Zcash', emoji: 'Ⓩ', logo: 'zec', native: 'ZEC', evm: false, coingecko: 'zcash' },
  trx: { name: 'Tron', emoji: '🟥', logo: 'trx', native: 'TRX', evm: false, coingecko: 'tron' },
  ton: { name: 'TON', emoji: '💎', logo: 'ton', native: 'TON', evm: false, coingecko: 'the-open-network' },
};

// ── Derived lists/maps (do not hand-edit — change CHAIN_REGISTRY) ─────────────

export const SUPPORTED_CHAINS = Object.keys(CHAIN_REGISTRY);

export const EVM_CHAINS = new Set(
  Object.entries(CHAIN_REGISTRY)
    .filter(([, m]) => m.evm)
    .map(([chain]) => chain)
);

// chain → canonical glyph (was CHAIN_EMOJIS in ui/formatters.js)
export const CHAIN_EMOJIS = Object.fromEntries(
  Object.entries(CHAIN_REGISTRY).map(([chain, m]) => [chain, m.emoji])
);

// chain → cryptocurrency-icons symbol for the QR center logo
export const LOGO_SYMBOL = Object.fromEntries(
  Object.entries(CHAIN_REGISTRY).map(([chain, m]) => [chain, m.logo])
);

// chain → human network label drawn under the QR logo
export const NETWORK_LABEL = Object.fromEntries(
  Object.entries(CHAIN_REGISTRY).map(([chain, m]) => [chain, m.name])
);

export function isEvmChain(chain) {
  return EVM_CHAINS.has(String(chain || '').toLowerCase());
}

export function isSupportedChain(chain) {
  return SUPPORTED_CHAINS.includes(String(chain || '').toLowerCase());
}
