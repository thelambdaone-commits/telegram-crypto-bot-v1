
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { BaseProvider } from './base.provider.js';
import { TOKEN_CONFIGS, getTokenConfig } from '../core/tokens.config.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
import * as bip39 from 'bip39';
import bs58 from 'bs58';

export class SolanaChain extends BaseProvider {
  constructor(rpcUrl) {
    super('Solana', 'SOL');
    this.primaryRpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Fallback RPC endpoints
    this.fallbackRpcs = [
      'https://api.mainnet-beta.solana.com',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://rpc.ankr.com/solana'
    ];
  }

  async createWallet() {
    const mnemonic = bip39.generateMnemonic();
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const keypair = Keypair.fromSeed(seed.slice(0, 32));

    return {
      address: keypair.publicKey.toString(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
      mnemonic,
    };
  }

  async importFromSeed(seedPhrase) {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    const seed = await bip39.mnemonicToSeed(seedPhrase);
    const keypair = Keypair.fromSeed(seed.slice(0, 32));

    return {
      address: keypair.publicKey.toString(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
      mnemonic: seedPhrase,
    };
  }

  async importFromKey(privateKey) {
    let secretKey;
    const cleanKey = privateKey.trim();
    let formatTried = [];

    // 1. Handle JSON Array format: [1, 2, 3, ...]
    if (cleanKey.startsWith('[') && cleanKey.endsWith(']')) {
      try {
        const arr = JSON.parse(cleanKey);
        if (Array.isArray(arr) && arr.length >= 32) {
          secretKey = Uint8Array.from(arr);
          formatTried.push('JSON');
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // 2. Try Base58 (Phantom, Solflare, etc. export) - more lenient
    if (!secretKey) {
      try {
        // Try decode directly, no regex check needed
        const decoded = bs58.decode(cleanKey);
        // Valid Solana key is 64 bytes (private + public) or 32 bytes (private only)
        if (decoded.length === 64 || decoded.length === 32) {
          secretKey = decoded;
          formatTried.push('Base58');
        }
      } catch (e) {
        // Not valid Base58, continue
      }
    }

    // 3. Try Hex format (with or without 0x prefix)
    if (!secretKey) {
      try {
        let hex = cleanKey.startsWith('0x') ? cleanKey.slice(2) : cleanKey;
        // Support both 64 char (32 bytes) and 128 char (64 bytes) hex
        if (/^[0-9a-fA-F]+$/.test(hex) && (hex.length === 64 || hex.length === 128)) {
          secretKey = Uint8Array.from(Buffer.from(hex, 'hex'));
          formatTried.push('Hex');
        }
      } catch (e) {
        // Not valid hex
      }
    }

    // 4. Try base64 format (sometimes used)
    if (!secretKey) {
      try {
        const decoded = Buffer.from(cleanKey, 'base64');
        if (decoded.length === 64 || decoded.length === 32) {
          secretKey = decoded;
          formatTried.push('Base64');
        }
      } catch (e) {
        // Not valid base64
      }
    }

    if (!secretKey) {
      throw new Error(`Format non reconnu. Formats acceptes: Base58 (87-88 car.), Hex (64 car.), ou JSON array []. Length recu: ${cleanKey.length}`);
    }

    let keypair;
    if (secretKey.length === 64) {
      // Full 64-byte secret key (32 bytes private + 32 bytes public)
      keypair = Keypair.fromSecretKey(secretKey);
    } else if (secretKey.length === 32) {
      // 32-byte seed
      keypair = Keypair.fromSeed(secretKey);
    } else {
      throw new Error(`Longueur de clé invalide: ${secretKey.length} octets (attendu 32 ou 64)`);
    }

    return {
      address: keypair.publicKey.toString(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
      mnemonic: null,
    };
  }

  async getBalance(address, tokenSymbol = null) {
    if (tokenSymbol && tokenSymbol.toUpperCase() !== 'SOL') {
      const config = getTokenConfig('sol', tokenSymbol);
      if (config) {
        return await this.getTokenBalance(address, config.mint);
      }
    }
    const publicKey = new PublicKey(address);
    
    // Try primary connection first
    const rpcsToTry = [this.primaryRpcUrl, ...this.fallbackRpcs];
    
    for (const rpcUrl of rpcsToTry) {
      try {
        const conn = new Connection(rpcUrl, { 
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 10000
        });
        const balance = await conn.getBalance(publicKey);

        return {
          balance: (balance / LAMPORTS_PER_SOL).toString(),
          balanceLamports: balance.toString(),
          symbol: this.symbol,
        };
      } catch (error) {
        // Try next RPC silently
        continue;
      }
    }
    
    // All RPCs failed
    console.warn(`[SOL] All RPCs failed for address ${address.slice(0, 12)}...`);
    return {
      balance: '0',
      balanceLamports: '0',
      symbol: this.symbol,
      error: 'Unable to fetch balance - network issue'
    };
  }

  async estimateFees(fromAddress, toAddress, amount) {
    // Solana has stable base fees (5000 lamports per signature)
    // Recent blockhash is no longer used for fee calculation in modern web3 versions
    const baseFee = 5000; 

    // Solana doesn't have fee levels like ETH, but we can add priority fees
    const fees = {
      slow: {
        fee: baseFee,
        feeSOL: (baseFee / LAMPORTS_PER_SOL).toString(),
        priorityFee: 0,
      },
      average: {
        fee: baseFee + 1000,
        feeSOL: ((baseFee + 1000) / LAMPORTS_PER_SOL).toString(),
        priorityFee: 1000,
      },
      fast: {
        fee: baseFee + 10000,
        feeSOL: ((baseFee + 10000) / LAMPORTS_PER_SOL).toString(),
        priorityFee: 10000,
      },
    };

    return fees;
  }

  async sendTransaction(privateKey, toAddress, amount, feeLevel = 'average') {
    const secretKey = Uint8Array.from(Buffer.from(privateKey, 'hex'));
    const fromKeypair = Keypair.fromSecretKey(secretKey);
    const toPublicKey = new PublicKey(toAddress);

    const lamports = Math.round(Number.parseFloat(amount) * LAMPORTS_PER_SOL);
    const transaction = new Transaction();
    
    // Add priority fees if specified
    if (feeLevel !== 'slow') {
      const fees = await this.estimateFees('', '', 0);
      const priorityFee = fees[feeLevel]?.priorityFee || 0;
      
      if (priorityFee > 0) {
        const { ComputeBudgetProgram } = await import('@solana/web3.js');
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: Math.floor((priorityFee * 1000) / 200000) // Rough conversion to microLamports for priority
          })
        );
      }
    }

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports,
      }),
    );

    const signature = await sendAndConfirmTransaction(this.connection, transaction, [fromKeypair]);

    return {
      hash: signature,
      from: fromKeypair.publicKey.toString(),
      to: toAddress,
      amount: amount.toString(),
      status: 'success',
    };
  }

