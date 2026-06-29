import { BaseProvider } from './base.provider.js';
import { TransactionError, ERROR_CODES } from '../shared/errors.js';
import { uiToBaseUnits } from '../shared/amounts.js';
import { fetchWithTor } from '../shared/tor-proxy.js';

let moneroTs;

async function loadMoneroTs() {
  if (!moneroTs) {
    moneroTs = await import('monero-ts');
  }
  return moneroTs;
}

export class MoneroChain extends BaseProvider {
  constructor(daemonUrl = null, walletRpcUrl = null, walletRpcAuth = null) {
    super('Monero', 'XMR');
    this.daemonUrl = daemonUrl || 'http://node.moneroworld.com:18089';
    this.walletRpcUrl = walletRpcUrl;
    this.walletRpcAuth = walletRpcAuth;
    this._walletCache = new Map();
  }

  async _getMoneroTs() {
    return await loadMoneroTs();
  }

  async _createKeysWallet() {
    const m = await this._getMoneroTs();
    return await m.createWalletKeys({ networkType: m.MoneroNetworkType.MAINNET });
  }

  async createWallet() {
    const wallet = await this._createKeysWallet();
    const [address, seed, privateSpendKey, privateViewKey, publicSpendKey, publicViewKey] =
      await Promise.all([
        wallet.getPrimaryAddress(),
        wallet.getSeed(),
        wallet.getPrivateSpendKey(),
        wallet.getPrivateViewKey(),
        wallet.getPublicSpendKey(),
        wallet.getPublicViewKey(),
      ]);

    return {
      address,
      privateKey: privateSpendKey,
      viewKey: privateViewKey,
      publicKey: publicSpendKey,
      publicViewKey,
      mnemonic: seed,
    };
  }

  async importFromSeed(seedPhrase) {
    const m = await this._getMoneroTs();
    const wallet = await m.createWalletKeys({
      networkType: m.MoneroNetworkType.MAINNET,
      seed: seedPhrase.trim(),
      seedLanguage: 'English',
    });

    const [address, privateSpendKey, privateViewKey, publicSpendKey, publicViewKey] =
      await Promise.all([
        wallet.getPrimaryAddress(),
        wallet.getPrivateSpendKey(),
        wallet.getPrivateViewKey(),
        wallet.getPublicSpendKey(),
        wallet.getPublicViewKey(),
      ]);

    return {
      address,
      privateKey: privateSpendKey,
      viewKey: privateViewKey,
      publicKey: publicSpendKey,
      publicViewKey,
      // Preserve the user's original phrase (fidelity) over the library's
      // normalised getSeed() output.
      mnemonic: seedPhrase.trim(),
    };
  }

  async importFromKey(privateSpendKey) {
    const m = await this._getMoneroTs();
    const wallet = await m.createWalletKeys({
      networkType: m.MoneroNetworkType.MAINNET,
      privateSpendKey,
    });

    const [address, seed, privateViewKey, publicSpendKey, publicViewKey] = await Promise.all([
      wallet.getPrimaryAddress(),
      wallet.getSeed(),
      wallet.getPrivateViewKey(),
      wallet.getPublicSpendKey(),
      wallet.getPublicViewKey(),
    ]);

    return {
      address,
      privateKey: privateSpendKey,
      viewKey: privateViewKey,
      publicKey: publicSpendKey,
      publicViewKey,
      mnemonic: seed,
    };
  }

