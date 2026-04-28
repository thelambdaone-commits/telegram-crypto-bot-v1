import { convertToEUR, formatEUR } from '../../../shared/price.js';
import { MESSAGES, EMOJIS } from '../../messages/index.js';

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
    bch: 'BCH'
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
    totalDisplay = `*${data.amount.toFixed(6)} ${displaySymbol} + ${Number(feeAmount).toFixed(8)} ${nativeSymbol}*`;
  } else {
    // If it's native, show unified total
    const total = data.amount + Number.parseFloat(feeAmount);
    totalDisplay = `*${total.toFixed(6)} ${nativeSymbol}*`;
  }

  const details = (
    '🏁 *Details de l\'envoi*\n\n' +
    `📮 Vers: \`${data.toAddress.slice(0, 10)}...${data.toAddress.slice(-8)}\`\n\n` +
    `${EMOJIS.money} Montant: *${data.amount.toFixed(6)} ${displaySymbol}* (${formatEUR(amountEUR.valueEUR)})\n` +
    `⛽ Frais: *${Number(feeAmount).toFixed(8)} ${nativeSymbol}* (${formatEUR(feeEUR.valueEUR)})\n` +
    `💎 Total: ${totalDisplay}`
  );

  if (tokenSymbol && data.selectedChain === 'arb') {
    return details + '\n\n⚠️ *Attention:* Les frais sont payes en ETH native sur Arbitrum.\n\n💡 _Verifie bien l\'adresse avant de confirmer._';
  }

  return details + '\n\n💡 _Verifie bien l\'adresse avant de confirmer._';
}

/**
 * Handle errors in send flow
 */
export async function handleSendError(ctx, error, mainMenuKeyboard) {
  console.error('Send Flow Error:', error);
  const errorMessage = error.message.includes('insufficient funds') 
    ? '❌ Solde insuffisant pour couvrir le montant et les frais.'
    : error.message.includes('user rejected') 
      ? '❌ Transaction refusee par l\'utilisateur.'
      : `❌ Erreur: ${error.message}`;
      
  return ctx.editMessageText(errorMessage, {
    parse_mode: 'Markdown',
    ...mainMenuKeyboard(),
  });
}
