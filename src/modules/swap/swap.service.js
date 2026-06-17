/**
 * SwapService — Phase 1: EVM token/native quoting via a keyless aggregator
 * (KyberSwap). Token addresses/decimals come from the single TOKEN_CONFIGS
 * registry; native coins use the aggregator's native sentinel.
 *
 * SAFETY: getQuote is read-only. executeSwap is gated behind config.swapEnabled
 * and is NOT wired to any Telegram handler yet (Phase 2 adds the confirmation
 * UI, allowance/approve flow, slippage display and rate/volume guards before it
 * can ever sign a transaction).
 */
import { parseUnits, formatUnits } from 'ethers';
import { config } from '../../core/config.js';
import { getTokenConfig, getNativeSymbol } from '../../core/tokens.config.js';
import { CHAIN_REGISTRY } from '../../shared/chains.js';
import * as kyber from './aggregators/kyber.aggregator.js';

const NATIVE_DECIMALS = 18; // all supported EVM native coins use 18 decimals

export class SwapService {
  constructor(walletService, aggregator = kyber) {
    this.walletService = walletService;
    this.aggregator = aggregator;
  }

  isSupported(chain) {
    return this.aggregator.isSwapSupported(chain);
  }

  /**
   * Resolve a chain + asset symbol to an on-chain address + decimals.
   * Native coin → aggregator sentinel; token → TOKEN_CONFIGS entry.
   */
  _resolveAsset(chain, symbol) {
    const sym = String(symbol || '').toUpperCase();
    if (sym === getNativeSymbol(chain).toUpperCase()) {
      return { address: kyber.NATIVE_SENTINEL, decimals: NATIVE_DECIMALS, native: true };
    }
    const token = getTokenConfig(chain, sym);
    if (!token?.address) {
      throw new Error(`Token ${sym} introuvable sur ${chain.toUpperCase()}`);
    }
    return { address: token.address, decimals: token.decimals, native: false };
  }

  /**
   * Read-only quote. Returns the input/output amounts (human-readable) plus the
   * opaque routeSummary needed to build the swap later.
   */
  async getQuote(chain, fromSymbol, toSymbol, amountHuman) {
    if (!CHAIN_REGISTRY[chain]?.evm) throw new Error(`Swaps EVM uniquement (pas ${chain})`);
    if (!this.isSupported(chain)) throw new Error(`Swaps non supportés sur ${chain.toUpperCase()}`);

    const from = this._resolveAsset(chain, fromSymbol);
    const to = this._resolveAsset(chain, toSymbol);
    if (from.address.toLowerCase() === to.address.toLowerCase()) {
      throw new Error('Les deux actifs sont identiques');
    }

    const amount = Number.parseFloat(String(amountHuman).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');

    const amountInWei = parseUnits(amount.toString(), from.decimals).toString();
    const quote = await this.aggregator.getQuote({
      chain,
      tokenIn: from.address,
      tokenOut: to.address,
      amountInWei,
    });

    return {
      chain,
      fromSymbol: fromSymbol.toUpperCase(),
      toSymbol: toSymbol.toUpperCase(),
      amountIn: amount,
      amountOut: Number(formatUnits(quote.amountOut, to.decimals)),
      amountOutRaw: quote.amountOut,
      routeSummary: quote.routeSummary,
      routerAddress: quote.routerAddress,
      from,
      to,
    };
  }

  /**
   * Execute a swap from the user's wallet. HARD-GATED behind config.swapEnabled.
   * Flow: quote → (ERC-20 approve if allowance insufficient) → build calldata →
   * sign+send via the provider. Native input needs no approval.
   *
   * @param {number} chatId
   * @param {string} walletId  the user's wallet on the swap chain
   * @param {string} fromSymbol
   * @param {string} toSymbol
   * @param {number|string} amountHuman
   * @param {{ slippageBps?: number }} [opts]
   */
  async executeSwap(chatId, walletId, fromSymbol, toSymbol, amountHuman, { slippageBps = 50 } = {}) {
    if (!config.swapEnabled) {
      throw new Error('Les swaps sont désactivés (SWAP_ENABLED=false).');
    }

    const full = await this.walletService.storage.getWalletWithKey(chatId, walletId);
    if (!full || full.isCorrupted || !full.privateKey) {
      throw new Error('Wallet introuvable ou corrompu');
    }
    const chain = full.chain;
    const quote = await this.getQuote(chain, fromSymbol, toSymbol, amountHuman);
    const provider = this.walletService.chains[chain];
    const amountInWei = parseUnits(quote.amountIn.toString(), quote.from.decimals);

    // ERC-20 inputs must approve the aggregator router first (native: skip).
    if (!quote.from.native) {
      const allowance = await provider.getTokenAllowance(
        full.address,
        quote.routerAddress,
        quote.from.address
      );
      if (BigInt(allowance) < amountInWei) {
        await provider.approveSpender(
          full.privateKey,
          quote.from.address,
          quote.routerAddress,
          amountInWei
        );
      }
    }

    const built = await this.aggregator.buildSwapTx({
      chain,
      routeSummary: quote.routeSummary,
      sender: full.address,
      recipient: full.address,
      slippageBps,
    });

    const result = await provider.sendRaw(full.privateKey, {
      to: built.to,
      data: built.data,
      value: built.value,
    });

    return {
      ...result,
      chain,
      fromSymbol: quote.fromSymbol,
      toSymbol: quote.toSymbol,
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
    };
  }
}
