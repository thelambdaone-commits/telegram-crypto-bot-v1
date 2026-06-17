import { mainMenuKeyboard, mainReplyKeyboard } from '../../keyboards/index.js';
import { getFullHelpText } from '../../ui/index.js';

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
        '• L1 : BTC, ETH, SOL, TRX, AVAX, LTC, BCH, XMR, ZEC\n' +
        '• L2 : Arbitrum, Polygon, Optimism, Base',
      { parse_mode: 'HTML' }
    );
  });
}
