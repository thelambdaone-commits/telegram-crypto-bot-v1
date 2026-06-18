const ADDRESS_EXPLORERS = {
  eth:   (addr) => `https://etherscan.io/address/${addr}`,
  arb:   (addr) => `https://arbiscan.io/address/${addr}`,
  op:    (addr) => `https://optimism.io/address/${addr}`,
  base:  (addr) => `https://basescan.org/address/${addr}`,
  matic: (addr) => `https://polygonscan.com/address/${addr}`,
  avax:  (addr) => `https://snowtrace.io/address/${addr}`,
  sol:   (addr) => `https://solscan.io/account/${addr}`,
  ltc:   (addr) => `https://mempool.space/litecoin/address/${addr}`,
  bch:   (addr) => `https://blockchain.com/bch/address/${addr}`,
  btc:   (addr) => `https://blockchain.com/btc/address/${addr}`,
  xmr:   (addr) => `https://xmrchain.net/address/${addr}`,
  zec:   (addr) => `https://zcashblockexplorer.com/address/${addr}`,
  trx:   (addr) => `https://tronscan.org/#/address/${addr}`,
  ton:   (addr) => `https://tonviewer.com/${addr}`,
  bsc:   (addr) => `https://bscscan.com/address/${addr}`,
};

const EXPLORER_NAMES = {
  eth:   'Etherscan',
  arb:   'Arbiscan',
  op:    'Optimism Explorer',
  base:  'BaseScan',
  matic: 'PolygonScan',
  avax:  'Snowtrace',
  sol:   'Solscan',
  ltc:   'Mempool Space',
  bch:   'Blockchain.com',
  btc:   'Blockchain.com',
  xmr:   'XMRchain',
  zec:   'Zcash Block Explorer',
  trx:   'Tronscan',
  ton:   'Tonviewer',
  bsc:   'BscScan',
};

const TOKEN_EXPLORERS = {
  sol: (mint) => `https://solscan.io/token/${mint}`,
  eth: (addr) => `https://etherscan.io/token/${addr}`,
  arb: (addr) => `https://arbiscan.io/token/${addr}`,
  op:  (addr) => `https://optimism.io/token/${addr}`,
  base:(addr) => `https://basescan.org/token/${addr}`,
  matic:(addr) => `https://polygonscan.com/token/${addr}`,
  avax:(addr) => `https://snowtrace.io/token/${addr}`,
  trx: (addr) => `https://tronscan.org/#/token20/${addr}`,
  bsc: (addr) => `https://bscscan.com/token/${addr}`,
};

export function getAddressExplorerUrl(chain, address) {
  const builder = ADDRESS_EXPLORERS[chain];
  return builder ? builder(address) : null;
}

export function getExplorerName(chain) {
  return EXPLORER_NAMES[chain] || 'Explorer';
}

export function getTokenExplorerUrl(chain, mint) {
  const builder = TOKEN_EXPLORERS[chain];
  return builder ? builder(mint) : null;
}