  async getTransactionHistory(address, limit = 5) {
    // Solana - Get signatures first, then fetch details for each
    const rpcUrl = this.primaryRpcUrl || 'https://api.mainnet-beta.solana.com';
    
    try {
      // Step 1: Get recent signatures
      const sigResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [address, { limit }],
        }),
      });
      const sigData = await sigResponse.json();
      
      if (!sigData.result?.length) return [];
      
      // Step 2: Get transaction details for each signature
      const transactions = [];
      
      for (const sig of sigData.result.slice(0, limit)) {
        try {
          const txResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
            }),
          });
          const txData = await txResponse.json();
          
          let amount = 0;
          let type = 'tx';
          
          if (txData.result?.meta) {
            const meta = txData.result.meta;
            const accountKeys = txData.result.transaction?.message?.accountKeys || [];
            
            // Find the address index
            let addressIndex = -1;
            for (let i = 0; i < accountKeys.length; i++) {
              const key = accountKeys[i]?.pubkey || accountKeys[i];
              if (key === address) {
                addressIndex = i;
                break;
              }
            }
            
            if (addressIndex >= 0 && meta.preBalances && meta.postBalances) {
              const preBalance = meta.preBalances[addressIndex] || 0;
              const postBalance = meta.postBalances[addressIndex] || 0;
              const diff = postBalance - preBalance;
              
              if (diff > 0) {
                type = 'in';
                amount = diff / 1e9;
              } else if (diff < 0) {
                type = 'out';
                amount = Math.abs(diff) / 1e9;
              }
            }
          }
          
          transactions.push({
            hash: sig.signature,
            type: type,
            amount: amount > 0 ? amount.toFixed(6) : '—',
            timestamp: (sig.blockTime || Date.now() / 1000) * 1000,
          });
        } catch (e) {
          // If individual tx fetch fails, add basic info
          transactions.push({
            hash: sig.signature,
            type: 'tx',
            amount: '—',
            timestamp: (sig.blockTime || Date.now() / 1000) * 1000,
          });
        }
      }
      
      return transactions;
    } catch (error) {
       return [];
    }
  }

  validateAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getTokens(address) {
    const publicKey = new PublicKey(address);
    const rpcsToTry = [this.primaryRpcUrl, ...this.fallbackRpcs];
    
    for (const rpcUrl of rpcsToTry) {
      try {
        const conn = new Connection(rpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 10000
        });
        
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });
        
        const tokens = tokenAccounts.value
          .map((account) => {
            const info = account.account.data.parsed.info;
            const mint = info.mint;
            const amount = info.tokenAmount;
            
            return {
              mint,
              address: account.pubkey.toString(),
              amount: Number(amount.amount) / Math.pow(10, amount.decimals),
              decimals: amount.decimals,
              uiAmount: amount.uiAmount,
              isNonZero: amount.amount > 0,
              programId: account.account.data.program,
              associated: account.pubkey.toBase58().startsWith(mint.slice(0, 10)),
            };
          })
          .filter((t) => t.isNonZero);
        
        return tokens;
      } catch (error) {
        continue;
      }
    }
    
    return [];
  }

  async getAllTokensWithSymbols(address) {
    const allTokens = await this.getTokens(address);
    const knownTokens = TOKEN_CONFIGS.sol.tokens;
    
    return allTokens.map(token => {
      const knownToken = Object.entries(knownTokens).find(
        ([, config]) => config.mint.toLowerCase() === token.mint.toLowerCase()
      );
      
      return {
        ...token,
        symbol: knownToken ? knownToken[0] : `SOL-${token.mint.slice(0, 4)}`,
        isKnown: !!knownToken,
        icon: knownToken ? knownToken[1].icon : '🪙',
      };
    });
  }

  async getTokenBalance(address, mintAddress) {
    const walletPubkey = new PublicKey(address);
    const mintPubkey = new PublicKey(mintAddress);
    const conn = this.connection;

    const ata = await getAssociatedTokenAddress(walletPubkey, mintPubkey);

    try {
      const accountInfo = await getAccount(conn, ata);
      return {
        balance: Number(accountInfo.amount) / 1e9,
        decimals: accountInfo.decimals,
        ata: ata.toString(),
        exists: true,
      };
    } catch {
      return {
        balance: 0,
        decimals: 9,
        ata: ata.toString(),
        exists: false,
      };
    }
  }

  async ensureAta(privateKey, mintAddress) {
    const keypair = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));
    const mintPubkey = new PublicKey(mintAddress);
    const conn = this.connection;

    const ata = await getAssociatedTokenAddress(keypair.publicKey, mintPubkey);

    try {
      await getAccount(conn, ata);
      return { ata: ata.toString(), created: false };
    } catch {
      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const transaction = new Transaction();
      transaction.add(createAssociatedTokenAccountInstruction(keypair.publicKey, ata, keypair.publicKey, mintPubkey));

      const signature = await sendAndConfirmTransaction(conn, transaction, [keypair]);
      return { ata: ata.toString(), created: true, signature };
    }
  }

  async sendRawTransaction(privateKey, transaction, feeLevel = 'average') {
    const keypair = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(privateKey, 'hex')));

    const fees = await this.estimateFees('', '', 0);
    const priorityFee = fees[feeLevel]?.priorityFee || 0;

    if (priorityFee > 0) {
      const { ComputeBudgetProgram } = await import('@solana/web3.js');
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: Math.floor((priorityFee * 1000) / 200000),
        })
      );
    }

    const signature = await sendAndConfirmTransaction(this.connection, transaction, [keypair]);

    return {
      hash: signature,
      status: 'success',
    };
  }
}
