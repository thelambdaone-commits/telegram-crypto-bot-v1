import { ECPairFactory } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import bs58check from 'bs58check';

import { BaseProvider } from './base.provider.js';
import { uiToBaseUnits } from '../shared/amounts.js';
import { TransactionError, ERROR_CODES } from '../shared/errors.js';
import { fetchWithTor } from '../shared/tor-proxy.js';

const ECPair = ECPairFactory(tinysecp);

const ZEC_NETWORK = {
  messagePrefix: '\x18Zcash Signed Message:\n',
  bech32: 'zs',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x1cb8,
  scriptHash: 0x1cbd,
  wif: 0x80,
  coinType: 133,
};

const P2PKH_VERSION = Buffer.from([0x1c, 0xb8]);

function publicKeyToAddress(pubkey) {
  const hash160 = bitcoin.crypto.hash160(pubkey);
  const payload = Buffer.concat([P2PKH_VERSION, hash160]);
  return bs58check.encode(payload);
}

function bitcoinToZcashWif(privateKeyBytes) {
  const payload = Buffer.concat([Buffer.from([0x80]), privateKeyBytes, Buffer.from([0x01])]);
  return bs58check.encode(payload);
}

export class ZcashChain extends BaseProvider {
  constructor(apiUrl = null, rpcUrl = null, rpcAuth = null, apiKey = null) {
    super('Zcash', 'ZEC');
    // Blockchair Zcash REST API. The old api.zcha.in / BlockCypher ZEC endpoints
    // were discontinued; Blockchair is the live free explorer (optional API key
    // raises the free-tier rate limit).
    this.apiUrl = (apiUrl || 'https://api.blockchair.com/zcash').replace(/\/+$/, '');
    this.apiKey = apiKey || null;
    this.rpcUrl = rpcUrl;
    this.rpcAuth = rpcAuth;
    this.network = ZEC_NETWORK;
  }

  // Append the Blockchair API key (if configured) to a query string.
  _withKey(url) {
    if (!this.apiKey) return url;
    return url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(this.apiKey)}`;
  }

  // Fetch a Blockchair address dashboard (balance + utxo + tx hashes in one call).
  async _fetchDashboard(address, limit = 'utxo') {
    const url = this._withKey(`${this.apiUrl}/dashboards/address/${address}?limit=${limit}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchWithTor(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const entry = data?.data?.[address];
      if (!entry) throw new Error('adresse introuvable');
      return entry;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createWallet() {
    const keyPair = ECPair.makeRandom();
    const address = publicKeyToAddress(keyPair.publicKey);

    return {
      address,
      privateKey: bitcoinToZcashWif(keyPair.privateKey),
      publicKey: keyPair.publicKey.toString('hex'),
    };
  }

  async importFromKey(privateKeyWif) {
    const keyPair = ECPair.fromWIF(privateKeyWif, bitcoin.networks.bitcoin);
    const address = publicKeyToAddress(keyPair.publicKey);

    return {
      address,
      privateKey: privateKeyWif,
      publicKey: keyPair.publicKey.toString('hex'),
    };
  }

  async importFromSeed(seedPhrase) {
    const { default: bip39 } = await import('bip39');
    const BIP32Factory = (await import('bip32')).default;
    const ecc = await import('tiny-secp256k1');
    const bip32 = BIP32Factory(ecc);

    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Seed phrase invalide');
    }

    const seed = await bip39.mnemonicToSeed(seedPhrase);
    const root = bip32.fromSeed(seed);
    const path = "m/44'/133'/0'/0/0";
    const child = root.derivePath(path);
    const keyPair = ECPair.fromPrivateKey(child.privateKey);
    const address = publicKeyToAddress(keyPair.publicKey);

    return {
      address,
      privateKey: bitcoinToZcashWif(keyPair.privateKey),
      publicKey: keyPair.publicKey.toString('hex'),
      mnemonic: seedPhrase,
    };
  }

