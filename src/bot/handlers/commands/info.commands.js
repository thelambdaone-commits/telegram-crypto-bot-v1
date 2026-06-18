import { Markup } from 'telegraf';
import { mainMenuKeyboard, mainReplyKeyboard } from '../../keyboards/index.js';
import { getFullHelpText } from '../../ui/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { CHAIN_REGISTRY } from '../../../shared/chains.js';
import { TOKEN_CONFIGS } from '../../../core/tokens.config.js';
import { TROCADOR_COINS } from '../../../modules/swap/exchange.service.js';

// "Ξ Ethereum · ₿ Bitcoin · …" — every supported network, from CHAIN_REGISTRY.
function networksLine() {
  return Object.values(CHAIN_REGISTRY)
    .map((m) => `${m.emoji} ${m.name}`)
    .join(' · ');
}

// "• Ethereum: USDC, USDT, …" per chain that has tokens, from TOKEN_CONFIGS.
function tokensSection() {
  return Object.entries(TOKEN_CONFIGS)
    .map(([chain, cfg]) => [chain, Object.keys(cfg.tokens || {})])
    .filter(([, syms]) => syms.length)
    .map(([chain, syms]) => `• ${CHAIN_REGISTRY[chain]?.name || chain}: ${syms.join(', ')}`)
    .join('\n');
}

export function setupInfoCommands(bot) {
  // 🆘 /help - Menu d'aide complet
  bot.command('help', async (ctx) => {
    await ctx.reply(getFullHelpText(), {
      parse_mode: 'HTML',
      ...mainReplyKeyboard(),
    });
  });

  // 🏠 /menu - Menu principal interactif (inline)
  bot.command('menu', async (ctx) => {
    await ctx.reply('🏠 <b>Menu Principal</b>', {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(),
    });
  });

  // 📚 /learn - Leçon éducative
  bot.command('learn', async (ctx) => {
    await ctx.reply(
      '📌 <b>Coin vs Token</b>\n\n' +
        '1️⃣ <b>Coins</b> 🪙 : Blockchains natives (BTC, ETH, SOL).\n' +
        '2️⃣ <b>Tokens</b> 🎫 : Hébérgés (USDC, USDT).\n\n' +
        '🚀 <b>Layer 2</b> (Polygon, Base, Optimism) : Moins cher, même adresse ETH.',
      { parse_mode: 'HTML' }
    );
  });

  // 🔗 /chains - Liste des blockchains supportées
  bot.command('chains', async (ctx) => {
    await ctx.reply(
      '🔗 <b>Blockchains supportées</b>\n\n' +
        '• L1 : BTC, ETH, SOL, TRX, TON, AVAX, LTC, BCH, XMR, ZEC\n' +
        '• L2 : Arbitrum, Polygon, Optimism, Base',
      { parse_mode: 'HTML' }
    );
  });

  // 📋 /list (/coins, /tokens, /assets) - Supported coins & tokens (English)
  bot.command(['list', 'coins', 'tokens', 'assets'], async (ctx) => {
    await ctx.reply(
      '📋 <b>Supported coins & tokens</b>\n\n' +
        `🔗 <b>Networks</b> (${Object.keys(CHAIN_REGISTRY).length})\n` +
        `${networksLine()}\n\n` +
        `🎫 <b>Tokens</b>\n${tokensSection()}\n\n` +
        'ℹ️ All of these are swappable no-KYC — see <code>/swaps</code>.',
      { parse_mode: 'HTML' }
    );
  });

  // 💱 /swaps (/swap, /exchange) - Swappable assets, no-KYC (English)
  bot.command(['swaps', 'swap', 'exchange'], async (ctx) => {
    const symbols = [...new Set(Object.values(TROCADOR_COINS).map((c) => c.symbol))];
    await ctx.reply(
      '💱 <b>No-KYC exchange</b>\n\n' +
        `<b>${Object.keys(TROCADOR_COINS).length}</b> swappable assets, cross-chain, best rate. ` +
        'Quote-only for now (no funds are moved).\n\n' +
        `🪙 ${symbols.join(', ')}\n\n` +
        '💵 USDT & USDC are available on multiple networks ' +
        '(Ethereum, Arbitrum, Optimism, Polygon, Base, Avalanche, Solana, Tron, TON).\n\n' +
        '👇 Tap to simulate a swap',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Open exchange', CALLBACKS.EXCHANGE)]]),
      }
    );
  });
}
