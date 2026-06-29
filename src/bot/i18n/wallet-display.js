import { convertToEUR, formatEUR, getPricesEUR } from '../../shared/price.js';
import { getAllTokensForChain } from '../../core/tokens.config.js';
import { formatNumber, separator } from './formatters.js';
import { escapeHtml } from '../../shared/utils/telegram.js';

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

// Non-zero token balances for a wallet, with their EUR value.
async function getTokenBalances(walletService, chatId, wallet, prices) {
  const symbols = Object.keys(getAllTokensForChain(wallet.chain));
  if (symbols.length === 0) return [];

  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const bal = await walletService.getBalance(chatId, wallet.id, symbol);
        const num = Number.parseFloat(bal.balance) || 0;
        if (num <= 0) return null;
        const price = prices[symbol.toLowerCase()] || 0;
        return { symbol, num, valueEUR: num * price };
      } catch {
        return null;
      }
    })
  );
  return entries.filter(Boolean);
}

export async function buildBalancesText(walletService, storage, chatId) {
  const wallets = await storage.getWallets(chatId);
  const prices = await getPricesEUR().catch(() => ({}));
  let text = '\n';
  let totalEUR = 0;

  const results = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        const { balance, valueEUR } = await getWalletBalanceEUR(walletService, chatId, wallet);
        const tokens = await getTokenBalances(walletService, chatId, wallet, prices);
        return { wallet, balance, valueEUR, tokens, error: null };
      } catch {
        return { wallet, balance: null, valueEUR: 0, tokens: [], error: true };
      }
    })
  );

  for (const { wallet, balance, valueEUR, tokens, error } of results) {
    text += `🔸 <b>${escapeHtml(wallet.label)}</b> (${wallet.chain.toUpperCase()})\n`;
    if (error) {
      text += '❌ Erreur de récupération\n\n';
      continue;
    }

    totalEUR += valueEUR;
    // Localise the decimal separator (fr-FR) and cap to 8 decimals without
    // forcing trailing zeros, so "0" stays "0" and BTC keeps its precision.
    text += `Solde: ${formatNumber(Number(balance.balance), 0, 8)} ${balance.symbol || wallet.chain.toUpperCase()}`;
    if (valueEUR > 0) text += ` ≈ ${formatEUR(valueEUR)}`;
    text += '\n';

    for (const t of tokens) {
      totalEUR += t.valueEUR;
      text += `   • ${formatNumber(t.num, 0, 8)} ${t.symbol}`;
      if (t.valueEUR > 0) text += ` ≈ ${formatEUR(t.valueEUR)}`;
      text += '\n';
    }
    text += '\n';
  }

  text += `${separator()}\n`;
  text += `💶 <b>Total :</b> ${formatEUR(totalEUR)}`;
  return text;
}