  async _daemonRpcCall(method, params = {}) {
    const headers = { 'Content-Type': 'application/json' };

    const response = await fetchWithTor(this.daemonUrl + '/json_rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'xmrcall',
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Daemon RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    return data.result;
  }

  async _walletRpcCall(method, params = {}) {
    if (!this.walletRpcUrl) {
      throw new Error('Wallet RPC non configure');
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.walletRpcAuth) {
      headers['Authorization'] = 'Basic ' + Buffer.from(this.walletRpcAuth).toString('base64');
    }

    const response = await fetchWithTor(this.walletRpcUrl + '/json_rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'xmrwcall',
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Wallet RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    return data.result;
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== 'XMR') {
      return { balance: '0', symbol: tokenSymbol };
    }

    if (this.walletRpcUrl) {
      try {
        const result = await this._walletRpcCall('get_balance');
        const balanceXmr = result.balance / 1e12;
        return {
          balance: balanceXmr.toString(),
          balanceAtomic: result.balance.toString(),
          symbol: this.symbol,
        };
      } catch {
        // Fallback
      }
    }

    try {
      const daemonInfo = await this._daemonRpcCall('get_info');
      const height = daemonInfo.height;

      return {
        balance: '0',
        balanceAtomic: '0',
        symbol: this.symbol,
        height,
        note: 'Solde indisponible sans wallet RPC — configurez XMR_WALLET_RPC_URL',
      };
    } catch {
      return {
        balance: '0',
        symbol: this.symbol,
        note: 'Daemon XMR injoignable',
      };
    }
  }

  async estimateFees(_fromAddress, _toAddress, _amount) {
    try {
      const result = await this._daemonRpcCall('get_fee_estimate', {});
      const perByte = result.fee || 20000;
      const estimatedTxSize = 2500;
      const estimatedFee = perByte * estimatedTxSize;
      const feeXmr = estimatedFee / 1e12;

      return {
        slow: { fee: feeXmr.toFixed(12), feeAtomic: Math.floor(estimatedFee * 0.8), confBlocks: '~30 min' },
        average: { fee: feeXmr.toFixed(12), feeAtomic: Math.floor(estimatedFee), confBlocks: '~20 min' },
        fast: { fee: (feeXmr * 2).toFixed(12), feeAtomic: Math.floor(estimatedFee * 2), confBlocks: '~10 min' },
      };
    } catch {
      return {
        slow: { fee: '0.000030000000', feeAtomic: 30000, confBlocks: '~30 min' },
        average: { fee: '0.000060000000', feeAtomic: 60000, confBlocks: '~20 min' },
        fast: { fee: '0.000120000000', feeAtomic: 120000, confBlocks: '~10 min' },
      };
    }
  }

  async sendTransaction(privateSpendKey, toAddress, amount, feeLevel = 'average') {
    if (!this.walletRpcUrl) {
      throw new TransactionError(
        'Monero Wallet RPC requis pour envoyer — configurez XMR_WALLET_RPC_URL',
        { code: ERROR_CODES.RPC_ERROR, chain: 'XMR' }
      );
    }

    try {
      const m = await this._getMoneroTs();
      const wallet = await m.createWalletKeys({
        networkType: m.MoneroNetworkType.MAINNET,
        privateSpendKey,
      });

      await this._walletRpcCall('open_wallet', {
        filename: '',
        password: '',
      });

      const fees = await this.estimateFees('', toAddress, amount);
      const feeData = fees[feeLevel];

      // Montant UI → piconero (12 décimales) en entier, sans flottant.
      const atomic = uiToBaseUnits(amount, 12);
      if (atomic <= 0n) {
        throw new TransactionError('Montant inférieur au minimum transférable (1 piconero)', {
          code: ERROR_CODES.INVALID_AMOUNT,
          chain: 'XMR',
        });
      }

      const txWallet = await this._walletRpcCall('create_transaction', {
        destinations: [{ address: toAddress, amount: Number(atomic) }],
        priority: feeLevel === 'fast' ? 2 : feeLevel === 'average' ? 1 : 0,
        fee: feeData.feeAtomic,
      });

      if (txWallet.tx_hash) {
        await this._walletRpcCall('relay_transaction', {
          hex: txWallet.tx_blob || txWallet.tx_hex,
        });

        return {
          hash: txWallet.tx_hash,
          from: await wallet.getPrimaryAddress(),
          to: toAddress,
          amount: amount.toString(),
          symbol: 'XMR',
          fee: (feeData.feeAtomic / 1e12).toString(),
          status: 'broadcast',
        };
      }

      throw new Error('Transaction echouee');
    } catch (error) {
      if (error instanceof TransactionError) throw error;
      throw new TransactionError(error.message, {
        code: ERROR_CODES.BROADCAST_FAILED,
        chain: 'XMR',
        details: error,
      });
    }
  }

  async getTransactionHistory(address, limit = 5) {
    if (this.walletRpcUrl) {
      try {
        const result = await this._walletRpcCall('get_transfers', {
          in: true,
          out: true,
          limit,
        });

        const txs = [];
        for (const tx of result.in || []) {
          txs.push({
            hash: tx.txid,
            type: 'in',
            amount: (tx.amount / 1e12).toString(),
            timestamp: tx.timestamp * 1000,
          });
        }
        for (const tx of result.out || []) {
          txs.push({
            hash: tx.txid,
            type: 'out',
            amount: (tx.amount / 1e12).toString(),
            timestamp: tx.timestamp * 1000,
          });
        }

        return txs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
      } catch {
        // Fallback
      }
    }

    try {
      const info = await this._daemonRpcCall('get_info');
      return [{
        hash: '—',
        type: 'info',
        amount: '0',
        timestamp: Date.now(),
        note: `Hauteur du bloc: ${info.height}`,
      }];
    } catch {
      return [];
    }
  }

  validateAddress(address) {
    if (!address || typeof address !== 'string') return false;
    address = address.trim();

    if (/^[48][A-Za-z0-9]{94}$/.test(address)) return true;

    if (/^[48][A-Za-z0-9]{105}$/.test(address)) return true;

    return false;
  }
}

export default MoneroChain;
