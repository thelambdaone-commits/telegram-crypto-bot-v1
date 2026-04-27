import { Markup } from "telegraf";

export function feeSelectionKeyboard(recommendedLevel = "slow") {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `🐢 Lent (Economique)${recommendedLevel === "slow" ? " ✅" : ""}`,
        "fee_slow",
      ),
    ],
    [
      Markup.button.callback(
        `🚗 Moyen${recommendedLevel === "average" ? " ✅" : ""}`,
        "fee_average",
      ),
    ],
    [
      Markup.button.callback(
        `🚀 Rapide${recommendedLevel === "fast" ? " ✅" : ""}`,
        "fee_fast",
      ),
    ],
    [Markup.button.callback("🤖 Auto (Meilleur rapport)", "fee_auto")],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

export function confirmationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Confirmer", "confirm_send")],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

export function tokenSelectionKeyboard(chain) {
  const buttons = [];
  
  if (chain === "eth" || chain === "arb" || chain === "op" || chain === "base") {
    buttons.push([Markup.button.callback("🔷 ETH (native)", `token_${chain}_native`)]);
  } else if (chain === "matic") {
    buttons.push([Markup.button.callback("🟣 MATIC (native)", `token_${chain}_native`)]);
  }
  
  if (["arb", "matic", "op", "base"].includes(chain)) {
    buttons.push([Markup.button.callback("💵 USDC", `token_${chain}_USDC`)]);
    buttons.push([Markup.button.callback("💵 USDT", `token_${chain}_USDT`)]);
  }
  
  buttons.push([Markup.button.callback("↩️ Retour", "back_to_menu")]);
  return Markup.inlineKeyboard(buttons);
}

export function amountTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔷 En Crypto (Native)", "amount_type_native"),
      Markup.button.callback("💶 En Euros (EUR)", "amount_type_eur"),
    ],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

export function quickAmountKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("💯 Tout envoyer", "quick_amount_all"),
      Markup.button.callback("📊 50% du solde", "quick_amount_50"),
    ],
    [Markup.button.callback("✏️ Saisir un montant", "manual_amount")],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

export function addressAnalyzedKeyboard(chain) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "📤 Envoyer a cette adresse",
        `send_to_analyzed_${chain}`,
      ),
    ],
    [Markup.button.callback("🔍 Analyser une autre adresse", "analyze_address")],
    [Markup.button.callback("↩️ Retour au menu", "back_to_menu")],
  ]);
}
