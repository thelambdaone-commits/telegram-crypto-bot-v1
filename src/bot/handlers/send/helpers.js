import { convertToEUR, formatEUR } from '../../../shared/price.js';
import { EMOJIS } from '../../i18n/index.js';
import { truncateAddress } from '../../i18n/formatters.js';
import { logger } from '../../../shared/logger.js';
import { ERROR_CODES } from '../../../shared/errors.js';

/**
 * Format transaction details for confirmation
 */
export async function formatTxDetails(data, feeLevel) {
  const fee = data.fees[feeLevel];
  const feeAmount = fee.estimatedFee || fee.feeSOL || '0';
  const tokenSymbol = data.selectedToken;
  const displaySymbol = tokenSymbol || data.selectedChain.toUpperCase();

  // Determine native symbol for fees
  const CHAIN_NATIVE_SYMBOLS = {
    sol: 'SOL',
    eth: 'ETH',
    matic: 'MATIC',
    arb: 'ETH',
    op: 'ETH',
    base: 'ETH',
    btc: 'BTC',
    ltc: 'LTC',
    bch: 'BCH',
    xmr: 'XMR',
    zec: 'ZEC',
  };
  const nativeSymbol = CHAIN_NATIVE_SYMBOLS[data.selectedChain] || data.selectedChain.toUpperCase();

  let amountEUR, feeEUR;

  if (tokenSymbol) {
    amountEUR = await convertToEUR('usd', data.amount);
    // Fee is always in native currency
    feeEUR = await convertToEUR(data.selectedChain, Number.parseFloat(feeAmount));
  } else {
    amountEUR = await convertToEUR(data.selectedChain, data.amount);
    feeEUR = await convertToEUR(data.selectedChain, Number.parseFloat(feeAmount));
  }

  let totalDisplay;
  if (tokenSymbol) {
    // If it's a token, show separately: Amount TOKEN + Fee NATIVE
    totalDisplay = `<b>${data.amount.toFixed(6)} ${displaySymbol} + ${Number(feeAmount).toFixed(8)} ${nativeSymbol}</b>`;
  } else {
    // If it's native, show unified total
    const total = data.amount + Number.parseFloat(feeAmount);
    totalDisplay = `<b>${total.toFixed(6)} ${nativeSymbol}</b>`;
  }

  const details =
    "🏁 <b>Détails de l'envoi</b>\n\n" +
    `📮 Vers : <code>${truncateAddress(data.toAddress)}</code>\n\n` +
    `${EMOJIS.money} Montant: <b>${data.amount.toFixed(6)} ${displaySymbol}</b> (${formatEUR(amountEUR.valueEUR)})\n` +
    `⛽ Frais: <b>${Number(feeAmount).toFixed(8)} ${nativeSymbol}</b> (${formatEUR(feeEUR.valueEUR)})\n` +
    `💎 Total: ${totalDisplay}`;

  if (tokenSymbol && data.selectedChain === 'arb') {
    return (
      details +
      "\n\n⚠️ <b>Attention:</b> Les frais sont payes en ETH native sur Arbitrum.\n\n💡 <i>Verifie bien l'adresse avant de confirmer.</i>"
    );
  }

  return details + "\n\n💡 <i>Verifie bien l'adresse avant de confirmer.</i>";
}

/**
 * Handle errors in send flow
 */
export async function handleSendError(ctx, error, mainMenuKeyboard) {
  logger.logError(error, { context: 'handleSendError', chatId: ctx.chat?.id });

  let message;
  switch (error.code) {
    case ERROR_CODES.INSUFFICIENT_FUNDS:
      message = '❌ Solde insuffisant pour couvrir le montant et les frais.';
      break;
    case ERROR_CODES.RPC_ERROR:
      message = '❌ Erreur de connexion au réseau. Réessaie.';
      break;
    case ERROR_CODES.BROADCAST_FAILED:
      message = '❌ La transaction a échoué lors de la diffusion sur le réseau.';
      break;
    case ERROR_CODES.USER_REJECTED:
      message = "❌ Transaction refusée par l'utilisateur.";
      break;
    case ERROR_CODES.INVALID_ADDRESS:
      message = '❌ Adresse de destination invalide.';
      break;
    default:
      message = `❌ Erreur: ${error.message}`;
  }

  return ctx.editMessageText(message, {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(),
  });
}
