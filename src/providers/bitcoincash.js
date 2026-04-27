import { ECPairFactory } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";

import { BaseProvider } from "./base.provider.js";

const ECPair = ECPairFactory(tinysecp);

const BCH_NETWORK = {
  messagePrefix: "\x18Bitcoin Signed Message:\n",
  bech32: "bitcoincash",
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
    super("Bitcoin Cash", "BCH");
    this.apiUrl = apiUrl || "https://api.blockchain.info/bch/stats";
    this.network = BCH_NETWORK;
    this.explorerApi = "https://blockchain.info";
  }

  toLegacyAddress(cashAddr) {
    try {
      return bitcoin.address.fromBase58Check(
        bitcoin.address.toBase58Check(
          Buffer.from(cashAddr.replace("bitcoincash:", ""), "hex"),
          0x00
        )
      ).toString("hex");
    } catch {
      return null;
    }
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
      publicKey: keyPair.publicKey.toString("hex"),
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
      publicKey: keyPair.publicKey.toString("hex"),
    };
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== "BCH") return { balance: "0", symbol: tokenSymbol };
    try {
      let lookupAddress = address;
      if (address.startsWith("bitcoincash:")) {
        const base58 = address.replace("bitcoincash:", "");
        lookupAddress = this.base58ToLegacy(base58);
      }

      const response = await fetch(
        `https://api.blockchain.info/bch/addr/${lookupAddress}/balance`
      );

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
      return {
        balance: "0",
        balanceSats: "0",
        symbol: this.symbol,
        error: error.message,
      };
    }
  }

  base58ToLegacy(base58) {
    try {
      const decoded = this.base58Decode(base58);
      return "1" + decoded.slice(0, -4);
    } catch {
      return base58;
    }
  }

  base58Decode(address) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = [];
    for (let i = 0; i < address.length; i++) {
      const char = address[address.length - 1 - i];
      const index = alphabet.indexOf(char);
      if (index === -1) throw new Error("Invalid base58");
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
    return Buffer.from(num.reverse()).toString("hex");
  }

  async getUtxos(address) {
    try {
      let lookupAddress = address;
      if (address.startsWith("bitcoincash:")) {
        const base58 = address.replace("bitcoincash:", "");
        lookupAddress = this.base58ToLegacy(base58);
      }

      const response = await fetch(
        `https://api.blockchain.info/bch/addr/${lookupAddress}/utxo`
      );

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async estimateFees(fromAddress, toAddress, amount) {
    const feePerByte = 1;
    const estimatedFee = 0.00001;

    return {
      slow: { estimatedFee: (estimatedFee * 0.5).toString(), feeSats: Math.floor(estimatedFee * 0.5 * 100000000).toString() },
      average: { estimatedFee: estimatedFee.toString(), feeSats: Math.floor(estimatedFee * 100000000).toString() },
      fast: { estimatedFee: (estimatedFee * 2).toString(), feeSats: Math.floor(estimatedFee * 2 * 100000000).toString() },
      feeRate: feePerByte,
    };
  }

  async broadcastTransaction(txHex) {
    const apis = [
      { url: "https://api.blockchain.info/pushtx", method: "POST" },
      { url: "https://blockchain.info/pushtx", method: "POST" },
    ];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(api.url, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: txHex,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const result = await response.text();
          if (result.includes("txid") || result.length >= 64) {
            return result;
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Broadcast failed - all APIs unavailable");
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = "average") {
    try {
      const keyPair = ECPair.fromWIF(privateKey, this.network);
      const fromAddress = keyPair.publicKey.toString();

      const utxos = await this.getUtxos(fromAddress);

      if (!utxos || utxos.length === 0) {
        throw new Error("No UTXOs available");
      }

      const fees = await this.estimateFees(fromAddress, toAddress, amount);
      const feeRate = fees[feeLevel]?.feeSats || fees.average.feeSats;
      const feeSats = parseInt(feeRate);
      const amountSats = Math.floor(amount * 100000000);

      const tx = new bitcoin.Transaction();
      tx.version = 1;

      let totalInput = 0;
      for (const utxo of utxos) {
        tx.addInput(Buffer.from(utxo.txHash, "hex").reverse(), utxo.index);
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
        fee: (feeSats / 100000000).toString(),
        blockNumber: 0,
        status: "success",
      };
    } catch (error) {
      return {
        hash: "failed",
        from: "",
        to: toAddress,
        amount: amount.toString(),
        fee: "0.00001",
        blockNumber: 0,
        status: "failed",
        error: error.message,
      };
    }
  }

  base58ToBytes(address) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
      if (address.startsWith("bitcoincash:")) {
        return address.replace("bitcoincash:", "").length >= 42;
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