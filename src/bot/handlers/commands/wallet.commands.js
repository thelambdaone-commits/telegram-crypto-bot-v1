import {
  mainMenuKeyboard,
  walletListKeyboard,
  mainReplyKeyboard,
  feeSelectionKeyboard,
} from '../../keyboards/index.js';
import { formatEUR, convertToEUR } from '../../../shared/price.js';
import { formatNumber, formatCryptoAmount, CHAIN_EMOJIS, truncateAddress } from '../../ui/formatters.js';
import { sendWalletKeysFile } from '../wallet/key-file.js';
import { SUPPORTED_CHAINS as PUBLIC_CHAINS } from '../../../shared/chains.js';
import { escapeHtml } from '../../../shared/utils/telegram.js';

// Native-coin denomination tables for /unit. `factor` = sub-units per 1 coin.
const UNIT_DENOMS = {
  btc: { emoji: '₿', units: [['BTC', 1], ['satoshi', 1e8]] },
  ltc: { emoji: 'Ł', units: [['LTC', 1], ['litoshi', 1e8]] },
  bch: { emoji: '🅑', units: [['BCH', 1], ['satoshi', 1e8]] },
  eth: { emoji: 'Ξ', units: [['ETH', 1], ['gwei', 1e9], ['wei', 1e18]] },
  sol: { emoji: '◎', units: [['SOL', 1], ['lamport', 1e9]] },
  xmr: { emoji: 'ɱ', units: [['XMR', 1], ['piconero', 1e12]] },
  zec: { emoji: 'Ⓩ', units: [['ZEC', 1], ['zatoshi', 1e8]] },
  trx: { emoji: '🟥', units: [['TRX', 1], ['sun', 1e6]] },
};

// Any accepted input unit (singular, lower-case) → { coin, factor }.
const UNIT_MAP = {
  btc: { coin: 'btc', factor: 1 },
  satoshi: { coin: 'btc', factor: 1e8 },
  sat: { coin: 'btc', factor: 1e8 },
  ltc: { coin: 'ltc', factor: 1 },
  litoshi: { coin: 'ltc', factor: 1e8 },
  bch: { coin: 'bch', factor: 1 },
  eth: { coin: 'eth', factor: 1 },
  gwei: { coin: 'eth', factor: 1e9 },
  wei: { coin: 'eth', factor: 1e18 },
  sol: { coin: 'sol', factor: 1 },
  lamport: { coin: 'sol', factor: 1e9 },
  xmr: { coin: 'xmr', factor: 1 },
  piconero: { coin: 'xmr', factor: 1e12 },
  atomic: { coin: 'xmr', factor: 1e12 },
  zec: { coin: 'zec', factor: 1 },
  zatoshi: { coin: 'zec', factor: 1e8 },
  trx: { coin: 'trx', factor: 1 },
  sun: { coin: 'trx', factor: 1e6 },
};

const UNIT_LIST_LABEL = 'btc, sat, ltc, litoshi, bch, eth, gwei, wei, sol, lamport, xmr, piconero, zec, zatoshi, trx, sun';

