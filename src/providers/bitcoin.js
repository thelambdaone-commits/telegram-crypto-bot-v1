import * as bitcoin from "bitcoinjs-lib"
import * as bip39 from "bip39"
import BIP32Factory from "bip32"
import * as ecc from "tiny-secp256k1"
import ECPairFactoryModule from "ecpair"

import { BaseProvider } from "./base.provider.js";

const bip32 = BIP32Factory(ecc)
const ECPairFactory = ECPairFactoryModule.default || ECPairFactoryModule
const ECPair = ECPairFactory(ecc)

export class BitcoinChain extends BaseProvider {
  constructor(apiUrl) {
    super("Bitcoin", "BTC");
    this.apiUrl = apiUrl
    this.network = bitcoin.networks.bitcoin // mainnet
  }

  async createWallet() {
    const mnemonic = bip39.generateMnemonic()
    const seed = await bip39.mnemonicToSeed(mnemonic)
    const root = bip32.fromSeed(seed, this.network)

    // BIP84 path for native SegWit (bech32)
    const path = "m/84'/0'/0'/0/0"
    const child = root.derivePath(path)

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.network,
    })

    return {
      address,
      privateKey: child.toWIF(),
      mnemonic,
    }
  }

  async importFromSeed(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error("Invalid seed phrase")
    }

    const seed = await bip39.mnemonicToSeed(seedPhrase)
    const root = bip32.fromSeed(seed, this.network)

    // BIP84 path for native SegWit (bech32)
    const path = "m/84'/0'/0'/0/0"
    const child = root.derivePath(path)

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: this.network,
    })

    return {
      address,
      privateKey: child.toWIF(),
      mnemonic: seedPhrase,
    }
  }

  async importFromKey(privateKeyWif) {
    const keyPair = ECPair.fromWIF(privateKeyWif, this.network)

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    })

    return {
      address,
      privateKey: privateKeyWif,
      mnemonic: null,
    }
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== "BTC") return { balance: "0", symbol: tokenSymbol };
    // Multiple API fallbacks to avoid rate limiting
    const apis = [
      { url: `${this.apiUrl}/address/${address}`, type: "mempool" },
      { url: `https://blockstream.info/api/address/${address}`, type: "mempool" },
      { url: `https://blockchain.info/rawaddr/${address}?limit=0`, type: "blockchain" }
    ]
    
    for (const api of apis) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout
        
        const response = await fetch(api.url, {
          signal: controller.signal
        })
        clearTimeout(timeout)
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`)
        }
        
        const data = await response.json()
        
        let balanceSats
        if (api.type === "mempool") {
          balanceSats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
        } else if (api.type === "blockchain") {
          balanceSats = data.final_balance
        }
        
        const balanceBTC = balanceSats / 100000000

        return {
          balance: balanceBTC.toString(),
          balanceSats: balanceSats.toString(),
          symbol: this.symbol,
        }
      } catch (error) {
        // Try next API silently (don't spam logs)
        continue
      }
    }
    
    return {
      balance: "0",
      balanceSats: "0",
      symbol: this.symbol,
      error: "Unable to fetch balance - network issue"
    }
  }

  async getUtxos(address) {
    const apis = [
      { url: this.apiUrl, type: "mempool" },
      { url: "https://blockstream.info/api", type: "blockstream" },
      { url: "https://mempool.space/api", type: "mempool2" },
    ]
    
    for (const api of apis) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        
        const response = await fetch(`${api.url}/address/${address}/utxo`, {
          signal: controller.signal
        })
        clearTimeout(timeout)
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`)
        }
        
        return await response.json()
      } catch (error) {
        continue
      }
    }
    
    throw new Error("Unable to fetch UTXOs - all APIs failed")
  }

  async estimateFees(fromAddress, toAddress, amount) {
    const apis = [
      { url: this.apiUrl, type: "mempool" },
      { url: "https://mempool.space/api", type: "mempool2" },
    ]
    let feeEstimates = null
    
    for (const api of apis) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        
        const feeResponse = await fetch(`${api.url}/fee-estimates`, {
          signal: controller.signal
        })
        clearTimeout(timeout)
        
        if (feeResponse.ok) {
          feeEstimates = await feeResponse.json()
          break
        }
      } catch (error) {
        continue
      }
    }
    
    if (!feeEstimates) {
      feeEstimates = { "1": 20, "6": 10, "144": 2 }
    }

    let utxos = []
    try {
      utxos = await this.getUtxos(fromAddress)
    } catch (error) {
      utxos = [{}]
    }

    // Estimate transaction size (simplified)
    const inputCount = Math.max(1, Math.min(utxos.length, 5))
    const outputCount = 2 // recipient + change
    const txSize = inputCount * 68 + outputCount * 31 + 10 // P2WPKH estimation

    const fees = {
      slow: {
        satPerVbyte: Math.ceil(feeEstimates["144"] || 1),
        estimatedFee: (((feeEstimates["144"] || 1) * txSize) / 100000000).toFixed(8),
        estimatedFeeSats: Math.ceil((feeEstimates["144"] || 1) * txSize),
        confirmationBlocks: "~144 blocks (~24h)",
      },
      average: {
        satPerVbyte: Math.ceil(feeEstimates["6"] || 5),
        estimatedFee: (((feeEstimates["6"] || 5) * txSize) / 100000000).toFixed(8),
        estimatedFeeSats: Math.ceil((feeEstimates["6"] || 5) * txSize),
        confirmationBlocks: "~6 blocks (~1h)",
      },
      fast: {
        satPerVbyte: Math.ceil(feeEstimates["1"] || 10),
        estimatedFee: (((feeEstimates["1"] || 10) * txSize) / 100000000).toFixed(8),
        estimatedFeeSats: Math.ceil((feeEstimates["1"] || 10) * txSize),
        confirmationBlocks: "~1 block (~10m)",
      },
    }

    return fees
  }

  async sendTransaction(privateKeyWif, toAddress, amount, feeLevel = "average") {
    const keyPair = ECPair.fromWIF(privateKeyWif, this.network)
    const { address: fromAddress } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    })

    const utxos = await this.getUtxos(fromAddress)
    const fees = await this.estimateFees(fromAddress, toAddress, amount)
    const feeData = fees[feeLevel]

    const amountSats = Math.floor(Number.parseFloat(amount) * 100000000)
    const feeSats = feeData.estimatedFeeSats

    // Select UTXOs
    let totalInput = 0
    const selectedUtxos = []

    for (const utxo of utxos) {
      selectedUtxos.push(utxo)
      totalInput += utxo.value
      if (totalInput >= amountSats + feeSats) break
    }

    if (totalInput < amountSats + feeSats) {
      throw new Error("Insufficient balance")
    }

    const psbt = new bitcoin.Psbt({ network: this.network })

    // Add inputs
    for (const utxo of selectedUtxos) {
      const txHex = await fetch(`${this.apiUrl}/tx/${utxo.txid}/hex`).then((r) => r.text())

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: this.network }).output,
          value: utxo.value,
        },
      })
    }

    // Add outputs
    psbt.addOutput({
      address: toAddress,
      value: amountSats,
    })

    // Change output
    const change = totalInput - amountSats - feeSats
    if (change > 546) {
      // dust limit
      psbt.addOutput({
        address: fromAddress,
        value: change,
      })
    }

    // Sign all inputs
    for (let i = 0; i < selectedUtxos.length; i++) {
      psbt.signInput(i, keyPair)
    }

    psbt.finalizeAllInputs()
    const tx = psbt.extractTransaction()
    const txHex = tx.toHex()

    // Broadcast transaction
    const broadcastResponse = await fetch(`${this.apiUrl}/tx`, {
      method: "POST",
      body: txHex,
    })

    const txid = await broadcastResponse.text()

    return {
      hash: txid,
      from: fromAddress,
      to: toAddress,
      amount: amount.toString(),
      fee: feeData.estimatedFee,
      status: "broadcast",
    }
  }

  async getTransactionHistory(address, limit = 5) {
    try {
      const response = await fetch(`https://mempool.space/api/address/${address}/txs`)
      const data = await response.json()
      if (!Array.isArray(data)) return []
      return data.slice(0, limit).map(tx => {
        const isOut = tx.vin?.some(vin => vin.prevout?.scriptpubkey_address === address)
        let amount = 0
        for (const vout of tx.vout || []) {
          if (isOut && vout.scriptpubkey_address !== address) {
            amount += vout.value
          } else if (!isOut && vout.scriptpubkey_address === address) {
            amount += vout.value
          }
        }
        return {
          hash: tx.txid,
          type: isOut ? "out" : "in",
          amount: (amount / 1e8).toFixed(8),
          timestamp: (tx.status?.block_time || Date.now() / 1000) * 1000,
        }
      })
    } catch (error) {
      return []
    }
  }

  validateAddress(address) {
    try {
      bitcoin.address.toOutputScript(address, this.network)
      return true
    } catch {
      return false
    }
  }
}
