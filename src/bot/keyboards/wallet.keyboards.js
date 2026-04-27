import { Markup } from "telegraf";

export function walletListKeyboard(wallets, prefix = "wallet_") {
  const chainEmojis = {
    eth: "🔷",
    btc: "₿",
    ltc: "◈",
    bch: "₿",
    sol: "◎",
    arb: "🔴",
    matic: "🟣",
    op: "🔵",
    base: "🟦",
  };
  const buttons = wallets.map((w) => [
    Markup.button.callback(
      `${chainEmojis[w.chain] || "●"} ${w.chain.toUpperCase()} - ${w.label}`,
      `${prefix}${w.id}`,
    ),
  ]);
  buttons.push([Markup.button.callback("↩️ Retour", "back_to_menu")]);
  return Markup.inlineKeyboard(buttons);
}

export function walletActionsKeyboard(walletId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Copier Adresse", `copy_addr_${walletId}`)],
    [Markup.button.callback("🌱 Voir Seed Phrase", `view_seed_${walletId}`)],
    [Markup.button.callback("🔑 Voir Clé Privée", `view_privkey_${walletId}`)],
    [Markup.button.callback("📜 Historique", `wallet_history_${walletId}`)],
    [Markup.button.callback("🗑 Supprimer", `delete_wallet_${walletId}`)],
    [Markup.button.callback("↩️ Retour", "view_keys")],
  ]);
}

export function deleteConfirmKeyboard(walletId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗑️ Oui, Supprimer", `confirm_delete_${walletId}`)],
    [Markup.button.callback("↩️ Annuler", "view_keys")],
  ]);
}

export function corruptedWalletKeyboard(walletId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "🗑️ Supprimer ce wallet",
        `confirm_delete_${walletId}`,
      ),
    ],
    [Markup.button.callback("↩️ Retour", "view_keys")],
  ]);
}

export function walletCreationMethodKeyboard(chain) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🆕 Générer Nouveau Wallet", `generate_${chain}`)],
    [
      Markup.button.callback(
        "🔑 Importer une Clé Privée",
        `import_key_${chain}`,
      ),
    ],
    [
      Markup.button.callback(
        "🔐 Importer une Seed Phrase",
        `import_seed_${chain}`,
      ),
    ],
    [Markup.button.callback("🔙 Retour", "create_wallet")],
  ]);
}

export function chainSelectionKeyboard(actionPrefix = "chain_") {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔷 Ethereum", `${actionPrefix}eth`),
      Markup.button.callback("₿ Bitcoin", `${actionPrefix}btc`),
    ],
    [
      Markup.button.callback("◈ Litecoin", `${actionPrefix}ltc`),
      Markup.button.callback("₿ Bitcoin Cash", `${actionPrefix}bch`),
    ],
    [
      Markup.button.callback("◎ Solana", `${actionPrefix}sol`),
      Markup.button.callback("🔴 Arbitrum", `${actionPrefix}arb`),
    ],
    [
      Markup.button.callback("🟣 Polygon", `${actionPrefix}matic`),
      Markup.button.callback("🔵 Optimism", `${actionPrefix}op`),
    ],
    [
      Markup.button.callback("🟦 Base", `${actionPrefix}base`),
    ],
    [Markup.button.callback("↩️ Retour", "back_to_menu")],
  ]);
}
