/**
 * Tron (TRX + TRC-20) provider.
 *
 * Uses tronweb for key derivation, signing and broadcast. TRC-20 token
 * metadata (USDT/USDC) comes from the single TOKEN_CONFIGS registry, so the
 * contract addresses are the same officially-verified, test-locked values used
 * everywhere else. Account derivation follows BIP-44 coin type 195
 * (tronweb's default for fromMnemonic).
 */
import { TronWeb } from 'tronweb';
import * as bip39 from 'bip39';
import { BaseProvider } from './base.provider.js';
import { getAllTokensForChain } from '../core/tokens.config.js';

const DEFAULT_HOST = 'https://api.trongrid.io';
// Generous cap so token transfers never fail for lack of energy; only the
// energy/bandwidth actually consumed is charged.
const TRC20_FEE_LIMIT_SUN = 100_000_000; // 100 TRX

export class TronChain extends BaseProvider {
  constructor(apiUrl = null, apiKey = '') {
    super('Tron', 'TRX');
    this.apiUrl = apiUrl || DEFAULT_HOST;
    this.apiKey = apiKey || '';
    this.tokens = getAllTokensForChain('trx');
    // Without an API key, serialize TronGrid calls with a gap so the parallel
    // balances screen doesn't trip the public rate limit (→ "Erreur de
    // récupération"). With a key, no throttle is needed.
    this._minGapMs = this.apiKey ? 0 : 350;
    this._queue = Promise.resolve();
  }

  /** Serialize a TronGrid call behind the queue (with min-gap) + 429 retry. */
  _schedule(fn) {
    const result = this._queue.then(() => this._retry(fn));
    const gap = () => (this._minGapMs ? new Promise((r) => setTimeout(r, this._minGapMs)) : 0);
    this._queue = result.then(gap, gap);
    return result;
  }

  _client(privateKey = null) {
    const opts = { fullHost: this.apiUrl };
    if (this.apiKey) opts.headers = { 'TRON-PRO-API-KEY': this.apiKey };
    if (privateKey) opts.privateKey = privateKey.replace(/^0x/, '');
    return new TronWeb(opts);
  }

  _token(symbol) {
    return this.tokens[String(symbol || '').toUpperCase()] || null;
  }

  async createWallet() {
    const mnemonic = bip39.generateMnemonic();
    const acc = TronWeb.fromMnemonic(mnemonic);
    return {
      address: acc.address,
      privateKey: acc.privateKey.replace(/^0x/, ''),
      publicKey: acc.publicKey,
      mnemonic,
    };
  }

