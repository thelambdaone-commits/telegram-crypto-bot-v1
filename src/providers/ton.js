/**
 * TON (The Open Network) provider — native Toncoin only (no jettons).
 *
 * Key model: TON uses ed25519 keys. To stay inside the bot's single-seed model
 * (one BIP39 mnemonic derives every non-Monero chain), we derive the TON keypair
 * from the BIP39 seed exactly like Solana does (`keyPairFromSeed(seed[0:32])`),
 * NOT from TON's native 24-word mnemonic. The stored private key is the 32-byte
 * ed25519 seed (hex); the full keypair is reconstructed for signing. Wallet
 * contract: WalletContractV4, workchain 0. Receiving address is the friendly,
 * non-bounceable `UQ…` form (the modern wallet convention).
 */
import * as bip39 from 'bip39';
import { keyPairFromSeed, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4, TonClient, internal, SendMode } from '@ton/ton';
import { Address, toNano, fromNano, beginCell, external, storeMessage } from '@ton/core';
import { BaseProvider } from './base.provider.js';
import { TransactionError, ERROR_CODES } from '../shared/errors.js';
import { uiToBaseUnits } from '../shared/amounts.js';
import { logger } from '../shared/logger.js';

const ADDR_OPTS = { bounceable: false, urlSafe: true };

export class TonChain extends BaseProvider {
  constructor(endpoint, apiKey = '') {
    super('TON', 'TON');
    this.endpoint = endpoint || 'https://toncenter.com/api/v2/jsonRPC';
    this.client = new TonClient({ endpoint: this.endpoint, apiKey: apiKey || undefined });
    // TonCenter limits: no key = 1 RPS, free key = 10 RPS, both with NO burst
    // allowance (docs.ton.org/.../toncenter/rate-limit). The balances screen
    // fetches wallets in parallel, so serialize with a gap that stays safely
    // under the limit (~8 RPS keyed, ~0.9 RPS keyless); retry backs it up.
    this._minGapMs = apiKey ? 120 : 1100;
    this._queue = Promise.resolve();
  }

