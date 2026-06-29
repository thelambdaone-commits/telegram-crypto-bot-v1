/**
 * Deposit / receive flow — asset → network → confirmation → address + QR.
 *
 * Designed so the receiving network is ALWAYS explicit: a user thinks in
 * terms of the asset (USDT) first, then picks the exact network, then must
 * confirm before any address is shown. This prevents the classic loss-of-funds
 * mistake of sending e.g. USDT-ERC20 to a Base address.
 *
 * All asset/network metadata is derived from the single TOKEN_CONFIGS source.
 */
import { Markup } from 'telegraf';
import { safeAnswerCbQuery, escapeHtml } from '../../../shared/utils/telegram.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import {
  getDepositAssets,
  getAssetNetworks,
  getTokenConfig,
} from '../../../core/tokens.config.js';
import { generateAddressQR } from '../../../shared/qr.js';
import { buildPaymentURI } from '../../../shared/payment-uri.js';
import { logger } from '../../../shared/logger.js';
import { CHAIN_EMOJIS, truncateAddress } from '../../i18n/formatters.js';
// EVM chains share one address, so any EVM wallet can receive on any of them.
import { EVM_CHAINS } from '../../../shared/chains.js';

const ASSET_ICONS = Object.fromEntries(getDepositAssets().map((a) => [a.symbol, a.icon]));
const iconFor = (symbol) => ASSET_ICONS[symbol] || '🪙';

function netLabel(net) {
  if (!net.isNative && net.standard && net.standard !== net.chainName) {
    return `${net.chainName} (${net.standard})`;
  }
  return net.chainName;
}

// Every wallet that can receive `symbol` on `chain` — so the user can pick when
// they hold several (e.g. ETH Wallet 1, ETH Wallet 2). EVM addresses are
// interchangeable across EVM chains, so if no wallet was created specifically on
// this chain we fall back to any EVM wallet (matches the old single-resolve
// behaviour, just widened to the whole list).
export async function eligibleDepositWallets(storage, chatId, chain) {
  const wallets = await storage.getWallets(chatId);
  let list = wallets.filter((w) => w.chain === chain && !w.isCorrupted && w.address);
  if (list.length === 0 && EVM_CHAINS.has(chain)) {
    list = wallets.filter((w) => EVM_CHAINS.has(w.chain) && !w.isCorrupted && w.address);
  }
  return list;
}

const walletLabel = (w) => w.label || `${String(w.chain).toUpperCase()} ${truncateAddress(w.address, 6, 4)}`;

// Fee tier per network, to steer users toward a cheap/right network when an
// asset (especially a stablecoin) exists on several chains.
const FEE_HINT = {
  eth: { emoji: '🔴', label: 'frais élevés' },
  arb: { emoji: '🟢', label: 'frais bas' },
  op: { emoji: '🟢', label: 'frais bas' },
  base: { emoji: '🟢', label: 'frais bas' },
  matic: { emoji: '🟢', label: 'frais bas' },
  avax: { emoji: '🟢', label: 'frais bas' },
  bsc: { emoji: '🟢', label: 'frais bas' },
  sol: { emoji: '🟢', label: 'frais quasi nuls' },
  trx: { emoji: '🟢', label: 'frais bas' },
  ton: { emoji: '🟢', label: 'frais bas' },
};

const feeEmoji = (chain) => FEE_HINT[chain]?.emoji || '';

// ── Keyboards ──────────────────────────────────────────────────────────────

function chunk2(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function assetsKeyboard() {
  const assets = getDepositAssets();
  const stables = assets.filter((a) => a.type === 'stablecoin');
  const coins = assets.filter((a) => a.type !== 'stablecoin');
  const btn = (a) => Markup.button.callback(`${a.icon} ${a.symbol}`, `dep_a_${a.symbol}`);

  const rows = [];
  // Stablecoins first (common, error-prone deposit), then the rest. No header
  // rows — they looked like tappable buttons. The row break between the two
  // groups gives a subtle visual separation on its own.
  rows.push(...chunk2(stables.map(btn)));
  rows.push(...chunk2(coins.map(btn)));
  rows.push([Markup.button.callback('↩️ Menu', CALLBACKS.BACK_TO_MENU)]);
  return Markup.inlineKeyboard(rows);
}

function networksKeyboard(symbol, networks) {
  const rows = networks.map((n) => {
    const fee = feeEmoji(n.chain);
    const sym = CHAIN_EMOJIS[n.chain] ? `${CHAIN_EMOJIS[n.chain]} ` : '';
    const text = `${fee ? fee + ' ' : ''}${sym}${netLabel(n)}${n.bridged ? ' • bridged' : ''}`;
    return [Markup.button.callback(text, `dep_n_${symbol}_${n.chain}`)];
  });
  rows.push([Markup.button.callback('↩️ Retour', CALLBACKS.DEPOSIT)]);
  return Markup.inlineKeyboard(rows);
}

function confirmKeyboard(symbol, net, multiNetwork) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Continuer', `dep_s_${symbol}_${net.chain}`)],
    [Markup.button.callback('↩️ Retour', multiNetwork ? `dep_a_${symbol}` : CALLBACKS.DEPOSIT)],
  ]);
}