  async importFromSeed(seedPhrase) {
    const mnemonic = String(seedPhrase || '').trim();
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Seed phrase invalide');
    }
    const acc = TronWeb.fromMnemonic(mnemonic);
    return {
      address: acc.address,
      privateKey: acc.privateKey.replace(/^0x/, ''),
      publicKey: acc.publicKey,
      mnemonic,
    };
  }

  async importFromKey(privateKey) {
    const pk = String(privateKey || '').trim().replace(/^0x/, '');
    const address = TronWeb.address.fromPrivateKey(pk);
    if (!address) {
      throw new Error('Clé privée Tron invalide');
    }
    return { address, privateKey: pk, publicKey: null };
  }

  /**
   * Retry a TronGrid call on HTTP 429. The public endpoint rate-limits hard
   * (~a few req/s) and the balances screen fetches every wallet in parallel, so
   * without an API key multiple TRX wallets would 429 → "Erreur de récupération".
   * Exponential backoff + jitter staggers the retries past the rate window.
   */
  async _retry(fn, attempts = 4, baseMs = 300) {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const status = e?.response?.status || e?.status;
        const is429 = status === 429 || /\b429\b|rate.?limit|too many/i.test(e?.message || '');
        if (!is429 || i >= attempts - 1) throw e;
        await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.floor(Math.random() * 150)));
      }
    }
  }

  async getBalance(address, tokenSymbol = null) {
    const sym = String(tokenSymbol || 'TRX').toUpperCase();
    const tw = this._client();

    if (sym !== 'TRX') {
      const token = this._token(sym);
      if (!token) return { balance: '0', symbol: tokenSymbol };
      tw.setAddress(address);
      const contract = await tw.contract().at(token.address);
      const raw = await this._schedule(() => contract.balanceOf(address).call());
      const balance = Number(raw.toString()) / 10 ** token.decimals;
      return { balance, symbol: sym };
    }

    const sun = await this._schedule(() => tw.trx.getBalance(address));
    return { balance: sun / 1e6, balanceSun: String(sun), symbol: 'TRX' };
  }

  async estimateFees(_fromAddress, _toAddress, _amount, tokenSymbol = null) {
    const isToken = String(tokenSymbol || 'TRX').toUpperCase() !== 'TRX';
    // Tron charges bandwidth/energy, not a gas price. These are practical
    // upper-bound estimates in TRX for a non-staked account.
    const est = isToken ? 27 : 1.1;
    const fee = est.toFixed(2);
    return {
      slow: { fee },
      average: { fee },
      fast: { fee },
      feeNote: isToken
        ? "Frais en énergie/bande passante (~27 TRX si le compte n'est pas staké)"
        : '~1.1 TRX (bande passante)',
    };
  }

  async sendTransaction(privateKey, toAddress, amount, _feeLevel = 'average', tokenSymbol = null) {
    const pk = String(privateKey || '').replace(/^0x/, '');
    const tw = this._client(pk);
    const from = tw.defaultAddress.base58;
    const sym = String(tokenSymbol || 'TRX').toUpperCase();

    if (!TronWeb.isAddress(toAddress)) {
      throw new Error('Adresse de destination Tron invalide');
    }

    if (sym !== 'TRX') {
      const token = this._token(sym);
      if (!token) throw new Error(`Token TRC-20 non supporté: ${sym}`);
      const contract = await tw.contract().at(token.address);
      const value = BigInt(Math.round(Number(amount) * 10 ** token.decimals)).toString();
      const hash = await contract
        .transfer(toAddress, value)
        .send({ feeLimit: TRC20_FEE_LIMIT_SUN });
      return {
        hash,
        from,
        to: toAddress,
        amount: String(amount),
        symbol: sym,
        status: 'success',
      };
    }

    const sun = Math.round(Number(amount) * 1e6);
    const result = await tw.trx.sendTransaction(toAddress, sun);
    const hash = result?.txid || result?.transaction?.txID;
    if (!hash || result?.result === false) {
      throw new Error(result?.message || 'Échec de la transaction Tron');
    }
    return {
      hash,
      from,
      to: toAddress,
      amount: String(amount),
      symbol: 'TRX',
      status: 'success',
    };
  }

  async getTransactionHistory(address, limit = 10) {
    const headers = this.apiKey ? { 'TRON-PRO-API-KEY': this.apiKey } : {};
    const url = `${this.apiUrl}/v1/accounts/${address}/transactions?limit=${limit}&only_confirmed=true`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];

      const json = await res.json();
      const txs = json.data || [];
      return txs.map((t) => {
        const contract = t.raw_data?.contract?.[0];
        const value = contract?.parameter?.value || {};
        const isTrxTransfer = contract?.type === 'TransferContract';
        const amount = isTrxTransfer ? (value.amount || 0) / 1e6 : null;
        return {
          hash: t.txID,
          from: value.owner_address ? TronWeb.address.fromHex(value.owner_address) : null,
          to: value.to_address ? TronWeb.address.fromHex(value.to_address) : null,
          amount: amount != null ? String(amount) : '0',
          symbol: 'TRX',
          timestamp: t.block_timestamp,
          status: t.ret?.[0]?.contractRet === 'SUCCESS' ? 'success' : 'failed',
        };
      });
    } catch {
      return [];
    }
  }

  validateAddress(address) {
    try {
      return TronWeb.isAddress(address);
    } catch {
      return false;
    }
  }
}

export default TronChain;
