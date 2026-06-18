import { setupSendActions } from './actions.js';
import { setupSendTextInput } from './text-input.js';
import { safeAnswerCbQuery } from '../../../shared/utils/telegram.js';
import { mainMenuKeyboard, quickAmountKeyboard } from '../../keyboards/index.js';
import { CALLBACKS, CALLBACK_REGEX } from '../../constants/callbacks.js';

/**
 * Setup all send-related handlers
 */
export function setupSendHandlers(bot, storage, walletService, sessions) {
  // Analyze address menu
  bot.action(CALLBACKS.ANALYZE_ADDRESS, async (ctx) => {
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    sessions.setState(chatId, 'ENTER_ADDRESS_ANALYZE');
    ctx.editMessageText(
      "🔍 <b>Analyse d'adresse</b>\n\n" +
        'Envoie-moi une adresse publique (ETH, BTC, LTC, BCH, SOL, ARB, MATIC, OP, BASE, AVAX, TON) pour voir son solde et tous ses tokens.',
      { parse_mode: 'HTML' }
    );
  });

  // Amount type selection (callback from ENTER_ADDRESS flow)
  bot.action(CALLBACK_REGEX.AMOUNT_TYPE, async (ctx) => {
    const type = ctx.match[1]; // native or eur
    const chatId = ctx.chat.id;
    await safeAnswerCbQuery(ctx);

    const data = sessions.getData(chatId);
      sessions.updateData(chatId, { amountType: type });

    try {
      const balanceData = await walletService.getBalance(chatId, data.selectedWalletId);

      // Store current balance for quick calculations
      const balanceNum = Number.parseFloat(balanceData.balance);
      sessions.updateData(chatId, {
        currentBalance: balanceNum,
        currentBalanceLamports: balanceData.balanceLamports,
      });

      const label = type === 'native' ? data.selectedChain.toUpperCase() : 'Euros';
      const prompt =
        '💰 <b>Saisie du montant</b>\n\n' +
        `Ton solde : <b>${balanceData.balance} ${data.selectedChain.toUpperCase()}</b>\n\n` +
        `Entre le montant en <b>${label}</b> ou utilise les raccourcis :`;

      ctx.editMessageText(prompt, { parse_mode: 'HTML', ...quickAmountKeyboard() });
      sessions.setState(chatId, 'SELECT_QUICK_AMOUNT');
    } catch (error) {
      ctx.editMessageText(`❌ Erreur: ${error.message}`, mainMenuKeyboard());
    }
  });

  // Initialize sub-modules
  setupSendActions(bot, storage, walletService, sessions);
  setupSendTextInput(bot, storage, walletService, sessions);
}