// Shown only when the user holds several wallets able to receive on this chain.
function walletPickKeyboard(symbol, chain, wallets) {
  const rows = wallets.map((w) => [
    Markup.button.callback(`💰 ${walletLabel(w)}`, `dep_w_${symbol}_${chain}_${w.id}`),
  ]);
  rows.push([Markup.button.callback('↩️ Retour', `dep_n_${symbol}_${chain}`)]);
  return Markup.inlineKeyboard(rows);
}

// ── Texts (French) ───────────────────────────────────────────────────────────

const HOME_TEXT =
  '📥 <b>Recevoir des fonds</b>\n' +
  '───────────\n' +
  '💵 <b>Stablecoins</b> (USDT/USDC)\n' +
  "Choisis l'actif, puis le réseau de l'expéditeur.\n\n" +
  '🪙 <b>Cryptos natives</b>\n' +
  'Choisis la crypto, puis son réseau.\n\n' +
  '👇 Sélectionne un actif :\n' +
  '🟢 frais bas · 🔴 frais élevés';

function networkPickText(symbol) {
  const sym = escapeHtml(symbol);
  return (
    `${iconFor(symbol)} <b>${sym}</b>\n\n` +
    `Où veux-tu recevoir ces <b>${sym}</b> ?\n` +
    '🟢 frais bas · 🔴 frais élevés\n\n' +
    '⚠️ <b>Important</b>\n' +
    "Choisis exactement le réseau utilisé par l'expéditeur.\n" +
    'Un mauvais réseau → perte définitive des fonds.'
  );
}

function confirmText(symbol, net) {
  const fee = FEE_HINT[net.chain];
  const feeLine = fee ? `\nFrais : ${fee.emoji} ${fee.label}` : '';
  const sym = escapeHtml(symbol);
  return (
    '⚠️ <b>Vérifie bien</b>\n\n' +
    `Actif : ${iconFor(symbol)} <b>${sym}</b>\n` +
    `Réseau : <b>${escapeHtml(netLabel(net))}</b>${feeLine}\n\n` +
    `Je comprends que seuls les <b>${sym}</b> envoyés via <b>${escapeHtml(net.chainName)}</b> seront reçus.\n` +
    'Tout envoi depuis un autre réseau entraînera une perte définitive des fonds.'
  );
}

function walletPickText(symbol, net, count) {
  return (
    '💰 <b>Choisis le wallet</b>\n\n' +
    `Actif : ${iconFor(symbol)} <b>${escapeHtml(symbol)}</b>\n` +
    `Réseau : <b>${escapeHtml(netLabel(net))}</b>\n\n` +
    `Tu as <b>${count}</b> wallets compatibles. Sur lequel veux-tu recevoir ?`
  );
}

function addressText(symbol, net, address, label = '') {
  const sym = escapeHtml(symbol);
  const walletLine = label ? `Wallet : 💰 <b>${escapeHtml(label)}</b>\n` : '';
  return (
    `💰 <b>Dépôt de ${sym}</b>\n\n` +
    `Actif : ${iconFor(symbol)} <b>${sym}</b>\n` +
    `Réseau : <b>${escapeHtml(netLabel(net))}</b>\n` +
    walletLine +
    '━━━━━━━━━━━━━━━\n' +
    `Adresse :\n<code>${address}</code>\n` +
    '━━━━━━━━━━━━━━━\n' +
    `⚠️ N'envoie que des <b>${sym}</b> via le réseau <b>${escapeHtml(net.chainName)}</b>.\n` +
    'Les fonds envoyés depuis un autre réseau ne pourront pas être récupérés.'
  );
}

function noWalletText(symbol, net) {
  return (
    `Tu n'as pas encore de wallet compatible avec <b>${escapeHtml(net.chainName)}</b> ` +
    `pour recevoir des <b>${escapeHtml(symbol)}</b>.\n\nCrée d'abord un wallet sur ce réseau.`
  );
}

// ── Rendering helpers ────────────────────────────────────────────────────────

// editMessageText fails when the current message is a photo (the address QR);
// in that case delete it and send a fresh menu instead.
async function renderHome(ctx) {
  const kb = assetsKeyboard();
  try {
    await ctx.editMessageText(HOME_TEXT, { parse_mode: 'HTML', ...kb });
  } catch (e) {
    try {
      await ctx.deleteMessage();
    } catch (_) {
      // already gone
    }
    await ctx.reply(HOME_TEXT, { parse_mode: 'HTML', ...kb });
  }
}

async function showConfirmation(ctx, symbol, net, multiNetwork) {
  await ctx.editMessageText(confirmText(symbol, net), {
    parse_mode: 'HTML',
    ...confirmKeyboard(symbol, net, multiNetwork),
  });
}

