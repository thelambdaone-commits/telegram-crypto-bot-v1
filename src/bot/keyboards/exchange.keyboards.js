import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';

/**
 * Step 1 — compact symbol picker (one button per unique coin, ~20 total).
 * prefix = 'exch_fs_' | 'exch_ts_'. `exclude` drops an already-chosen symbol.
 * @param {{symbol:string, emoji:string}[]} symbols
 */
export function exchangeSymbolKeyboard(symbols, prefix, exclude = null) {
  const btns = symbols
    .filter((s) => s.symbol !== exclude)
    .map((s) => Markup.button.callback(`${s.emoji} ${s.symbol}`, `${prefix}${s.symbol}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  rows.push([Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Step 2 — network picker, shown only when a symbol exists on several networks.
 * prefix = 'exch_from_' | 'exch_to_'; each button resolves to a final coin key.
 * @param {{key:string, chainName:string, emoji:string}[]} coins
 */
export function exchangeNetworkKeyboard(coins, prefix) {
  const btns = coins.map((c) =>
    Markup.button.callback(`${c.emoji} ${c.chainName}`, `${prefix}${c.key}`)
  );
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Shown with a ready exchange: primary keyless AnonPay link (address pre-filled),
 * an optional SimpleSwap alternative, then new pair / menu.
 */
export function exchangeLinkKeyboard(url, openLabel, altUrl) {
  const rows = [[Markup.button.url(openLabel, url)]];
  if (altUrl) rows.push([Markup.button.url('🔁 Alternative (SimpleSwap)', altUrl)]);
  rows.push([Markup.button.callback('🔄 Autre paire', CALLBACKS.EXCHANGE)]);
  rows.push([Markup.button.callback('🏠 Menu', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(rows);
}
