import { formatNumber } from '../../ui/formatters.js';
import { formatCollateralBalance as formatCollateralBalanceUi } from '../../ui/formatters.js';

export function formatCollateralBalance(value) {
  return formatCollateralBalanceUi(value).replace(',', '.');
}

export function formatWalletAssets(walletBalance, tokens = [], chain = 'eth') {
  const symbol = chain.toUpperCase();
  const nativeBalance = Number(walletBalance?.balance || walletBalance || 0);
  const lines = [`${formatNumber(nativeBalance, 4, 6)} ${symbol}`];

  const visibleTokens = (tokens || [])
    .filter((token) => Number(token.balance || token.uiAmount || 0) > 0)
    .slice(0, 4);

  for (const token of visibleTokens) {
    const amount = Number(token.balance || token.uiAmount || 0);
    const tokenSymbol = token.symbol || token.mint || token.contractAddress || 'TOKEN';
    lines.push(`${formatNumber(amount, 2, 6)} ${tokenSymbol}`);
  }

  if ((tokens || []).length > visibleTokens.length) {
    lines.push(`+${tokens.length - visibleTokens.length} tokens`);
  }

  return lines.join(', ');
}