// Replace the current message with the chosen wallet's address + QR.
async function showDepositAddress(ctx, symbol, net, wallet) {
  const chain = net.chain;
  try {
    await ctx.deleteMessage();
  } catch (e) {
    // already gone
  }

  const backKb = Markup.inlineKeyboard([
    [Markup.button.callback('↩️ Recevoir autre chose', CALLBACKS.DEPOSIT)],
  ]);

  // For tokens, encode the contract/mint so the sender's wallet pre-selects
  // the right asset; native deposits encode the plain network URI.
  let tokenMeta = null;
  if (!net.isNative) {
    const tc = getTokenConfig(chain, symbol);
    if (tc) tokenMeta = tc.address ? { contract: tc.address } : { mint: tc.mint };
  }
  const uri = buildPaymentURI(chain, wallet.address, tokenMeta);

  // Make the QR itself state the asset AND the network (e.g. token logo +
  // "USDT · Base"), so it's unambiguous even without reading the caption.
  const qrOptions = { uri };
  if (!net.isNative) {
    qrOptions.logoSymbol = symbol.toLowerCase();
    qrOptions.pastilleSymbol = chain; // small network badge on the token logo
    qrOptions.label = ''; // no "USDT · Ethereum" text — the pastille shows the network
  }

  const caption = addressText(symbol, net, wallet.address, walletLabel(wallet));
  try {
    const buffer = await generateAddressQR(wallet.address, chain, qrOptions);
    await ctx.replyWithPhoto({ source: buffer }, { caption, parse_mode: 'HTML', ...backKb });
  } catch (e) {
    logger.logError(e, { context: 'deposit.showAddress', chain, symbol });
    await ctx.reply(caption, { parse_mode: 'HTML', ...backKb });
  }
}

const noWalletKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('➕ Nouveau', CALLBACKS.CREATE_WALLET)],
    [Markup.button.callback('↩️ Retour', CALLBACKS.DEPOSIT)],
  ]);

// ── Handlers ─────────────────────────────────────────────────────────────────

export function setupDepositHandlers(bot, storage) {
  bot.action(CALLBACKS.DEPOSIT, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await renderHome(ctx);
  });

  const openReceive = async (ctx) => {
    await ctx.reply(HOME_TEXT, { parse_mode: 'HTML', ...assetsKeyboard() });
  };
  bot.command('recevoir', openReceive);
  bot.command('receive', openReceive); // English alias

  bot.hears('📥 Recevoir', async (ctx) => {
    await ctx.reply(HOME_TEXT, { parse_mode: 'HTML', ...assetsKeyboard() });
  });

  // Asset chosen → pick network (or skip straight to confirmation if single).
  bot.action(/^dep_a_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const symbol = ctx.match[1];
    const networks = getAssetNetworks(symbol);
    if (networks.length === 0) {
      return ctx.editMessageText('😕 Actif non supporté.', assetsKeyboard());
    }
    if (networks.length === 1) {
      return showConfirmation(ctx, symbol, networks[0], false);
    }
    await ctx.editMessageText(networkPickText(symbol), {
      parse_mode: 'HTML',
      ...networksKeyboard(symbol, networks),
    });
  });

  // Network chosen → confirmation step.
  bot.action(/^dep_n_([^_]+)_([^_]+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const symbol = ctx.match[1];
    const chain = ctx.match[2];
    const networks = getAssetNetworks(symbol);
    const net = networks.find((n) => n.chain === chain);
    if (!net) {
      return ctx.editMessageText('😕 Réseau non supporté.', assetsKeyboard());
    }
    await showConfirmation(ctx, symbol, net, networks.length > 1);
  });

  // Confirmed → pick a wallet (if several) then show the address + QR.
  bot.action(/^dep_s_([^_]+)_([^_]+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const symbol = ctx.match[1];
    const chain = ctx.match[2];
    const net = getAssetNetworks(symbol).find((n) => n.chain === chain);
    if (!net) {
      return ctx.editMessageText('😕 Réseau non supporté.', assetsKeyboard());
    }

    const wallets = await eligibleDepositWallets(storage, ctx.chat.id, chain);
    if (wallets.length === 0) {
      return ctx.editMessageText(noWalletText(symbol, net), { parse_mode: 'HTML', ...noWalletKeyboard() });
    }
    if (wallets.length > 1) {
      // Several compatible wallets (e.g. ETH Wallet 1 / 2) → let the user choose.
      return ctx.editMessageText(walletPickText(symbol, net, wallets.length), {
        parse_mode: 'HTML',
        ...walletPickKeyboard(symbol, chain, wallets),
      });
    }
    await showDepositAddress(ctx, symbol, net, wallets[0]);
  });

  // A specific wallet was chosen from the picker → show its address + QR.
  bot.action(/^dep_w_([^_]+)_([^_]+)_(.+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);
    const symbol = ctx.match[1];
    const chain = ctx.match[2];
    const walletId = ctx.match[3];
    const net = getAssetNetworks(symbol).find((n) => n.chain === chain);
    if (!net) {
      return ctx.editMessageText('😕 Réseau non supporté.', assetsKeyboard());
    }
    const wallets = await eligibleDepositWallets(storage, ctx.chat.id, chain);
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) {
      return ctx.editMessageText(noWalletText(symbol, net), { parse_mode: 'HTML', ...noWalletKeyboard() });
    }
    await showDepositAddress(ctx, symbol, net, wallet);
  });
}
