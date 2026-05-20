import { Markup } from 'telegraf';
import { CALLBACKS } from '../constants/callbacks.js';
import { getAddressExplorerUrl, getExplorerName } from '../../shared/explorer.js';

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

export function tokenSelectionKeyboard(chain) {
  const buttons = [];

  if (chain === 'eth' || chain === 'arb' || chain === 'op' || chain === 'base') {
    buttons.push([Markup.button.callback('🔷 ETH (native)', `token_${chain}_native`)]);
  } else if (chain === 'matic') {
    buttons.push([Markup.button.callback('🟣 MATIC (native)', `token_${chain}_native`)]);
  }

  if (['arb', 'matic', 'op', 'base'].includes(chain)) {
    buttons.push([Markup.button.callback('💵 USDC', `token_${chain}_USDC`)]);
    buttons.push([Markup.button.callback('💵 USDT', `token_${chain}_USDT`)]);
  }

  buttons.push([Markup.button.callback('↩️ Retour', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(buttons);
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

  buttons.push(
    [Markup.button.callback('📤 Envoyer a cette adresse', `send_to_analyzed_${chain}`)],
    [Markup.button.callback('🔍 Analyser une autre adresse', CALLBACKS.ANALYZE_ADDRESS)],
    [Markup.button.callback('↩️ Retour au menu', CALLBACKS.BACK_TO_MENU)],
  );

  return Markup.inlineKeyboard(buttons);
}
