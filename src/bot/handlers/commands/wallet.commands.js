import {
  mainMenuKeyboard,
  walletListKeyboard,
  mainReplyKeyboard,
  feeSelectionKeyboard,
} from '../../keyboards/index.js';
import { formatEUR, convertToEUR } from '../../../shared/price.js';
import { formatNumber, formatCryptoAmount, CHAIN_EMOJIS, truncateAddress } from '../../i18n/formatters.js';
import { sendWalletKeysFile } from '../wallet/key-file.js';
import { SUPPORTED_CHAINS as PUBLIC_CHAINS, CHAIN_REGISTRY } from '../../../shared/chains.js';
import { escapeHtml } from '../../../shared/utils/telegram.js';
import { uiToBaseUnits } from '../../../shared/amounts.js';
import { getTxExplorerUrl } from '../../../shared/explorer.js';
import bs58 from 'bs58';

// chain → "Name Emoji" display label, derived from the registry so /gen
// auto-syncs with every supported chain (no hand-maintained list to drift).
const CHAIN_DISPLAY = Object.fromEntries(
  Object.entries(CHAIN_REGISTRY).map(([chain, m]) => [chain, `${m.name} ${m.emoji}`])
);

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

// Pure resolution of the /send amount argument — no I/O, so it's unit-testable.
// The caller fetches the async inputs (estimatedFee for a non-SOL "max",
// priceEUR for a "€" amount) and passes them in. Returns
// { amount, amountType, isMaxSend } on success, or { error: <code> }.
export function computeSendAmount(
  amountArg,
  { network, balance, balanceLamports, estimatedFee = 0, priceEUR = null } = {}
) {
  const isMax = /^max$/i.test(amountArg);
  const eurMatch = amountArg.match(/^([\d.,]+)\s*(?:€|eur|euro|euros)$/i);

  if (isMax) {
    // SOL sweeps to the exact balance − fee at confirmation (0 dust); other
    // chains reserve the estimated fee up front.
    const amount =
      network === 'sol' && balanceLamports
        ? Math.max(0, Number(balanceLamports) - 5000) / 1e9
        : Math.max(0, balance - Number.parseFloat(estimatedFee));
    if (amount <= 0) return { error: 'insufficient_fee' };
    return {
      amount,
      amountType: 'native',
      isMaxSend: network === 'sol' && !!balanceLamports,
    };
  }

  if (eurMatch) {
    const eur = Number.parseFloat(eurMatch[1].replace(',', '.'));
    if (Number.isNaN(eur) || eur <= 0) return { error: 'invalid_eur' };
    if (!priceEUR) return { error: 'no_price' };
    return { amount: eur / priceEUR, amountType: 'eur', isMaxSend: false };
  }

  const amount = Number.parseFloat(amountArg.replace(',', '.'));
  if (Number.isNaN(amount) || amount <= 0) return { error: 'invalid_amount' };
  return { amount, amountType: 'native', isMaxSend: false };
}

// Heuristic: does `v` look like a transaction hash/signature (vs an address)?
// Used to turn the common "/tx <network> <txhash>" mistake into a helpful reply.
export function looksLikeTxHash(network, v) {
  if (CHAIN_REGISTRY[network]?.evm) return /^0x[0-9a-fA-F]{64}$/.test(v); // 32-byte hash
  if (network === 'sol') {
    // SOL signature = 64 bytes base58; an address is 32 bytes.
    try {
      return bs58.decode(v).length === 64;
    } catch {
      return false;
    }
  }
  // BTC/LTC/BCH/ZEC/XMR/TRX txids are 64 hex chars.
  return /^[0-9a-fA-F]{64}$/.test(v);
}

