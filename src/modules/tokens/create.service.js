/**
 * Token Create Service - V1
 * Create SPL tokens on Solana using @solana/spl-token
 * 
 * Low cost V1: wallet, decimals, supply, optional revoke mint authority
 */

import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { config } from "../../core/config.js";

const connection = new Connection(config.rpc.sol, "confirmed");

export const TokenService = {
  /**
   * Create a new SPL token mint
   * @param {string} payerPrivateKey - Hex or Base64 private key of the payer
   * @param {number} decimals - Token decimals (0-9)
   * @returns {Promise<{success: boolean, mint?: PublicKey, error?: string}>}
   */
  async createMint(payerPrivateKey, decimals) {
    try {
      console.log("[TOKEN_SERVICE] createMint - key length:", payerPrivateKey?.length);
      
      let keypair;
      // Try hex first (most common), then base64
      if (payerPrivateKey.length === 64) {
        // Hex format (64 chars)
        const secretKey = Buffer.from(payerPrivateKey, "hex");
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        // Base64 or other
        const secretKey = Buffer.from(payerPrivateKey, "base64");
        keypair = Keypair.fromSecretKey(secretKey);
      }

      console.log("[TOKEN_SERVICE] Keypair created, pubkey:", keypair.publicKey.toString());

      const mint = await createMint(
        connection,
        keypair,
        keypair.publicKey,
        keypair.publicKey,
        decimals
      );

      return {
        success: true,
        mint: mint,
      };
    } catch (error) {
      console.error("[TOKEN_SERVICE] createMint error:", error);
      return {
        success: false,
        error: error.message || "Failed to create mint",
      };
    }
  },

  /**
   * Create or get Associated Token Account
   * @param {string} payerPrivateKey - Hex or Base64 private key of the payer
   * @param {string} mintAddress - Mint address (base58)
   * @param {string} ownerAddress - Owner of the ATA
   * @returns {Promise<{success: boolean, ata?: PublicKey, error?: string}>}
   */
  async createATA(payerPrivateKey, mintAddress, ownerAddress) {
    try {
      let keypair;
      if (payerPrivateKey.length === 64) {
        const secretKey = Buffer.from(payerPrivateKey, "hex");
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        const secretKey = Buffer.from(payerPrivateKey, "base64");
        keypair = Keypair.fromSecretKey(secretKey);
      }
      
      const mint = new PublicKey(mintAddress);
      const owner = new PublicKey(ownerAddress);

      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mint,
        owner
      );

      return {
        success: true,
        ata: ata.address,
      };
    } catch (error) {
      console.error("[TOKEN_SERVICE] createATA error:", error);
      return {
        success: false,
        error: error.message || "Failed to create ATA",
      };
    }
  },

  /**
   * Mint tokens to an address
   * @param {string} payerPrivateKey - Hex or Base64 private key
   * @param {string} mintAddress - Mint address
   * @param {string} destinationAddress - Destination ATA
   * @param {number} amount - Amount in tokens (not lamports)
   * @param {number} decimals - Token decimals
   * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
   */
  async mintTo(payerPrivateKey, mintAddress, destinationAddress, amount, decimals) {
    try {
      let keypair;
      if (payerPrivateKey.length === 64) {
        const secretKey = Buffer.from(payerPrivateKey, "hex");
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        const secretKey = Buffer.from(payerPrivateKey, "base64");
        keypair = Keypair.fromSecretKey(secretKey);
      }
      
      const mint = new PublicKey(mintAddress);
      const destination = new PublicKey(destinationAddress);

      const amountInLamports = amount * Math.pow(10, decimals);

      const txHash = await mintTo(
        connection,
        keypair,
        mint,
        destination,
        keypair.publicKey,
        amountInLamports
      );

      return {
        success: true,
        txHash: txHash,
      };
    } catch (error) {
      console.error("[TOKEN_SERVICE] mintTo error:", error);
      return {
        success: false,
        error: error.message || "Failed to mint tokens",
      };
    }
  },

  /**
   * Revoke mint authority (make supply fixed)
   * @param {string} payerPrivateKey - Hex or Base64 private key
   * @param {string} mintAddress - Mint address
   * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
   */
  async revokeMintAuthority(payerPrivateKey, mintAddress) {
    try {
      let keypair;
      if (payerPrivateKey.length === 64) {
        const secretKey = Buffer.from(payerPrivateKey, "hex");
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        const secretKey = Buffer.from(payerPrivateKey, "base64");
        keypair = Keypair.fromSecretKey(secretKey);
      }
      
      const mint = new PublicKey(mintAddress);

      const txHash = await setAuthority(
        connection,
        keypair,
        mint,
        keypair.publicKey,
        AuthorityType.MintTokens,
        null
      );

      return {
        success: true,
        txHash: txHash,
      };
    } catch (error) {
      console.error("[TOKEN_SERVICE] revokeMintAuthority error:", error);
      return {
        success: false,
        error: error.message || "Failed to revoke mint authority",
      };
    }
  },

  /**
   * Estimate real costs dynamically
   * @returns {Promise<{mintRent: number, ataRent: number, networkFeeEstimate: number, totalEstimate: number}>}
   */
  async estimateRealCost() {
    try {
      const mintRent = await connection.getMinimumBalanceForRentExemption(40);
      const ataRent = await connection.getMinimumBalanceForRentExemption(165);

      const recentFees = await connection.getRecentBlockhash();
      const feePerTx = recentFees.value.lamportsPerSignature * 5000;
      const networkFeeEstimate = feePerTx * 3;

      const totalEstimate = mintRent + ataRent + networkFeeEstimate;

      return {
        mintRent: mintRent / 1e9,
        ataRent: ataRent / 1e9,
        networkFeeEstimate: networkFeeEstimate / 1e9,
        totalEstimate: totalEstimate / 1e9,
      };
    } catch (error) {
      console.error("[TOKEN_SERVICE] estimateRealCost error:", error);
      return {
        mintRent: 0.002,
        ataRent: 0.002,
        networkFeeEstimate: 0.001,
        totalEstimate: 0.005,
      };
    }
  },

  /**
   * Get Solscan explorer link for mint
   * @param {string} mintAddress
   * @returns {string}
   */
  getExplorerLink(mintAddress) {
    return `https://solscan.io/token/${mintAddress}`;
  },
};