  async _retry(fn, attempts = 4, baseMs = 400) {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const status = e?.response?.status || e?.status;
        const transient =
          status === 429 ||
          (status >= 500 && status < 600) ||
          /\b429\b|rate.?limit|too many|timeout|ECONNRESET|socket/i.test(e?.message || '');
        if (!transient || i >= attempts - 1) throw e;
        await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.floor(Math.random() * 200)));
      }
    }
  }

  /** Serialize a TonCenter call behind the queue (with min-gap) + retry. */
  _schedule(fn) {
    const result = this._queue.then(() => this._retry(fn));
    const gap = () => (this._minGapMs ? new Promise((r) => setTimeout(r, this._minGapMs)) : 0);
    this._queue = result.then(gap, gap);
    return result;
  }

  // ── key / wallet derivation ────────────────────────────────────────────────

  _walletFromSeed32(seed32) {
    const keyPair = keyPairFromSeed(seed32);
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    return { keyPair, wallet };
  }

  _result(seed32, wallet, mnemonic) {
    return {
      address: wallet.address.toString(ADDR_OPTS),
      privateKey: Buffer.from(seed32).toString('hex'),
      mnemonic,
    };
  }

  async createWallet() {
    const mnemonic = bip39.generateMnemonic();
    const seed = (await bip39.mnemonicToSeed(mnemonic)).slice(0, 32);
    const { wallet } = this._walletFromSeed32(seed);
    return this._result(seed, wallet, mnemonic);
  }

  async importFromSeed(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }
    const seed = (await bip39.mnemonicToSeed(seedPhrase)).slice(0, 32);
    const { wallet } = this._walletFromSeed32(seed);
    return this._result(seed, wallet, seedPhrase);
  }

  /**
   * Accepts either a TON 24-word mnemonic, or a raw ed25519 key in hex
   * (32-byte seed = 64 chars, or 64-byte secret key = 128 chars).
   */
  async importFromKey(privateKey) {
    const clean = String(privateKey).trim();
    let seed32;

    const words = clean.split(/\s+/);
    if (words.length === 24) {
      const kp = await mnemonicToPrivateKey(words);
      seed32 = Buffer.from(kp.secretKey).subarray(0, 32);
    } else {
      const hex = clean.startsWith('0x') ? clean.slice(2) : clean;
      if (!/^[0-9a-fA-F]+$/.test(hex) || (hex.length !== 64 && hex.length !== 128)) {
        throw new Error('Clé TON invalide : attendu 24 mots, ou hex 64/128 caractères.');
      }
      seed32 = Buffer.from(hex, 'hex').subarray(0, 32);
    }

    const { wallet } = this._walletFromSeed32(seed32);
    return { address: wallet.address.toString(ADDR_OPTS), privateKey: Buffer.from(seed32).toString('hex'), mnemonic: null };
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  async getBalance(address) {
    try {
      const addr = Address.parse(address); // sync: invalid address fails fast (not retried)
      const nano = await this._schedule(() => this.client.getBalance(addr));
      return {
        balance: fromNano(nano),
        balanceNano: nano.toString(),
        symbol: 'TON',
      };
    } catch (error) {
      throw new TransactionError('Unable to fetch balance - network issue', {
        code: ERROR_CODES.RPC_ERROR,
        chain: 'TON',
      });
    }
  }

  /**
   * TON fees for a simple transfer are tiny and roughly fixed (~0.005 TON). We
   * return a small conservative estimate per level so "send all" keeps a buffer
   * for the actual on-chain fee.
   */
  async estimateFees() {
    const mk = (ton) => ({ fee: Number(toNano(ton)), feeTON: ton, estimatedFee: ton });
    return { slow: mk('0.01'), average: mk('0.012'), fast: mk('0.015') };
  }

  async getTransactionHistory(address, limit = 5) {
    try {
      const txs = await this.client.getTransactions(Address.parse(address), { limit });
      return txs.map((tx) => {
        let type = 'tx';
        let amount = 0n;
        const inInfo = tx.inMessage?.info;
        if (tx.outMessages?.size > 0) {
          type = 'out';
          for (const [, m] of tx.outMessages) {
            if (m.info?.type === 'internal') amount += m.info.value.coins;
          }
        } else if (inInfo?.type === 'internal') {
          type = 'in';
          amount = inInfo.value.coins;
        }
        return {
          hash: tx.hash().toString('hex'),
          type,
          amount: amount > 0n ? Number(fromNano(amount)).toFixed(6) : '—',
          timestamp: Number(tx.now) * 1000,
        };
      });
    } catch (error) {
      logger.debug('[TON] history fetch failed', { error: error.message });
      return [];
    }
  }

  // ── send ─────────────────────────────────────────────────────────────────

  async sendTransaction(privateKey, toAddress, amount, _feeLevel = 'average') {
    if (!this.validateAddress(toAddress)) {
      throw new TransactionError('Adresse TON invalide', {
        code: ERROR_CODES.VALIDATION_ERROR || 'VALIDATION_ERROR',
        chain: 'TON',
      });
    }
    // Montant UI → nanotons (9 décimales) en entier, sans flottant ni notation
    // scientifique (que toNano() rejette), avec troncature vers le bas.
    const value = uiToBaseUnits(amount, 9);
    if (value <= 0n) {
      throw new TransactionError('Montant inférieur au minimum transférable (1 nanoton)', {
        code: ERROR_CODES.INVALID_AMOUNT,
        chain: 'TON',
      });
    }

    const seed32 = Buffer.from(privateKey, 'hex').subarray(0, 32);
    const { keyPair, wallet } = this._walletFromSeed32(seed32);
    const opened = this.client.open(wallet);

    try {
      const seqno = await opened.getSeqno();
      const body = wallet.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
        messages: [internal({ to: Address.parse(toAddress), value, bounce: false })],
      });

      // Build the exact external message we broadcast so the returned hash is the
      // canonical one explorers index (include stateInit only when undeployed).
      const ext = external({ to: wallet.address, init: seqno === 0 ? wallet.init : undefined, body });
      const boc = beginCell().store(storeMessage(ext)).endCell();
      await this.client.sendFile(boc.toBoc());

      return {
        hash: boc.hash().toString('hex'),
        from: wallet.address.toString(ADDR_OPTS),
        to: toAddress,
        amount: String(amount),
        symbol: 'TON',
        status: 'success',
      };
    } catch (error) {
      let code = ERROR_CODES.BROADCAST_FAILED;
      if (/insufficient|not enough/i.test(error.message)) code = ERROR_CODES.INSUFFICIENT_FUNDS;
      throw new TransactionError(error.message, { code, chain: 'TON', details: error });
    }
  }

  validateAddress(address) {
    const s = String(address || '').trim();
    if (!s) return false;
    try {
      // Friendly form (UQ/EQ/kQ/0Q): reject testnet-encoded addresses on mainnet.
      return !Address.parseFriendly(s).isTestOnly;
    } catch {
      // Raw form (0:<hex>) is network-agnostic — accept if it parses.
      try {
        Address.parseRaw(s);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export default TonChain;
