import { Markup } from 'telegraf';
import { JitoService } from '../../../../modules/staking/jito.js';
import { mainMenuKeyboard, stakingExitKeyboard, jitoWithdrawalKeyboard, jitoStandardExitKeyboard } from '../../../keyboards/index.js';
import { safeAnswerCbQuery } from '../../../utils.js';
import { formatEUR, getPricesEUR } from '../../../../shared/price.js';
import { logger } from '../../../../shared/logger.js';
import { formatAmount } from '../../../../shared/formatters.js';

export function setupJitoWithdrawHandlers(bot, storage, walletService, sessions) {
  bot.action(/^jito_exit_fast_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const action = ctx.match[1];

    if (action === 'select') {
      const wallets = await storage.getWallets(chatId);
      const solWallets = wallets.filter((w) => w.chain === 'sol');

      if (solWallets.length === 0) {
        return ctx.editMessageText("❌ Tu n'as pas de wallet Solana.", {
          parse_mode: 'Markdown',
          ...mainMenuKeyboard(),
        });
      }

      const sessionWalletId = sessions.getData(chatId)?.stakingWalletId;
      let solWallet = sessionWalletId ? solWallets.find((w) => w.id === sessionWalletId) : null;

      if (!solWallet && solWallets.length === 1) {
        solWallet = solWallets[0];
      }

      if (solWallet) {
        const balanceResult = await JitoService.getBalance(solWallet.address);
        const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
        const prices = await getPricesEUR();
        const jitoPriceEur = prices.jitosol || prices.sol || 0;
        const balanceEUR = jitoBalance * jitoPriceEur;

        if (jitoBalance <= 0) {
          return ctx.editMessageText(
            "❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.",
            { parse_mode: 'Markdown', ...mainMenuKeyboard() }
          );
        }

        sessions.updateData(chatId, {
          walletId: solWallet.id,
          action: 'jito_exit_fast',
          jitoBalance: jitoBalance,
          jitoBalanceEUR: balanceEUR,
        });
        sessions.setState(chatId, 'JITO_EXIT_FAST_AMOUNT');

        return ctx.editMessageText(
          '⚡ *Convertir JitoSOL → SOL*\n\n' +
            `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
            `(${formatEUR(balanceEUR)})\n\n` +
            'Entrez un montant en JitoSOL ou en € :\n\n' +
            '_Exemples :_\n' +
            '• `0.10` → 0.10 JitoSOL\n' +
            '• `10€` → ~10€ en JitoSOL\n' +
            '• `50%` → 50% du solde\n' +
            '• `100%` → tout le solde',
          { parse_mode: 'Markdown', ...stakingExitKeyboard() }
        );
      }

      const buttons = solWallets.map((w) => [
        Markup.button.callback(
          `${w.label || w.address.slice(0, 8)}...`,
          `jito_wallet_exit_${w.id}`
        ),
      ]);
      buttons.push([Markup.button.callback('↩️ Retour', 'jito_staking')]);

      await ctx.editMessageText('⚡ *Convertir JitoSOL → SOL*\n\nSélectionne ton wallet Solana :', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
      return;
    }

    const walletId = ctx.match[1];
    const wallet = await storage.getWalletWithKey(chatId, walletId);
    const balanceResult = await JitoService.getBalance(wallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;
    const balanceEUR = jitoBalance * jitoPriceEur;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        "❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.",
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    sessions.updateData(chatId, {
      walletId,
      action: 'jito_exit_fast',
      jitoBalance: jitoBalance,
      jitoBalanceEUR: balanceEUR,
    });
    sessions.setState(chatId, 'JITO_EXIT_FAST_AMOUNT');

    await ctx.editMessageText(
      '⚡ *Convertir JitoSOL → SOL*\n\n' +
        `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
        `(${formatEUR(balanceEUR)})\n\n` +
        'Entrez un montant en JitoSOL ou en € :\n\n' +
        '_Exemples :_\n' +
        '• `0.10` → 0.10 JitoSOL\n' +
        '• `10€` → ~10€ en JitoSOL\n' +
        '• `50%` → 50% du solde\n' +
        '• `100%` → tout le solde',
      { parse_mode: 'Markdown', ...stakingExitKeyboard() }
    );
  });

  bot.action(/^jito_wallet_exit_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const walletId = ctx.match[1];

    const wallet = await storage.getWalletWithKey(chatId, walletId);
    if (!wallet) {
      return ctx.editMessageText('❌ Wallet non trouvé.', mainMenuKeyboard());
    }

    const balanceResult = await JitoService.getBalance(wallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const prices = await getPricesEUR();
    const jitoPriceEur = prices.jitosol || prices.sol || 0;
    const balanceEUR = jitoBalance * jitoPriceEur;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        "❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.",
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    sessions.updateData(chatId, {
      walletId,
      action: 'jito_exit_fast',
      jitoBalance: jitoBalance,
      jitoBalanceEUR: balanceEUR,
    });
    sessions.setState(chatId, 'JITO_EXIT_FAST_AMOUNT');

    await ctx.editMessageText(
      '⚡ *Convertir JitoSOL → SOL*\n\n' +
        `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
        `(${formatEUR(balanceEUR)})\n\n` +
        'Entrez un montant en JitoSOL ou en € :\n\n' +
        '_Exemples :_\n' +
        '• `0.10` → 0.10 JitoSOL\n' +
        '• `10€` → ~10€ en JitoSOL\n' +
        '• `50%` → 50% du solde\n' +
        '• `100%` → tout le solde',
      { parse_mode: 'Markdown', ...stakingExitKeyboard() }
    );
  });

  bot.action('jito_withdraw', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await ctx.editMessageText(
      '💸 *Retrait JitoSOL*\n\n' +
        'Choisissez votre mode de retrait :\n\n' +
        '⚡ *Rapide* (Swap) : Immédiat, frais de swap (~0.1-0.3%).\n' +
        "⏳ *Standard* (Unstake) : Sans frais, délai de 2-3 jours (fin d'epoch).",
      { parse_mode: 'Markdown', ...jitoWithdrawalKeyboard() }
    );
  });

  bot.action('jito_exit_standard_select', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;

    const wallets = await storage.getWallets(chatId);
    const solWallets = wallets.filter((w) => w.chain === 'sol');

    if (solWallets.length === 0) {
      return ctx.editMessageText("❌ Tu n'as pas de wallet Solana.", {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard(),
      });
    }

    const sessionWalletId = sessions.getData(chatId)?.stakingWalletId;
    let solWallet = sessionWalletId ? solWallets.find((w) => w.id === sessionWalletId) : null;

    if (!solWallet) {
      if (solWallets.length === 1) {
        solWallet = solWallets[0];
      } else {
        return ctx.editMessageText(
          "💳 *Veuillez d'abord sélectionner un wallet* dans le menu JitoSOL principal.",
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Retour', 'jito_staking')]]),
          }
        );
      }
    }

    const balanceResult = await JitoService.getBalance(solWallet.address);
    const jitoBalance = balanceResult.success ? balanceResult.balance : 0;
    const rateSol = balanceResult.success ? balanceResult.rateSol : 1.07;
    const balanceSOL = jitoBalance * rateSol;

    if (jitoBalance <= 0) {
      return ctx.editMessageText(
        "❌ *Solde JitoSOL insuffisant*\n\nTu n'as pas de JitoSOL staké.\n\nFais un stake d'abord pour obtenir du JitoSOL.",
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Retour', 'jito_withdraw')]]),
        }
      );
    }

    sessions.updateData(chatId, {
      walletId: solWallet.id,
      action: 'jito_exit_standard',
      jitoBalance: jitoBalance,
      rateSol: rateSol,
    });
    sessions.setState(chatId, 'JITO_EXIT_STANDARD_AMOUNT');

    return ctx.editMessageText(
      '⏳ *Sortie Standard (Delayed Unstake)*\n\n' +
        `💰 Solde disponible : *${formatAmount(jitoBalance)} JitoSOL*\n` +
        `📊 Valeur : *${balanceSOL.toFixed(6)} SOL*\n\n` +
        "⚠️ *Important* : L'unstake standard prend **2 à 3 jours**. Vos fonds seront bloqués dans un compte de stake jusqu'à la fin de l'epoch.\n\n" +
        'Choisissez le montant à retirer :',
      { parse_mode: 'Markdown', ...jitoStandardExitKeyboard() }
    );
  });

  bot.action(/^jito_exit_std_(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const percentage = parseInt(ctx.match[1], 10) / 100;
    const data = sessions.getData(chatId);

    if (!data || !data.jitoBalance) {
      return ctx.reply('❌ Session expirée.', mainMenuKeyboard());
    }

    const amount = Number((data.jitoBalance * percentage).toFixed(6));
    const amountSOL = amount * (data.rateSol || 1.07);

    sessions.updateData(chatId, { amount });
    sessions.setState(chatId, 'JITO_EXIT_STANDARD_CONFIRM');

    await ctx.editMessageText(
      '⚠️ *Confirmation Unstake Standard*\n\n' +
        `📥 Montant à retirer : *${formatAmount(amount)} JitoSOL*\n` +
        `📤 Valeur estimée : *${formatAmount(amountSOL)} SOL*\n\n` +
        "• *Délai* : 2-3 jours (fin d'epoch)\n" +
        '• *Frais* : 0% (swap) / ~0.000005 SOL (réseau)\n\n' +
        'Une fois lancé, vous recevrez un *Stake Account* qui se désactivera automatiquement. Vous devrez cliquer sur "Récupérer" dans 2-3 jours.\n\n' +
        "Confirmer l'opération ?",
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirmer l'Unstake", 'confirm_jito_exit_standard')],
          [Markup.button.callback('❌ Annuler', 'jito_withdraw')],
        ]),
      }
    );
  });

  bot.action('jito_exit_std_manual', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const chatId = ctx.chat.id;
    const data = sessions.getData(chatId);

    if (!data || !data.jitoBalance) {
      return ctx.reply('❌ Session expirée.', mainMenuKeyboard());
    }

    sessions.setState(chatId, 'JITO_EXIT_STANDARD_AMOUNT');

    await ctx.reply(
      '✏️ *Saisie manuelle (Standard)*\n\n' +
        `Solde disponible : *${formatAmount(data.jitoBalance)} JitoSOL*\n\n` +
        'Entrez le montant à retirer (ex: 0.1 ou 10€) :',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'jito_withdraw')]]),
      }
    );
  });
}
