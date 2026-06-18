import { Markup } from 'telegraf';
import { getAllTokensForChain, getNativeSymbol } from '../../core/tokens.config.js';
import { CHAIN_EMOJIS } from '../ui/formatters.js';
import { CALLBACKS } from '../constants/callbacks.js';

// Wallet picker — EVM wallets only (swaps are EVM in Phase 2).
export function swapWalletKeyboard(wallets) {
  const rows = wallets.map((w) => [
    Markup.button.callback(`${CHAIN_EMOJIS[w.chain] || '●'} ${w.chain.toUpperCase()} — ${w.label}`, `swap_w_${w.id}`),
  ]);
  rows.push([Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]);
  return Markup.inlineKeyboard(rows);
}

// Token picker for one side of the pair. prefix = 'swap_from_' | 'swap_to_'.
// `exclude` removes the already-chosen from-token from the to-list.
export function swapTokenKeyboard(chain, prefix, exclude = null) {
  const symbols = [getNativeSymbol(chain), ...Object.keys(getAllTokensForChain(chain))].filter(
    (s) => s !== exclude
  );
  const btns = symbols.map((s) => Markup.button.callback(s, `${prefix}${s}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  rows.push([Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]);
  return Markup.inlineKeyboard(rows);
}

// Shown under a quote. Confirm button only when execution is enabled.
export function swapQuoteKeyboard(canExecute) {
  const rows = [];
  if (canExecute) rows.push([Markup.button.callback('✅ Confirmer le swap', 'swap_confirm')]);
  rows.push([Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]);
  return Markup.inlineKeyboard(rows);
}
