import { Markup } from 'telegraf';

const STAKING_WALLET_SETTING = 'stakingSolWalletId';
const STAKING_SESSION_KEY = 'stakingWalletId';

export function formatStakingWalletLabel(wallet, activeWalletId = null) {
  const active = activeWalletId && wallet.id === activeWalletId ? '⭐ ' : '';
  const label = wallet.label || `SOL ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  return `${active}${label} (${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)})`;
}

export async function getSolWallets(storage, chatId) {
  const wallets = await storage.getWallets(chatId);
  return wallets.filter((wallet) => wallet.chain === 'sol');
}

export async function getPreferredStakingWallet(storage, sessions, chatId, solWallets = null) {
  const wallets = solWallets || (await getSolWallets(storage, chatId));
  if (wallets.length === 0) {
    return null;
  }

  const sessionWalletId = sessions?.getData(chatId)?.[STAKING_SESSION_KEY];
  const data = typeof storage.loadUserData === 'function' ? await storage.loadUserData(chatId) : {};
  const storedWalletId = data.settings?.[STAKING_WALLET_SETTING];
  const preferredWalletId = storedWalletId || sessionWalletId;
  const preferredWallet = preferredWalletId
    ? wallets.find((wallet) => wallet.id === preferredWalletId)
    : null;

  return preferredWallet || (wallets.length === 1 ? wallets[0] : null);
}

export async function setPreferredStakingWallet(storage, sessions, chatId, walletId) {
  sessions?.updateData(chatId, { [STAKING_SESSION_KEY]: walletId });

  if (typeof storage.updateSettings === 'function') {
    await storage.updateSettings(chatId, { [STAKING_WALLET_SETTING]: walletId });
  }
}

export function stakingWalletSelectionKeyboard({
  wallets,
  activeWalletId,
  callbackPrefix,
  backCallback,
}) {
  const buttons = wallets.map((wallet) => [
    Markup.button.callback(
      formatStakingWalletLabel(wallet, activeWalletId),
      `${callbackPrefix}_${wallet.id}`
    ),
  ]);
  buttons.push([Markup.button.callback('↩️ Retour', backCallback)]);
  return Markup.inlineKeyboard(buttons);
}
