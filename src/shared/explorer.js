const ADDRESS_EXPLORERS = {
  eth:   (addr) => `https://etherscan.io/address/${addr}`,
  arb:   (addr) => `https://arbiscan.io/address/${addr}`,
  op:    (addr) => `https://optimistic.etherscan.io/address/${addr}`,
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
  op:    'Optimistic Etherscan',
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
  op:  (addr) => `https://optimistic.etherscan.io/token/${addr}`,
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

const TX_EXPLORERS = {
  eth:   (hash) => `https://etherscan.io/tx/${hash}`,
  arb:   (hash) => `https://arbiscan.io/tx/${hash}`,
  op:    (hash) => `https://optimistic.etherscan.io/tx/${hash}`,
  base:  (hash) => `https://basescan.org/tx/${hash}`,
  matic: (hash) => `https://polygonscan.com/tx/${hash}`,
  avax:  (hash) => `https://snowtrace.io/tx/${hash}`,
  bsc:   (hash) => `https://bscscan.com/tx/${hash}`,
  sol:   (hash) => `https://solscan.io/tx/${hash}`,
  ltc:   (hash) => `https://mempool.space/litecoin/tx/${hash}`,
  bch:   (hash) => `https://blockchain.com/bch/tx/${hash}`,
  btc:   (hash) => `https://blockchain.com/btc/tx/${hash}`,
  xmr:   (hash) => `https://xmrchain.net/tx/${hash}`,
  zec:   (hash) => `https://zcashblockexplorer.com/tx/${hash}`,
  trx:   (hash) => `https://tronscan.org/#/transaction/${hash}`,
  ton:   (hash) => `https://tonviewer.com/transaction/${hash}`,
};

export function getTransactionExplorerUrl(chain, hash) {
  const builder = TX_EXPLORERS[chain];
  return builder ? builder(hash) : null;
}

export function getTokenExplorerUrl(chain, mint) {
  const builder = TOKEN_EXPLORERS[chain];
  return builder ? builder(mint) : null;
}
