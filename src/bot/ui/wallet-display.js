import { convertToEUR, formatEUR } from '../../shared/price.js';

export async function getWalletBalanceEUR(walletService, chatId, wallet) {
  const balance = await walletService.getBalance(chatId, wallet.id);
  const balanceNum = Number.parseFloat(balance.balance) || 0;
  let valueEUR = 0;
  if (balanceNum > 0) {
    try {
      const conversion = await convertToEUR(wallet.chain, balanceNum);
      valueEUR = conversion.valueEUR || 0;
    } catch {}
  }
  return { balance, balanceNum, valueEUR };
}

export async function buildBalancesText(walletService, storage, chatId) {
  const wallets = await storage.getWallets(chatId);
  let text = '\n';
  let totalEUR = 0;

  const results = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        const { balance, valueEUR } = await getWalletBalanceEUR(
          walletService, chatId, wallet
        );
        return { wallet, balance, valueEUR, error: null };
      } catch {
        return { wallet, balance: null, valueEUR: 0, error: true };
      }
    })
  );

  for (const { wallet, balance, valueEUR, error } of results) {
    if (!error) {
      totalEUR += valueEUR;
      text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
      text += `Solde: ${balance.balance} ${balance.symbol || wallet.chain.toUpperCase()}`;
      if (valueEUR > 0) text += ` ≈ ${formatEUR(valueEUR)}`;
    } else {
      text += `🔸 *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
      text += '❌ Erreur de récupération\n\n';
    }
    text += '\n\n';
  }

  text += '━━━━━━━━━━━━\n';
  text += `💶 *Total :* ${formatEUR(totalEUR)}`;
  return text;
}
