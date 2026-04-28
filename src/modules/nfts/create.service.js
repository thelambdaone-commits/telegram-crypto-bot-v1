/**
 * NFT Create Service - V1
 * Create simple NFT on Solana using @solana/spl-token
 * 
 * V1: Supply = 1, Decimals = 0, Metadata off-chain JSON
 * URL image only (PNG/JPG), no Telegram upload
 */

import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import { config } from '../../core/config.js';

const connection = new Connection(config.rpc.sol, 'confirmed');

export const NFTService = {
  /**
   * Create a new NFT (SFT with supply=1, decimals=0)
   * @param {string} payerPrivateKey - Hex or Base64 private key
   * @param {string} name - NFT name
   * @param {string} description - NFT description
   * @param {string} imageUrl - URL to image (PNG/JPG)
   * @returns {Promise<{success: boolean, mint?: string, txHash?: string, error?: string}>}
   */
  async createNFT(payerPrivateKey, name, description, imageUrl) {
    try {
      console.log('[NFT_SERVICE] createNFT - name:', name);
      
      let keypair;
      if (payerPrivateKey.length === 64) {
        const secretKey = Buffer.from(payerPrivateKey, 'hex');
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        const secretKey = Buffer.from(payerPrivateKey, 'base64');
        keypair = Keypair.fromSecretKey(secretKey);
      }

      console.log('[NFT_SERVICE] Keypair created, pubkey:', keypair.publicKey.toString());

      // Create mint with supply=1, decimals=0
      const mint = await createMint(
        connection,
        keypair,
        keypair.publicKey,
        keypair.publicKey,
        0 // decimals = 0 for NFT
      );

      const mintAddress = mint.toString();
      console.log('[NFT_SERVICE] Mint created:', mintAddress);

      // Create ATA for the owner
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mint,
        keypair.publicKey
      );

      const ataAddress = ata.address.toString();
      console.log('[NFT_SERVICE] ATA created:', ataAddress);

      // Mint NFT (supply = 1)
      const amountInLamports = 1; // 1 NFT
      const txHash = await mintTo(
        connection,
        keypair,
        mint,
        ataAddress,
        keypair.publicKey,
        amountInLamports
      );

      console.log('[NFT_SERVICE] NFT minted, tx:', txHash);

      // Create metadata JSON (off-chain)
      const metadata = {
        name: name,
        description: description || '',
        image: imageUrl,
        properties: {
          category: 'image',
          files: [
            {
              uri: imageUrl,
              type: imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
            }
          ]
        }
      };

      return {
        success: true,
        mint: mintAddress,
        txHash: txHash,
        metadata: metadata,
      };
    } catch (error) {
      console.error('[NFT_SERVICE] createNFT error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create NFT',
      };
    }
  },

  /**
   * Validate image URL
   * @param {string} url
   * @returns {valid: boolean, error?: string}
   */
  validateImageUrl(url) {
    if (!url) {
      return { valid: false, error: 'URL d\'image requise' };
    }

    try {
      const parsed = new URL(url);
      
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'L\'URL doit utiliser HTTP ou HTTPS' };
      }

      const lowerUrl = url.toLowerCase();
      if (!lowerUrl.endsWith('.png') && 
          !lowerUrl.endsWith('.jpg') && 
          !lowerUrl.endsWith('.jpeg')) {
        return { valid: false, error: 'Seuls PNG et JPG sont acceptés' };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'URL invalide' };
    }
  },

  /**
   * Estimate real costs
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
      console.error('[NFT_SERVICE] estimateRealCost error:', error);
      return {
        mintRent: 0.002,
        ataRent: 0.002,
        networkFeeEstimate: 0.001,
        totalEstimate: 0.005,
      };
    }
  },

  /**
   * Get Solscan explorer link
   * @param {string} mintAddress
   * @returns {string}
   */
  getExplorerLink(mintAddress) {
    return `https://solscan.io/token/${mintAddress}`;
  },
};