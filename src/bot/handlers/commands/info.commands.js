import { Markup } from 'telegraf';
import { mainMenuKeyboard, mainReplyKeyboard } from '../../keyboards/index.js';
import { getFullHelpText } from '../../ui/index.js';
import { CALLBACKS } from '../../constants/callbacks.js';
import { CHAIN_REGISTRY } from '../../../shared/chains.js';
import { TOKEN_CONFIGS } from '../../../core/tokens.config.js';
import { ExchangeService } from '../../../modules/swap/exchange.service.js';

const exchange = new ExchangeService();

// "Ξ Ethereum · ₿ Bitcoin · …" — every supported network, from CHAIN_REGISTRY.
function networksLine() {
  return Object.values(CHAIN_REGISTRY)
    .map((m) => `${m.emoji} ${m.name}`)
    .join(' · ');
}

// "• Ethereum : USDC, USDT, …" per chain that has tokens, from TOKEN_CONFIGS.
function tokensSection() {
  return Object.entries(TOKEN_CONFIGS)
    .map(([chain, cfg]) => [chain, Object.keys(cfg.tokens || {})])
    .filter(([, syms]) => syms.length)
    .map(([chain, syms]) => `• <b>${CHAIN_REGISTRY[chain]?.name || chain}</b> : ${syms.join(', ')}`)
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

  // 🎮 /menu - Menu principal interactif (inline)
  bot.command('menu', async (ctx) => {
    await ctx.reply('🎮 <b>Menu Principal</b>', {
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

  // 🔗 /chains - Liste des blockchains supportées (dérivée de CHAIN_REGISTRY)
  bot.command('chains', async (ctx) => {
    const entries = Object.entries(CHAIN_REGISTRY);
    const isL2 = (k, m) => m.evm && k !== 'eth' && k !== 'avax'; // EVM scaling chains
    const l1 = entries
      .filter(([k, m]) => !isL2(k, m))
      .map(([, m]) => `${m.emoji} ${m.native}`)
      .join(' · ');
    const l2 = entries
      .filter(([k, m]) => isL2(k, m))
      .map(([, m]) => `${m.emoji} ${m.name}`)
      .join(' · ');
    await ctx.reply(
      '🔗 <b>Blockchains supportées</b>\n\n' + `🏛️ <b>L1</b> : ${l1}\n⚡ <b>L2</b> : ${l2}`,
      { parse_mode: 'HTML' }
    );
  });

  // 📋 /list (/coins, /tokens, /assets) - Supported coins & tokens (English)
  bot.command(['list', 'coins', 'tokens', 'assets'], async (ctx) => {
    await ctx.reply(
      '📋 <b>Cryptos &amp; tokens supportés</b>\n' +
        '━━━━━━━━━━━━━━━\n\n' +
        `🔗 <b>Réseaux</b> · ${Object.keys(CHAIN_REGISTRY).length} chaînes\n` +
        `${networksLine()}\n\n` +
        '🎫 <b>Tokens par réseau</b>\n' +
        `${tokensSection()}\n\n` +
        '━━━━━━━━━━━━━━━\n' +
        '💱 Tout est échangeable <b>sans KYC</b> → <code>/swaps</code>\n' +
        '💹 Prix en euros → <code>/price</code>',
      { parse_mode: 'HTML' }
    );
  });

  // 💱 /swaps (/swap, /exchange) - Swappable assets, no-KYC (English)
  bot.command(['swaps', 'swap', 'exchange'], async (ctx) => {
    const symbols = exchange.listSymbols(); // sorted: natives → stablecoins → tokens
    const list = symbols.map((s) => `${s.emoji} ${s.symbol}`).join(' · ');
    await ctx.reply(
      '💱 <b>Échange sans KYC</b>\n' +
        '━━━━━━━━━━━━━━━\n\n' +
        '🔒 Sans inscription, sans KYC — le meilleur taux est choisi automatiquement ' +
        'et le bot ne touche jamais tes fonds.\n\n' +
        `🪙 <b>${symbols.length} cryptos</b> sur tous leurs réseaux\n` +
        `${list}\n\n` +
        '💵 <b>USDT</b> &amp; <b>USDC</b> dispo sur Ethereum, Arbitrum, Optimism, Polygon, ' +
        'Base, Avalanche, Solana, Tron et TON.\n\n' +
        '━━━━━━━━━━━━━━━\n' +
        '👇 Choisis une crypto à donner puis une à recevoir',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Ouvrir l’échange', CALLBACKS.EXCHANGE)]]),
      }
    );
  });
}