export function setupWalletCommands(bot, storage, walletService, sessions) {
  // 💰 /wallet - Affiche la liste des wallets
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

    let text = '💰 <b>Tes Wallets</b>\n\n';

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
      const lines = PUBLIC_CHAINS.map((c) => `• <code>/gen ${c}</code> — ${CHAIN_DISPLAY[c]}`).join('\n');
      return ctx.reply(
        '🎲 <b>Génération de Wallet</b>\n\n' + 'Utilise cette commande avec le réseau souhaité :\n\n' + lines,
        { parse_mode: 'HTML' }
      );
    }

    const chain = args[0].toLowerCase();
    if (!PUBLIC_CHAINS.includes(chain)) {
      return ctx.reply(
        '❌ <b>Réseau non supporté !</b>\n\n' + `Choisis parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`,
        {
          parse_mode: 'HTML',
        }
      );
    }

    const chainNames = CHAIN_DISPLAY;
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
          '<b>Montant</b> — au choix :\n' +
          '• en crypto : <code>/send eth 0x123...abc 0.1</code>\n' +
          '• en euros : <code>/send eth 0x123...abc 25€</code>\n' +
          '• tout le solde : <code>/send sol Abc...xyz max</code>\n\n' +
          '💡 Pour un envoi plus guidé, utilise le bouton <b>💸 Envoyer</b> du menu !',
        { parse_mode: 'HTML' }
      );
    }

    const network = args[0].toLowerCase();
    const toAddress = args[1];
    // Le montant peut s'écrire en plusieurs jetons ("25 €") → on rejoint la fin.
    const amountArg = args.slice(2).join(' ').trim();

    if (!PUBLIC_CHAINS.includes(network)) {
      return ctx.reply(
        `❌ Réseau non supporté ! Choisis parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`,
        {
          parse_mode: 'HTML',
        }
      );
    }

    const wallets = await storage.getWallets(chatId);
    const wallet = wallets.find((w) => w.chain === network);

    if (!wallet) {
      return ctx.reply(`❌ Tu n'as pas de wallet ${network.toUpperCase()} !`, {
        parse_mode: 'HTML',
      });
    }

    // "max" (tout le solde) et "25€" déclenchent des appels réseau différents.
    const wantsMax = /^max$/i.test(amountArg);
    const wantsEur = /^[\d.,]+\s*(?:€|eur|euro|euros)$/i.test(amountArg);

    try {
      const balanceData = await walletService.getBalance(chatId, wallet.id);
      const balance = Number.parseFloat(balanceData.balance);

      // Pré-charge uniquement ce dont le type de montant a besoin.
      let estimatedFee = 0;
      let priceEUR = null;
      if (wantsMax && !(network === 'sol' && balanceData.balanceLamports)) {
        const feeProbe = await walletService.estimateFees(chatId, wallet.id, toAddress, 0.001);
        estimatedFee = feeProbe.slow?.estimatedFee || feeProbe.slow?.feeSOL || 0;
      }
      if (wantsEur) {
        const conv = await convertToEUR(network, 1);
        priceEUR = conv?.priceEUR || null;
      }

      const resolved = computeSendAmount(amountArg, {
        network,
        balance,
        balanceLamports: balanceData.balanceLamports,
        estimatedFee,
        priceEUR,
      });
      if (resolved.error) {
        const errors = {
          insufficient_fee: '💸 Solde insuffisant pour couvrir les frais de réseau.',
          invalid_eur: '❌ Montant en euros invalide !',
          no_price: `⚠️ Prix indisponible pour ${network.toUpperCase()}. Saisis le montant en ${network.toUpperCase()}.`,
          invalid_amount: '❌ Montant invalide !',
        };
        return ctx.reply(errors[resolved.error] || '❌ Montant invalide !');
      }
      const { amount, amountType, isMaxSend } = resolved;

      if (amount > balance) {
        return ctx.reply(
          `💸 Solde insuffisant (${balanceData.balance} ${escapeHtml(balanceData.symbol || network.toUpperCase())})`
        );
      }

      const fees = await walletService.estimateFees(chatId, wallet.id, toAddress, amount);

      sessions.setData(chatId, {
        selectedWalletId: wallet.id,
        selectedChain: network,
        toAddress,
        amount,
        amountType,
        isMaxSend,
        fees,
        currentBalance: balance,
        currentBalanceLamports: balanceData.balanceLamports,
      });
      sessions.setState(chatId, 'SELECT_FEE');

      const conversion = await convertToEUR(network, amount);

      await ctx.reply(
        "💸 <b>Préparation de l'envoi</b>\n\n" +
          `📤 De : ${escapeHtml(wallet.label)}\n` +
          `📥 Vers : <code>${truncateAddress(toAddress)}</code>\n` +
          `💰 Montant : <b>${escapeHtml(formatCryptoAmount(amount, network))}</b>${wantsMax ? ' 💯 <i>(max)</i>' : ''}\n` +
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

  // ✅ /validate - Vérifie qu'une adresse est valide pour un réseau
  bot.command(['validate', 'check'], async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      return ctx.reply(
        '✅ <b>Validation d’adresse</b>\n\n' +
          'Utilisation : <code>/validate &lt;réseau&gt; &lt;adresse&gt;</code>\n\n' +
          'Exemples :\n' +
          '• <code>/validate btc bc1q...xyz</code>\n' +
          '• <code>/validate eth 0x123...abc</code>\n\n' +
          '💡 À utiliser <b>avant</b> un envoi pour éviter une perte de fonds.',
        { parse_mode: 'HTML' }
      );
    }

    const network = args[0].toLowerCase();
    const address = args[1];

    if (!PUBLIC_CHAINS.includes(network)) {
      return ctx.reply(
        `❌ Réseau non supporté ! Choisis parmi : <code>${PUBLIC_CHAINS.join(', ')}</code>`,
        { parse_mode: 'HTML' }
      );
    }

    let valid = false;
    try {
      valid = walletService.validateAddress(network, address);
    } catch (e) {
      valid = false;
    }

    const chainEmoji = CHAIN_EMOJIS[network] || '💎';
    const name = CHAIN_DISPLAY[network] || network.toUpperCase();

    if (valid) {
      await ctx.reply(
        '✅ <b>Adresse valide</b>\n\n' +
          `${chainEmoji} Réseau : <b>${escapeHtml(name)}</b>\n` +
          `📬 <code>${escapeHtml(address)}</code>\n\n` +
          `Tu peux l’utiliser avec <code>/send ${network} ${escapeHtml(truncateAddress(address))} &lt;montant&gt;</code>.`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(
        `❌ <b>Adresse invalide</b> pour ${chainEmoji} <b>${escapeHtml(name)}</b>\n\n` +
          `📬 <code>${escapeHtml(address)}</code>\n\n` +
          '⚠️ Vérifie que tu as bien choisi le <b>bon réseau</b> et recopié l’adresse en entier.',
        { parse_mode: 'HTML' }
      );
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

    // /tx liste l'historique d'une ADRESSE. Si l'argument est un hash de
    // transaction (erreur courante), on l'oriente vers l'explorateur.
    let validAddress = false;
    try {
      validAddress = walletService.validateAddress(network, address);
    } catch {
      validAddress = false;
    }
    if (!validAddress) {
      if (looksLikeTxHash(network, address)) {
        const url = getTxExplorerUrl(network, address);
        return ctx.reply(
          '🔗 <b>Ça ressemble à un hash de transaction</b>, pas à une adresse.\n\n' +
            '<code>/tx</code> liste l’historique d’une <b>adresse</b>. Pour inspecter cette transaction :\n' +
            (url ? `<a href="${url}">Ouvrir dans l’explorateur</a>` : '<i>explorateur indisponible</i>'),
          { parse_mode: 'HTML' }
        );
      }
      return ctx.reply(`❌ Adresse ${network.toUpperCase()} invalide.`, { parse_mode: 'HTML' });
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
        text += `🔗 <code>${escapeHtml(tx.hash)}</code>\n\n`;
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
        // 10^18 overflows JS floats/safe-ints: convert via the string→BigInt
        // helper (no float multiply), exact down to 1 wei.
        valStr = uiToBaseUnits(coinAmount, 18).toLocaleString('fr-FR');
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
