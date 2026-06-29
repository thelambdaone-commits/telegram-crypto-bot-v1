import { EvmBaseProvider } from './evm-base.js';

export class EthereumChain extends EvmBaseProvider {
  constructor(rpcUrl) {
    super({
      name: 'Ethereum',
      symbol: 'ETH',
      nativeSymbol: 'ETH',
      rpcUrl: rpcUrl || 'https://ethereum.publicnode.com',
      // Keyless public fallbacks (verified live, juin 2026). rpc.ankr.com/eth was
      // removed: Ankr dropped keyless access and it now requires an API key.
      // PublicNode + dRPC verified working; llamarpc kept last (intermittent).
      fallbackRpcUrls: [
        'https://ethereum.publicnode.com',
        'https://eth.drpc.org',
        'https://eth.llamarpc.com',
      ],
      tokenConfigKey: 'eth',
    });
  }
}
