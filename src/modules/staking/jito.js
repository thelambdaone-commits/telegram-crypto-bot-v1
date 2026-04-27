/**
 * Jito Liquid Staking Service
 * SOL <-> JitoSOL via Jupiter swap
 */

import { PublicKey, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { getPricesEUR } from "../../shared/price.js";

const JITO_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
const JITO_RPC = "https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff";
const JUPITER_API = "https://api.jup.ag";
const SOL_RPC = process.env.SOL_RPC_URL || JITO_RPC;

// Jito Stake Pool Constants
const STAKE_POOL_PROGRAM_ID = new PublicKey("SPoo1Ku8WFXoNDS9keSTneZabDECtSTAkgSxzZByMkB");
const JITO_STAKE_POOL_ADDRESS = new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const STAKE_PROGRAM_ID = new PublicKey("Stake11111111111111111111111111111111111111");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSVAR_CLOCK_ID = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

let connection;

const getConnection = () => {
  if (!connection) {
    connection = new Connection(SOL_RPC, "confirmed");
  }
  return connection;
};

export class JitoService {
  static async getBalance(walletAddress, retryCount = 3) {
    console.log(`[JITO] getBalance for: ${walletAddress}`);
    
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const mintPubkey = new PublicKey(JITO_MINT);
      const conn = getConnection();
      
      const ata = await getAssociatedTokenAddress(walletPubkey, mintPubkey);
      
      let balance = 0;
      let hasAccount = false;

      try {
        const accountInfo = await getAccount(conn, ata);
        balance = Number(accountInfo.amount) / 1e9;
        hasAccount = true;
      } catch (error) {
        // Fallback to parsed accounts
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(walletPubkey, {
          mint: mintPubkey
        });
        if (tokenAccounts.value.length > 0) {
          balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          hasAccount = true;
        }
      }

      // Get real rate SOL/JitoSOL from price service (most reliable)
      let rateSol = 1.07; 
      try {
        const prices = await getPricesEUR();
        if (prices.jitosol && prices.sol) {
          rateSol = prices.jitosol / prices.sol;
        }
      } catch (e) {
        // Fallback to Jupiter quote if price service fails
        try {
          const quote = await this.quoteExitFast(1.0);
          if (quote.success) {
            rateSol = quote.amountOut;
          }
        } catch (e2) {}
      }
      
      return {
        success: true,
        balance: balance,
        symbol: "JitoSOL",
        decimals: 9,
        rateSol: rateSol,
        hasAccount: hasAccount
      };
    } catch (error) {
      console.log(`[JITO] getBalance error:`, error.message || error);
      return { success: false, balance: 0, error: error.message };
    }
  }

  static async quoteEnter(amountSOL) {
    try {
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const amountLamports = Math.floor(amountSOL * 1e9);

      const quoteResponse = await fetch(
        `${JUPITER_API}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${JITO_MINT}&amount=${amountLamports}&slippageBps=50`
      );

      if (!quoteResponse.ok) {
        const stakeLamports = Math.floor(amountSOL * 1e9);
        const JitoSOLReceived = stakeLamports / 1e9;
        return {
          success: true,
          amountIn: amountSOL,
          amountOut: JitoSOLReceived,
          priceImpact: 0,
          fee: 0.000005,
          feeUSD: 0,
        };
      }

      const quoteData = await quoteResponse.json();
      const JitoSOLReceived = Number(quoteData.outAmount) / 1e9;
      const priceImpactBps = quoteData.priceImpactBps || 0;
      const priceImpact = priceImpactBps / 100;

      return {
        success: true,
        amountIn: amountSOL,
        amountOut: JitoSOLReceived,
        priceImpact: priceImpact,
        fee: 0.000005,
        feeUSD: 0,
      };
    } catch (error) {
      const stakeLamports = Math.floor(amountSOL * 1e9);
      const JitoSOLReceived = stakeLamports / 1e9;
      return {
        success: true,
        amountIn: amountSOL,
        amountOut: JitoSOLReceived,
        priceImpact: 0,
        fee: 0.000005,
        feeUSD: 0,
      };
    }
  }

  static async enter(walletPrivateKey, amountSOL, rpcUrl = SOL_RPC) {
    try {
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const amountLamports = Math.floor(amountSOL * 1e9);

      console.log(`[JITO] Enter: Calling Jupiter quote for SOL->JitoSOL, amountLamports=${amountLamports}`);

      const quoteResponse = await fetch(
        `${JUPITER_API}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${JITO_MINT}&amount=${amountLamports}&slippageBps=50`
      );

      if (!quoteResponse.ok) {
        const errText = await quoteResponse.text();
        console.error(`[JITO] Quote failed: ${quoteResponse.status} - ${errText}`);
        return { success: false, error: `Failed to get Jupiter quote: ${quoteResponse.status}` };
      }

      const quoteData = await quoteResponse.json();
      console.log(`[JITO] Quote response:`, JSON.stringify(quoteData).slice(0, 500));

      if (!quoteData || !quoteData.outAmount) {
        console.error(`[JITO] Invalid quote data:`, quoteData);
        return { success: false, error: "Invalid quote from Jupiter" };
      }

      const jitoSOLReceived = Number(quoteData.outAmount) / 1e9;

      const { Keypair } = await import("@solana/web3.js");
      const secretKey = Uint8Array.from(Buffer.from(walletPrivateKey, "hex"));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      const userPublicKey = fromKeypair.publicKey.toString();

      console.log(`[JITO] Building swap transaction for user: ${userPublicKey}`);

      const swapTxResponse = await fetch(`${JUPITER_API}/swap/v1/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: userPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      });

      if (!swapTxResponse.ok) {
        const errText = await swapTxResponse.text();
        console.error(`[JITO] Swap build failed: ${swapTxResponse.status} - ${errText}`);
        return { success: false, error: `Failed to build swap transaction: ${swapTxResponse.status}` };
      }

      const swapData = await swapTxResponse.json();
      console.log(`[JITO] Swap built, tx length: ${swapData.swapTransaction?.length || 0}`);

      if (!swapData.swapTransaction) {
        console.error(`[JITO] No swapTransaction in response:`, swapData);
        return { success: false, error: "No swap transaction returned" };
      }

      const { VersionedTransaction } = await import("@solana/web3.js");

      const swapTransaction = VersionedTransaction.deserialize(
        Buffer.from(swapData.swapTransaction, "base64")
      );

      swapTransaction.sign([fromKeypair]);

      const conn = new Connection(rpcUrl, "confirmed");
      const signature = await conn.sendTransaction(swapTransaction);
      console.log(`[JITO] Transaction sent: ${signature}`);

      await conn.confirmTransaction(signature, "confirmed");
      console.log(`[JITO] Transaction confirmed: ${signature}`);

      return {
        success: true,
        txHash: signature,
        amountIn: amountSOL,
        amountOut: jitoSOLReceived,
        message: `Successfully converted ${amountSOL} SOL to ${jitoSOLReceived.toFixed(6)} JitoSOL`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async quoteExitFast(amountJitoSOL) {
    try {
      const response = await fetch(
        `${JUPITER_API}/swap/v1/quote?inputMint=${JITO_MINT}&outputMint=So11111111111111111111111111111111111111112&amount=${Math.floor(amountJitoSOL * 1e9)}&slippageBps=50`
      );

      if (!response.ok) {
        const receivedSOL = amountJitoSOL * 0.998;
        return {
          success: true,
          amountIn: amountJitoSOL,
          amountOut: receivedSOL,
          priceImpact: 0.2,
          fee: 0.00001,
          feeUSD: 0,
          mode: "fast",
          fallback: true,
        };
      }

      const quoteData = await response.json();
      const amountOut = Number(quoteData.outAmount) / 1e9;
      const minReceived = Number(quoteData.otherAmountThreshold) / 1e9;
      const priceImpact = quoteData.priceImpactBps ? quoteData.priceImpactBps / 100 : 0.1;

      return {
        success: true,
        amountIn: amountJitoSOL,
        amountOut: amountOut,
        minReceived: minReceived,
        priceImpact: priceImpact,
        fee: 0.000005,
        feeUSD: 0,
        mode: "fast",
        quoteResponse: quoteData,
      };
    } catch (error) {
      const receivedSOL = amountJitoSOL * 0.998;
      return {
        success: true,
        amountIn: amountJitoSOL,
        amountOut: receivedSOL,
        priceImpact: 0.2,
        fee: 0.00001,
        feeUSD: 0,
        mode: "fast",
        fallback: true,
      };
    }
  }

  static async exitFast(walletPrivateKey, amountJitoSOL, rpcUrl = SOL_RPC) {
    try {
      const quoteResult = await JitoService.quoteExitFast(amountJitoSOL);

      if (!quoteResult.success) {
        return { success: false, error: quoteResult.error };
      }

      if (quoteResult.fallback) {
        return { success: false, error: "Jupiter API unavailable. Try again later." };
      }

      const quoteData = quoteResult.quoteResponse;
      if (!quoteData) {
        return { success: false, error: "Unable to get quote data" };
      }

      const { Keypair, VersionedTransaction } = await import("@solana/web3.js");
      const secretKey = Uint8Array.from(Buffer.from(walletPrivateKey, "hex"));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      const userPublicKey = fromKeypair.publicKey.toString();

      const conn = new Connection(rpcUrl, "confirmed");
      const swapTxResponse = await fetch(`${JUPITER_API}/swap/v1/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: userPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      });

      if (!swapTxResponse.ok) {
        const errText = await swapTxResponse.text();
        console.error(`[JITO] Swap build failed: ${swapTxResponse.status} - ${errText}`);
        return { success: false, error: "Failed to build swap transaction" };
      }

      const swapData = await swapTxResponse.json();

      if (!swapData.swapTransaction) {
        return { success: false, error: "No swap transaction returned" };
      }

      const swapTransaction = VersionedTransaction.deserialize(
        Buffer.from(swapData.swapTransaction, "base64")
      );

      swapTransaction.sign([fromKeypair]);
      
      const signature = await conn.sendTransaction(swapTransaction);
      console.log(`[JITO] ExitFast Transaction sent: ${signature}`);

      await conn.confirmTransaction(signature, "confirmed");
      console.log(`[JITO] ExitFast Transaction confirmed: ${signature}`);

      return {
        success: true,
        txHash: signature,
        amountIn: amountJitoSOL,
        amountOut: quoteResult.amountOut,
        message: `Successfully swapped ${amountJitoSOL} JitoSOL for ${quoteResult.amountOut.toFixed(6)} SOL`,
        mode: "fast",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async quoteExitStandard(amountJitoSOL) {
    return {
      success: false,
      error: "Standard exit not implemented in V1",
    };
  }

  static async exitStandard(walletPrivateKey, amountJitoSOL) {
    console.log(`[JITO] Initiating real Standard Exit for ${amountJitoSOL} JitoSOL`);
    try {
      const { Keypair, Transaction, TransactionInstruction, SystemProgram, StakeProgram } = await import("@solana/web3.js");
      const secretKey = Uint8Array.from(Buffer.from(walletPrivateKey, "hex"));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      const conn = getConnection();

      const lamports = Math.floor(amountJitoSOL * 1e9);
      if (lamports <= 0) throw new Error("Montant invalide");

      // 1. Find user's JitoSOL token account
      const userPoolTokenAccount = await getAssociatedTokenAddress(new PublicKey(JITO_MINT), fromKeypair.publicKey);
      
      // 2. Create temporary stake account
      const tempStakeAccount = Keypair.generate();
      const stakeRentExempt = await conn.getMinimumBalanceForRentExemption(StakeProgram.space);

      const transaction = new Transaction();

      // Step A: Create the stake account
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: fromKeypair.publicKey,
          newAccountPubkey: tempStakeAccount.publicKey,
          lamports: stakeRentExempt,
          space: StakeProgram.space,
          programId: STAKE_PROGRAM_ID,
        })
      );

      // Step B: Find a validator stake account to withdraw from
      // For Jito, we can use a known good validator or scan the list.
      // To keep it simple and fast, we'll try to find the "withdraw authority" PDA
      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [JITO_STAKE_POOL_ADDRESS.toBuffer(), Buffer.from("withdraw")],
        STAKE_POOL_PROGRAM_ID
      );

      // We need to fetch the Stake Pool account to find the validator list
      const poolInfo = await conn.getAccountInfo(JITO_STAKE_POOL_ADDRESS);
      if (!poolInfo) throw new Error("Impossible de récupérer les infos de la pool Jito");
      
      // The validator list address is at offset 65 in the Stake Pool account data
      const validatorListAddr = new PublicKey(poolInfo.data.slice(65, 65 + 32));
      const validatorListAcc = await conn.getAccountInfo(validatorListAddr);
      if (!validatorListAcc) throw new Error("Impossible de récupérer la liste des validateurs");

      // Find first active validator with enough balance (simplified scan)
      // ValidatorList structure: Header(1) + Count(4) + Validators(Count * 73)
      const validatorCount = validatorListAcc.data.readUInt32LE(1);
      let validatorStakeAccount = null;

      for (let i = 0; i < validatorCount; i++) {
        const offset = 5 + (i * 73);
        const voteAddr = new PublicKey(validatorListAcc.data.slice(offset, offset + 32));
        const status = validatorListAcc.data[offset + 32]; // 0 = Active
        
        if (status === 0) {
           const [derived] = PublicKey.findProgramAddressSync(
             [voteAddr.toBuffer(), JITO_STAKE_POOL_ADDRESS.toBuffer()],
             STAKE_POOL_PROGRAM_ID
           );
           validatorStakeAccount = derived;
           break;
        }
      }

      if (!validatorStakeAccount) throw new Error("Aucun validateur disponible pour le retrait");

      // Step C: Approve token transfer (for the withdrawStake instruction)
      // Instruction index 4 for SPL Token Approve
      const approveData = Buffer.alloc(9);
      approveData.writeUInt8(4, 0);
      approveData.writeBigUint64LE(BigInt(lamports), 1);

      transaction.add(new TransactionInstruction({
        keys: [
          { pubkey: userPoolTokenAccount, isSigner: false, isWritable: true },
          { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
          { pubkey: fromKeypair.publicKey, isSigner: true, isWritable: false },
        ],
        programId: TOKEN_PROGRAM_ID,
        data: approveData,
      }));

      // Step D: Withdraw Stake instruction (Instruction index 10)
      const withdrawData = Buffer.alloc(9);
      withdrawData.writeUInt8(10, 0); // WithdrawStake index
      withdrawData.writeBigUint64LE(BigInt(lamports), 1);

      transaction.add(new TransactionInstruction({
        programId: STAKE_POOL_PROGRAM_ID,
        keys: [
          { pubkey: JITO_STAKE_POOL_ADDRESS, isSigner: false, isWritable: true },
          { pubkey: validatorListAddr, isSigner: false, isWritable: true },
          { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
          { pubkey: validatorStakeAccount, isSigner: false, isWritable: true },
          { pubkey: tempStakeAccount.publicKey, isSigner: false, isWritable: true },
          { pubkey: fromKeypair.publicKey, isSigner: false, isWritable: false }, // Stake authority
          { pubkey: withdrawAuthority, isSigner: false, isWritable: false }, // Transfer authority (the delegate we approved)
          { pubkey: userPoolTokenAccount, isSigner: false, isWritable: true },
          { pubkey: new PublicKey("JitoFeeY9mJ3p7Z3CndYfncZfN8Jp5DrsA7uB6u5j7j"), isSigner: false, isWritable: true }, // Manager fee account (placeholder, should be from pool info)
          { pubkey: new PublicKey(JITO_MINT), isSigner: false, isWritable: true },
          { pubkey: SYSVAR_CLOCK_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: STAKE_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: withdrawData,
      }));

      transaction.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      transaction.feePayer = fromKeypair.publicKey;

      const signature = await conn.sendTransaction(transaction, [fromKeypair, tempStakeAccount]);
      
      return {
        success: true,
        txHash: signature,
        stakeAccountAddress: tempStakeAccount.publicKey.toString(),
      };
    } catch (error) {
      console.error("[JITO] exitStandard error:", error.message);
      return { success: false, error: error.message };
    }
  }

  static async getPendingStandardExits(walletAddress, specificAddress = null) {
    console.log(`[JITO] Checking pending exits for wallet ${walletAddress}${specificAddress ? ` (specific: ${specificAddress})` : ""}`);
    try {
      const conn = getConnection();
      const STAKE_PROGRAM_ID = new PublicKey("Stake11111111111111111111111111111111111111");
      
      let stakeAccounts = [];

      if (specificAddress) {
        console.log(`[JITO] Explicitly checking address: ${specificAddress}`);
        try {
          const pubkey = new PublicKey(specificAddress);
          const acc = await conn.getParsedAccountInfo(pubkey);
          if (acc.value) {
            console.log(`[JITO] Found account ${specificAddress}. Owner: ${acc.value.owner.toString()}`);
            stakeAccounts.push({
              pubkey: pubkey,
              account: acc.value
            });
          } else {
            console.log(`[JITO] Account ${specificAddress} NOT FOUND on blockchain.`);
          }
        } catch (e) {
          console.log(`[JITO] Error checking specific address: ${e.message}`);
        }
      }

      // If no specific or not found, try by wallet
      if (stakeAccounts.length === 0) {
        // Try staker authority (offset 12)
        const byStaker = await conn.getParsedProgramAccounts(
          STAKE_PROGRAM_ID,
          {
            filters: [{ memcmp: { offset: 12, bytes: walletAddress } }],
          }
        );
        stakeAccounts = byStaker;

        // If still empty, try withdrawer authority (offset 44)
        if (stakeAccounts.length === 0) {
          const byWithdrawer = await conn.getParsedProgramAccounts(
            STAKE_PROGRAM_ID,
            {
              filters: [{ memcmp: { offset: 44, bytes: walletAddress } }],
            }
          );
          stakeAccounts = byWithdrawer;
        }
      }

      const epochInfo = await conn.getEpochInfo();
      const slotsRemaining = epochInfo.slotsInEpoch - epochInfo.slotIndex;
      const secondsRemaining = slotsRemaining * 0.45;
      const estimatedAvailableAt = new Date(Date.now() + secondsRemaining * 1000).toISOString();

      const pending = [];
      for (const account of stakeAccounts) {
        const parsedData = account.account.data?.parsed;
        // Skip accounts that aren't parsed stake accounts
        if (!parsedData || parsedData.program !== "stake") {
          console.log(`[JITO] Skipping non-stake account: ${account.pubkey.toString()}`);
          continue;
        }

        const data = parsedData.info;
        if (!data || !data.stake) continue;

        const stakeState = data.stake.delegation?.stake || account.account.lamports;
        const deactivationEpoch = Number(data.stake.delegation?.deactivationEpoch) || 0;
        
        // On Solana, a stake account is ready to withdraw if its deactivationEpoch <= currentEpoch
        const isReady = deactivationEpoch <= epochInfo.epoch && deactivationEpoch !== 0;

        pending.push({
          address: account.pubkey.toString(),
          amountSOL: Number(stakeState) / 1e9,
          status: isReady ? "ready" : "deactivating",
          deactivationEpoch: deactivationEpoch,
          estimatedAvailableAt: estimatedAvailableAt,
        });
      }

      return {
        success: true,
        pending: pending,
        epochInfo: epochInfo,
      };
    } catch (error) {
      console.error("[JITO] getPendingStandardExits error:", error.message);
      
      // Basic fallback to at least get epoch info if possible
      try {
        const conn = getConnection();
        const epochInfo = await conn.getEpochInfo();
        return { success: false, error: error.message, pending: [], epochInfo };
      } catch (e) {
        return { success: false, error: error.message, pending: [] };
      }
    }
  }

  static async claimExitStandard(walletPrivateKey, stakeAccountAddress) {
    try {
      const { Keypair, Transaction, StakeProgram } = await import("@solana/web3.js");
      const secretKey = Uint8Array.from(Buffer.from(walletPrivateKey, "hex"));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      
      const conn = getConnection();
      
      if (!stakeAccountAddress || typeof stakeAccountAddress !== "string" || stakeAccountAddress.length < 32 || stakeAccountAddress === "UNKNOWN") {
        throw new Error(`Adresse de compte de stake invalide ou manquante : ${stakeAccountAddress}`);
      }

      const stakePubkey = new PublicKey(stakeAccountAddress);
      
      // 1. Get stake account info and check state
      const accountInfo = await conn.getParsedAccountInfo(stakePubkey);
      
      if (!accountInfo.value) {
          // Double check with non-parsed call
          const rawInfo = await conn.getAccountInfo(stakePubkey);
          if (!rawInfo) {
              throw new Error(`Compte de stake non trouvé sur la blockchain (Adresse: ${stakeAccountAddress}). Assurez-vous que l'adresse est correcte et que le compte n'a pas déjà été fermé.`);
          }
          throw new Error(`Le compte existe mais n'est pas un compte de stake valide (Propriétaire: ${rawInfo.owner.toString()}).`);
      }
      
      const parsedData = accountInfo.value.data?.parsed;
      if (!parsedData || parsedData.program !== "stake") {
        const owner = accountInfo.value.owner.toString();
        throw new Error(`L'adresse fournie (${stakeAccountAddress.slice(0, 8)}...) n'est pas un compte de stake (Propriétaire: ${owner}). Veuillez entrer l'adresse du STAKE ACCOUNT créé lors de l'unstake.`);
      }

      const data = parsedData.info;
      if (!data || !data.stake) throw new Error("Données de compte de stake invalides.");

      const deactivationEpoch = Number(data.stake.delegation?.deactivationEpoch) || 0;
      const epochInfo = await conn.getEpochInfo();

      // Check if ready (deactivationEpoch <= currentEpoch)
      if (deactivationEpoch > epochInfo.epoch || deactivationEpoch === 0) {
        throw new Error(`Le compte n'est pas encore désactivé par le réseau Solana. Il sera prêt au début de l'Epoch ${deactivationEpoch}. (Epoch actuelle : ${epochInfo.epoch})`);
      }

      // Check authority
      const staker = data.meta?.authorized?.staker;
      const withdrawer = data.meta?.authorized?.withdrawer;
      if (staker !== fromKeypair.publicKey.toString() && withdrawer !== fromKeypair.publicKey.toString()) {
         throw new Error(`Ce compte appartient à un autre wallet (Autorité : ${withdrawer}). Assurez-vous d'utiliser le wallet correct.`);
      }

      // 2. Build withdraw instruction
      const transaction = StakeProgram.withdraw({
        stakePubkey: stakePubkey,
        authorizedPubkey: fromKeypair.publicKey,
        toPubkey: fromKeypair.publicKey,
        lamports: accountInfo.value.lamports,
      });

      // Set blockhash and fee payer
      transaction.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      transaction.feePayer = fromKeypair.publicKey;

      const signature = await conn.sendTransaction(transaction, [fromKeypair]);
      await conn.confirmTransaction(signature, "confirmed");

      return {
        success: true,
        txHash: signature,
        message: "Successfully withdrawn SOL from stake account",
      };
    } catch (error) {
      console.error("[JITO] claimExitStandard error:", error.message || error);
      return { success: false, error: error.message || "Erreur inconnue lors du retrait" };
    }
  }

  static async getApy() {
    try {
      const response = await fetch("https://jito-api.staked.xyz/apy");
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          apy: data.apy || 8.5,
          source: "jito",
        };
      }
    } catch {}

    return {
      success: true,
      apy: 8.5,
      source: "jito",
    };
  }
}

export default JitoService;