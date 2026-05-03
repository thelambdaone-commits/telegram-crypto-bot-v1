import { Markup } from 'telegraf';
import { mainMenuKeyboard, walletListKeyboard, mainReplyKeyboard, feeSelectionKeyboard } from '../../keyboards/index.js';
import { formatEUR, convertToEUR } from '../../../shared/price.js';
import { formatNumber, formatCryptoAmount } from '../../ui/formatters.js';

export function setupWalletCommands(bot, storage, walletService, sessions) {
  // 👛 /wallet - Affiche la liste des wallets
  bot.command('wallet', async (ctx) => {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.reply(
        '😅 *Oups !* Tu n\'as pas encore de wallet.\n\n' +
        '💡 Utilise `/gen eth`, `/gen btc` ou `/gen sol` pour en créer un !',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
    }

    let text = '👛 *Tes Wallets*\n\n';
    
    for (const wallet of wallets) {
      const chainEmoji = { eth: '🔷', btc: '🟠', sol: '🟣' }[wallet.chain] || '💎';
      try {
        const balance = await walletService.getBalance(chatId, wallet.id);
        text += `${chainEmoji} *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += `📬 \`${wallet.address}\`\n`;
        text += `💰 Solde: *${formatCryptoAmount(balance.balance, wallet.chain)}*\n\n`;
      } catch (e) {
        text += `${chainEmoji} *${wallet.label}* (${wallet.chain.toUpperCase()})\n`;
        text += `📬 \`${wallet.address}\`\n`;
        text += '💰 Solde: _Erreur de récupération_\n\n';
      }
    }

    await ctx.reply(text, { 
      parse_mode: 'Markdown',
      ...walletListKeyboard(wallets, 'wallet_')
    });
  });

  // 🆕 /gen - Génère un nouveau wallet
  bot.command('gen', async (ctx) => {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      return ctx.reply(
        '🎲 *Génération de Wallet*\n\n' +
        'Utilise cette commande avec le réseau souhaité :\n\n' +
        '• `/gen eth` — Ethereum 🔷\n' +
        '• `/gen btc` — Bitcoin 🟠\n' +
        '• `/gen sol` — Solana 🟣',
        { parse_mode: 'Markdown' }
      );
    }

    const chain = args[0].toLowerCase();
    if (!['eth', 'btc', 'sol'].includes(chain)) {
      return ctx.reply(
        '❌ *Réseau non supporté !*\n\n' +
        'Choisis parmi : `eth`, `btc`, `sol`',
        { parse_mode: 'Markdown' }
      );
    }

    const chainNames = { eth: 'Ethereum 🔷', btc: 'Bitcoin 🟠', sol: 'Solana 🟣' };
    const loadingMsg = await ctx.reply(`⏳ Génération de ton wallet ${chainNames[chain]}...`);

    try {
      const wallet = await walletService.createWallet(chatId, chain);
      const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

      let message = `🎉 *Wallet ${chainNames[chain]} créé !*\n\n`;
      message += `🏷 *Nom :* ${wallet.label}\n`;
      message += `📬 *Adresse :*\n\`${fullWallet.address}\`\n\n`;
      
      if (fullWallet.mnemonic) {
        message += `🔐 *Phrase de récupération :*\n\`${fullWallet.mnemonic}\`\n\n`;
      }
      
      message += '⚠️ *IMPORTANT :* Sauvegarde bien cette phrase ! Elle ne sera plus affichée.\n\n';
      message += '🕐 _Ce message sera supprimé dans 60 secondes._';

      try {
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {}
      
      const sentMsg = await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...mainReplyKeyboard()
      });

      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
          ctx.reply('🔒 _Message de sécurité supprimé._', { parse_mode: 'Markdown' });
        } catch (e) {}
      }, 60000);

    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {}
      ctx.reply(`❌ Oups ! Erreur : ${error.message}`);
    }
  });

  // 💰 /bal - Vérifie le solde d'une adresse
  bot.command('bal', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      return ctx.reply(
        '💰 *Verification de solde*\n\n' +
        'Utilisation : `/bal <reseau> <adresse>`\n\n' +
        'Exemples :\n' +
        '• `/bal eth 0x123...abc`\n' +
        '• `/bal btc bc1q...xyz`\n' +
        '• `/bal sol 5Yfk...123`',
        { parse_mode: 'Markdown' }
      );
    }

    const network = args[0].toLowerCase();
    const address = args[1];

    if (!['eth', 'btc', 'sol', 'matic', 'op', 'base'].includes(network)) {
      return ctx.reply('❌ Réseau non supporté !', { parse_mode: 'Markdown' });
    }

    const loadingMsg = await ctx.reply('🔍 Recherche du solde...');

    try {
      const balanceData = await walletService.getPublicAddressBalance(network, address);
      const conversion = await convertToEUR(network, Number.parseFloat(balanceData.balance));
      
      const chainEmoji = { eth: '🔷', btc: '🟠', sol: '🟣', matic: '🟣', op: '🔵', base: '🟦' }[network] || '💎';
      
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      
      await ctx.reply(
        `${chainEmoji} *Solde ${network.toUpperCase()}*\n\n` +
        `📬 Adresse : \`${address.slice(0, 8)}...${address.slice(-6)}\`\n` +
        `💰 Solde : *${formatCryptoAmount(balanceData.balance, network)}*\n` +
        `💶 Valeur : *${formatEUR(conversion.valueEUR)}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer le solde : ${error.message}`);
    }
  });

  // 📤 /send - Envoie des cryptos
  bot.command('send', async (ctx) => {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 3) {
      return ctx.reply(
        '💸 *Envoi de cryptos*\n\n' +
        'Utilisation : `/send <réseau> <adresse> <montant>`\n\n' +
        'Exemple : `/send eth 0x123...abc 0.1`\n\n' +
        '💡 Pour un envoi plus guidé, utilise le bouton *🚀 Envoyer* du menu !',
        { parse_mode: 'Markdown' }
      );
    }

    const network = args[0].toLowerCase();
    const toAddress = args[1];
    const amount = Number.parseFloat(args[2].replace(',', '.'));

    if (!['eth', 'btc', 'sol'].includes(network)) {
      return ctx.reply('❌ Réseau non supporté ! Choisis : `eth`, `btc`, `sol`', { parse_mode: 'Markdown' });
    }

    if (Number.isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Montant invalide !');
    }

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find(w => w.chain === network);

    if (!wallet) {
      return ctx.reply(`❌ Tu n'as pas de wallet ${network.toUpperCase()} !`, { parse_mode: 'Markdown' });
    }

    sessions.setData(chatId, {
      selectedWalletId: wallet.id,
      selectedChain: network,
      toAddress: toAddress,
      amount: amount,
      amountType: 'native'
    });
    sessions.setState(chatId, 'SELECT_FEE');

    try {
      const balanceData = await walletService.getBalance(chatId, wallet.id);
      const fees = await walletService.estimateFees(chatId, wallet.id, toAddress, amount);
      
      sessions.setData(chatId, { 
        ...sessions.getData(chatId), 
        fees,
        currentBalance: Number.parseFloat(balanceData.balance)
      });

      const conversion = await convertToEUR(network, amount);
      
      await ctx.reply(
        '💸 *Préparation de l\'envoi*\n\n' +
        `📤 De : ${wallet.label}\n` +
        `📥 Vers : \`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}\`\n` +
        `💰 Montant : *${formatCryptoAmount(amount, network)}*\n` +
        `💶 Valeur : ${formatEUR(conversion.valueEUR)}\n` +
        `📊 Solde dispo : ${balanceData.balance} ${network.toUpperCase()}\n\n` +
        'Choisis la vitesse de transaction :',
        { parse_mode: 'Markdown', ...feeSelectionKeyboard('slow') }
      );
    } catch (error) {
      sessions.clearState(chatId);
      ctx.reply(`❌ Erreur : ${error.message}`);
    }
  });

  // 📜 /tx - Historique des transactions
  bot.command('tx', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      return ctx.reply(
        '📜 *Historique des transactions*\n\n' +
        'Utilisation : `/tx <réseau> <adresse> [limite]`',
        { parse_mode: 'Markdown' }
      );
    }

    const network = args[0].toLowerCase();
    const address = args[1];
    const limit = Math.min(Number.parseInt(args[2]) || 5, 20);

    if (!['eth', 'btc', 'sol'].includes(network)) {
      return ctx.reply('❌ Réseau non supporté !', { parse_mode: 'Markdown' });
    }

    const loadingMsg = await ctx.reply('🔍 Recherche des transactions...');

    try {
      const txHistory = await walletService.getTransactionHistory(network, address, limit);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      
      if (!txHistory || txHistory.length === 0) {
        return ctx.reply('📜 Aucune transaction trouvée.', { parse_mode: 'Markdown' });
      }

      let text = `📜 *${txHistory.length} dernières transactions (${network.toUpperCase()})*\n\n`;
      for (const tx of txHistory.slice(0, limit)) {
        const direction = tx.type === 'in' ? '📥' : '📤';
        const date = new Date(tx.timestamp).toLocaleDateString('fr-FR');
        text += `${direction} *${formatCryptoAmount(tx.amount, network)}*\n`;
        text += `📅 ${date}\n`;
        text += `🔗 \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n\n`;
      }

      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (error) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (e) {}
      ctx.reply(`❌ Impossible de récupérer l'historique : ${error.message}`);
    }
  });

  // 🔢 /unit - Conversion des unités crypto
  bot.command('unit', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      return ctx.reply(
        '🔢 *Conversion d\'Unités Crypto*\n\n' +
        'Utilisation : `/unit <montant> <unité>`',
        { parse_mode: 'Markdown' }
      );
    }

    const amount = Number.parseFloat(args[0].replace(',', '.'));
    const unit = args[1].toLowerCase().replace(/s$/, '');

    if (Number.isNaN(amount)) {
      return ctx.reply('❌ Montant invalide !');
    }

    let result = '';
    if (unit === 'btc') {
      result = `🟠 *${formatNumber(amount)} BTC* = *${formatNumber(amount * 100_000_000, 0, 0)} satoshis*`;
    } 
    else if (unit === 'satoshi' || unit === 'sat') {
      result = `🟠 *${formatNumber(amount, 0, 0)} satoshis* = *${formatNumber(amount / 100_000_000, 8, 8)} BTC*`;
    }
    else if (unit === 'eth') {
      result = `🔷 *${formatNumber(amount)} ETH* = *${formatNumber(amount * 1_000_000_000, 0, 0)} gwei*`;
    }
    else if (unit === 'gwei') {
      result = `🔷 *${formatNumber(amount, 0, 0)} gwei* = *${formatNumber(amount / 1_000_000_000, 9, 9)} ETH*`;
    }
    else if (unit === 'sol') {
      result = `🟣 *${formatNumber(amount)} SOL* = *${formatNumber(amount * 1_000_000_000, 0, 0)} lamports*`;
    }
    else if (unit === 'lamport') {
      result = `🟣 *${formatNumber(amount, 0, 0)} lamports* = *${formatNumber(amount / 1_000_000_000, 9, 9)} SOL*`;
    }
    else {
      return ctx.reply('❌ Unité non reconnue ! (btc, sat, eth, gwei, sol, lamport)');
    }

    await ctx.reply(`🔢 *Conversion*\n\n${result}`, { parse_mode: 'Markdown' });
  });
}