  async _rpcCall(method, params = []) {
    if (!this.rpcUrl) throw new Error('Zcash RPC non configure');

    const headers = { 'Content-Type': 'text/plain' };
    if (this.rpcAuth) {
      headers['Authorization'] = 'Basic ' + Buffer.from(this.rpcAuth).toString('base64');
    }

    const response = await fetchWithTor(this.rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'zecbot',
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== 'ZEC') {
      return { balance: '0', symbol: tokenSymbol };
    }

    if (this.rpcUrl) {
      try {
        const result = await this._rpcCall('getaddressbalance', [{ addresses: [address] }]);
        const balanceZec = (result.balance || 0) / 100000000;
        return {
          balance: balanceZec.toString(),
          balanceSats: (result.balance || 0).toString(),
          symbol: this.symbol,
        };
      } catch {
        // Fallback to API
      }
    }

    try {
      const entry = await this._fetchDashboard(address, 0);
      const balanceSats = entry.address?.balance ?? 0;
      return {
        balance: (balanceSats / 100000000).toString(),
        balanceSats: balanceSats.toString(),
        symbol: this.symbol,
      };
    } catch {
      return {
        balance: '0',
        balanceSats: '0',
        symbol: this.symbol,
        warning: 'API Zcash indisponible',
      };
    }
  }

