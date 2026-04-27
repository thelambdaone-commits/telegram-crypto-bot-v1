import { ECPairFactory } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";

import { BaseProvider } from "./base.provider.js";

const ECPair = ECPairFactory(tinysecp);

const LTC_NETWORK = {
  messagePrefix: "\x18Bitcoin Signed Message:\n",
  bech32: "ltc",
  bip32: {
    public: 0x019d9cfe,
    private: 0x019d9c6e,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
  coinType: 2,
};

export class LitecoinChain extends BaseProvider {
  constructor(apiUrl = null) {
    super("Litecoin", "LTC");
    this.apiUrl = apiUrl || "https://mempool.space/api/litecoin";
    this.network = LTC_NETWORK;
  }

  async createWallet() {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
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
    const { address } = bitcoin.payments.p2wpkh({
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
    if (tokenSymbol && tokenSymbol.toUpperCase() !== "LTC") return { balance: "0", symbol: tokenSymbol };
    const apis = [this.apiUrl, "https://mempool.space/api/litecoin"];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${api}/address/${address}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }

        const data = await response.json();
        const chainStats = data.chain_stats || data;

        return {
          balance: (chainStats.funded_txo_sum - chainStats.spent_txo_sum) / 100000000,
          balanceSats: (chainStats.funded_txo_sum - chainStats.spent_txo_sum).toString(),
          symbol: this.symbol,
        };
      } catch (error) {
        continue;
      }
    }

    return {
      balance: "0",
      balanceSats: "0",
      symbol: this.symbol,
      error: "Unable to fetch balance",
    };
  }

  async getUtxos(address) {
    const apis = [this.apiUrl, "https://mempool.space/api/litecoin"];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${api}/address/${address}/utxo`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  async estimateFees(fromAddress, toAddress, amount) {
    const apis = [this.apiUrl, "https://mempool.space/api/litecoin"];
    let feeEstimates = null;

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const feeResponse = await fetch(`${api}/fee-estimates`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (feeResponse.ok) {
          feeEstimates = await feeResponse.json();
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!feeEstimates) {
      feeEstimates = { "1": 1, "6": 0.5, "144": 0.1 };
    }

    let utxos = [];
    try {
      utxos = await this.getUtxos(fromAddress);
    } catch (error) {
      utxos = [{}];
    }

    const avgFeeRate = feeEstimates["6"] || 1;
    const txVbytes = 140 + utxos.length * 50;
    const estimatedFee = avgFeeRate * txVbytes;

    return {
      slow: { fee: estimatedFee.toFixed(0), feeSats: Math.floor(estimatedFee).toString() },
      average: { fee: (estimatedFee * 1.5).toFixed(0), feeSats: Math.floor(estimatedFee * 1.5).toString() },
      fast: { fee: (estimatedFee * 2).toFixed(0), feeSats: Math.floor(estimatedFee * 2).toString() },
      feeRate: avgFeeRate,
    };
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = "average") {
    const keyPair = ECPair.fromWIF(privateKey, this.network);
    const utxos = await this.getUtxos(keyPair.publicKey.toString());
    const fees = await this.estimateFees(keyPair.publicKey.toString(), toAddress, amount);

    const feeRate = fees[feeLevel]?.fee || fees.average.fee;

    const psbt = new bitcoin.Psbt({ network: this.network });

    for (const utxo of utxos) {
      const txHexResponse = await fetch(`${this.apiUrl}/tx/${utxo.txid}/hex`);
      const txHex = await txHexResponse.text();

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(txHex, "hex"),
      });
    }

    const amountSats = Math.floor(amount * 100000000);
    const feeSats = Math.floor(parseFloat(feeRate));

    psbt.addOutput({
      address: toAddress,
      value: amountSats,
    });

    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    if (totalInput > amountSats + feeSats) {
      psbt.addOutput({
        address: keyPair.publicKey.toString(),
        value: totalInput - amountSats - feeSats,
      });
    }

    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();

    const response = await fetch(`${this.apiUrl}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: txHex,
    });

    if (!response.ok) {
      throw new Error("Failed to broadcast transaction");
    }

    const txId = await response.text();

    return {
      hash: txId,
      from: keyPair.publicKey.toString(),
      to: toAddress,
      amount: amount.toString(),
      fee: (feeSats / 100000000).toString(),
      blockNumber: 0,
      status: "success",
    };
  }

  validateAddress(address) {
    try {
      if (address.startsWith("ltc1")) {
        return true;
      }
      if (/^[LM][a-km-zA-HJ-NP-Z1-9]{25,33}$/.test(address)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export default LitecoinChain;