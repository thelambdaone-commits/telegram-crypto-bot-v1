import { Markup } from "telegraf";
import { DustService } from "../../../modules/dust/dust.service.js";
import { SolanaBurner } from "../../../modules/dust/solana.burner.js";
import { getPricesEUR, formatEUR } from "../../../shared/price.js";
import { mainMenuKeyboard } from "../../keyboards/index.js";
import { config } from "../../../core/config.js";
import { safeAnswerCbQuery } from "../../utils.js";

async function getEthGasPrice() {
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(config.rpc?.eth || "https://eth.llamarpc.com");
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) / 1e9 : 30;
    return { gasPrice, level: gasPrice < 20 ? "bas" : gasPrice < 60 ? "moyen" : "eleve" };
  } catch {
    return { gasPrice: 30, level: "defaut" };
  }
}

async function handleDustCommand(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply("🧹 Analyse du dust en cours...");

  try {
    const wallets = await storage.getWallets(chatId);
    const ethWallets = wallets.filter((w) => w.chain === "eth");
    const btcWallets = wallets.filter((w) => w.chain === "btc");

    if (ethWallets.length === 0 && btcWallets.length === 0) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      return ctx.reply(
        "❌ Tu n'as pas de wallet ETH ou BTC.\n\nCrée-en un avec `/gen eth` ou `/gen btc`",
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }

    const prices = await getPricesEUR();
    const chainAdapters = walletService.chains;
    const { gasPrice: gasGwei } = await getEthGasPrice();

    let summaryText = "🧹 *Dust Keeper*\n\n";
    summaryText += "━━━━━━━━━━━━\n";

    let totalDustValue = 0;
    let hasDust = false;

    for (const wallet of ethWallets) {
      try {
        const balance = await walletService.getBalance(chatId, wallet.id);
        const balanceEth = parseFloat(balance.balance) || 0;

        if (balanceEth > 0) {
          const gasUnits = 21000;
          const gasCostEth = (gasGwei * gasUnits) / 1_000_000_000;
          const valueUsd = balanceEth * prices.eth;
          const gasCostUsd = gasCostEth * prices.eth;
          const isDust = valueUsd < gasCostUsd;

          summaryText += `🔷 *${wallet.label}*\n`;
          summaryText += `Solde: ${balanceEth.toFixed(8)} ETH\n`;
          summaryText += `⛽ Gas: ${gasGwei.toFixed(1)} Gwei\n`;

          if (isDust) {
            hasDust = true;
            totalDustValue += valueUsd;
            const ratio = gasCostUsd > 0 ? ((valueUsd / gasCostUsd) * 100).toFixed(1) : 0;
            summaryText += `💰 Valeur: ${formatEUR(valueUsd)}\n`;
            summaryText += `⛽ Coût transfert: ${formatEUR(gasCostUsd)}\n`;
            summaryText += `⚠️ Ratio: ${ratio}% du coût\n`;
            summaryText += `📊 Statut: 🟡 Dust\n\n`;
          } else {
            summaryText += `💰 Valeur: ${formatEUR(valueUsd)}\n`;
            summaryText += `📊 Statut: ✅ Utilisable\n\n`;
          }
        }
      } catch (error) {
        continue;
      }
    }

    summaryText += "━━━━━━━━━━━━\n";

    for (const wallet of btcWallets) {
      try {
        const utxos = await chainAdapters.btc.getUtxos(wallet.address);
        const feeEstimates = await chainAdapters.btc.estimateFees(
          wallet.address,
          wallet.address,
          0
        );
        const avgFeeRate = feeEstimates.average.satPerVbyte;

        const classifiedUtxos = utxos.map((utxo) => {
          const spendCostSats = avgFeeRate * 140;
          const isDust = utxo.value <= spendCostSats;
          const utxoValueBtc = utxo.value / 100_000_000;
          const valueBtcUsd = utxoValueBtc * prices.btc;
          return { ...utxo, isDust, valueBtcUsd, spendCostSats };
        });

        const dustUtxos = classifiedUtxos.filter((u) => u.isDust);
        const totalDustSats = dustUtxos.reduce((s, u) => s + u.value, 0);
        const totalDustBtc = totalDustSats / 100_000_000;
        const totalDustUsd = totalDustBtc * prices.btc;

        if (dustUtxos.length > 0) {
          hasDust = true;
          totalDustValue += totalDustUsd;
        }

        summaryText += `🟠 *${wallet.label}*\n`;
        summaryText += `UTXOs total: ${utxos.length}\n`;
        summaryText += `Dust UTXOs: ${dustUtxos.length}\n`;
        summaryText += `⛽ Fee rate: ${avgFeeRate} sat/vB\n`;

        if (dustUtxos.length > 0) {
          summaryText += `💰 Valeur dust: ${totalDustBtc.toFixed(8)} BTC\n`;
          summaryText += `   (≈ ${formatEUR(totalDustUsd)})\n`;
          summaryText += `📊 Statut: 🟡 Dust détecté\n`;
        } else {
          summaryText += `📊 Statut: ✅ Aucun dust\n`;
        }
        summaryText += "\n";
      } catch (error) {
        continue;
      }
    }

    summaryText += "━━━━━━━━━━━━\n";

    if (hasDust) {
      summaryText += `💵 *Total dust value:* ${formatEUR(totalDustValue)}\n\n`;
      summaryText += `_\n💡 Conseil: Le dust ETH/BTC n'est pas dangereux,\nmais peut être coûteux à transférer._`;
    } else {
      summaryText += `✅ *Aucun dust détecté* sur tes wallets.`;
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(summaryText, {
      parse_mode: "Markdown",
      ...mainMenuKeyboard(),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
  }
}

async function handleBurnCommand(ctx, storage, walletService) {
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply("🔥 Analyse des tokens SOL...");

  try {
    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === "sol");

    if (solWallets.length === 0) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      return ctx.reply(
        "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un avec `/gen sol`",
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }

    let summaryText = "🔥 *Burn Tokens (SOL)*\n\n";
    let totalBurnable = 0;

    for (const wallet of solWallets) {
      try {
        const tokens = await walletService.chains.sol.getTokens(wallet.address);
        const burnableTokens = SolanaBurner.detectBurnableTokens(tokens);

        summaryText += `🟣 *${wallet.label}*\n`;
        summaryText += `Tokens: ${tokens.length}\n`;
        summaryText += `Brûlables: ${burnableTokens.length}\n\n`;

        if (burnableTokens.length > 0) {
          totalBurnable += burnableTokens.length;

          const displayTokens = burnableTokens.slice(0, 5);
          for (const token of displayTokens) {
            const known = SolanaBurner.KNOWN_TOKENS[token.mint];
            const symbol = known ? known.symbol : `Token (${token.mint.slice(0, 4)}...${token.mint.slice(-4)})`;
            
            // Show more precision for small amounts
            const amountStr = token.amount < 0.0001 ? token.amount.toFixed(8) : token.amount.toFixed(4);
            
            summaryText += `• *${symbol}*: \`${amountStr}\`\n`;
            summaryText += `  ↳ _${token.reason}_\n`;
          }

          if (burnableTokens.length > 5) {
            summaryText += `\n_...et ${burnableTokens.length - 5} autres tokens_`;
          }

          summaryText += "\n\n";
        }
      } catch (error) {
        continue;
      }
    }

    summaryText += "━━━━━━━━━━━━\n";

    if (totalBurnable > 0) {
      summaryText += `⚠️ *${totalBurnable} token(s) sans valeur détecté(s)*\n\n`;
      summaryText += `_\n💡 Ces tokens peuvent être brûlés via un outil externe\ncomme Jupiter, Raydium ou Solflare._`;
    } else {
      summaryText += `✅ *Aucun token brûlable détecté.*`;
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    await ctx.reply(summaryText, {
      parse_mode: "Markdown",
      ...mainMenuKeyboard(),
    });
  } catch (error) {
    try {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    ctx.reply(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
  }
}

export function setupDustHandlers(bot, storage, walletService) {
  bot.command("dust", async (ctx) => {
    await handleDustCommand(ctx, storage, walletService);
  });

  bot.command("burn", async (ctx) => {
    await handleBurnCommand(ctx, storage, walletService);
  });

  bot.action("dust_analysis", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleDustCommand(ctx, storage, walletService);
  });

  bot.action("burn_tokens", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await handleBurnCommand(ctx, storage, walletService);
  });
}