  async getUtxos(address) {
    if (this.rpcUrl) {
      try {
        const result = await this._rpcCall('getaddressutxos', [{ addresses: [address] }]);
        return result.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.outputIndex,
          value: utxo.satoshis,
          height: utxo.height,
        }));
      } catch {
        // Fallback to API
      }
    }

    try {
      const entry = await this._fetchDashboard(address, 'utxo');
      return (entry.utxo || []).map((u) => ({
        txid: u.transaction_hash,
        vout: u.index,
        value: u.value,
        height: u.block_id,
      }));
    } catch {
      return [];
    }
  }

  async estimateFees(fromAddress, _toAddress, _amount) {
    if (this.rpcUrl) {
      try {
        const mempool = await this._rpcCall('getmempoolinfo');
        const bytesPerInput = 68;
        const bytesPerOutput = 31;
        const overhead = 10;
        const utxos = await this.getUtxos(fromAddress);
        const inputCount = Math.max(1, Math.min(utxos.length, 10));
        const outputCount = 2;
        const txSize = inputCount * bytesPerInput + outputCount * bytesPerOutput + overhead;

        const baseFee = mempool?.usage ? Math.ceil(mempool.usage / 100000) : 10;

        return {
          slow: {
            fee: ((baseFee * txSize) / 100000000).toFixed(8),
            feeSats: Math.ceil(baseFee * txSize),
            confBlocks: '~144 blocs (~24h)',
          },
          average: {
            fee: ((baseFee * 1.5 * txSize) / 100000000).toFixed(8),
            feeSats: Math.ceil(baseFee * 1.5 * txSize),
            confBlocks: '~6 blocs (~1h)',
          },
          fast: {
            fee: ((baseFee * 2 * txSize) / 100000000).toFixed(8),
            feeSats: Math.ceil(baseFee * 2 * txSize),
            confBlocks: '~1 bloc (~10m)',
          },
        };
      } catch {
        // Fallback
      }
    }

    return {
      slow: { fee: '0.00001000', feeSats: 1000, confBlocks: '~144 blocs' },
      average: { fee: '0.00005000', feeSats: 5000, confBlocks: '~6 blocs' },
      fast: { fee: '0.00010000', feeSats: 10000, confBlocks: '~1 bloc' },
    };
  }

  _p2pkhOutput(pubkey) {
    return bitcoin.payments.p2pkh({ pubkey }).output;
  }

  async sendTransaction(privateKeyWif, toAddress, amount, feeLevel = 'average') {
    if (this.rpcUrl) {
      try {
        const keyPair = ECPair.fromWIF(privateKeyWif, bitcoin.networks.bitcoin);
        const fromAddress = publicKeyToAddress(keyPair.publicKey);

        const utxos = await this.getUtxos(fromAddress);
        const fees = await this.estimateFees(fromAddress, toAddress, amount);
        const feeData = fees[feeLevel];
        const zats = uiToBaseUnits(amount, 8);
        if (zats <= 0n) {
          throw new Error('Montant inférieur au minimum transférable (1 zatoshi)');
        }
        const amountSats = Number(zats);
        const feeSats = Math.max(feeData.feeSats, 1000);

        let totalInput = 0;
        const selectedUtxos = [];
        for (const utxo of utxos) {
          selectedUtxos.push(utxo);
          totalInput += utxo.value;
          if (totalInput >= amountSats + feeSats) break;
        }

        if (totalInput < amountSats + feeSats) {
          throw new TransactionError('Solde insuffisant', {
            code: ERROR_CODES.INSUFFICIENT_FUNDS,
            chain: 'ZEC',
          });
        }

        const psbt = new bitcoin.Psbt();
        for (const utxo of selectedUtxos) {
          psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
              script: this._p2pkhOutput(keyPair.publicKey),
              value: utxo.value,
            },
          });
        }

        const toHash160 = bitcoin.crypto.hash160(
          bs58check.decode(toAddress).slice(2)
        );
        const toScript = bitcoin.payments.p2pkh({ hash: toHash160 }).output;
        psbt.addOutput({ script: toScript, value: amountSats });

        const change = totalInput - amountSats - feeSats;
        if (change > 1000) {
          const changeHash160 = bitcoin.crypto.hash160(keyPair.publicKey);
          const changeScript = bitcoin.payments.p2pkh({ hash: changeHash160 }).output;
          psbt.addOutput({ script: changeScript, value: change });
        }

        for (let i = 0; i < selectedUtxos.length; i++) {
          psbt.signInput(i, keyPair);
        }

        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();

        const result = await this._rpcCall('sendrawtransaction', [txHex]);

        return {
          hash: result || tx.getId(),
          from: fromAddress,
          to: toAddress,
          amount: amount.toString(),
          symbol: 'ZEC',
          fee: (feeSats / 100000000).toString(),
          status: 'broadcast',
        };
      } catch (error) {
        throw new TransactionError(error.message, {
          code: ERROR_CODES.BROADCAST_FAILED,
          chain: 'ZEC',
          details: error,
        });
      }
    }

    throw new TransactionError('Zcash RPC non configure — impossible d\'envoyer', {
      code: ERROR_CODES.RPC_ERROR,
      chain: 'ZEC',
    });
  }

  async getTransactionHistory(address, limit = 5) {
    if (this.rpcUrl) {
      try {
        const txids = await this._rpcCall('getaddresstxids', [{ addresses: [address] }]);
        const recentTxs = txids.slice(-limit);

        return await Promise.all(
          recentTxs.map(async (txid) => {
            try {
              const tx = await this._rpcCall('getrawtransaction', [txid, 1]);
              let amount = 0;
              let type = 'in';

              for (const vout of tx.vout || []) {
                if (vout.scriptPubKey?.addresses?.includes(address)) {
                  amount += vout.value;
                }
              }

              for (const vin of tx.vin || []) {
                if (vin.addresses?.includes(address)) {
                  type = 'out';
                }
              }

              return {
                hash: tx.txid,
                type,
                amount: amount.toString(),
                timestamp: (tx.time || tx.blocktime || Math.floor(Date.now() / 1000)) * 1000,
              };
            } catch {
              return null;
            }
          })
        ).then((results) => results.filter(Boolean));
      } catch {
        // Fallback to API
      }
    }

    // Blockchair fallback: list recent tx hashes for the address, then fetch
    // each transaction to derive direction + amount.
    try {
      const entry = await this._fetchDashboard(address, limit);
      const hashes = (entry.transactions || []).slice(0, limit);
      if (hashes.length === 0) return [];

      const url = this._withKey(`${this.apiUrl}/dashboards/transactions/${hashes.join(',')}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let txMap;
      try {
        const response = await fetchWithTor(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        txMap = (await response.json())?.data || {};
      } finally {
        clearTimeout(timeout);
      }

      return hashes
        .map((hash) => {
          const tx = txMap[hash];
          if (!tx) return null;
          const isOut = (tx.inputs || []).some((i) => i.recipient === address);
          const credited = (tx.outputs || [])
            .filter((o) => o.recipient === address)
            .reduce((sum, o) => sum + (o.value || 0), 0);
          const debited = (tx.inputs || [])
            .filter((i) => i.recipient === address)
            .reduce((sum, i) => sum + (i.value || 0), 0);
          const amountSats = isOut ? debited - credited : credited;
          const t = tx.transaction?.time;
          return {
            hash,
            type: isOut ? 'out' : 'in',
            amount: (Math.abs(amountSats) / 100000000).toString(),
            timestamp: t ? Date.parse(t + ' UTC') : Date.now(),
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  validateAddress(address) {
    if (!address || typeof address !== 'string') return false;
    address = address.trim();

    if (/^t1[a-km-zA-HJ-NP-Z1-9]{33}$/.test(address)) return true;
    if (/^t3[a-km-zA-HJ-NP-Z1-9]{33}$/.test(address)) return true;

    return false;
  }
}

export default ZcashChain;
