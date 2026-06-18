import { EvmBaseProvider } from './evm-base.js';

export class BscChain extends EvmBaseProvider {
  constructor(rpcUrl) {
    super({
      name: 'BNB Chain',
      symbol: 'BSC',
      nativeSymbol: 'BNB',
      rpcUrl: rpcUrl || 'https://bsc-dataseed.binance.org',
      fallbackRpcUrls: [
        'https://bsc-dataseed.binance.org',
        'https://bsc-dataseed1.defibit.io',
        'https://bsc.publicnode.com',
        'https://binance.llamarpc.com',
      ],
      tokenConfigKey: 'bsc',
      explorer: 'https://bscscan.com',
    });
  }
}

export default BscChain;
