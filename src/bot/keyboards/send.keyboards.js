import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';
import { getAddressExplorerUrl, getExplorerName } from '../../shared/explorer.js';
import { getAllTokensForChain, getNativeSymbol } from '../../core/tokens.config.js';
import { COIN_IDS } from '../../shared/coingecko.js';

export function feeSelectionKeyboard(recommendedLevel = 'slow') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `🐢 Lent (Economique)${recommendedLevel === 'slow' ? ' ✅' : ''}`,
        CALLBACKS.FEE_SLOW
      ),
    ],
    [
      Markup.button.callback(
        `🚗 Moyen${recommendedLevel === 'average' ? ' ✅' : ''}`,
        CALLBACKS.FEE_AVERAGE
      ),
    ],
    [Markup.button.callback(`🚀 Rapide${recommendedLevel === 'fast' ? ' ✅' : ''}`, CALLBACKS.FEE_FAST)],
    [Markup.button.callback('🤖 Auto (Meilleur rapport)', CALLBACKS.FEE_AUTO)],
    [Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)],
  ]);
}

export function confirmationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirmer', CALLBACKS.CONFIRM_SEND)],
    [Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)],
  ]);
}

// Generic token picker driven by the single token registry: the native coin
// plus every token defined for the chain. Works for all chains automatically.
export function tokenSelectionKeyboard(chain) {
  const buttons = [];
  const native = getNativeSymbol(chain);
  buttons.push([Markup.button.callback(`🪙 ${native} (natif)`, `token_${chain}_native`)]);

  for (const [symbol, token] of Object.entries(getAllTokensForChain(chain))) {
    const icon = token.icon || '🎫';
    buttons.push([Markup.button.callback(`${icon} ${symbol}`, `token_${chain}_${symbol}`)]);
  }

  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(buttons);
}

// Whether the send flow should offer a token choice for this chain.
export function chainHasTokens(chain) {
  return Object.keys(getAllTokensForChain(chain)).length > 0;
}

export function amountTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔷 En Crypto (Native)', CALLBACKS.AMOUNT_TYPE_NATIVE),
      Markup.button.callback('💶 En Euros (EUR)', CALLBACKS.AMOUNT_TYPE_EUR),
    ],
    [Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)],
  ]);
}

export function quickAmountKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💯 Tout envoyer', CALLBACKS.QUICK_AMOUNT_ALL),
      Markup.button.callback('📊 50% du solde', CALLBACKS.QUICK_AMOUNT_50),
    ],
    [Markup.button.callback('✏️ Saisir un montant', CALLBACKS.MANUAL_AMOUNT)],
    [Markup.button.callback('❌ Annuler', CALLBACKS.CANCEL)],
  ]);
}

export function addressAnalyzedKeyboard(chain, address) {
  const buttons = [];

  if (address) {
    const url = getAddressExplorerUrl(chain, address);
    if (url) {
      const name = getExplorerName(chain);
      buttons.push([Markup.button.url(`🔗 Voir sur ${name}`, url)]);
    }
  }

  buttons.push([Markup.button.callback('📜 Historique', `analyze_history_${chain}`)]);
  // Price chart for this chain's coin, when it's priced/graphable.
  if (COIN_IDS[String(chain).toLowerCase()]) {
    buttons.push([Markup.button.callback(`📈 Graphique ${String(chain).toUpperCase()}`, `graph_${chain}`)]);
  }
  buttons.push(
    [Markup.button.callback('📤 Envoyer a cette adresse', `send_to_analyzed_${chain}`)],
    [Markup.button.callback('🔍 Analyser une autre adresse', CALLBACKS.ANALYZE_ADDRESS)],
    [Markup.button.callback('↩️ Retour au menu', CALLBACKS.BACK_TO_MENU)],
  );

  return Markup.inlineKeyboard(buttons);
}
