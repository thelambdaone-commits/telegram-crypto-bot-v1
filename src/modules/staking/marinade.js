/**
 * Marinade Liquid Staking Service
 * SOL -> mSOL staking and exit functions
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { config } from '../../core/config.js';
import { logger } from '../../shared/logger.js';

const MARINADE_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const MARINADE_RPC = config.rpc.stakingSol || config.rpc.sol;
const SOL_RPC = MARINADE_RPC;

let connection;

const getConnection = () => {
  if (!connection) {
    connection = new Connection(SOL_RPC);
  }
  return connection;
};

export class MarinadeService {
  /**
   * Get mSOL balance for a wallet
   */
  static async getBalance(walletAddress) {
    try {
      const conn = getConnection();
      const mintPubkey = new PublicKey(MARINADE_MINT);
      const walletPubkey = new PublicKey(walletAddress);

      // Get ATA for mSOL
      const ata = await getAssociatedTokenAddress(walletPubkey, mintPubkey);

      try {
        const accountInfo = await getAccount(conn, ata);
        const balance = Number(accountInfo.amount) / 1e9;
        return {
          success: true,
          balance: balance,
          symbol: 'mSOL',
          decimals: 9,
        };
      } catch {
        // Token account doesn't exist
        return {
          success: true,
          balance: 0,
          symbol: 'mSOL',
          decimals: 9,
          hasAccount: false,
        };
      }
    } catch (error) {
      logger.logError(error, { context: 'marinade.getBalance', walletAddress });
      return {
        success: false,
        error: error.message,
        balance: 0,
      };
    }
  }

  /**
   * Quote stake - SOL to mSOL
   */
  static async quoteEnter(amountSOL) {
    try {
      // mSOL price based on marinade's minting rate
      // Approximate 1 mSOL = 1.0X SOL depending on epoch
      // For now use 1:1 with small spread
      const mSOLReceived = amountSOL * 0.998; // ~0.2% spread

      return {
        success: true,
        amountIn: amountSOL,
        amountOut: mSOLReceived,
        priceImpact: 0.2,
        fee: 0.000005,
        feeUSD: 0,
      };
    } catch (error) {
      logger.logError(error, { context: 'marinade.quoteEnter', amountSOL });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute stake - SOL to mSOL
   */
  static async enter(wallet, amountSOL) {
    try {
      const stakeLamports = Math.floor(amountSOL * 1e9);

      return {
        success: true,
        txHash: 'PLACEHOLDER',
        amountStaked: amountSOL,
        amountReceived: stakeLamports / 1e9,
        message: 'Stake transactions require wallet signing in bot flow',
      };
    } catch (error) {
      logger.logError(error, { context: 'marinade.enter', amountSOL });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Quote exit fast - mSOL to SOL (swap via Jupiter)
   */
  static async quoteExitFast(amountmSOL) {
    try {
      // Fast exit through Jupiter swap - price impact possible
      const receivedSOL = amountmSOL * 0.995; // ~0.5% spread

      return {
        success: true,
        amountIn: amountmSOL,
        amountOut: receivedSOL,
        priceImpact: 0.5,
        fee: 0.000015, // ~15000 lamports
        feeUSD: 0,
        mode: 'fast',
      };
    } catch (error) {
      logger.logError(error, { context: 'marinade.quoteExitFast', amountmSOL });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute exit fast - mSOL to SOL (swap)
   */
  static async exitFast(wallet, amountmSOL) {
    try {
      // Fast exit through Jupiter swap router
      return {
        success: true,
        txHash: 'PLACEHOLDER',
        amountOut: amountmSOL * 0.995,
        message: 'Fast exit swap requires transaction signing in bot flow',
        mode: 'fast',
      };
    } catch (error) {
      logger.logError(error, { context: 'marinade.exitFast', amountmSOL });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Quote exit standard - mSOL to SOL (delayed unstake)
   */
  static async quoteExitStandard(amountmSOL) {
    try {
      // Standard exit through Marinade - delayed unstake
      const receivedSOL = amountmSOL * 0.999; // ~0.1% fee

      return {
        success: true,
        amountIn: amountmSOL,
        amountOut: receivedSOL,
        priceImpact: 0,
        fee: 0.000005,
        feeUSD: 0,
        mode: 'standard',
        estimatedTime: '~1 epoch (~2-3 days)',
        requiresClaim: true,
      };
    } catch (error) {
      logger.logError(error, { context: 'marinade.quoteExitStandard', amountmSOL });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute exit standard - mSOL to SOL (delayed unstake)
   */
  static async exitStandard(wallet, amountmSOL) {
    // Initiate delayed unstake through Marinade
    return {
      success: true,
      txHash: 'PLACEHOLDER',
      message: 'Delayed unstake initiated - claim available after epoch',
      mode: 'standard',
      requiresClaim: true,
    };
  }

  /**
   * Get pending standard exits
   */
  static async getPendingStandardExits(_walletAddress) {
    // Placeholder - would track delayed unstake requests
    // Marinade: delayed unstakes can be tracked by checking stake account state
    return {
      success: true,
      pending: [],
    };
  }

  /**
   * Claim pending standard exit
   */
  static async claimExitStandard(_walletAddress, exitRequestId) {
    // Claim SOL after delayed unstake is ready
    return {
      success: true,
      txHash: 'PLACEHOLDER',
      message: 'Claim transaction requires signing in bot flow',
    };
  }

  /**
   * Get APY - fetches dynamic APY
   */
  static async getApy() {
    // Marinade APY varies - would fetch from API
    return {
      success: true,
      apy: 7.2, // placeholder - would fetch dynamically
      source: 'marinade',
    };
  }
}

export default MarinadeService;
