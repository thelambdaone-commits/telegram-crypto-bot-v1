/**
 * Jito Staking Handler for Telegram
 * Handle JitoSOL staking operations
 */

import { Markup } from "telegraf";
import { JitoService } from "../../../modules/staking/jito.js";
import { mainMenuKeyboard, stakingExitKeyboard, jitoWithdrawalKeyboard, jitoStandardExitKeyboard, jitoUnstakeStatusKeyboard } from "../../keyboards/index.js";
import { safeAnswerCbQuery } from "../../utils.js";
import { formatEUR, getPricesEUR } from "../../../shared/price.js";

function formatAmount(amount) {
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

async function syncJitoUnstakes(chatId, storage) {
  try {
    const wallets = await storage.getWallets(chatId);
    const solWallet = wallets.find(w => w.chain === "sol");
    if (!solWallet) return 0;

    const requests = await storage.getUnstakeRequests(chatId);
    const blockchainExits = await JitoService.getPendingStandardExits(solWallet.address);
    
    if (!blockchainExits.success || blockchainExits.pending.length === 0) return 0;

    let importedCount = 0;
    for (const exit of blockchainExits.pending) {
      const alreadyTracked = requests.some(r => r.stakeAccountAddress === exit.address);
      if (!alreadyTracked) {
        // Try to find a local request without address to link it
        const pendingLocal = requests.find(r => !r.stakeAccountAddress && r.walletAddress === solWallet.address);
        
        if (pendingLocal) {
          await storage.updateUnstakeRequest(chatId, pendingLocal.id, {
            stakeAccountAddress: exit.address,
            status: exit.status,
            estimatedAvailableAt: exit.estimatedAvailableAt
          });
          importedCount++;
        } else {
          await storage.addUnstakeRequest(chatId, {
            amount: exit.amountSOL / 1.07, 
            walletId: solWallet.id,
            walletAddress: solWallet.address,
            stakeAccountAddress: exit.address,
            status: exit.status,
            estimatedAvailableAt: exit.estimatedAvailableAt,
            label: "Blockchain Auto-Import"
          });
          importedCount++;
        }
      } else {
        // Update estimated date if it changed
        const request = requests.find(r => r.stakeAccountAddress === exit.address);
        if (request && (exit.estimatedAvailableAt || exit.status)) {
          await storage.updateUnstakeRequest(chatId, request.id, {
            estimatedAvailableAt: exit.estimatedAvailableAt || request.estimatedAvailableAt,
            status: exit.status || request.status
          });
        }
      }
    }
    return importedCount;
  } catch (e) {
    console.error("Sync error:", e);
    return 0;
  }
}

export function setupJitoHandlers(bot, storage, walletService, sessions) {
  // Show Jito staking menu
  bot.action("jito_staking", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    
    try {
      const chatId = ctx.chat.id;
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === "sol");

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking JitoSOL.",
          { parse_mode: "Markdown", ...mainMenuKeyboard() }
        );
      }

      const solWalletId = sessions.getData(chatId)?.stakingWalletId;
      let solWallet;

      if (solWalletId) {
        solWallet = solWallets.find(w => w.id === solWalletId);
      }

      if (!solWallet) {
        if (solWallets.length > 1) {
          const buttons = solWallets.map(w => [
            Markup.button.callback(`${w.label || w.address.slice(0, 8)}...`, `jito_select_wallet_${w.id}`)
          ]);
          buttons.push([Markup.button.callback("↩️ Retour", "liquid_staking_menu")]);
          
          return ctx.editMessageText(
            "💎 *JitoSOL - Sélection du Wallet*\n\n" +
            "Plusieurs wallets Solana détectés. Lequel souhaitez-vous utiliser ?",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
          );
        }
        solWallet = solWallets[0];
        sessions.setData(chatId, { ...sessions.getData(chatId), stakingWalletId: solWallet.id });
      }
      
      // Get JitoSOL balance
      const balanceResult = await JitoService.getBalance(solWallet.address);
      const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
      const rateSol = balanceResult.success ? balanceResult.rateSol : 1.127;
      const valueSOL = jitoBalance * rateSol;
      const initialSOL = jitoBalance; // Assuming 1:1 at start for simplicity if no history
      const gainsSOL = valueSOL - initialSOL;

      // Get APY
      const apyResult = await JitoService.getApy();
      const apy = apyResult.success ? `${apyResult.apy.toFixed(2)}%` : "N/A";

      // Get SOL price
      const prices = await getPricesEUR();
      const solPrice = prices.sol || 0;
      const jitoValueEUR = valueSOL * solPrice;
      const gainsEUR = gainsSOL * solPrice;

      const tokenLabel = "JitoSOL";
      const symbol = tokenLabel;

      // Build menu
      const keyboardRows = [
        [Markup.button.callback(`🔄 Déposer (SOL → JitoSOL)`, "jito_enter_select")],
        [Markup.button.callback("💸 Retirer (JitoSOL → SOL)", "jito_withdraw")],
      ];

      // Sync with blockchain to find any new/missed requests
      await syncJitoUnstakes(chatId, storage);

      // Check for pending unstakes
      const unstakeRequests = await storage.getUnstakeRequests(chatId);
      const pendingUnstakes = unstakeRequests.filter(r => r.walletAddress === solWallet.address);
      
      if (pendingUnstakes.length > 0) {
        const callbackData = pendingUnstakes.length === 1 
          ? `jito_unstake_status_${pendingUnstakes[0].id}` 
          : "jito_unstake_list";
        keyboardRows.push([Markup.button.callback(`⏳ Suivre mon Unstake (${pendingUnstakes.length})`, callbackData)]);
      }

      if (solWallets.length > 1) {
        keyboardRows.push([Markup.button.callback("💳 Changer de wallet", "jito_wallet_selection")]);
      }

      keyboardRows.push([Markup.button.callback("↩️ Retour", "liquid_staking_menu")]);

      const keyboard = Markup.inlineKeyboard(keyboardRows);

      await ctx.editMessageText(
        `🥇 *JitoSOL - Liquid Staking*\n` +
        `━━━━━━━━━━━━\n` +
        `💰 *Solde* : \`${jitoBalance.toFixed(6)}\` JitoSOL\n` +
        `📊 *Valeur* : \`${valueSOL.toFixed(6)}\` SOL\n` +
        `💶 *Estimation* : \`${formatEUR(jitoValueEUR)}\`\n` +
        `━━━━━━━━━━━━\n` +
        `📈 *Performances*\n` +
        `Gain Total : \`+${gainsSOL.toFixed(6)}\` SOL\n` +
        `Yield (est.) : \`+${formatEUR(gainsEUR)}\`\n` +
        `━━━━━━━━━━━━\n` +
        `📊 *Détails Techniques*\n` +
        `Taux : \`1 JitoSOL = ${rateSol.toFixed(4)} SOL\`\n` +
        `APY Actuel : *${apy}*\n\n` +
        `_Le rendement est automatiquement ajouté à la valeur du token (LST)._`,
        {
          parse_mode: "Markdown",
          ...keyboard,
        }
      );
    } catch (error) {
      if (error.message && error.message.includes("message is not modified")) {
        return;
      }
      console.error("Jito staking menu error:", error);
      ctx.editMessageText(
        `❌ Erreur: ${error.message}`,
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }
  });

  // Enter JitoSOL - Show wallet selection first
  bot.action(/^jito_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const action = ctx.match[1]; // "select" means show wallet selection

    if (action === "select") {
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === "sol");

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.\n\nCrée-en un pour utiliser le staking.",
          { parse_mode: "Markdown", ...mainMenuKeyboard() }
        );
      }

      if (solWallets.length === 1) {
        sessions.setData(chatId, { walletId: solWallets[0].id, action: "jito_enter" });
        sessions.setState(chatId, "JITO_ENTER_AMOUNT");
        return ctx.editMessageText(
          "🔄 *Convertir SOL → JitoSOL*\n\n" +
          `Wallet: \`${solWallets[0].label || solWallets[0].address.slice(0, 8)}...\`\n\n` +
          "Entre le montant de SOL à convertir :\n\n" +
          "_Format: 1.5 SOL_",
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Annuler", "cancel_staking")]]) }
        );
      }

      const buttons = solWallets.map((w, i) => [
        Markup.button.callback(`${w.label || w.address.slice(0, 8)}...`, `jito_wallet_enter_${w.id}`)
      ]);
      buttons.push([Markup.button.callback("↩️ Retour", "jito_staking")]);

      await ctx.editMessageText(
        "🔄 *Convertir SOL → JitoSOL*\n\nSélectionne ton wallet Solana :",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
      );
      return;
    }

    const walletId = ctx.match[1];
    sessions.setData(chatId, { walletId, action: "jito_enter" });
    sessions.setState(chatId, "JITO_ENTER_AMOUNT");

    await ctx.editMessageText(
      "🔄 *Convertir SOL → JitoSOL*\n\n" +
      "Entre le montant de SOL à convertir :\n\n" +
      "_Format: 1.5 SOL_",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Annuler", "cancel_staking")]]) }
    );
  });

  // Wallet selected for enter
  bot.action(/^jito_wallet_enter_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    sessions.setData(chatId, { walletId, action: "jito_enter" });
    sessions.setState(chatId, "JITO_ENTER_AMOUNT");

    await ctx.editMessageText(
      "🔄 *Convertir SOL → JitoSOL*\n\n" +
      "Entre le montant de SOL à convertir :\n\n" +
      "_Format: 1.5 SOL_",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Annuler", "cancel_staking")]]) }
    );
  });

  // Exit Fast - Show balance and amount input directly
  bot.action(/^jito_exit_fast_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const action = ctx.match[1];

    if (action === "select") {
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === "sol");

      if (solWallets.length === 0) {
        return ctx.editMessageText(
          "❌ Tu n'as pas de wallet Solana.",
          { parse_mode: "Markdown", ...mainMenuKeyboard() }
        );
      }

      // Priority: use the wallet already selected in the Jito dashboard
      const sessionWalletId = sessions.getData(chatId)?.stakingWalletId;
      let solWallet = sessionWalletId ? solWallets.find(w => w.id === sessionWalletId) : null;

      // Fallback: if only one wallet exists, use it
      if (!solWallet && solWallets.length === 1) {
        solWallet = solWallets[0];
      }

      if (solWallet) {
        const balanceResult = await JitoService.getBalance(solWallet.address);
        const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
        const prices = await getPricesEUR();
        const jitoPriceEur = prices.jitosol || prices.sol || 0;
        const balanceEUR = jitoBalance * jitoPriceEur;

        if (jitoBalance <= 0) {
          return ctx.editMessageText(
            `❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.`,
            { parse_mode: "Markdown", ...mainMenuKeyboard() }
          );
        }

        sessions.setData(chatId, { 
          walletId: solWallet.id, 
          action: "jito_exit_fast",
          jitoBalance: jitoBalance,
          jitoBalanceEUR: balanceEUR,
        });
        sessions.setState(chatId, "JITO_EXIT_FAST_AMOUNT");
        
        return ctx.editMessageText(
          `⚡ *Convertir JitoSOL → SOL*\n\n` +
          `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
          `(${formatEUR(balanceEUR)})\n\n` +
          `Entrez un montant en JitoSOL ou en € :\n\n` +
          `_Exemples :_\n` +
          `• \`0.10\` → 0.10 JitoSOL\n` +
          `• \`10€\` → ~10€ en JitoSOL\n` +
          `• \`50%\` → 50% du solde\n` +
          `• \`100%\` → tout le solde`,
          { parse_mode: "Markdown", ...stakingExitKeyboard() }
        );
      }

      const buttons = solWallets.map((w) => [
        Markup.button.callback(`${w.label || w.address.slice(0, 8)}...`, `jito_wallet_exit_${w.id}`)
      ]);
      buttons.push([Markup.button.callback("↩️ Retour", "jito_staking")]);

      await ctx.editMessageText(
        "⚡ *Convertir JitoSOL → SOL*\n\nSélectionne ton wallet Solana :",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
      );
      return;
    }

    const walletId = ctx.match[1];
    const wallet = await storage.getWalletWithKey(chatId, walletId);
    const balanceResult = await JitoService.getBalance(wallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;
    const balanceEUR = jitoBalance * jitoPriceEur;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        `❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.`,
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }

    sessions.setData(chatId, { 
      walletId, 
      action: "jito_exit_fast",
      jitoBalance: jitoBalance,
      jitoBalanceEUR: balanceEUR,
    });
    sessions.setState(chatId, "JITO_EXIT_FAST_AMOUNT");

    await ctx.editMessageText(
      `⚡ *Convertir JitoSOL → SOL*\n\n` +
      `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
      `(${formatEUR(balanceEUR)})\n\n` +
      `Entrez un montant en JitoSOL ou en € :\n\n` +
      `_Exemples :_\n` +
      `• \`0.10\` → 0.10 JitoSOL\n` +
      `• \`10€\` → ~10€ en JitoSOL\n` +
      `• \`50%\` → 50% du solde\n` +
      `• \`100%\` → tout le solde`,
      { parse_mode: "Markdown", ...stakingExitKeyboard() }
    );
  });

  // Wallet selected for exit - show balance and amount input
  bot.action(/^jito_wallet_exit_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      return ctx.editMessageText("❌ Wallet non trouvé.", mainMenuKeyboard());
    }

    const balanceResult = await JitoService.getBalance(wallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;
    const balanceEUR = jitoBalance * jitoPriceEur;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        `❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.`,
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }

    sessions.setData(chatId, { 
      walletId, 
      action: "jito_exit_fast",
      jitoBalance: jitoBalance,
      jitoBalanceEUR: balanceEUR,
    });
    sessions.setState(chatId, "JITO_EXIT_FAST_AMOUNT");

    await ctx.editMessageText(
      `⚡ *Convertir JitoSOL → SOL*\n\n` +
      `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
      `(${formatEUR(balanceEUR)})\n\n` +
      `Entrez un montant en JitoSOL ou en € :\n\n` +
      `_Exemples :_\n` +
      `• \`0.10\` → 0.10 JitoSOL\n` +
      `• \`10€\` → ~10€ en JitoSOL\n` +
      `• \`50%\` → 50% du solde\n` +
      `• \`100%\` → tout le solde`,
      { parse_mode: "Markdown", ...stakingExitKeyboard() }
    );
  });

  bot.action("jito_withdraw", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText(
      "💸 *Retrait JitoSOL*\n\n" +
      "Choisissez votre mode de retrait :\n\n" +
      "⚡ *Rapide* (Swap) : Immédiat, frais de swap (~0.1-0.3%).\n" +
      "⏳ *Standard* (Unstake) : Sans frais, délai de 2-3 jours (fin d'epoch).",
      { parse_mode: "Markdown", ...jitoWithdrawalKeyboard() }
    );
  });

  // Exit Standard - Show balance and amount input
  bot.action("jito_exit_standard_select", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    
    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === "sol");

    if (solWallets.length === 0) {
      return ctx.editMessageText(
        "❌ Tu n'as pas de wallet Solana.",
        { parse_mode: "Markdown", ...mainMenuKeyboard() }
      );
    }

    // Use selected wallet from session
    const sessionWalletId = sessions.getData(chatId)?.stakingWalletId;
    let solWallet = sessionWalletId ? solWallets.find(w => w.id === sessionWalletId) : null;

    if (!solWallet) {
      if (solWallets.length === 1) {
        solWallet = solWallets[0];
      } else {
        // If multiple wallets and none selected, ask to select
        return ctx.editMessageText(
          "💳 *Veuillez d'abord sélectionner un wallet* dans le menu JitoSOL principal.",
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("↩️ Retour", "jito_staking")]]) }
        );
      }
    }

    const balanceResult = await JitoService.getBalance(solWallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const rateSol = balanceResult.success ? balanceResult.rateSol : 1.07;
    const balanceSOL = jitoBalance * rateSol;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        `❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("↩️ Retour", "jito_withdraw")]]) }
      );
    }

    sessions.setData(chatId, { 
      walletId: solWallet.id, 
      action: "jito_exit_standard",
      jitoBalance: jitoBalance,
      rateSol: rateSol
    });
    sessions.setState(chatId, "JITO_EXIT_STANDARD_AMOUNT");
    
    return ctx.editMessageText(
      `⏳ *Sortie Standard (Delayed Unstake)*\n\n` +
      `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
      `📊 Valeur : *${balanceSOL.toFixed(6)} SOL*\n\n` +
      `⚠️ *Important* : L'unstake standard prend **2 à 3 jours**. Vos fonds seront bloqués dans un compte de stake jusqu'à la fin de l'epoch.\n\n` +
      `Choisissez le montant à retirer :`,
      { parse_mode: "Markdown", ...jitoStandardExitKeyboard() }
    );
  });

  bot.action(/^jito_exit_std_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const percentage = parseInt(ctx.match[1], 10) / 100;
    const data = sessions.getData(chatId);

    if (!data || !data.jitoBalance) {
      return ctx.reply("❌ Session expirée.", mainMenuKeyboard());
    }

    const amount = Number((data.jitoBalance * percentage).toFixed(6));
    const amountSOL = amount * (data.rateSol || 1.07);

    sessions.setData(chatId, { ...data, amount });
    sessions.setState(chatId, "JITO_EXIT_STANDARD_CONFIRM");

    await ctx.editMessageText(
      `⚠️ *Confirmation Unstake Standard*\n\n` +
      `📥 Montant à retirer : *${formatAmount(amount)} JitoSOL*\n` +
      `📤 Valeur estimée : *${formatAmount(amountSOL)} SOL*\n\n` +
      `• *Délai* : 2-3 jours (fin d'epoch)\n` +
      `• *Frais* : 0% (swap) / ~0.000005 SOL (réseau)\n\n` +
      `Une fois lancé, vous recevrez un *Stake Account* qui se désactivera automatiquement. Vous devrez cliquer sur "Récupérer" dans 2-3 jours.\n\n` +
      `Confirmer l'opération ?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirmer l'Unstake", "confirm_jito_exit_standard")],
          [Markup.button.callback("❌ Annuler", "jito_withdraw")]
        ])
      }
    );
  });

  bot.action("confirm_jito_exit_standard", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const data = sessions.getData(chatId);

    if (!data || !data.amount) {
      return ctx.reply("❌ Session expirée.", mainMenuKeyboard());
    }

    try {
      const wallet = await storage.getWalletWithKey(chatId, data.walletId);
      if (!wallet) throw new Error("Wallet non trouvé");

      await ctx.editMessageText("⛓ *Initialisation de l'Unstake sur la blockchain Solana...*", { parse_mode: "Markdown" });

      const result = await JitoService.exitStandard(wallet.privateKey, data.amount);

      if (!result.success) {
        return ctx.editMessageText(`❌ Erreur lors de l'unstake : ${result.error}`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[Markup.button.callback("↩️ Retour", "jito_withdraw")]])
        });
      }
      
      // Save request to storage with real blockchain data
      const request = await storage.addUnstakeRequest(chatId, {
        amount: data.amount,
        walletId: data.walletId,
        walletAddress: wallet.address,
        rateSol: data.rateSol || 1.07,
        stakeAccountAddress: result.stakeAccountAddress, // Saved from blockchain!
        status: "pending",
        createdAt: new Date().toISOString(),
        estimatedAvailableAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      });

      await ctx.editMessageText(
        `✅ *Unstake Standard Réussi*\n\n` +
        `L'opération a été transmise au réseau Solana.\n\n` +
        `📥 Montant : *${formatAmount(data.amount)} JitoSOL*\n` +
        `⛓ Stake Acc : \`${result.stakeAccountAddress}\`\n` +
        `🔗 [Voir Transaction](https://solscan.io/tx/${result.txHash})\n\n` +
        `📅 *Disponibilité* : Vos SOL seront prêts dans environ 2-3 jours (fin de l'epoch actuelle).\n\n` +
        `Vous pouvez suivre l'avancement dans le menu JitoSOL.`,
        { 
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          ...Markup.inlineKeyboard([[Markup.button.callback("⏳ Suivre mon Unstake", `jito_unstake_status_${request.id}`)]]) 
        }
      );

      sessions.clearState(chatId);
      sessions.clearData(chatId);
    } catch (error) {
      console.error("Jito unstake error:", error);
      ctx.editMessageText(`❌ Erreur lors de l'initialisation: ${error.message}`, mainMenuKeyboard());
    }
  });

  bot.action("jito_unstake_list", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    
    // Sync before showing list
    await syncJitoUnstakes(chatId, storage);
    
    const requests = await storage.getUnstakeRequests(chatId);
    
    if (requests.length === 0) {
      return ctx.editMessageText("❌ Aucune demande d'unstake en cours.", {
        ...Markup.inlineKeyboard([[Markup.button.callback("↩️ Retour", "jito_staking")]])
      });
    }
    
    const buttons = requests.map((r, i) => [
      Markup.button.callback(
        `🔹 Unstake #${i + 1} (${formatAmount(r.amount)} JitoSOL)`, 
        `jito_unstake_status_${r.id}`
      )
    ]);
    
    buttons.push([Markup.button.callback("↩️ Retour", "jito_staking")]);
    
    await ctx.editMessageText(
      `⏳ *Vos demandes d'Unstake*\n\n` +
      `Vous avez *${requests.length}* demandes en cours de traitement par Jito.\n\n` +
      `Sélectionnez une demande pour voir les détails ou la réclamer :`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons)
      }
    );
  });

  // Unstake Status Handler
  bot.action(/^jito_unstake_status_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];
    
    // Show loading state
    await ctx.editMessageText("⏳ *Synchronisation avec la blockchain Solana...*", { parse_mode: "Markdown" });

    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        // Attempt to recover if not found in storage (Auto-Sync)
        const wallets = await storage.getWallets(chatId);
        const solWallet = wallets.find(w => w.chain === "sol");
        
        if (solWallet) {
          const blockchainExits = await JitoService.getPendingStandardExits(solWallet.address);
          if (blockchainExits.success && blockchainExits.pending.length > 0) {
            // Import all found ones that aren't in storage
            let importedCount = 0;
            let lastNewRequestId = null;
            
            for (const exit of blockchainExits.pending) {
              const alreadyTracked = requests.some(r => r.stakeAccountAddress === exit.address);
              if (!alreadyTracked) {
                const newRequest = await storage.addUnstakeRequest(chatId, {
                  amount: exit.amountSOL / 1.07, // Estimate JitoSOL
                  walletId: solWallet.id,
                  walletAddress: solWallet.address,
                  stakeAccountAddress: exit.address,
                  status: exit.status,
                  label: "Blockchain Auto-Import"
                });
                lastNewRequestId = newRequest.id;
                importedCount++;
              }
            }
            
            if (importedCount > 0) {
              return ctx.editMessageText(`✅ ${importedCount} demande(s) récupérée(s) de la blockchain.\n\nRéessayez d'ouvrir le menu.`, {
                ...Markup.inlineKeyboard([[Markup.button.callback("➡️ Retour", importedCount === 1 ? `jito_unstake_status_${lastNewRequestId}` : `jito_staking`)]])
              });
            }
          }
        }
        return ctx.editMessageText("❌ Demande non trouvée.", mainMenuKeyboard());
      }
      
      // Real-time check if possible
      const blockchainStatus = await JitoService.getPendingStandardExits(request.walletAddress, request.stakeAccountAddress);
      let canClaim = false;
      let timerText = "";
      
      if (blockchainStatus.success && blockchainStatus.pending.length > 0) {
        const matching = blockchainStatus.pending.find(p => p.address === request.stakeAccountAddress) || blockchainStatus.pending[0];
        
        // If we matched by fallback (missing address), update the request
        if (!request.stakeAccountAddress && matching.address) {
          await storage.updateUnstakeRequest(chatId, request.id, {
            stakeAccountAddress: matching.address,
            status: matching.status,
            estimatedAvailableAt: matching.estimatedAvailableAt
          });
          request.stakeAccountAddress = matching.address;
        }

        if (matching.status === "ready") {
           canClaim = true;
        } else {
          // For the sake of the exercise, we calculate based on epochs
          const now = new Date();
          const availableAt = new Date(matching.estimatedAvailableAt || request.estimatedAvailableAt);
          const diffMs = availableAt - now;
          canClaim = diffMs <= 0;

          if (!canClaim) {
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days === 0 && hours === 0 && minutes === 0) {
              timerText = "Quelques instants...";
            } else {
              timerText = `${days}j ${hours}h ${minutes}m`;
            }
          }
        }
      } else {
        // Fallback to storage timer if blockchain check fails
        const now = new Date();
        const availableAt = new Date(request.estimatedAvailableAt);
        const diffMs = availableAt - now;
        canClaim = diffMs <= 0;
        if (!canClaim) {
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days === 0 && hours === 0 && minutes === 0) {
            timerText = "Quelques instants...";
          } else {
            timerText = `${days}j ${hours}h ${minutes}m`;
          }
        }
      }
      
      const amountSOL = request.amount * (request.rateSol || 1.07);
      
      // Get epoch info for display
      const currentEpoch = blockchainStatus.success && blockchainStatus.epochInfo ? blockchainStatus.epochInfo.epoch : "N/A";
      
      await ctx.editMessageText(
        `⏳ *Statut de votre Unstake*\n` +
        `━━━━━━━━━━━━\n` +
        `📥 *Montant* : \`${formatAmount(request.amount)}\` JitoSOL\n` +
        `📤 *Valeur* : \`${formatAmount(amountSOL)}\` SOL\n` +
        `💼 *Wallet* : \`${request.walletAddress.slice(0, 8)}...\`\n` +
        `⛓ *Stake Acc* : ${request.stakeAccountAddress ? `\`${request.stakeAccountAddress}\`` : "_Non détecté_"}\n` +
        `━━━━━━━━━━━━\n` +
        `📊 *Progression*\n` +
        `Statut : *${canClaim ? "✅ Prêt à être réclamé" : "⛓ Désactivation en cours"}*\n` +
        `Disponibilité : ${canClaim ? "*Maintenant*" : `\`${timerText}\``}\n` +
      `Epoch Actuelle : \`${currentEpoch}\`\n` +
        `━━━━━━━━━━━━\n\n` +
        (canClaim 
          ? "✅ *Vos SOL sont prêts !*\n\nCliquez sur le bouton ci-dessous pour les transférer immédiatement vers votre wallet." 
          : "💡 *Note* : Le retrait standard n'est pas automatique. Une fois le délai écoulé, un bouton **Réclamer** apparaîtra ici pour vous permettre de récupérer vos SOL.") +
        (!request.stakeAccountAddress ? "\n\n⚠️ *Attention* : Le bot ne trouve pas votre compte de stake sur la blockchain. Si vous l'avez, vous pouvez le saisir manuellement." : "") +
        (request.stakeAccountAddress === request.walletAddress ? "\n\n❌ *Erreur détectée* : Vous avez lié votre adresse de Wallet au lieu de votre compte de Stake. Utilisez le bouton ci-dessous pour corriger." : ""),
        {
          parse_mode: "Markdown",
          ...jitoUnstakeStatusKeyboard(requestId, canClaim, !!request.stakeAccountAddress && request.stakeAccountAddress !== request.walletAddress)
        }
      );
    } catch (error) {
      console.error("Status sync error:", error);
      ctx.editMessageText(`❌ Erreur de synchronisation: ${error.message}`, mainMenuKeyboard());
    }
  });

  // Claim Unstake Handler
  bot.action(/^jito_claim_unstake_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];
    
    await ctx.editMessageText("⏳ *Extraction des SOL depuis la blockchain...*");
    
    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) throw new Error("Demande non trouvée.");

      if (!request.stakeAccountAddress || request.stakeAccountAddress === "UNKNOWN") {
        throw new Error("L'adresse du compte de stake est manquante. Veuillez rafraîchir le menu pour synchroniser avec la blockchain.");
      }

      const wallet = await storage.getWalletWithKey(chatId, request.walletId);
      
      // Real blockchain withdrawal
      const result = await JitoService.claimExitStandard(wallet.privateKey, request.stakeAccountAddress);
      
      if (result.success) {
        await storage.removeUnstakeRequest(chatId, requestId);
        await ctx.editMessageText(
          "✅ *SOL récupérés avec succès !*\n\n" +
          `Les SOL ont été transférés vers votre wallet.\n\n` +
          `🔗 [Voir la transaction](https://solscan.io/tx/${result.txHash})`,
          { parse_mode: "Markdown", ...mainMenuKeyboard() }
        );
      } else {
        if (result.error && result.error.includes("not yet deactivated")) {
           return ctx.answerCbQuery("⚠️ Le compte n'est pas encore totalement désactivé par le réseau.", { show_alert: true });
        }
        throw new Error(result.error || "Échec du retrait");
      }
    } catch (error) {
      console.error("Claim error:", error);
      ctx.reply(`❌ Erreur lors du retrait : ${error.message}\n\nAssurez-vous que l'epoch est bien terminée.`);
    }
  });

  bot.action(/^jito_unstake_manual_sync_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];
    const requests = await storage.getUnstakeRequests(chatId);
    const request = requests.find(r => r.id === requestId);
    
    sessions.setData(chatId, { requestId, walletAddress: request?.walletAddress });
    sessions.setState(chatId, "JITO_UNSTAKE_MANUAL_ADDRESS");
    
    await ctx.editMessageText("✏️ *Saisie manuelle de l'adresse*\n\nVeuillez copier et coller l'adresse de votre **Stake Account** (vous pouvez la trouver sur Solscan dans l'historique de votre wallet) :", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Annuler", `jito_unstake_status_${requestId}`)]])
    });
  });

  bot.action(/^jito_unstake_auto_repair_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const requestId = ctx.match[1];
    
    await ctx.editMessageText("🔍 *Recherche de votre compte sur la blockchain...*", { parse_mode: "Markdown" });
    
    try {
      const requests = await storage.getUnstakeRequests(chatId);
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error("Demande non trouvée");

      // Scan by wallet address
      const blockchainExits = await JitoService.getPendingStandardExits(request.walletAddress);
      
      if (blockchainExits.success && blockchainExits.pending.length > 0) {
        const found = blockchainExits.pending[0].address;
        await storage.updateUnstakeRequest(chatId, requestId, { stakeAccountAddress: found });
        
        await ctx.reply(`✅ Compte de stake détecté : \`${found}\`\n\nIl a été lié à votre demande. Vous pouvez maintenant retourner au statut pour réclamer vos SOL.`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[Markup.button.callback("⏳ Voir le statut", `jito_unstake_status_${requestId}`)]])
        });
      } else {
        await ctx.reply("❌ Aucun compte de stake n'a été détecté pour votre wallet.\n\nAssurez-vous que l'opération a bien été faite sur la blockchain (il peut y avoir un délai de quelques minutes).", {
          ...Markup.inlineKeyboard([[Markup.button.callback("✏️ Saisir manuellement", `jito_unstake_manual_sync_${requestId}`)]])
        });
      }
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });

  bot.action("jito_unstake_pending_info", async (ctx) => {
    await ctx.answerCbQuery("⏳ Le protocole Jito libère les fonds à la fin de l'epoch (tous les 2-3 jours).", { show_alert: true });
  });

  bot.action("jito_exit_std_manual", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const data = sessions.getData(chatId);
    
    if (!data || !data.jitoBalance) {
      return ctx.reply("❌ Session expirée.", mainMenuKeyboard());
    }

    sessions.setState(chatId, "JITO_EXIT_STANDARD_AMOUNT");
    
    await ctx.reply(
      `✏️ *Saisie manuelle (Standard)*\n\n` +
      `Solde disponible : *${formatAmount(data.jitoBalance)} JitoSOL*\n\n` +
      `Entrez le montant à retirer (ex: 0.1 ou 10€) :`,
      { 
        parse_mode: "Markdown", 
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Annuler", "jito_withdraw")]]) 
      }
    );
  });

  bot.action("jito_wallet_selection", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === "sol");

    const buttons = solWallets.map(w => [
      Markup.button.callback(`${w.label || w.address.slice(0, 8)}...`, `jito_select_wallet_${w.id}`)
    ]);
    buttons.push([Markup.button.callback("↩️ Retour", "jito_staking")]);

    await ctx.editMessageText(
      "💳 *Sélection du Wallet Solana*\n\nChoisissez le wallet à utiliser pour JitoSOL :",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
    );
  });

  bot.action(/^jito_select_wallet_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];
    
    sessions.setData(chatId, { ...sessions.getData(chatId), stakingWalletId: walletId });
    
    // Manual redirect to jito_staking logic
    // We can just call the action handler again by name if we refactor it, 
    // or just send a message and then the menu.
    // Actually, the easiest is to just tell the user it's selected and show a button.
    
    await ctx.editMessageText(
      "✅ *Wallet sélectionné*\n\nLe bot va maintenant utiliser ce wallet pour JitoSOL.",
      { 
        parse_mode: "Markdown", 
        ...Markup.inlineKeyboard([[Markup.button.callback("➡️ Retour au Menu Jito", "jito_staking")]]) 
      }
    );
  });

  bot.action(/^jito_unstake_delete_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    await safeAnswerCbQuery(ctx);
    try {
      await storage.removeUnstakeRequest(ctx.chat.id, requestId);
      await ctx.editMessageText("🗑 *Demande supprimée.*\n\nVous pouvez maintenant en lancer une nouvelle qui sera réelle.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("↩️ Menu JitoSOL", "jito_staking")]])
      });
    } catch (error) {
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });

  console.log("[JITO_HANDLERS] Loaded");
}