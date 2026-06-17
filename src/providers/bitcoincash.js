import { ECPairFactory } from 'ecpair';
import * as tinysecp from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';

import { BaseProvider } from './base.provider.js';
import { TransactionError, ERROR_CODES } from '../shared/errors.js';

const ECPair = ECPairFactory(tinysecp);
const bip32 = BIP32Factory(tinysecp);
const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const BCH_NETWORK = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bitcoincash',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
  coinType: 145,
};

export class BitcoinCashChain extends BaseProvider {
  constructor(apiUrl = null) {
    super('Bitcoin Cash', 'BCH');
    this.apiUrl = apiUrl || 'https://api.blockchain.info/bch/stats';
    this.network = BCH_NETWORK;
    this.explorerApi = 'https://blockchain.info';
  }

  toLegacyAddress(cashAddr) {
    try {
      return this.cashAddrToLegacy(cashAddr);
    } catch {
      return null;
    }
  }

  cashAddrPrefixToWords(prefix) {
    return [...prefix].map((char) => char.charCodeAt(0) & 0x1f);
  }

  cashAddrPolymod(values) {
    const generators = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    let checksum = 1n;

    for (const value of values) {
      const top = checksum >> 35n;
      checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(value);

      for (let i = 0; i < generators.length; i += 1) {
        if (((top >> BigInt(i)) & 1n) !== 0n) {
          checksum ^= generators[i];
        }
      }
    }

    return checksum;
  }

  convertBits(data, fromBits, toBits, pad = false) {
    let accumulator = 0;
    let bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;
    const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

    for (const value of data) {
      if (value < 0 || value >> fromBits !== 0) {
        throw new Error('Invalid cashaddr value');
      }

      accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
      bits += fromBits;

      while (bits >= toBits) {
        bits -= toBits;
        result.push((accumulator >> bits) & maxValue);
      }
    }

    if (pad) {
      if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
    } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
      throw new Error('Invalid cashaddr padding');
    }