export function setupWalletCommands(bot, storage, walletService, sessions) {
  // 👛 /wallet - Affiche la liste des wallets
  bot.command('wallet', async (ctx) => {
    const chatId = ctx.chat.id;
    const wallets = await storage.getWallets(chatId);

    if (wallets.length === 0) {
      return ctx.reply(
        "😅 <b>Oups !</b> Tu n'as pas encore de wallet.\n\n" +
          '💡 Utilise <code>/gen eth</code>, <code>/gen btc</code>, <code>/gen xmr</code> ou <code>/gen zec</code> pour en créer un !',
        { parse_mode: 'HTML', ...mainMenuKeyboard() }
      );
    }

    let text = '👛 <b>Tes Wallets</b>\n\n';

    for (const wallet of wallets) {
      const chainEmoji = CHAIN_EMOJIS[wallet.chain] || '💎';
      try {
        const balance = await walletService.getBalance(chatId, wallet.id);
        text += `${chainEmoji} <b>${escapeHtml(wallet.label)}</b> (${wallet.chain.toUpperCase()})\n`;
        text += `📬 <code>${wallet.address}</code>\n`;
        text += `💰 Solde: <b>${escapeHtml(formatCryptoAmount(balance.balance, balance.symbol || wallet.chain))}</b>\n\n`;
      } catch (e) {
        text += `${chainEmoji} <b>${escapeHtml(wallet.label)}</b> (${wallet.chain.toUpperCase()})\n`;
        text += `📬 <code>${wallet.address}</code>\n`;
        text += '💰 Solde: <i>Erreur de récupération</i>\n\n';
      }
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...walletListKeyboard(wallets, 'wallet_'),
    });
  });

  // 🆕 /gen - Génère un nouveau wallet
  bot.command('gen', async (ctx) => {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
      return ctx.reply(
        '🎲 <b>Génération de Wallet</b>\n\n' +
          'Utilise cette commande avec le réseau souhaité :\n\n' +
          '• <code>/gen eth</code> — Ethereum Ξ\n' +
          '• <code>/gen btc</code> — Bitcoin ₿\n' +
          '• <code>/gen sol</code> — Solana ◎\n' +
          '• <code>/gen arb</code> — Arbitrum 🔵\n' +
          '• <code>/gen matic</code> — Polygon ⬡\n' +
          '• <code>/gen op</code> — Optimism 🔴\n' +
          '• <code>/gen base</code> — Base 🟦\n' +
          '• <code>/gen avax</code> — Avalanche 🔺\n' +
          '• <code>/gen ltc</code> — Litecoin Ł\n' +
          '• <code>/gen bch</code> — Bitcoin Cash 🅑\n' +
          '• <code>/gen xmr</code> — Monero ɱ\n' +
          '• <code>/gen zec</code> — Zcash Ⓩ',
        { parse_mode: 'HTML' }
      );
    }

    const chain = args[0].toLowerCase();
    const supportedChains = ['eth', 'btc', 'sol', 'arb', 'matic', 'op', 'base', 'avax', 'ltc', 'bch', 'xmr', 'zec'];
    if (!supportedChains.includes(chain)) {
      return ctx.reply(
        '❌ <b>Réseau non supporté !</b>\n\n' + `Choisis parmi : <code>${supportedChains.join(', ')}</code>`,
        {
          parse_mode: 'HTML',
        }
      );
    }

    const chainNames = {
      eth: 'Ethereum Ξ',
      btc: 'Bitcoin ₿',
      sol: 'Solana ◎',
      arb: 'Arbitrum 🔵',
      matic: 'Polygon ⬡',
      op: 'Optimism 🔴',
      base: 'Base 🟦',
      avax: 'Avalanche 🔺',
      ltc: 'Litecoin Ł',
      bch: 'Bitcoin Cash 🅑',
      xmr: 'Monero ɱ',
      zec: 'Zcash Ⓩ',
    };
    const loadingMsg = await ctx.reply(`⏳ Génération de ton wallet ${chainNames[chain]}...`);

    try {
      const wallet = await walletService.createWallet(chatId, chain);
      const fullWallet = await storage.getWalletWithKey(chatId, wallet.id);

      let message = `🎉 <b>Wallet ${chainNames[chain]} créé !</b>\n\n`;
      message += `🏷 <b>Nom :</b> ${escapeHtml(wallet.label)}\n`;
      message += `📬 <b>Adresse :</b>\n<code>${fullWallet.address}</code>\n\n`;

      await sendWalletKeysFile(ctx, fullWallet, storage);

      if (fullWallet.mnemonic) {
        message += `🔐 <b>Phrase de récupération :</b>\n<code>${escapeHtml(fullWallet.mnemonic)}</code>\n\n`;
      }

      message += '⚠️ <b>IMPORTANT :</b> Sauvegarde bien cette phrase ! Elle ne sera plus affichée.\n\n';
      message += '🕐 <i>Ce message sera supprimé dans 60 secondes.</i>';

      try {
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {}

      const sentMsg = await ctx.reply(message, {
        parse_mode: 'HTML',
        ...mainReplyKeyboard(),
      });

      const deleteTimer = setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
          ctx.reply('🔒 <i>Message de sécurité supprimé.</i>', { parse_mode: 'HTML' });
        } catch (e) {}
      }, 60000);
      deleteTimer.unref();
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
        '💰 <b>Verification de solde</b>\n\n' +
          'Utilisation : <code>/bal &lt;reseau&gt; &lt;adresse&gt;</code>\n\n' +
          'Exemples :\n' +
          '• <code>/bal eth 0x123...abc</code>\n' +
          '• <code>/bal btc bc1q...xyz</code>\n' +
          '• <code>/bal sol 5Yfk...123</code>',
        { parse_mode: 'HTML' }
      );
    }

    const network = args[0].toLowerCase();
    const address = args[1];

    if (!PUBLIC_CHAINS.includes(network)) {
      return ctx.reply(`❌ Réseau non supporté ! Choisissez parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`, {
        parse_mode: 'HTML',
      });
    }

    const loadingMsg = await ctx.reply('🔍 Recherche du solde...');

    try {
      const balanceData = await walletService.getPublicAddressBalance(network, address);
      const conversion = await convertToEUR(network, Number.parseFloat(balanceData.balance));

      const chainEmoji = CHAIN_EMOJIS[network] || '💎';

      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      await ctx.reply(
        `${chainEmoji} <b>Solde ${network.toUpperCase()}</b>\n\n` +
          `📬 Adresse : <code>${truncateAddress(address)}</code>\n` +
          `💰 Solde : <b>${escapeHtml(formatCryptoAmount(balanceData.balance, balanceData.symbol || network))}</b>\n` +
          `💶 Valeur : <b>${escapeHtml(formatEUR(conversion.valueEUR))}</b>`,
        { parse_mode: 'HTML' }
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
        '💸 <b>Envoi de cryptos</b>\n\n' +
          'Utilisation : <code>/send &lt;réseau&gt; &lt;adresse&gt; &lt;montant&gt;</code>\n\n' +
          'Exemple : <code>/send eth 0x123...abc 0.1</code>\n\n' +
          '💡 Pour un envoi plus guidé, utilise le bouton <b>💸 Envoyer</b> du menu !',
        { parse_mode: 'HTML' }
      );
    }

    const network = args[0].toLowerCase();
    const toAddress = args[1];
    const amount = Number.parseFloat(args[2].replace(',', '.'));

    if (!PUBLIC_CHAINS.includes(network)) {
      return ctx.reply(
        `❌ Réseau non supporté ! Choisis parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`,
        {
          parse_mode: 'HTML',
        }
      );
    }

    if (Number.isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Montant invalide !');
    }

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.chain === network);

    if (!wallet) {
      return ctx.reply(`❌ Tu n'as pas de wallet ${network.toUpperCase()} !`, {
        parse_mode: 'HTML',
      });
    }

    sessions.setData(chatId, {
      selectedWalletId: wallet.id,
      selectedChain: network,
      toAddress: toAddress,
      amount: amount,
      amountType: 'native',
    });
    sessions.setState(chatId, 'SELECT_FEE');

    try {
      const balanceData = await walletService.getBalance(chatId, wallet.id);
      const fees = await walletService.estimateFees(chatId, wallet.id, toAddress, amount);

      sessions.setData(chatId, {
        ...sessions.getData(chatId),
        fees,
        currentBalance: Number.parseFloat(balanceData.balance),
      });

      const conversion = await convertToEUR(network, amount);

      await ctx.reply(
        "💸 <b>Préparation de l'envoi</b>\n\n" +
          `📤 De : ${escapeHtml(wallet.label)}\n` +
          `📥 Vers : <code>${truncateAddress(toAddress)}</code>\n` +
          `💰 Montant : <b>${escapeHtml(formatCryptoAmount(amount, network))}</b>\n` +
          `💶 Valeur : ${escapeHtml(formatEUR(conversion.valueEUR))}\n` +
          `📊 Solde dispo : ${balanceData.balance} ${escapeHtml(balanceData.symbol || network.toUpperCase())}\n\n` +
          'Choisis la vitesse de transaction :',
        { parse_mode: 'HTML', ...feeSelectionKeyboard('slow') }
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
        '📜 <b>Historique des transactions</b>\n\n' + 'Utilisation : <code>/tx &lt;réseau&gt; &lt;adresse&gt; [limite]</code>',
        { parse_mode: 'HTML' }
      );
    }

    const network = args[0].toLowerCase();
    const address = args[1];
    const limit = Math.min(Number.parseInt(args[2]) || 5, 20);

    if (!PUBLIC_CHAINS.includes(network)) {
      return ctx.reply(`❌ Réseau non supporté ! Choisissez parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`, {
        parse_mode: 'HTML',
      });
    }

    const loadingMsg = await ctx.reply('🔍 Recherche des transactions...');

    try {
      const txHistory = await walletService.getTransactionHistory(network, address, limit);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

      if (!txHistory || txHistory.length === 0) {
        return ctx.reply('📜 Aucune transaction trouvée.', { parse_mode: 'HTML' });
      }

      let text = `📜 <b>${txHistory.length} dernières transactions (${network.toUpperCase()})</b>\n\n`;
      for (const tx of txHistory.slice(0, limit)) {
        const direction = tx.type === 'in' ? '📥' : '📤';
        const date = new Date(tx.timestamp).toLocaleDateString('fr-FR');
        text += `${direction} <b>${escapeHtml(formatCryptoAmount(tx.amount, network))}</b>\n`;
        text += `📅 ${date}\n`;
        text += `🔗 <code>${truncateAddress(tx.hash, 10, 8)}</code>\n\n`;
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
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
        "🔢 <b>Conversion d'Unités Crypto</b>\n\n" +
          'Utilisation : <code>/unit &lt;montant&gt; &lt;unité&gt;</code>\n\n' +
          `<b>Unités :</b> ${UNIT_LIST_LABEL}\n` +
          '<i>Exemples :</i> <code>/unit 0.5 eth</code> · <code>/unit 1 btc</code> · <code>/unit 1 xmr</code>',
        { parse_mode: 'HTML' }
      );
    }

    const amount = Number.parseFloat(args[0].replace(',', '.'));
    const unit = args[1].toLowerCase().replace(/s$/, '');

    if (Number.isNaN(amount) || amount < 0) {
      return ctx.reply('❌ Montant invalide ! Entre un nombre positif.');
    }

    const entry = UNIT_MAP[unit];
    if (!entry) {
      return ctx.reply(`❌ Unité non reconnue !\n\nUnités : ${UNIT_LIST_LABEL}`);
    }

    // Convert input → coin amount, then render every denomination of that coin.
    const coinAmount = amount / entry.factor;
    const def = UNIT_DENOMS[entry.coin];

    const lines = def.units.map(([name, factor]) => {
      let valStr;
      if (name === 'wei') {
        // 10^18 overflows JS safe integers: go ETH→gwei (safe) then ×10^9 exact.
        valStr = (BigInt(Math.round(coinAmount * 1e9)) * 1_000_000_000n).toLocaleString('fr-FR');
      } else if (factor === 1) {
        valStr = formatNumber(coinAmount, 0, 8); // the coin amount itself
      } else {
        valStr = formatNumber(coinAmount * factor, 0, 0); // integer sub-units
      }
      return `• <b>${valStr}</b> ${name}`;
    });

    await ctx.reply(
      `${def.emoji} <b>Conversion ${entry.coin.toUpperCase()}</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  });
}
