import { Markup } from "telegraf";

export function liquidStakingKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🥇 JitoSOL", "jito_staking"),
      Markup.button.callback("🥈 Marinade", "marinade_staking"),
    ],
    [Markup.button.callback("↩️ Retour", "staking_yield")],
  ]);
}

export function jitoWithdrawalKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("⚡ Rapide (Swap)", "jito_exit_fast_select"),
      Markup.button.callback("⏳ Standard (Unstake)", "jito_exit_standard_select"),
    ],
    [Markup.button.callback("↩️ Retour", "jito_staking")],
  ]);
}

export function stakingExitKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("25%", "jito_exit_quick_25"),
      Markup.button.callback("50%", "jito_exit_quick_50"),
      Markup.button.callback("100%", "jito_exit_quick_100"),
    ],
    [Markup.button.callback("✏️ Saisir un montant", "jito_exit_manual")],
    [Markup.button.callback("❌ Retour", "jito_staking")],
  ]);
}

export function jitoStandardExitKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("25%", "jito_exit_std_25"),
      Markup.button.callback("50%", "jito_exit_std_50"),
      Markup.button.callback("100%", "jito_exit_std_100"),
    ],
    [Markup.button.callback("✏️ Saisir un montant", "jito_exit_std_manual")],
    [Markup.button.callback("❌ Retour", "jito_withdraw")],
  ]);
}

export function jitoUnstakeStatusKeyboard(requestId, canClaim = false, hasAddress = true) {
  const buttons = [];
  if (canClaim) {
    buttons.push([Markup.button.callback("✅ Réclamer mes SOL", `jito_claim_unstake_${requestId}`)]);
  } else {
    buttons.push([Markup.button.callback("⏳ Désactivation en cours...", "jito_unstake_pending_info")]);
  }
  
  if (!hasAddress) {
    buttons.push([Markup.button.callback("🔍 Recherche automatique", `jito_unstake_auto_repair_${requestId}`)]);
    buttons.push([Markup.button.callback("✏️ Saisir l'adresse manuellement", `jito_unstake_manual_sync_${requestId}`)]);
    buttons.push([Markup.button.callback("🗑 Supprimer cette demande", `jito_unstake_delete_${requestId}`)]);
  }

  buttons.push([Markup.button.callback("↩️ Retour au Menu Jito", "jito_staking")]);
  return Markup.inlineKeyboard(buttons);
}