    return result;
  }

  cashAddrToLegacy(address) {
    const normalized = address.toLowerCase();
    const [prefix, payload] = normalized.includes(':')
      ? normalized.split(':')
      : ['bitcoincash', normalized];

    if (prefix !== 'bitcoincash' || !/^[qp][ac-hj-np-z02-9]{41}$/.test(payload)) {
      throw new Error('Invalid Bitcoin Cash address');
    }

    const payloadValues = [...payload].map((char) => {
      const value = CASHADDR_CHARSET.indexOf(char);
      if (value === -1) throw new Error('Invalid cashaddr character');
      return value;
    });

    const checksumInput = [...this.cashAddrPrefixToWords(prefix), 0, ...payloadValues];
    if (this.cashAddrPolymod(checksumInput) !== 1n) {
      throw new Error('Invalid cashaddr checksum');
    }

    const decoded = this.convertBits(payloadValues.slice(0, -8), 5, 8, false);
    const version = decoded[0];
    const hash = Buffer.from(decoded.slice(1));
    const type = version >> 3;

    if (hash.length !== 20) {
      throw new Error('Unsupported cashaddr hash size');
    }

    if (type === 0) return bitcoin.address.toBase58Check(hash, 0x00);
    if (type === 1) return bitcoin.address.toBase58Check(hash, 0x05);

    throw new Error('Unsupported cashaddr type');
  }

  async createWallet() {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      address: address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
    };
  }

  async importFromKey(privateKey) {
    const keyPair = ECPair.fromWIF(privateKey, this.network);
    const { address } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      address: address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
    };
  }

  async importFromSeed(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    const seed = await bip39.mnemonicToSeed(seedPhrase);
    const root = bip32.fromSeed(seed, this.network);
    // BIP44 path for Bitcoin Cash (coin type 145).
    const child = root.derivePath("m/44'/145'/0'/0/0");

    const { address } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: this.network,
    });

    return {
      address,
      privateKey: child.toWIF(),
      publicKey: child.publicKey.toString('hex'),
      mnemonic: seedPhrase,
    };
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== 'BCH')
      return { balance: '0', symbol: tokenSymbol };
    try {
      const response = await fetch(
        `https://api.bitcore.io/api/BCH/mainnet/address/${address}/balance`
      );

      if (response.ok) {
        const data = await response.json();
        const balanceSats = data.confirmed ?? data.balance ?? 0;

        return {
          balance: (balanceSats / 100000000).toString(),
          balanceSats: balanceSats.toString(),
          symbol: this.symbol,
        };
      }
    } catch {
      // Try the legacy fallback below.
    }

    try {
      let lookupAddress = address;
      if (/^(bitcoincash:)?[qp][ac-hj-np-z02-9]{41}$/i.test(address)) {
        lookupAddress = this.cashAddrToLegacy(address);
      }

      const response = await fetch(`https://api.blockchain.info/bch/addr/${lookupAddress}/balance`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const balanceSats = data.final_balance || 0;
      const balance = balanceSats / 100000000;

      return {
        balance: balance.toString(),
        balanceSats: balanceSats.toString(),
        symbol: this.symbol,
      };
    } catch (error) {
      throw new TransactionError(error.message, {
        code: error.message.includes('API error') ? ERROR_CODES.RPC_ERROR : ERROR_CODES.UNKNOWN,
        chain: 'BCH'
      });
    }
  }

  base58ToLegacy(base58) {
    try {
      const decoded = this.base58Decode(base58);
      return '1' + decoded.slice(0, -4);
    } catch {
      return base58;
    }
  }

  base58Decode(address) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = [];
    for (let i = 0; i < address.length; i++) {
      const char = address[address.length - 1 - i];
      const index = alphabet.indexOf(char);
      if (index === -1) throw new Error('Invalid base58');
      let carry = index;
      for (let j = 0; j < num.length; j++) {
        carry += num[j] * 58;
        num[j] = carry % 256;
        carry = Math.floor(carry / 256);
      }
      while (carry > 0) {
        num.push(carry % 256);
        carry = Math.floor(carry / 256);
      }
    }
    const leadingZeros = address.match(/^1+/);
    if (leadingZeros) {
      for (let i = 0; i < leadingZeros[0].length; i++) {
        num.push(0);
      }
    }
    return Buffer.from(num.reverse()).toString('hex');
  }

  async getTransactionHistory(address, limit = 5) {
    // Haskoin returns cashaddr in inputs/outputs while our wallets use legacy
    // addresses — normalise both sides to legacy before comparing.
    const toLegacy = (a) => {
      const s = String(a || '').replace(/^bitcoincash:/i, '');
      if (/^[qp][ac-hj-np-z02-9]{41}$/i.test(s)) {
        try {
          return this.cashAddrToLegacy(s);
        } catch {
          return s;
        }
      }
      return s;
    };

    try {
      const target = toLegacy(address);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(
        `https://api.haskoin.com/bch/address/${address}/transactions/full?limit=${limit}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!response.ok) return [];

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data.map((tx) => {
        const isOut = (tx.inputs || []).some((input) => toLegacy(input.address) === target);
        let amount = 0;
        for (const output of tx.outputs || []) {
          const to = toLegacy(output.address);
          if (isOut && to !== target) amount += output.value;
          else if (!isOut && to === target) amount += output.value;
        }
        return {
          hash: tx.txid,
          type: isOut ? 'out' : 'in',
          amount: (amount / 1e8).toFixed(8),
          timestamp: (tx.time || Date.now() / 1000) * 1000,
        };
      });
    } catch {
      return [];
    }
  }

  async getUtxos(address) {
    try {
      let lookupAddress = address;
      if (/^(bitcoincash:)?[qp][ac-hj-np-z02-9]{41}$/i.test(address)) {
        lookupAddress = this.cashAddrToLegacy(address);
      }

      const response = await fetch(`https://api.blockchain.info/bch/addr/${lookupAddress}/utxo`);

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async estimateFees(_fromAddress, _toAddress, _amount) {
    const feePerByte = 1;
    const estimatedFee = 0.00001;

    return {
      slow: {
        estimatedFee: (estimatedFee * 0.5).toString(),
        feeSats: Math.floor(estimatedFee * 0.5 * 100000000).toString(),
      },
      average: {
        estimatedFee: estimatedFee.toString(),
        feeSats: Math.floor(estimatedFee * 100000000).toString(),
      },
      fast: {
        estimatedFee: (estimatedFee * 2).toString(),
        feeSats: Math.floor(estimatedFee * 2 * 100000000).toString(),
      },
      feeRate: feePerByte,
    };
  }

  async broadcastTransaction(txHex) {
    const apis = [
      { url: 'https://api.blockchain.info/pushtx', method: 'POST' },
      { url: 'https://blockchain.info/pushtx', method: 'POST' },
    ];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(api.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: txHex,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const result = await response.text();
          if (result.includes('txid') || result.length >= 64) {
            return result;
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error('Broadcast failed - all APIs unavailable');
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = 'average') {
    const keyPair = ECPair.fromWIF(privateKey, this.network);
    // Real P2PKH (legacy base58) address — NOT the hex public key. Used for UTXO
    // lookup, fees and the change output; a wrong change address loses funds.
    const { address: fromAddress } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    const utxos = await this.getUtxos(fromAddress);

    if (!utxos || utxos.length === 0) {
      throw new TransactionError('No UTXOs available', { code: ERROR_CODES.NO_UTXOS, chain: 'BCH' });
    }

    const fees = await this.estimateFees(fromAddress, toAddress, amount);
    const feeRate = fees[feeLevel]?.feeSats || fees.average.feeSats;
    const feeSats = parseInt(feeRate);
    const amountSats = Math.floor(amount * 100000000);

    const tx = new bitcoin.Transaction();
    tx.version = 1;

    let totalInput = 0;
    for (const utxo of utxos) {
      tx.addInput(Buffer.from(utxo.txHash, 'hex').reverse(), utxo.index);
      totalInput += utxo.value;
    }

    tx.addOutput(Buffer.from(this.base58ToBytes(toAddress)), amountSats);

    const changeAmount = totalInput - amountSats - feeSats;
    if (changeAmount > 0) {
      tx.addOutput(Buffer.from(this.base58ToBytes(fromAddress)), changeAmount);
    }

    tx.sign(keyPair, bitcoin.transactions.SIGHASH_ALL);

    const txHex = tx.toHex();
    const txId = await this.broadcastTransaction(txHex);

    return {
      hash: txId,
      from: fromAddress,
      to: toAddress,
      amount: amount.toString(),
      symbol: 'BCH',
      fee: (feeSats / 100000000).toString(),
      blockNumber: 0,
      status: 'success',
    };
  }

  base58ToBytes(address) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = [];
    for (let i = 0; i < address.length; i++) {
      const char = address[i];
      const index = alphabet.indexOf(char);
      if (index === -1) throw new Error(`Invalid character: ${char}`);
      let value = index;
      for (let j = 0; j < bytes.length; j++) {
        value = value * 58 + bytes[j];
        bytes[j] = value & 0xff;
        value = Math.floor(value / 256);
      }
      while (value > 0) {
        bytes.push(value & 0xff);
        value = Math.floor(value / 256);
      }
    }
    const leadingOnes = address.match(/^1+/);
    if (leadingOnes) {
      for (let i = 0; i < leadingOnes[0].length; i++) {
        bytes.push(0);
      }
    }
    return Buffer.from(bytes.reverse());
  }

  validateAddress(address) {
    try {
      if (address.startsWith('bitcoincash:')) {
        return (
          /^(bitcoincash:)?[qp][ac-hj-np-z02-9]{41}$/i.test(address) &&
          Boolean(this.cashAddrToLegacy(address))
        );
      }
      if (/^[qp][ac-hj-np-z02-9]{41}$/i.test(address)) {
        return Boolean(this.cashAddrToLegacy(address));
      }
      if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export default BitcoinCashChain;
